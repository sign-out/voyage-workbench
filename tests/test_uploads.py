import base64
from datetime import datetime, timedelta, timezone
import json
import http.client
from pathlib import Path
import socket
import struct
import tempfile
import threading
import unittest
from unittest.mock import patch
import zlib

from workbench.assets import Assets
from workbench.server import Store, Conflict
from workbench.uploads import Uploads, apply_image_url, inspect_image, put_signed
from workbench.voyage import Client, VoyageError


def png(width=600, height=600):
    def chunk(kind, data):
        return struct.pack('>I', len(data)) + kind + data + struct.pack('>I', zlib.crc32(kind + data) & 0xffffffff)
    data = (b'\0' + b'\x30\x60\x90' * width) * height
    return b'\x89PNG\r\n\x1a\n' + chunk(b'IHDR', struct.pack('>IIBBBBB', width, height, 8, 2, 0, 0, 0)) + chunk(b'IDAT', zlib.compress(data)) + chunk(b'IEND', b'')


class FakeClient(Client):
    def __init__(self):
        super().__init__()
        self.configure('secret-never-forwarded')
        self.calls = []
        self.failures = {}
        self.expires = (datetime.now(timezone.utc) + timedelta(minutes=5)).isoformat()
    def request(self, method, path, body=None, etag=None, idempotency_key=None):
        self.calls.append((method, path, body, idempotency_key))
        if self.failures.get(path):
            raise self.failures[path].pop(0)
        if path == '/uploads':
            return json.dumps({'data': {'uploadId': 'upload/1', 'directUploadUrl': 'https://storage.example/object?signature=private', 'expiresAt': self.expires}}), None
        return json.dumps({'data': {'success': True, 'code': 200, 'imageUrl': 'https://images.example/canonical.png'}}), None


class UploadTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.store = Store(Path(self.temp.name) / 'db')
        self.assets = Assets(self.store)
        self.client = FakeClient()
        self.source = ' {"shortId":"WORLD1","initialGameState":{"heroesVersion":36,"npcs":{"Ada":{"name":"Ada","exact":90071992547409934567}},"locations":{"Port":{"areas":{"Dock":{}}}},"regions":{"Coast":{}},"unassignedAreas":{"Field":{}}}}\r\n'
        self.project = self.store.create('World', self.source)
        self.pid = self.project['id']
        with self.store.connect() as db:
            db.execute('CREATE TABLE remote_links (project_id TEXT PRIMARY KEY,short_id TEXT,environment TEXT)')
            db.execute('INSERT INTO remote_links VALUES (?,?,?)', (self.pid, 'WORLD1', 'alpha'))
        self.puts = []
        self.service = Uploads(self.store, self.client, self.assets, lambda *args: self.puts.append(args))
        self.path = ['initialGameState', 'npcs', 'Ada', 'portraitUrl']
    def tearDown(self):
        self.temp.cleanup()
    def prepare(self, **body):
        return self.service.prepare(self.pid, {'target': 'NPC_PORTRAIT', 'imageData': base64.b64encode(png()).decode(), 'destinationPath': self.path, **body})
    def permit_retry(self, uid):
        with self.store.connect() as db:
            upload = self.service._get(db, self.pid, uid)
            upload['retryAt'] = 0
            self.service._save(db, upload)

    def test_prepare_is_local_send_payload_and_canonical_result(self):
        prepared = self.prepare()
        self.assertEqual(self.client.calls, [])
        self.assertEqual(prepared['status'], 'prepared')
        self.assertEqual(prepared['width'], 600)
        ready = self.service.send(self.pid, prepared['id'])
        self.assertEqual(ready['status'], 'ready')
        self.assertEqual(ready['imageUrl'], 'https://images.example/canonical.png')
        self.assertNotIn('directUploadUrl', ready)
        self.assertNotIn('allowanceKey', ready)
        self.assertEqual(json.loads(self.client.calls[0][2]), {'target': 'NPC_PORTRAIT', 'width': 600, 'height': 600, 'mimeType': 'image/png'})
        self.assertEqual(self.client.calls[1][1], '/worlds/WORLD1/uploads/upload%2F1/moderate')
        self.assertNotEqual(self.client.calls[0][3], self.client.calls[1][3])
        self.assertEqual(self.puts[0][1], png())
        self.assertEqual(self.service.send(self.pid, prepared['id'])['status'], 'ready')
        self.assertEqual(len(self.client.calls), 2)
        with self.store.connect() as db:
            self.assertEqual(self.store.project(db, self.pid)['text'], self.source)

    def test_apply_checks_version_and_preserves_numeric_source(self):
        upload = self.prepare()
        self.service.send(self.pid, upload['id'])
        with self.assertRaises(Conflict):
            self.service.apply(self.pid, upload['id'], {'version': 0})
        result = self.service.apply(self.pid, upload['id'], {'version': 1})
        self.assertEqual(result['upload']['status'], 'applied')
        self.assertIn('90071992547409934567', result['project']['text'])
        self.assertTrue(result['project']['text'].endswith('\r\n'))
        self.assertEqual(len(self.client.calls), 2)
        self.assertEqual(len(result['project']['checkpoints']), 2)

    def test_existing_asset_and_cross_project_scope(self):
        asset = self.assets.capture_bytes(self.pid, 'generated', 'portrait', png())
        upload = self.service.prepare(self.pid, {'target': 'NPC_PORTRAIT', 'assetId': asset['id']})
        self.assertEqual(upload['assetId'], asset['id'])
        other = self.store.create('Other', '{}')['id']
        with self.assertRaises(KeyError):
            self.service.get(other, upload['id'])
        self.client.environment = 'production'
        with self.assertRaisesRegex(ValueError, 'environment'):
            self.service.send(self.pid, upload['id'])

    def test_local_constraints_fail_before_remote_call(self):
        for body in ({'imageData': base64.b64encode(png(599, 600)).decode()}, {'target': 'MUSIC'}, {'imageData': 'not base64'}, {'imageData': 'data:image/svg+xml;base64,PHN2Zz4='}, {'imageData': base64.b64encode(b'\x89PNG\r\n\x1a\ninvalid').decode()}):
            with self.subTest(body=list(body)), self.assertRaises(ValueError):
                self.prepare(**body)
        self.assertEqual(self.client.calls, [])
        with self.assertRaises(ValueError):
            inspect_image(b'x' * (5 * 1024 * 1024 + 1))

    def test_unknown_moderation_retries_exact_key_without_reupload(self):
        upload = self.prepare()
        endpoint = '/worlds/WORLD1/uploads/upload%2F1/moderate'
        self.client.failures[endpoint] = [VoyageError('Unknown outcome', code='request_status_unknown')]
        unknown = self.service.send(self.pid, upload['id'])
        self.assertEqual(unknown['status'], 'unknown')
        with self.assertRaises(ValueError):
            self.service.send(self.pid, upload['id'])
        with self.assertRaisesRegex(ValueError, 'unfinished'):
            self.prepare()
        self.permit_retry(upload['id'])
        done = self.service.send(self.pid, upload['id'])
        self.assertEqual(done['status'], 'ready')
        self.assertEqual(len(self.puts), 1)
        moderation = [call for call in self.client.calls if call[1] == endpoint]
        self.assertEqual(moderation[0], moderation[1])

    def test_pending_allowance_honors_backoff_and_original_key(self):
        upload = self.prepare()
        self.client.failures['/uploads'] = [VoyageError('Still pending', code='request_in_progress', status_code=409, retry_after='120')]
        pending = self.service.send(self.pid, upload['id'])
        self.assertEqual(pending['status'], 'pending')
        self.assertGreaterEqual(pending['retryAfterSeconds'], 119)
        self.assertEqual(self.puts, [])
        self.permit_retry(upload['id'])
        self.assertEqual(self.service.send(self.pid, upload['id'])['status'], 'ready')
        self.assertEqual(self.client.calls[0], self.client.calls[1])

    def test_rejected_and_expired_uploads_never_silently_replace_allowance(self):
        upload = self.prepare()
        self.client.expires = (datetime.now(timezone.utc) - timedelta(seconds=1)).isoformat()
        expired = self.service.send(self.pid, upload['id'])
        self.assertEqual(expired['status'], 'expired')
        self.assertFalse(expired['canRetry'])
        self.assertEqual(self.puts, [])
        self.client.expires = (datetime.now(timezone.utc) + timedelta(minutes=5)).isoformat()
        other = self.prepare()
        self.client.failures['/worlds/WORLD1/uploads/upload%2F1/moderate'] = [VoyageError('Rejected', rejected=True, code='studio_media_failed', status_code=422)]
        rejected = self.service.send(self.pid, other['id'])
        self.assertEqual(rejected['status'], 'rejected')
        with self.assertRaises(ValueError):
            self.service.send(self.pid, other['id'])

    def test_restart_resumes_recorded_step_and_replay_window_is_bounded(self):
        upload = self.prepare()
        with self.store.connect() as db:
            record = self.service._get(db, self.pid, upload['id'])
            record.update(status='sending', replayUntil=1)
            self.service._save(db, record)
        reopened = Uploads(self.store, self.client, self.assets, lambda *args: None)
        recovered = reopened.get(self.pid, upload['id'])
        self.assertEqual(recovered['status'], 'unknown')
        self.assertFalse(recovered['canRetry'])

    def test_destination_helpers_only_set_known_url_fields(self):
        destinations = [('REGION_MAP_IMAGE', ['regions', 'Coast', 'images', 'map', 'imageUrl']), ('LOCATION_IMAGE', ['locations', 'Port', 'images', 'establishingShot', 'imageUrl']), ('AREA_IMAGE', ['locations', 'Port', 'areas', 'Dock', 'images', 'establishingShot', 'imageUrl']), ('AREA_IMAGE', ['unassignedAreas', 'Field', 'images', 'establishingShot', 'imageUrl'])]
        for target, relative in destinations:
            path = ['initialGameState'] + relative
            changed = apply_image_url(self.source, target, path, 'https://images.example/a.png')
            from workbench import document
            self.assertEqual(document.section(changed, path), '"https://images.example/a.png"')
            self.assertIn('90071992547409934567', changed)
        for target, path in [('NPC_PORTRAIT', ['initialGameState', 'npcs', 'Missing', 'portraitUrl']), ('REGION_MAP_IMAGE', self.path), ('NPC_PORTRAIT', ['shortId'])]:
            with self.assertRaises(ValueError):
                apply_image_url(self.source, target, path, 'https://images.example/a.png')

    def test_premade_character_portrait_accepts_only_existing_integer_index(self):
        source = '{"heroesVersion":36,"premadeCharacters":[{"name":"Scout","exact":9007199254740993}]}'
        changed = apply_image_url(source, 'NPC_PORTRAIT', ['premadeCharacters', 0, 'portraitUrl'], 'https://images.example/scout.png')
        self.assertIn('9007199254740993', changed)
        self.assertIn('"portraitUrl": "https://images.example/scout.png"', changed)
        for index in (True, -1, 1, '0'):
            with self.subTest(index=index), self.assertRaises(ValueError):
                apply_image_url(source, 'NPC_PORTRAIT', ['premadeCharacters', index, 'portraitUrl'], 'https://images.example/scout.png')

    def test_signed_put_has_no_bearer_and_rejects_private_or_redirect_urls(self):
        calls = []
        class Response:
            status = 200
            def __enter__(self): return self
            def __exit__(self, *args): pass
            def read(self, *args): return b''
        class Opener:
            def open(self, request, timeout):
                calls.append(request)
                return Response()
        addresses = [(socket.AF_INET, socket.SOCK_STREAM, 6, '', ('93.184.216.34', 443))]
        with patch('workbench.uploads.socket.getaddrinfo', return_value=addresses), patch('workbench.uploads.urllib.request.build_opener', return_value=Opener()):
            put_signed('https://storage.example/object?sig=secret', b'image', 'image/png')
        self.assertEqual(calls[0].get_method(), 'PUT')
        self.assertEqual(calls[0].get_header('Content-type'), 'image/png')
        self.assertIsNone(calls[0].get_header('Authorization'))
        self.assertIsNone(calls[0].get_header('Cookie'))
        with patch('workbench.uploads.socket.getaddrinfo', return_value=[(socket.AF_INET, socket.SOCK_STREAM, 6, '', ('127.0.0.1', 443))]), self.assertRaises(ValueError):
            put_signed('https://local.example/object', b'image', 'image/png')
        for url in ('http://storage.example/a', 'https://user:password@storage.example/a', 'https://storage.example:8443/a'):
            with self.assertRaises(ValueError):
                put_signed(url, b'image', 'image/png')


class UploadRouteTests(unittest.TestCase):
    def test_authenticated_routes_prepare_send_apply_without_remote_world_save(self):
        from workbench.server import Server
        with tempfile.TemporaryDirectory() as temporary:
            server = Server(('127.0.0.1', 0), Path(temporary) / 'db')
            thread = threading.Thread(target=server.serve_forever, daemon=True)
            thread.start()
            try:
                calls = FakeClient()
                server.voyage.configure('test-key')
                server.voyage.request = calls.request
                signed = []
                server.uploads.transport = lambda *args: signed.append(args)
                project = server.store.create('World', '{"heroesVersion":36,"npcs":{"Ada":{}}}')
                with server.store.connect() as db:
                    db.execute('INSERT INTO remote_links VALUES (?,?,?,?,?)', (project['id'], 'WORLD1', 'alpha', '"etag"', project['text']))
                def request(method, path, body=None):
                    connection = http.client.HTTPConnection('127.0.0.1', server.server_port)
                    headers = {'Content-Type': 'application/json', 'Cookie': 'workbench_session=' + server.session, 'X-Workbench-Token': server.token}
                    connection.request(method, path, json.dumps(body) if body is not None else None, headers)
                    response = connection.getresponse()
                    status, payload = response.status, json.loads(response.read())
                    connection.close()
                    self.assertEqual(status, 200, payload)
                    return payload
                base = '/api/projects/' + project['id'] + '/uploads'
                listing = request('GET', base)
                self.assertEqual(listing['linked']['shortId'], 'WORLD1')
                upload = request('POST', base, {'target': 'NPC_PORTRAIT', 'imageData': 'data:image/png;base64,' + base64.b64encode(png()).decode(), 'destinationPath': ['npcs', 'Ada', 'portraitUrl']})
                self.assertEqual(calls.calls, [])
                ready = request('POST', base + '/' + upload['id'] + '/send', {})
                self.assertEqual(ready['status'], 'ready')
                applied = request('POST', base + '/' + upload['id'] + '/apply', {'version': 1})
                self.assertEqual(applied['project']['version'], 2)
                self.assertEqual(len(signed), 1)
                self.assertTrue(all(call[0] == 'POST' for call in calls.calls))
            finally:
                server.shutdown()
                server.world_agent.close()
                server.artwork.close()
                server.proposals.close()
                server.server_close()
                thread.join()


if __name__ == '__main__':
    unittest.main()
