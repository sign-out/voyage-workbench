"""Persisted artwork jobs: native generation, local crops, referenced tile refinement."""
import io
import json
from pathlib import Path
import shutil
import subprocess
import tempfile
import threading
import time
import uuid

from .codex_rpc import CodexSession

SHAPES = {'square': (1, 1), 'landscape': (3, 2), 'portrait': (2, 3), 'wide': (16, 9), 'tall': (9, 16)}
DETAILS = {'low': {'tilePixels': 512, 'recommendedGrid': 2}, 'medium': {'tilePixels': 1024, 'recommendedGrid': 3}, 'high': {'tilePixels': 1536, 'recommendedGrid': 4}}
PRESETS = {'shapes': [{'id': key, 'ratio': f'{size[0]}:{size[1]}'} for key, size in SHAPES.items()],
           'details': [{'id': key, **value} for key, value in DETAILS.items()], 'maxTiles': 64, 'maxGrid': 8}
INSTRUCTIONS = '''Create exactly one requested image using native image generation. Follow the requested framing, detail and composition. When reference images are attached, use those actual images as visual references in the image-generation edit; never substitute a purely textual recreation. Preserve geography, edge features and visual continuity. Do not use shell, filesystem, browser or external connectors. Do not generate additional alternatives. The application captures the image automatically. Finish briefly after generating the image.'''


def _bounds(width, height, columns, rows):
    if width < columns or height < rows or width * height > 64_000_000:
        raise ValueError('Image dimensions are too small for the grid or exceed 64 megapixels')
    return [(c * width // columns, r * height // rows, (c + 1) * width // columns, (r + 1) * height // rows)
            for r in range(rows) for c in range(columns)]


def slice_image(data, columns, rows):
    """Crop every pixel exactly once; no generation, resizing or quality loss."""
    try:
        from PIL import Image, ImageOps
    except ImportError:
        Image = None
    if Image is not None:
        with Image.open(io.BytesIO(data)) as source:
            if source.width * source.height > 64_000_000:
                raise ValueError('Image exceeds 64 megapixels')
            source = ImageOps.exif_transpose(source)
            source.load()
            boxes = _bounds(source.width, source.height, columns, rows)
            crops = []
            for box in boxes:
                output = io.BytesIO()
                source.crop(box).save(output, format='PNG')
                crops.append(output.getvalue())
            return source.width, source.height, boxes, crops
    magick = shutil.which('magick')
    if not magick:
        raise ValueError('Local slicing needs Pillow or ImageMagick; install Pillow with pip install Pillow')
    # Prefix the raster format explicitly; no user-controlled command arguments,
    # URLs or filenames are passed to ImageMagick's format/delegate resolver.
    if data.startswith(b'\x89PNG\r\n\x1a\n'):
        kind = 'png'
    elif data.startswith(b'\xff\xd8\xff'):
        kind = 'jpeg'
    elif data.startswith(b'RIFF') and data[8:12] == b'WEBP':
        kind = 'webp'
    else:
        raise ValueError('Unsupported master image format')
    limits = ['-limit', 'memory', '256MiB', '-limit', 'map', '256MiB', '-limit', 'disk', '0', '-limit', 'time', '30']
    def command(args):
        result = subprocess.run([magick, *limits, *args], capture_output=True, timeout=40)
        if result.returncode:
            raise ValueError('Local image processing failed: ' + result.stderr.decode(errors='replace')[:300])
        return result.stdout
    with tempfile.TemporaryDirectory(prefix='voyage-slice-') as temporary:
        path = Path(temporary) / 'master'
        path.write_bytes(data)
        # Decode once to normalize EXIF orientation before computing bounds.
        normalized = Path(temporary) / 'master.png'
        command([kind + ':' + str(path) + '[0]', '-auto-orient', 'png:' + str(normalized)])
        dimensions = command(['png:' + str(normalized), '-format', '%w %h', 'info:']).decode().split()
        width, height = map(int, dimensions)
        boxes = _bounds(width, height, columns, rows)
        crops = [command(['png:' + str(normalized), '-crop', f'{right-left}x{bottom-top}+{left}+{top}', '+repage', '-define', 'png:exclude-chunks=date,time', 'png:-'])
                 for left, top, right, bottom in boxes]
        return width, height, boxes, crops


class Artwork:
    def __init__(self, store, assets, session_factory=CodexSession):
        self.store, self.assets, self.session_factory = store, assets, session_factory
        self.lock = threading.RLock()
        self.running = {}
        self.closed = False
        self.workspace = Path(store.path).resolve().parent / 'artwork-workspaces'
        self.workspace.mkdir(exist_ok=True)
        with store.connect() as db:
            db.execute('CREATE TABLE IF NOT EXISTS artwork_jobs (id TEXT PRIMARY KEY,project_id TEXT NOT NULL,payload TEXT NOT NULL)')
            for row in db.execute('SELECT payload FROM artwork_jobs').fetchall():
                job = json.loads(row['payload'])
                if job['status'] in ('running', 'cancelling'):
                    job.update(status='interrupted', error='Workbench restarted; completed images are retained. Retry unfinished requests explicitly.')
                    for request in job['requests']:
                        if request['status'] in ('running', 'queued'):
                            request['status'] = 'interrupted'
                    for tile in job['tiles']:
                        if tile['status'] in ('running', 'queued'):
                            tile['status'] = 'interrupted'
                    self._save(db, job)

    def _save(self, db, job):
        job['updated'] = time.time()
        db.execute('INSERT OR REPLACE INTO artwork_jobs VALUES (?,?,?)', (job['id'], job['projectId'], json.dumps(job)))

    def _get(self, db, pid, jid):
        self.store.project(db, pid)
        row = db.execute('SELECT payload FROM artwork_jobs WHERE id=? AND project_id=?', (jid, pid)).fetchone()
        if not row:
            raise KeyError('Artwork job not found')
        return json.loads(row['payload'])

    def _public(self, job):
        result = json.loads(json.dumps(job))
        ids = {job.get('masterAssetId')}
        ids.update(job.get('masterVersions', []))
        for tile in job['tiles']:
            ids.update([tile.get('assetId'), tile.get('cropAssetId'), *tile['versions']])
        ids.update(request.get('assetId') for request in job['requests'])
        result['assets'] = [asset for asset in self.assets.list(job['projectId']) if asset['id'] in ids]
        return result

    def list(self, pid):
        with self.lock, self.store.connect() as db:
            self.store.project(db, pid)
            jobs = [json.loads(row[0]) for row in db.execute('SELECT payload FROM artwork_jobs WHERE project_id=? ORDER BY rowid DESC', (pid,))]
            return {'jobs': [self._public(job) for job in jobs], 'presets': PRESETS}

    def get(self, pid, jid):
        with self.lock, self.store.connect() as db:
            return self._public(self._get(db, pid, jid))

    def create(self, pid, body):
        prompt = body.get('prompt')
        if not isinstance(prompt, str) or not prompt.strip() or len(prompt) > 12000:
            raise ValueError('Artwork prompt must be 1–12000 characters')
        mode, shape, detail = body.get('mode', 'master'), body.get('shape', 'square'), body.get('detail', 'medium')
        if mode not in ('master', 'individual') or shape not in SHAPES or detail not in DETAILS:
            raise ValueError('Choose a supported artwork mode, shape and detail')
        columns, rows = body.get('columns', DETAILS[detail]['recommendedGrid']), body.get('rows', DETAILS[detail]['recommendedGrid'])
        if type(columns) is not int or type(rows) is not int or not 1 <= columns <= 8 or not 1 <= rows <= 8:
            raise ValueError('Grid dimensions must be integers from 1 to 8')
        master = body.get('masterAssetId')
        if master:
            self.assets.read(pid, master)
        now = time.time()
        job = {'id': uuid.uuid4().hex, 'projectId': pid, 'mode': mode, 'prompt': prompt.strip(), 'shape': shape,
               'columns': columns, 'rows': rows, 'tileCount': columns * rows, 'detail': detail,
               'tilePixels': DETAILS[detail]['tilePixels'], 'status': 'draft', 'masterAssetId': master or None,
               'masterVersions': [master] if master else [], 'tiles': [], 'requests': [], 'error': '', 'created': now, 'updated': now}
        for index in range(columns * rows):
            job['tiles'].append({'index': index, 'row': index // columns, 'column': index % columns, 'status': 'pending',
                                 'cropAssetId': None, 'assetId': None, 'prompt': '', 'versions': [], 'error': ''})
        with self.lock, self.store.connect() as db:
            self.store.project(db, pid)
            self._save(db, job)
        return self._public(job)

    def split(self, pid, jid, body=None):
        with self.lock:
            if (pid, jid) in self.running:
                raise ValueError('Wait for the active artwork request before splitting')
            with self.store.connect() as db:
                job = self._get(db, pid, jid)
            if job['mode'] != 'master':
                raise ValueError('Only master-image jobs can be split')
            master = (body or {}).get('masterAssetId') or job['masterAssetId']
            if not master:
                raise ValueError('Generate or choose a master image first')
            data, _, _ = self.assets.read(pid, master)
            width, height, boxes, crops = slice_image(data, job['columns'], job['rows'])
            for tile, box, crop in zip(job['tiles'], boxes, crops):
                item_id = f"crop-{master}-{tile['index']}"
                asset = self.assets.capture_bytes(pid, jid, item_id, crop, 'Local crop of master artwork',
                    {'jobId': jid, 'role': 'crop', 'parentAssetId': master, 'tileIndex': tile['index'], 'bounds': box, 'width': box[2]-box[0], 'height': box[3]-box[1]})
                # Detailed revisions remain preserved, but a new master begins a
                # fresh selection using its own crop rather than stale artwork.
                tile.update(cropAssetId=asset['id'], assetId=asset['id'], status='cropped', error='', bounds=box)
                if asset['id'] not in tile['versions']:
                    tile['versions'].append(asset['id'])
            job.update(masterAssetId=master, status='ready', error='', width=width, height=height)
            if master not in job['masterVersions']:
                job['masterVersions'].append(master)
            with self.store.connect() as db:
                self._save(db, job)
            return self._public(job)

    def _prompt(self, job, index, override=''):
        ratio = SHAPES[job['shape']]
        common = f"World artwork brief: {job['prompt']}\nDetail: {job['detail']}. Overall composition aspect ratio {ratio[0]}:{ratio[1]}, {job['columns']} columns by {job['rows']} rows."
        if index is None:
            return common + '\nGenerate one coherent master map image with continuous geography, no grid lines, no tile borders and no labels. The image will be cropped locally into this grid. Keep paths, terrain and coastlines continuous across future tile boundaries.'
        tile = job['tiles'][index]
        tile_ratio = (ratio[0]*job['rows'], ratio[1]*job['columns'])
        if tile.get('cropAssetId') and tile.get('bounds'):
            left, top, right, bottom = tile['bounds']
            tile_ratio = (right-left, bottom-top)
        common += f"\nGenerate only tile {index+1}, row {tile['row']+1}, column {tile['column']+1}. Tile aspect ratio {tile_ratio[0]}:{tile_ratio[1]}; target approximately {job['tilePixels']} pixels on its longer side. Add {job['detail']} detail without moving boundary geometry."
        if tile['cropAssetId']:
            common += '\nThe FIRST attached image is the exact cropped tile to refine. The SECOND is the whole master for geography and style. Regenerate the first image with richer detail, preserving its framing, terrain outlines and all features crossing its four edges. Use the attached images as actual image-generation references.'
        else:
            common += '\nUse the same consistent style and geographically coherent tile plan as the overall brief. Do not draw grid lines, labels or borders.'
        return common + ('\nTile-specific request: ' + override if override else '')

    def generate(self, pid, jid, body=None, tile_index=None):
        body = body or {}
        override = body.get('prompt', '')
        if not isinstance(override, str) or len(override) > 12000:
            raise ValueError('Tile prompt must be at most 12000 characters')
        target = body.get('target', 'default')
        if target not in ('default', 'master', 'tiles'):
            raise ValueError('Unknown artwork generation target')
        with self.lock:
            if self.closed:
                raise ValueError('Artwork service is shutting down')
            if (pid, jid) in self.running:
                raise ValueError('This artwork job already has an active request')
            with self.store.connect() as db:
                job = self._get(db, pid, jid)
            if tile_index is not None:
                if type(tile_index) is not int or not 0 <= tile_index < len(job['tiles']):
                    raise ValueError('Unknown tile index')
                if job['mode'] == 'master' and not job['tiles'][tile_index]['cropAssetId']:
                    raise ValueError('Split the master image before regenerating a tile')
                indices = [tile_index]
            elif job['mode'] == 'master' and target != 'tiles':
                indices = [None]
            else:
                indices = [tile['index'] for tile in job['tiles'] if tile['status'] != 'complete']
                if job['mode'] == 'master' and any(not job['tiles'][i]['cropAssetId'] for i in indices):
                    raise ValueError('Split the master image before regenerating tiles')
            if not indices:
                return self._public(job)
            pending = []
            for index in indices:
                refs = []
                if index is not None and job['tiles'][index]['cropAssetId']:
                    refs = [job['tiles'][index]['cropAssetId'], job['masterAssetId']]
                for asset_id in refs:
                    self.assets.reference_path(pid, asset_id)
                request = {'id': uuid.uuid4().hex, 'tileIndex': index, 'kind': 'master' if index is None else 'tile',
                           'prompt': self._prompt(job, index, override), 'referenceAssetIds': refs, 'status': 'queued',
                           'assetId': None, 'error': '', 'created': time.time()}
                job['requests'].append(request)
                pending.append(request['id'])
                if index is not None:
                    job['tiles'][index].update(status='queued', prompt=override, error='')
            job.update(status='running', error='')
            with self.store.connect() as db:
                self._save(db, job)
            cancel = threading.Event()
            thread = threading.Thread(target=self._execute, args=(pid, jid, pending, cancel), daemon=True)
            self.running[(pid, jid)] = (cancel, thread)
            thread.start()
            return self._public(job)

    def _execute(self, pid, jid, request_ids, cancel):
        key = (pid, jid)
        try:
            for rid in request_ids:
                if cancel.is_set():
                    break
                with self.lock, self.store.connect() as db:
                    job = self._get(db, pid, jid)
                    request = next(item for item in job['requests'] if item['id'] == rid)
                    request['status'] = 'running'
                    index = request['tileIndex']
                    if index is not None:
                        job['tiles'][index]['status'] = 'running'
                    self._save(db, job)
                paths = [self.assets.reference_path(pid, asset_id) for asset_id in request['referenceAssetIds']]
                project_workspace = self.workspace / pid
                if project_workspace.resolve().parent != self.workspace.resolve():
                    raise ValueError('Invalid artwork project workspace')
                project_workspace.mkdir(exist_ok=True)
                workspace = project_workspace / rid
                workspace.mkdir()
                def event(method, params, request_id=rid):
                    if method != 'image/completed':
                        return
                    with self.lock:
                        if cancel.is_set() or self.running.get(key, (None,))[0] is not cancel:
                            return
                        with self.store.connect() as db:
                            current = self._get(db, pid, jid)
                        active = next(item for item in current['requests'] if item['id'] == request_id)
                        if active['status'] != 'running':
                            return
                        target = active['tileIndex']
                        asset = self.assets.capture(pid, request_id, params.get('item', {}),
                            {'jobId': jid, 'role': active['kind'], 'tileIndex': target, 'referenceAssetIds': active['referenceAssetIds'], 'requestId': request_id})
                        if active['assetId'] is None:
                            active['assetId'] = asset['id']
                            if target is None:
                                current['masterAssetId'] = asset['id']
                                current['masterVersions'].append(asset['id'])
                                for tile in current['tiles']:
                                    tile.update(cropAssetId=None, assetId=None, status='pending', error='')
                            else:
                                tile = current['tiles'][target]
                                tile.update(assetId=asset['id'])
                                tile['versions'].append(asset['id'])
                        with self.store.connect() as db:
                            self._save(db, current)
                try:
                    session = self.session_factory(cwd=str(workspace), tools=[], instructions=INSTRUCTIONS,
                        image_generation=True, reference_images=paths, on_event=event, timeout=600)
                    result = session.run(request['prompt'], cancel)
                    error = '' if result.get('status') == 'completed' else str(result.get('error') or 'Image generation did not complete')
                except Exception as exc:
                    error = str(exc)
                finally:
                    # These standalone sessions never resume their cwd. Remove
                    # only this service-created request directory after closing.
                    shutil.rmtree(workspace)
                with self.lock, self.store.connect() as db:
                    job = self._get(db, pid, jid)
                    current = next(item for item in job['requests'] if item['id'] == rid)
                    status = 'cancelled' if cancel.is_set() else 'failed' if error or not current['assetId'] else 'complete'
                    current.update(status=status, error=error or ('' if current['assetId'] else 'No image was returned'))
                    if index is not None:
                        job['tiles'][index].update(status=status, error=current['error'])
                    self._save(db, job)
                    if status == 'failed':
                        break
        except Exception as exc:
            with self.lock, self.store.connect() as db:
                job = self._get(db, pid, jid)
                job['error'] = str(exc)
                self._save(db, job)
        finally:
            with self.lock, self.store.connect() as db:
                job = self._get(db, pid, jid)
                requested = [item for item in job['requests'] if item['id'] in request_ids]
                for item in requested:
                    if item['status'] in ('running', 'queued'):
                        item['status'] = 'cancelled' if cancel.is_set() else 'interrupted'
                        if item['tileIndex'] is not None:
                            job['tiles'][item['tileIndex']]['status'] = item['status']
                failed = any(item['status'] != 'complete' for item in requested)
                job['status'] = 'cancelled' if cancel.is_set() else 'failed' if failed or job['error'] else 'ready' if job['mode'] == 'master' else 'complete'
                if failed and not job['error']:
                    job['error'] = next((item['error'] for item in requested if item['error']), '')
                self._save(db, job)
                if self.running.get(key, (None,))[0] is cancel:
                    self.running.pop(key)

    def cancel(self, pid, jid):
        with self.lock, self.store.connect() as db:
            job = self._get(db, pid, jid)
            active = self.running.get((pid, jid))
            if active:
                active[0].set()
                job['status'] = 'cancelling'
                self._save(db, job)
            return self._public(job)

    def close(self):
        with self.lock:
            self.closed = True
            active = list(self.running.values())
            for cancel, _ in active:
                cancel.set()
        for _, thread in active:
            thread.join(timeout=4)


def route(handler, method, path, body):
    parts = path.strip('/').split('/')
    if len(parts) < 4 or parts[:2] != ['api', 'projects'] or parts[3] != 'artwork':
        return False
    service, pid = handler.server.artwork, parts[2]
    if len(parts) == 4 and method == 'GET':
        result = service.list(pid)
    elif len(parts) == 4 and method == 'POST':
        result = service.create(pid, body)
    elif len(parts) == 5 and method == 'GET':
        result = service.get(pid, parts[4])
    elif len(parts) == 6 and method == 'POST' and parts[5] == 'split':
        result = service.split(pid, parts[4], body)
    elif len(parts) == 6 and method == 'POST' and parts[5] == 'generate':
        result = service.generate(pid, parts[4], body)
    elif len(parts) == 6 and method == 'POST' and parts[5] == 'cancel':
        result = service.cancel(pid, parts[4])
    elif len(parts) == 8 and method == 'POST' and parts[5] == 'tiles' and parts[7] == 'generate':
        result = service.generate(pid, parts[4], body, int(parts[6]))
    else:
        return False
    handler.respond(200, result)
    return True
