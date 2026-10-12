"""Loopback-only, dependency-free persistent Voyage workspace."""
import argparse
import json
import mimetypes
import secrets
import shutil
import sqlite3
import sys
import threading
import time
import uuid
from contextlib import contextmanager
from http.cookies import SimpleCookie
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import unquote, urlsplit

ROOT = Path(__file__).resolve().parent.parent
LIMIT = 64 * 1024 * 1024


class Conflict(Exception):
    pass


class Store:
    @staticmethod
    def name_for(text, fallback):
        from . import document
        try:
            _, path = document._identify(document.parse(text))
            if path:
                title = document.parse(document.section(text, path[:-1] + ['title']))
                if isinstance(title, str) and title.strip() and len(title.strip()) <= 120:
                    return title.strip()
        except (ValueError, TypeError, KeyError, RecursionError):
            pass  # Invalid manual drafts must remain saveable.
        return fallback

    def __init__(self, path):
        from .revisions import Revisions
        self.path = str(path)
        self.lifecycle_lock = threading.RLock()
        Path(path).parent.mkdir(parents=True, exist_ok=True)
        self.revisions = Revisions(Path(path).parent / 'revisions')
        with self.connect() as db:
            db.executescript('''CREATE TABLE IF NOT EXISTS projects
              (id TEXT PRIMARY KEY,name TEXT NOT NULL,text TEXT NOT NULL,original TEXT NOT NULL,
               version INTEGER NOT NULL,updated REAL NOT NULL);
              CREATE TABLE IF NOT EXISTS checkpoints
               (id TEXT PRIMARY KEY,project_id TEXT NOT NULL,text TEXT NOT NULL,reason TEXT NOT NULL,created REAL NOT NULL);''')
            columns = {row['name'] for row in db.execute('PRAGMA table_info(projects)')}
            if 'archived' not in columns:
                db.execute('ALTER TABLE projects ADD COLUMN archived INTEGER NOT NULL DEFAULT 0')
            if 'archived_at' not in columns:
                db.execute('ALTER TABLE projects ADD COLUMN archived_at REAL')

    @contextmanager
    def connect(self):
        db = sqlite3.connect(self.path, timeout=10)
        db.row_factory = sqlite3.Row
        try:
            with db:
                yield db
        finally:
            db.close()

    def project(self, db, pid):
        row = db.execute('SELECT * FROM projects WHERE id=?', (pid,)).fetchone()
        if row is None:
            raise KeyError('Project not found')
        result = dict(row)
        result['archived'] = bool(result['archived'])
        result['checkpoints'] = [dict(r) for r in db.execute(
            'SELECT id,reason,created FROM checkpoints WHERE project_id=? ORDER BY created DESC', (pid,))]
        return result

    def create(self, name, text):
        if not isinstance(name, str) or not name.strip() or not isinstance(text, str):
            raise ValueError('A name and text string are required')
        pid = uuid.uuid4().hex
        with self.connect() as db:
            self.revisions.ensure(pid, text)
            db.execute('INSERT INTO projects(id,name,text,original,version,updated,archived) VALUES (?,?,?,?,?,?,0)', (pid, name.strip(), text, text, 1, time.time()))
            self.checkpoint(db, pid, text, 'Imported original', record_revision=False)
            return self.project(db, pid)

    def checkpoint(self, db, pid, text, reason, record_revision=True):
        if record_revision:
            self.revisions.ensure(pid, text)
            self.revisions.commit(pid, text, reason, allow_empty=True)
        db.execute('INSERT INTO checkpoints VALUES (?,?,?,?,?)',
                   (uuid.uuid4().hex, pid, text, reason, time.time()))

    def change(self, pid, body, action):
        with self.connect() as db:
            db.execute('BEGIN IMMEDIATE')
            current = self.project(db, pid)
            if current['archived']:
                raise Conflict('Restore this project from trash before editing')
            if type(body.get('version')) is not int or body['version'] != current['version']:
                raise Conflict('Project changed in another tab; reload before saving')
            text = current['text']
            if action == 'save':
                text = body.get('text')
                if not isinstance(text, str):
                    raise ValueError('text must be a string')
                self.revisions.ensure(pid, current['text'])
                self.revisions.commit(pid, text, 'Save working copy')
            elif action == 'checkpoints':
                reason = body.get('reason', 'Manual checkpoint')
                if not isinstance(reason, str) or not reason.strip():
                    raise ValueError('reason must be a nonempty string')
                self.checkpoint(db, pid, text, reason)
            elif action == 'restore':
                row = db.execute('SELECT text FROM checkpoints WHERE id=? AND project_id=?',
                                 (body.get('checkpointId'), pid)).fetchone()
                if row is None:
                    raise KeyError('Checkpoint not found')
                self.checkpoint(db, pid, text, 'Before restore')
                text = row['text']
                self.revisions.commit(pid, text, 'Restore checkpoint')
            else:
                raise ValueError('Unknown project change action')
            db.execute('UPDATE projects SET name=?,text=?,version=version+1,updated=? WHERE id=?',
                       (self.name_for(text, current['name']), text, time.time(), pid))
            return self.project(db, pid)

    def list_projects(self, archived=False):
        with self.connect() as db:
            return [{**dict(row), 'archived': bool(row['archived'])} for row in db.execute(
                'SELECT id,name,updated,version,archived,archived_at FROM projects WHERE archived=? ORDER BY updated DESC', (int(archived),))]

    def rename(self, pid, body):
        from . import document
        name = body.get('name')
        if not isinstance(name, str) or not name.strip() or len(name.strip()) > 120:
            raise ValueError('World name must be 1–120 characters.')
        name = name.strip()
        with self.connect() as db:
            db.execute('BEGIN IMMEDIATE')
            current = self.project(db, pid)
            if type(body.get('version')) is not int or body['version'] != current['version']:
                raise Conflict('Project changed; reload before renaming.')
            if current['archived']:
                raise Conflict('Restore this project from trash before renaming.')
            text = current['text']
            info = document.inspect(text)
            if info['errors']:
                raise ValueError('Fix the world JSON before renaming.')
            if info['gameStatePath']:
                parent = info['gameStatePath'][:-1]
                world = document.parse(document.section(text, parent))
                text = document.replace(text, parent + ['title'], json.dumps(name)) if 'title' in world else document.mutate(text, parent, 'add', 'title', json.dumps(name))
            self.checkpoint(db, pid, current['text'], 'Before rename: ' + current['name'])
            self.revisions.commit(pid, text, 'Rename world to ' + name, allow_empty=True)
            db.execute('UPDATE projects SET name=?,text=?,version=version+1,updated=? WHERE id=?', (name, text, time.time(), pid))
            return self.project(db, pid)

    def archive(self, pid, version, archived=True):
        with self.lifecycle_lock, self.connect() as db:
            db.execute('BEGIN IMMEDIATE')
            current = self.project(db, pid)
            if type(version) is not int or version != current['version']:
                raise Conflict('Project changed; reload before changing its trash status')
            if current['archived'] == archived:
                raise Conflict('Project is already in the requested state')
            now = time.time()
            db.execute('UPDATE projects SET archived=?,archived_at=?,version=version+1,updated=? WHERE id=?',
                       (int(archived), now if archived else None, now, pid))
            return self.project(db, pid)

    def delete(self, pid, version):
        """Remove application-owned history and files; never touch remote worlds."""
        self.revisions._id(pid)
        root = Path(self.path).resolve().parent
        moved = []
        quarantine = root / ('.purge-' + uuid.uuid4().hex)
        try:
            with self.lifecycle_lock, self.revisions._lock(pid), self.connect() as db:
                db.execute('BEGIN IMMEDIATE')
                current = self.project(db, pid)
                if type(version) is not int or version != current['version']:
                    raise Conflict('Project changed; reload before deleting')
                if not current['archived']:
                    raise Conflict('Move the project to trash before permanently deleting it')
                tables = {row['name'] for row in db.execute("SELECT name FROM sqlite_master WHERE type='table'")}
                targets = [self.revisions._repo(pid), root / 'artwork-workspaces' / pid]
                for registry in (self.revisions.root / 'stage-registry').glob('*.json'):
                    if registry.is_symlink():
                        raise ValueError('Revision registry cannot be a symbolic link')
                    record = json.loads(registry.read_text(encoding='utf-8'))
                    if record.get('project_id') == pid:
                        self.revisions._id(registry.stem)
                        targets.extend([self.revisions.root / 'stages' / registry.stem, registry])
                if 'world_assets' in tables:
                    for asset in db.execute('SELECT id,extension FROM world_assets WHERE project_id=?', (pid,)):
                        if len(asset['id']) != 64 or any(c not in '0123456789abcdef' for c in asset['id']) or asset['extension'] not in ('png', 'jpg', 'webp'):
                            raise ValueError('Invalid stored image identity')
                        targets.append(root / 'assets' / (asset['id'] + '.' + asset['extension']))
                quarantine.mkdir(mode=0o700)
                for target in targets:
                    if target.exists() or target.is_symlink():
                        destination = quarantine / str(len(moved))
                        target.rename(destination)
                        moved.append((target, destination))
                for table in tables:
                    # Only fixed identifiers discovered from this owned DB are
                    # quoted, never request data interpolated into SQL.
                    quoted = '"' + table.replace('"', '""') + '"'
                    columns = {row['name'] for row in db.execute('PRAGMA table_info(' + quoted + ')')}
                    if 'project_id' in columns:
                        db.execute('DELETE FROM ' + quoted + ' WHERE project_id=?', (pid,))
                if 'agent_runs' in tables:
                    for row in db.execute('SELECT id,payload FROM agent_runs').fetchall():
                        if json.loads(row['payload']).get('projectId') == pid:
                            db.execute('DELETE FROM agent_runs WHERE id=?', (row['id'],))
                db.execute('DELETE FROM projects WHERE id=?', (pid,))
        except Exception:
            for target, destination in reversed(moved):
                if destination.exists() or destination.is_symlink():
                    destination.rename(target)
            if quarantine.exists():
                shutil.rmtree(quarantine)
            raise
        shutil.rmtree(quarantine)
        return {'deleted': True, 'id': pid}


class Server(ThreadingHTTPServer):
    daemon_threads = True

    def __init__(self, address, db_path, web_root=None, fixtures_root=None, external_origin=None):
        super().__init__(address, Handler)
        from .tailnet import origin
        self.external_origin = origin(external_origin) if external_origin else None
        self.store = Store(db_path)
        self.web_root = Path(web_root or ROOT / 'web').resolve()
        self.fixtures_root = Path(fixtures_root or ROOT / 'fixtures').resolve()
        self.session = secrets.token_urlsafe(32)
        self.token = secrets.token_urlsafe(32)
        from .integrations import initialize
        initialize(self)


class Handler(BaseHTTPRequestHandler):
    def log_message(self, format, *args):
        # Never log project contents, credentials, or request query strings.
        pass

    def respond(self, status, value, cookie=False):
        data = json.dumps(value, ensure_ascii=True).encode()
        self.send_response(status)
        self.send_header('Content-Type', 'application/json; charset=utf-8')
        self.send_header('Content-Length', str(len(data)))
        self.send_header('Cache-Control', 'no-store')
        self.send_header('X-Content-Type-Options', 'nosniff')
        if cookie:
            self.send_header('Set-Cookie', 'workbench_session=' + self.server.session + '; HttpOnly; SameSite=Strict; Path=/' + ('; Secure' if self.headers.get('Host') == urlsplit(self.server.external_origin or '').netloc else ''))
        self.end_headers()
        self.wfile.write(data)

    def trusted(self):
        port = self.server.server_port
        local = {f'localhost:{port}', f'127.0.0.1:{port}'}
        host = self.headers.get('Host', '')
        external = self.server.external_origin
        expected = external if external and host == urlsplit(external).netloc else 'http://' + host if host in local else None
        if expected is None:
            return False
        request_origin = self.headers.get('Origin')
        return not request_origin or request_origin == expected

    def authenticated(self):
        cookie = SimpleCookie()
        try:
            cookie.load(self.headers.get('Cookie', ''))
            return secrets.compare_digest(cookie['workbench_session'].value, self.server.session)
        except (KeyError, ValueError):
            return False

    def body(self):
        if self.headers.get('Transfer-Encoding'):
            raise ValueError('Transfer encoding is unsupported')
        length = int(self.headers.get('Content-Length', '0'))
        if length < 0 or length > LIMIT:
            raise ValueError('Request body exceeds 64 MiB limit')
        if self.headers.get_content_type() != 'application/json':
            raise ValueError('Content-Type must be application/json')
        result = json.loads(self.rfile.read(length))
        if not isinstance(result, dict):
            raise ValueError('Request body must be an object')
        return result

    def do_GET(self):
        self.dispatch('GET')

    def do_POST(self):
        self.dispatch('POST')

    def do_PUT(self):
        self.dispatch('PUT')

    def do_DELETE(self):
        self.dispatch('DELETE')

    def templates(self):
        return {p.stem: p for p in self.server.fixtures_root.glob('*.json') if p.is_file()}

    def dispatch(self, method):
        # Serialize request mutations with lifecycle operations, so a start
        # request cannot race a trash/delete after its archived-state check.
        if method != 'GET':
            with self.server.store.lifecycle_lock:
                return self._dispatch(method)
        return self._dispatch(method)

    def _dispatch(self, method):
        try:
            if not self.trusted():
                return self.respond(403, {'error': 'Untrusted Host or Origin'})
            path = unquote(urlsplit(self.path).path)
            if path == '/api/session' and method == 'GET':
                return self.respond(200, {'token': self.server.token}, cookie=True)
            if not path.startswith('/api/'):
                if method != 'GET':
                    return self.respond(405, {'error': 'Method not allowed'})
                return self.static(path)
            if not self.authenticated():
                return self.respond(401, {'error': 'Start a session first'})
            if method != 'GET' and not secrets.compare_digest(self.headers.get('X-Workbench-Token', ''), self.server.token):
                return self.respond(403, {'error': 'Missing or invalid session token'})
            body = self.body() if method != 'GET' else {}
            store = self.server.store
            parts = path.strip('/').split('/')
            lifecycle = (len(parts) == 4 and parts[:2] == ['api', 'projects'] and parts[3] in ('archive', 'unarchive', 'import-changes', 'rename') and method == 'POST') or (len(parts) == 3 and parts[:2] == ['api', 'projects'] and method == 'DELETE')
            if lifecycle:
                pid = parts[2]
                with self.server.remote_lock, self.server.world_agent.lock, self.server.proposals.lock, self.server.artwork.lock:
                    if pid in self.server.world_agent.running or any(job.get('projectId') == pid and job.get('status') == 'running' for job in self.server.proposals.jobs.values()):
                        raise Conflict('Wait for the active agent run to finish or cancel it before changing this project')
                    if any(key[0] == pid for key in self.server.artwork.running):
                        raise Conflict('Wait for artwork generation to finish or cancel it before changing this project')
                    if method == 'DELETE':
                        result = store.delete(pid, body.get('version'))
                        self.server.proposals.jobs = {key: job for key, job in self.server.proposals.jobs.items() if job.get('projectId') != pid}
                    elif parts[3] == 'import-changes':
                        result = store.revisions.import_changes(store, pid, body)
                    elif parts[3] == 'rename':
                        result = store.rename(pid, body)
                    else:
                        result = store.archive(pid, body.get('version'), parts[3] == 'archive')
                return self.respond(200, result)
            if method != 'GET':
                pid = parts[2] if len(parts) >= 3 and parts[:2] == ['api', 'projects'] else body.get('projectId') if path == '/api/agent/proposals' else None
                if pid:
                    with store.connect() as db:
                        if store.project(db, pid)['archived']:
                            raise Conflict('Restore this project from trash before editing')
            from .integrations import route
            if route(self, method, path, body):
                return
            if path == '/api/reference' and method == 'GET':
                return self.respond(200, json.loads((ROOT / 'docs' / 'wiki.json').read_text(encoding='utf-8')))
            if path == '/api/diff' and method == 'POST':
                from . import document
                if not isinstance(body.get('before'), str) or not isinstance(body.get('after'), str):
                    raise ValueError('before and after must be JSON text strings')
                return self.respond(200, {'changes': document.diff(body['before'], body['after'])})
            if path == '/api/projects':
                if method == 'GET':
                    return self.respond(200, {'projects': store.list_projects()})
                if method == 'POST':
                    return self.respond(201, store.create(body.get('name'), body.get('text')))
            if path == '/api/projects/trash' and method == 'GET':
                return self.respond(200, {'projects': store.list_projects(archived=True)})
            if len(parts) in (3, 4) and parts[:2] == ['api', 'projects']:
                pid = parts[2]
                if len(parts) == 3 and method == 'GET':
                    with store.connect() as db:
                        return self.respond(200, store.project(db, pid))
                if len(parts) == 3 and method == 'PUT':
                    return self.respond(200, store.change(pid, body, 'save'))
                if len(parts) == 4 and method == 'POST' and parts[3] in ('checkpoints', 'restore'):
                    return self.respond(200, store.change(pid, body, parts[3]))
                if len(parts) == 4 and method == 'GET' and parts[3] == 'diff':
                    from . import document
                    with store.connect() as db:
                        project = store.project(db, pid)
                    return self.respond(200, {'changes': document.diff(project['original'], project['text'])})
            if path == '/api/templates' and method == 'GET':
                base_status = self.server.base_world.status()
                return self.respond(200, {'templates': [{'id': k, 'name': base_status.get('active', {}).get('name', 'Blank World') if k == 'blank-world' else k.replace('_', ' ').replace('-', ' ').title(), 'description': 'Configured base world for new projects' if k == 'blank-world' else {'lantern-coast':'A harbor, a missing light, and a first adventure','living-continuity':'177 triggers · systems seed, no world content'}.get(k,'Local JSON template')} for k in self.templates()]})
            if len(parts) == 3 and parts[:2] == ['api', 'templates'] and method == 'POST':
                fixture = self.templates().get(parts[2])
                if fixture is None:
                    raise KeyError('Template not found')
                text = self.server.base_world.template_text() if parts[2] == 'blank-world' and not self.server.base_world.status()['bundled'] else fixture.read_text(encoding='utf-8')
                name = self.server.base_world.status().get('active', {}).get('name', 'Blank World') if parts[2] == 'blank-world' else fixture.stem.replace('-', ' ').title()
                return self.respond(201, store.create(body.get('name', name), text))
            if method == 'POST' and path in ('/api/inspect', '/api/section', '/api/replace', '/api/validate', '/api/mutate', '/api/describe', '/api/replace-draft', '/api/map/inspect', '/api/map/edit', '/api/characters/inspect', '/api/characters/edit', '/api/characters/create'):
                from . import document
                text = body.get('text')
                if not isinstance(text, str):
                    raise ValueError('text must be a string')
                if path.startswith('/api/characters/'):
                    from . import characters
                    if path.endswith('/inspect'):
                        result = characters.inspect(text)
                    elif path.endswith('/create'):
                        result = characters.create(text, body.get('kind'), body.get('name'))
                    else:
                        result = {'text': characters.edit(text, body.get('path'), body.get('changes'), body.get('expected'))}
                elif path == '/api/map/inspect':
                    from . import map_editor
                    result = map_editor.inspect(text)
                elif path == '/api/map/edit':
                    from . import map_editor
                    result = {'text': map_editor.edit(text, body.get('action'), body.get('data', {}))}
                elif path == '/api/inspect':
                    result = document.inspect(text)
                elif path == '/api/validate':
                    result = document.validate(text)
                    from . import schema
                    result['warnings'].extend(schema.validate(text, self.server.base_world.validation_profile()))
                    result['schema'] = self.server.schema_catalog.status()
                    result['source'] = 'Local checks plus selected community schema; official validation is separate'
                elif path == '/api/section':
                    result = {'text': document.section(text, body.get('path', []))}
                elif path == '/api/replace-draft':
                    result = {'text': document.replace_draft(text, body.get('path', []), body.get('value'))}
                elif path == '/api/describe':
                    result = document.describe(text, body.get('path', []))
                elif path == '/api/mutate':
                    result = {'text': document.mutate(text, body.get('path', []), body.get('action'), body.get('key'), body.get('value'))}
                else:
                    value = body.get('value')
                    if not isinstance(value, str):
                        raise ValueError('value must be JSON text')
                    result = {'text': document.replace(text, body.get('path', []), value)}
                return self.respond(200, result)
            return self.respond(404, {'error': 'Route not found'})
        except Conflict as exc:
            self.respond(409, {'error': str(exc)})
        except KeyError as exc:
            self.respond(404, {'error': str(exc)})
        except (ValueError, TypeError, UnicodeError) as exc:
            self.respond(400, {'error': str(exc)})
        except Exception:
            self.respond(500, {'error': 'Internal server error'})

    def static(self, path):
        target = (self.server.web_root / (path.lstrip('/') or 'index.html')).resolve()
        if not target.is_relative_to(self.server.web_root) or not target.is_file():
            return self.respond(404, {'error': 'File not found'})
        data = target.read_bytes()
        self.send_response(200)
        self.send_header('Content-Type', mimetypes.guess_type(str(target))[0] or 'application/octet-stream')
        self.send_header('Content-Length', str(len(data)))
        self.send_header('X-Content-Type-Options', 'nosniff')
        self.send_header('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' https: data:; style-src 'self'; object-src 'none'; frame-ancestors 'none'")
        self.end_headers()
        self.wfile.write(data)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--port', type=int, default=8765)
    parser.add_argument('--db', default=str(ROOT / '.workbench' / 'workbench.sqlite3'))
    parser.add_argument('--tailscale', action='store_true', help='Register private HTTPS access through Tailscale Serve')
    parser.add_argument('--tailscale-port', type=int, default=8443, help='Private HTTPS port (default 8443)')
    args = parser.parse_args()
    server = Server(('127.0.0.1', args.port), args.db)
    if args.tailscale:
        from .tailnet import register
        from .setup import ensure_tailnet
        try:
            ensure_tailnet()
            try:
                server.external_origin = register(server.server_port, args.tailscale_port)
            except ValueError as exc:
                if not sys.stdin.isatty() or 'https://' not in str(exc):
                    raise
                print('Tailscale Serve needs browser setup: ' + str(exc), flush=True)
                input('Complete the Tailscale HTTPS setup page, then press Enter to retry: ')
                server.external_origin = register(server.server_port, args.tailscale_port)
            print('Private Tailscale URL: ' + server.external_origin, flush=True)
        except (ValueError, OSError) as exc:
            print('Tailscale registration unavailable: ' + str(exc), flush=True)
            print('Local workbench remains available. Restart with --tailscale after setup.', flush=True)
    print(f'Voyage Workbench: http://127.0.0.1:{server.server_port}', flush=True)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.artwork.close()
        server.world_agent.close()
        server.proposals.close()
        server.server_close()


if __name__ == '__main__':
    main()
