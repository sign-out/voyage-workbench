"""Official image uploads with immutable source assets and durable exact retries."""
import base64
from datetime import datetime, timezone
from email.utils import parsedate_to_datetime
import io
import hashlib
import ipaddress
import json
from pathlib import Path
import shutil
import socket
import subprocess
import tempfile
import threading
import time
import urllib.error
import urllib.parse
import urllib.request
import uuid

from . import document
from .voyage import VoyageError, NoRedirect

CONSTRAINTS = {
    'source': 'https://api.aidungeon.com/creator/v1/openapi.json',
    'maxFileSizeBytes': 5 * 1024 * 1024,
    'allowedMimeTypes': ['image/png', 'image/jpeg', 'image/jpg', 'image/webp'],
    'targets': {target: {'minimumWidth': 600, 'minimumHeight': 600,
                        'recommendedWidth': width, 'recommendedHeight': height,
                        'aspectRatioRule': 'none', 'maximumWidth': None, 'maximumHeight': None}
                for target, width, height in [('AREA_IMAGE', 750, 1333), ('LOCATION_IMAGE', 750, 1333),
                                              ('NPC_PORTRAIT', 750, 1000), ('REGION_MAP_IMAGE', 1000, 1000)]}}


def inspect_image(data):
    if not data or len(data) > CONSTRAINTS['maxFileSizeBytes']:
        raise ValueError('Voyage image uploads must be at most 5 MiB')
    if data.startswith(b'\x89PNG\r\n\x1a\n'):
        mime, kind = 'image/png', 'png'
    elif data.startswith(b'\xff\xd8\xff'):
        mime, kind = 'image/jpeg', 'jpeg'
    elif data.startswith(b'RIFF') and data[8:12] == b'WEBP':
        mime, kind = 'image/webp', 'webp'
    else:
        raise ValueError('Choose a PNG, JPEG or WebP image')
    try:
        from PIL import Image
    except ImportError:
        Image = None
    if Image:
        try:
            with Image.open(io.BytesIO(data)) as image:
                width, height = image.size
                if width * height > 64_000_000:
                    raise ValueError('Image exceeds the local 64 megapixel inspection limit')
                image.load()
        except (OSError, SyntaxError) as exc:
            raise ValueError('Image could not be decoded') from exc
    else:
        magick = shutil.which('magick')
        if not magick:
            raise ValueError('Image inspection needs Pillow or ImageMagick. Install Pillow first.')
        with tempfile.TemporaryDirectory(prefix='voyage-inspect-') as temporary:
            path = Path(temporary) / 'image'
            path.write_bytes(data)
            try:
                result = subprocess.run([magick, '-limit', 'memory', '256MiB', '-limit', 'map', '256MiB',
                    '-limit', 'disk', '0', '-limit', 'time', '20', kind + ':' + str(path) + '[0]',
                    '-format', '%w %h', 'info:'], capture_output=True, timeout=25)
                if result.returncode:
                    raise ValueError('Image could not be decoded')
                width, height = map(int, result.stdout.decode().split())
            except (OSError, subprocess.TimeoutExpired) as exc:
                raise ValueError('Local image inspection failed') from exc
        if width * height > 64_000_000:
            raise ValueError('Image exceeds the local 64 megapixel inspection limit')
    if width < 600 or height < 600:
        raise ValueError('All Voyage image targets require at least 600 × 600 pixels')
    return mime, width, height


def _https_url(value):
    if not isinstance(value, str) or not value:
        raise ValueError('Provider did not return an image URL')
    url = urllib.parse.urlsplit(value)
    if url.scheme != 'https' or not url.hostname or url.username or url.password or url.fragment or url.port not in (None, 443):
        raise ValueError('Provider URL must use HTTPS without credentials or a custom port')
    return url


def put_signed(url, data, mime):
    """Upload only bytes and MIME; never inherit the Creator bearer header."""
    parsed = _https_url(url)
    try:
        addresses = socket.getaddrinfo(parsed.hostname, 443, type=socket.SOCK_STREAM)
        if not addresses or any(not ipaddress.ip_address(address[4][0]).is_global for address in addresses):
            raise ValueError('Signed upload URL must resolve to a public server')
        request = urllib.request.Request(url, data=data, headers={'Content-Type': mime, 'User-Agent': 'VoyageWorkbench/1.0'}, method='PUT')
        with urllib.request.build_opener(NoRedirect()).open(request, timeout=45) as response:
            if not 200 <= response.status < 300:
                raise VoyageError('Signed upload did not return success')
            response.read(64 * 1024)
    except urllib.error.HTTPError as exc:
        code = exc.code
        exc.close()
        raise VoyageError('Signed image upload returned HTTP ' + str(code), status_code=code,
                          rejected=400 <= code < 500) from None
    except OSError:
        # Do not leak the signed capability URL through an exception message.
        raise VoyageError('Signed upload connection failed; exact bytes can be retried before expiry') from None


def _destination(text, target, path):
    info = document.inspect(text)
    root = info.get('gameStatePath')
    if root is None or info['errors'] or not isinstance(path, list) or path[:len(root)] != root:
        raise ValueError('Choose a supported image field in the current world')
    relative = path[len(root):]
    valid = False
    record_length = None
    if target == 'NPC_PORTRAIT':
        valid = len(relative) == 3 and relative[0] == 'npcs' and relative[2:] == ['portraitUrl']
        if len(relative) == 3 and relative[0] == 'premadeCharacters' and type(relative[1]) is int and relative[1] >= 0 and relative[2] == 'portraitUrl':
            valid = True
        record_length = 2
    elif target == 'REGION_MAP_IMAGE':
        valid = len(relative) == 5 and relative[0] == 'regions' and relative[2:] == ['images', 'map', 'imageUrl']
        record_length = 2
    elif target == 'LOCATION_IMAGE':
        valid = len(relative) == 5 and relative[0] == 'locations' and relative[2:] == ['images', 'establishingShot', 'imageUrl']
        record_length = 2
    elif target == 'AREA_IMAGE':
        valid = len(relative) == 7 and relative[0] == 'locations' and relative[2] == 'areas' and relative[4:] == ['images', 'establishingShot', 'imageUrl']
        record_length = 4
        if len(relative) == 5 and relative[0] == 'unassignedAreas' and relative[2:] == ['images', 'establishingShot', 'imageUrl']:
            valid, record_length = True, 2
    allowed_segments = all(isinstance(part, str) for part in relative) or (
        target == 'NPC_PORTRAIT' and len(relative) == 3 and relative[0] == 'premadeCharacters'
        and type(relative[1]) is int and relative[1] >= 0 and relative[2] == 'portraitUrl')
    if not valid or not allowed_segments:
        raise ValueError('Destination image field does not match the upload target')
    record_path = root + relative[:record_length]
    if not isinstance(document.parse(document.section(text, record_path)), dict):
        raise ValueError('Image destination record must exist')
    return record_path


def apply_image_url(text, target, path, image_url):
    """Set only a documented image URL; preserve original numeric/source lexemes."""
    _https_url(image_url)
    record = _destination(text, target, path)
    for length in range(len(record), len(path) - 1):
        parent = path[:length]
        key = path[length]
        value = document.parse(document.section(text, parent))
        if not isinstance(value, dict):
            raise ValueError('Image field containers must be objects')
        if key not in value:
            text = document.mutate(text, parent, 'add', key, '{}')
        elif not isinstance(value[key], dict):
            raise ValueError('Existing image field container is not an object')
    parent = path[:-1]
    value = json.dumps(image_url, ensure_ascii=True)
    if path[-1] in document.parse(document.section(text, parent)):
        return document.replace(text, path, value)
    return document.mutate(text, parent, 'add', path[-1], value)


def _expiry(value):
    if value is None:
        return None
    try:
        result = datetime.fromisoformat(value.replace('Z', '+00:00'))
        if result.tzinfo is None:
            raise ValueError()
        return result.timestamp()
    except (ValueError, TypeError, AttributeError):
        raise ValueError('Upload allowance has an invalid expiry') from None


def _retry_after(value):
    try:
        return max(0, float(value))
    except (TypeError, ValueError):
        try:
            return max(0, parsedate_to_datetime(value).timestamp() - time.time())
        except (TypeError, ValueError, OverflowError):
            return 60


class Uploads:
    def __init__(self, store, client, assets, transport=put_signed):
        self.store, self.client, self.assets, self.transport = store, client, assets, transport
        self.lock = threading.RLock()
        with store.connect() as db:
            db.execute('CREATE TABLE IF NOT EXISTS image_uploads (id TEXT PRIMARY KEY,project_id TEXT NOT NULL,payload TEXT NOT NULL)')
            for row in db.execute('SELECT payload FROM image_uploads').fetchall():
                upload = json.loads(row[0])
                if upload['status'] == 'sending':
                    upload.update(status='unknown', error='Workbench stopped during upload. Retry the identical recorded step; no new allowance will be requested.', retryAt=time.time())
                    self._save(db, upload)

    def _save(self, db, upload):
        upload['updated'] = time.time()
        db.execute('INSERT OR REPLACE INTO image_uploads VALUES (?,?,?)', (upload['id'], upload['projectId'], json.dumps(upload)))

    def _get(self, db, pid, uid):
        self.store.project(db, pid)
        row = db.execute('SELECT payload FROM image_uploads WHERE id=? AND project_id=?', (uid, pid)).fetchone()
        if not row:
            raise KeyError('Image upload not found')
        return json.loads(row[0])

    def _public(self, upload):
        result = {key: value for key, value in upload.items() if key not in ('directUploadUrl', 'allowanceKey', 'moderationKey')}
        result['canRetry'] = upload['status'] in ('prepared', 'retryable', 'pending', 'unknown') and time.time() < upload.get('replayUntil', float('inf'))
        result['retryAfterSeconds'] = max(0, int(upload.get('retryAt', 0) - time.time() + .99))
        return result

    def _link(self, db, pid):
        row = db.execute('SELECT short_id,environment FROM remote_links WHERE project_id=?', (pid,)).fetchone()
        if not row:
            raise ValueError('Create a Voyage draft or download an owned world before uploading images')
        if row['environment'] != self.client.environment:
            raise ValueError('Connect to this world’s ' + row['environment'] + ' environment first')
        return dict(row)

    def list(self, pid):
        with self.lock, self.store.connect() as db:
            self.store.project(db, pid)
            link = db.execute('SELECT short_id,environment FROM remote_links WHERE project_id=?', (pid,)).fetchone()
            uploads = [self._public(json.loads(row[0])) for row in db.execute('SELECT payload FROM image_uploads WHERE project_id=? ORDER BY rowid DESC', (pid,))]
        return {'uploads': uploads, 'constraints': CONSTRAINTS, 'assets': self.assets.list(pid),
                'linked': {'shortId': link['short_id'], 'environment': link['environment']} if link else None}

    def get(self, pid, uid):
        with self.lock, self.store.connect() as db:
            return self._public(self._get(db, pid, uid))

    def prepare(self, pid, body):
        target = body.get('target')
        if target not in CONSTRAINTS['targets']:
            raise ValueError('Choose a supported image upload target')
        with self.lock, self.store.connect() as db:
            project = self.store.project(db, pid)
            link = self._link(db, pid)
        path = body.get('destinationPath')
        if path is not None:
            _destination(project['text'], target, path)
        asset_id, encoded = body.get('assetId'), body.get('imageData')
        if bool(asset_id) == bool(encoded):
            raise ValueError('Choose exactly one existing image asset or uploaded image file')
        if asset_id:
            data, _, _ = self.assets.read(pid, asset_id)
        else:
            if not isinstance(encoded, str) or len(encoded) > CONSTRAINTS['maxFileSizeBytes'] * 4 // 3 + 200:
                raise ValueError('Image exceeds 5 MiB upload limit')
            if encoded.startswith('data:'):
                header, encoded = encoded.split(',', 1)
                if ';base64' not in header:
                    raise ValueError('Image file must be base64 encoded')
            try:
                data = base64.b64decode(encoded, validate=True)
            except ValueError:
                raise ValueError('Image file is not valid base64') from None
        mime, width, height = inspect_image(data)
        source_hash = hashlib.sha256(data).hexdigest()
        with self.lock, self.store.connect() as db:
            for row in db.execute('SELECT payload FROM image_uploads WHERE project_id=?', (pid,)):
                prior = json.loads(row[0])
                if (prior.get('sourceSha256') == source_hash and prior['target'] == target
                        and prior['environment'] == link['environment'] and prior['shortId'] == link['short_id']
                        and prior['status'] in ('sending', 'unknown', 'pending', 'retryable')):
                    raise ValueError('This image already has an unfinished upload. Resume upload ' + prior['id'] + ' with its original request keys.')
        uid, now = uuid.uuid4().hex, time.time()
        if not asset_id:
            asset_id = self.assets.capture_bytes(pid, 'upload-' + uid, 'source', data, 'Local image selected for Voyage upload', {'role': 'upload-source', 'target': target})['id']
        upload = {'id': uid, 'projectId': pid, 'target': target, 'assetId': asset_id,
                  'width': width, 'height': height, 'mimeType': mime, 'bytes': len(data),
                  'sourceSha256': source_hash,
                  'shortId': link['short_id'], 'environment': link['environment'], 'destinationPath': path,
                  'status': 'prepared', 'step': 'allowance', 'imageUrl': None, 'uploadId': None,
                  'allowanceKey': 'image-allowance-' + uid, 'moderationKey': 'image-moderation-' + uid,
                  'error': '', 'retryAt': 0, 'created': now, 'updated': now, 'events': []}
        with self.lock, self.store.connect() as db:
            self._save(db, upload)
        return self._public(upload)

    def send(self, pid, uid):
        with self.lock:
            with self.store.connect() as db:
                upload = self._get(db, pid, uid)
                link = self._link(db, pid)
            if upload['environment'] != link['environment'] or upload['shortId'] != link['short_id']:
                raise ValueError('Upload belongs to a different linked Voyage world or environment')
            if upload['status'] in ('ready', 'applied'):
                return self._public(upload)
            if not self._public(upload)['canRetry']:
                raise ValueError('This upload cannot be retried. Prepare a new upload after reviewing its result.')
            if time.time() < upload.get('retryAt', 0):
                raise ValueError('Wait for the upload retry countdown before trying the same request')
            if not self.client.key:
                raise ValueError('Connect a Creator API key before uploading')
            data, mime, _ = self.assets.read(pid, upload['assetId'])
            if mime != upload['mimeType']:
                raise ValueError('Source asset MIME changed')
            try:
                while upload['step'] != 'done':
                    step = upload['step']
                    # Persist exact request identity before each external effect.
                    upload.update(status='sending', error='', replayUntil=upload.get('replayUntil', time.time() + 24 * 60 * 60))
                    upload['events'].append({'step': step, 'status': 'sending', 'created': time.time()})
                    with self.store.connect() as db:
                        self._save(db, upload)
                    if step == 'allowance':
                        request = json.dumps({key: upload[key] for key in ('target', 'width', 'height', 'mimeType')}, separators=(',', ':'))
                        raw, _ = self.client.request('POST', '/uploads', request, idempotency_key=upload['allowanceKey'])
                        allowance = json.loads(raw)['data']
                        _https_url(allowance['directUploadUrl'])
                        if not isinstance(allowance.get('uploadId'), str) or not allowance['uploadId']:
                            raise ValueError('Upload allowance is missing its identifier')
                        _expiry(allowance.get('expiresAt'))
                        upload.update(uploadId=allowance['uploadId'], directUploadUrl=allowance['directUploadUrl'], expiresAt=allowance.get('expiresAt'), step='bytes')
                    elif step == 'bytes':
                        expires = _expiry(upload.get('expiresAt'))
                        if expires is not None and expires <= time.time():
                            upload.update(status='expired', error='Signed upload URL expired. Prepare a new upload with a new allowance; this request will not silently consume another allowance.')
                            upload['events'][-1]['status'] = 'expired'
                            break
                        self.transport(upload['directUploadUrl'], data, mime)
                        upload['step'] = 'moderation'
                    elif step == 'moderation':
                        path = '/worlds/' + urllib.parse.quote(upload['shortId'], safe='') + '/uploads/' + urllib.parse.quote(upload['uploadId'], safe='') + '/moderate'
                        raw, _ = self.client.request('POST', path, json.dumps({'target': upload['target']}, separators=(',', ':')), idempotency_key=upload['moderationKey'])
                        result = json.loads(raw)['data']
                        if result.get('success') is not True or result.get('code') != 200:
                            raise VoyageError('Image moderation did not approve this image', rejected=True, code='studio_media_failed')
                        _https_url(result.get('imageUrl'))
                        upload.update(imageUrl=result['imageUrl'], step='done', status='ready')
                    else:
                        raise ValueError('Unknown recorded upload step')
                    upload['events'][-1]['status'] = 'complete'
                    with self.store.connect() as db:
                        self._save(db, upload)
            except Exception as exc:
                code, http = getattr(exc, 'code', None), getattr(exc, 'status_code', None)
                if code == 'request_in_progress':
                    status = 'pending'
                elif code == 'studio_unavailable' or http in (429,):
                    status = 'retryable'
                elif isinstance(exc, VoyageError) and exc.rejected:
                    status = 'rejected'
                else:
                    status = 'unknown'
                message = str(exc) if isinstance(exc, VoyageError) else 'The upload response could not be confirmed; retry only this recorded request.'
                # Cap provider messages and remove the signed upload capability.
                if upload.get('directUploadUrl'):
                    message = message.replace(upload['directUploadUrl'], '[signed upload URL]')
                upload.update(status=status, error=message[:1000], retryAt=time.time() + _retry_after(getattr(exc, 'retry_after', None)))
                if upload['events']:
                    upload['events'][-1]['status'] = status
            with self.store.connect() as db:
                self._save(db, upload)
            return self._public(upload)

    def apply(self, pid, uid, body):
        from .server import Conflict
        with self.lock, self.store.connect() as db:
            db.execute('BEGIN IMMEDIATE')
            upload = self._get(db, pid, uid)
            current = self.store.project(db, pid)
            if upload['status'] not in ('ready', 'applied') or not upload['imageUrl']:
                raise ValueError('Only a successfully moderated upload can be applied')
            if type(body.get('version')) is not int or body['version'] != current['version']:
                raise Conflict('World changed; reload before applying the uploaded image')
            link = self._link(db, pid)
            if link['short_id'] != upload['shortId'] or link['environment'] != upload['environment']:
                raise ValueError('Upload belongs to a different linked world')
            path = body.get('path', upload['destinationPath'])
            text = apply_image_url(current['text'], upload['target'], path, upload['imageUrl'])
            self.store.checkpoint(db, pid, current['text'], 'Before applying uploaded image')
            self.store.revisions.ensure(pid, current['text'])
            self.store.revisions.commit(pid, text, 'Apply uploaded ' + upload['target'].lower())
            db.execute('UPDATE projects SET text=?,version=version+1,updated=? WHERE id=?', (text, time.time(), pid))
            upload.update(status='applied', appliedVersion=current['version'] + 1, destinationPath=path)
            self._save(db, upload)
            return {'upload': self._public(upload), 'project': self.store.project(db, pid)}


def route(handler, method, path, body):
    parts = path.strip('/').split('/')
    if len(parts) < 4 or parts[:2] != ['api', 'projects'] or parts[3] != 'uploads':
        return False
    server, pid = handler.server, parts[2]
    with server.remote_lock:
        service = server.uploads
        if len(parts) == 4 and method == 'GET':
            result = service.list(pid)
        elif len(parts) == 4 and method == 'POST':
            result = service.prepare(pid, body)
        elif len(parts) == 5 and method == 'GET':
            result = service.get(pid, parts[4])
        elif len(parts) == 6 and method == 'POST' and parts[5] == 'send':
            result = service.send(pid, parts[4])
        elif len(parts) == 6 and method == 'POST' and parts[5] == 'apply':
            result = service.apply(pid, parts[4], body)
        else:
            return False
    handler.respond(200, result)
    return True
