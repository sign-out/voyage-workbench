import http.client
import io
import json
import tempfile
import threading
import unittest
from pathlib import Path
from unittest.mock import patch
from workbench.server import Server
from workbench.voyage import Client, VoyageError


WORLD = '{"shortId":"remote","title":"World","visibility":"private","initialGameState":{"heroesVersion":36,"big":9007199254740993,"fraction":1.000}}'


class PublicationTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.server = Server(('127.0.0.1', 0), Path(self.tmp.name) / 'db.sqlite')
        self.thread = threading.Thread(target=self.server.serve_forever, daemon=True)
        self.thread.start()
        self.cookie = self.token = None
        self.token = self.request('GET', '/api/session')[1]['token']
        self.server.voyage.configure('mock-key', 'alpha')
        self.remote = WORLD
        self.etag = '"v1"'
        self.calls = []
        self.valid = True
        self.server.voyage.download = lambda sid: {'text': self.remote, 'etag': self.etag, 'environment': 'alpha', 'shortId': sid}
        self.server.voyage.moderation = lambda sid: {'data': {'status': 'approved'}}
        self.server.voyage.validate = lambda text, stage='draft': self.validate(text, stage)
        self.server.voyage.publication_request = self.mutation

    def tearDown(self):
        self.server.shutdown()
        self.server.world_agent.close()
        self.server.proposals.close()
        self.server.server_close()
        self.thread.join()
        self.tmp.cleanup()

    def validate(self, text, stage):
        self.calls.append(('validate', stage, text))
        return {'data': {'valid': self.valid, 'errors': [] if self.valid else ['Missing start']}}

    def mutation(self, kind, sid, body, key):
        self.calls.append((kind, sid, body, key))
        return {'data': {'shortId': 'remote'}} if kind == 'create' else {'data': {'status': kind}}

    def request(self, method, path, body=None):
        conn = http.client.HTTPConnection('127.0.0.1', self.server.server_port, timeout=5)
        headers = {'Content-Type': 'application/json'}
        if self.cookie: headers['Cookie'] = self.cookie
        if self.token: headers['X-Workbench-Token'] = self.token
        conn.request(method, path, json.dumps(body) if body is not None else None, headers)
        response = conn.getresponse()
        if path == '/api/session': self.cookie = response.getheader('Set-Cookie').split(';')[0]
        result = response.status, json.loads(response.read())
        conn.close()
        return result

    def project(self, text=WORLD, linked=True):
        status, project = self.request('POST', '/api/projects', {'name': 'World', 'text': text})
        self.assertEqual(status, 201)
        if linked:
            with self.server.store.connect() as db:
                db.execute('INSERT INTO remote_links VALUES (?,?,?,?,?)', (project['id'], 'remote', 'alpha', self.etag, WORLD))
        return project

    def test_publish_validation_sync_and_journal(self):
        p = self.project()
        uri = '/api/projects/' + p['id'] + '/publication'
        status, state = self.request('GET', uri)
        self.assertEqual(status, 200)
        self.assertTrue(state['synchronized'])
        self.assertEqual(state['moderation']['data']['status'], 'approved')
        self.valid = False
        self.assertEqual(self.request('POST', uri + '/publish', {'version': 1})[0], 400)
        self.assertFalse(any(c[0] == 'publish' for c in self.calls))
        self.valid = True
        self.etag = '"changed"'
        self.assertEqual(self.request('POST', uri + '/publish', {'version': 1})[0], 400)
        self.etag = '"v1"'
        status, result = self.request('POST', uri + '/publish', {'version': 1})
        self.assertEqual(status, 200)
        self.assertEqual(result['kind'], 'publish')
        self.assertTrue(any(c[:2] == ('validate', 'publish') for c in self.calls))
        operation = self.request('GET', uri)[1]['operations'][0]
        self.assertEqual(operation['status'], 'verified')
        self.assertEqual(operation['id'], next(c[3] for c in self.calls if c[0] == 'publish'))

    def test_rename_updates_title_and_history_without_number_roundtrip(self):
        p = self.project()
        uri = '/api/projects/' + p['id']
        status, renamed = self.request('POST', uri + '/rename', {'name': 'New title', 'version': 1})
        self.assertEqual(status, 200)
        self.assertEqual(renamed['name'], 'New title')
        self.assertEqual(json.loads(renamed['text'])['title'], 'New title')
        self.assertIn('9007199254740993', renamed['text'])
        self.assertIn('1.000', renamed['text'])
        self.assertEqual(json.loads(self.remote)['title'], 'World')
        self.assertEqual(self.request('POST', uri + '/rename', {'name': 'stale', 'version': 1})[0], 409)
        checkpoint = next(c for c in renamed['checkpoints'] if c['reason'].startswith('Before rename'))
        status, restored = self.request('POST', uri + '/restore', {'version': 2, 'checkpointId': checkpoint['id']})
        self.assertEqual(status, 200)
        self.assertEqual(restored['name'], 'World')

    def test_create_private_draft_from_raw_state_links_same_project(self):
        p = self.project('{"heroesVersion":36,"big":9007199254740993,"fraction":1.000}', False)
        uri = '/api/projects/' + p['id'] + '/publication'
        status, result = self.request('POST', uri + '/create', {'version': 1})
        self.assertEqual(status, 200)
        self.assertEqual(result['project']['id'], p['id'])
        self.assertEqual(result['project']['version'], 2)
        self.assertIn('9007199254740993', result['project']['text'])
        request = next(c for c in self.calls if c[0] == 'create')
        self.assertIn('1.000', request[2])
        self.assertEqual(json.loads(request[2])['world']['visibility'], 'private')
        self.assertEqual(self.request('POST', uri + '/create', {'version': 2})[0], 400)
        self.assertEqual(len(self.request('GET', '/api/projects')[1]['projects']), 1)

    def test_uncertain_request_retry_keeps_exact_key_and_body(self):
        p = self.project()
        uri = '/api/projects/' + p['id'] + '/publication'
        def uncertain(kind, sid, body, key):
            self.calls.append((kind, sid, body, key))
            raise VoyageError('Outcome unknown')
        self.server.voyage.publication_request = uncertain
        self.assertEqual(self.request('POST', uri + '/unpublish', {'version': 1})[0], 400)
        operation = self.request('GET', uri)[1]['operations'][0]
        self.assertEqual(operation['status'], 'unknown')
        self.assertEqual(self.request('POST', uri + '/unpublish', {'version': 1})[0], 400)
        self.server.voyage.publication_request = self.mutation
        self.assertEqual(self.request('POST', uri + '/retry', {'version': 1, 'operationId': operation['id']})[0], 200)
        attempts = [c for c in self.calls if c[0] == 'unpublish']
        self.assertEqual(attempts[0], attempts[1])

    def test_success_response_readback_failure_retries_only_readback(self):
        p = self.project()
        uri = '/api/projects/' + p['id'] + '/publication'
        self.server.voyage.download = lambda sid: (_ for _ in ()).throw(VoyageError('Readback down'))
        # Unpublish downloads before dispatch; fail only the subsequent readback.
        counter = []
        def download(sid):
            counter.append(sid)
            if len(counter) > 1: raise VoyageError('Readback down')
            return {'text': WORLD, 'etag': '"v1"', 'environment': 'alpha'}
        self.server.voyage.download = download
        self.assertEqual(self.request('POST', uri + '/unpublish', {'version': 1})[0], 400)
        with self.server.store.connect() as db:
            op = dict(db.execute('SELECT * FROM publication_operations').fetchone())
        self.assertEqual(op['status'], 'unknown')
        self.assertIsNotNone(op['result'])
        self.server.voyage.download = lambda sid: {'text': WORLD, 'etag': '"v1"', 'environment': 'alpha'}
        self.assertEqual(self.request('POST', uri + '/retry', {'version': 1, 'operationId': op['id']})[0], 200)
        self.assertEqual(len([c for c in self.calls if c[0] == 'unpublish']), 1)

    def test_idempotency_header_and_publish_validation_stage(self):
        client = Client(); client.configure('test-key')
        class Response:
            headers = {}
            def __enter__(self): return self
            def __exit__(self, *args): pass
            def read(self, size): return b'{"data":{"valid":true}}'
        with patch('workbench.voyage.urllib.request.build_opener') as opener:
            opener.return_value.open.return_value = Response()
            client.publication_request('publish', 'with/slash', '{}', 'key-123')
            req = opener.return_value.open.call_args.args[0]
            self.assertEqual(req.get_header('Idempotency-key'), 'key-123')
            self.assertTrue(req.full_url.endswith('/worlds/with%2Fslash/publish'))
            client.validate('{"heroesVersion":36,"n":9007199254740993}', 'publish')
            req = opener.return_value.open.call_args.args[0]
            self.assertIn(b'"stage":"publish"', req.data)
            self.assertIn(b'9007199254740993', req.data)

    def test_artwork_routes_scope_plans_and_block_lifecycle_during_generation(self):
        p = self.project()
        uri = '/api/projects/' + p['id'] + '/artwork'
        status, job = self.request('POST', uri, {'prompt': 'Coastal map', 'mode': 'master', 'shape': 'wide', 'detail': 'high'})
        self.assertEqual(status, 200)
        self.assertEqual(job['tileCount'], 16)
        self.assertEqual(job['requests'], [])
        self.assertEqual(self.request('GET', uri)[1]['jobs'][0]['id'], job['id'])
        other = self.project(linked=False)
        self.assertEqual(self.request('GET', '/api/projects/' + other['id'] + '/artwork/' + job['id'])[0], 404)
        self.server.artwork.running[(p['id'], job['id'])] = (threading.Event(), None)
        try:
            self.assertEqual(self.request('POST', '/api/projects/' + p['id'] + '/archive', {'version': 1})[0], 409)
            self.assertEqual(self.request('POST', '/api/projects/' + p['id'] + '/rename', {'version': 1, 'name': 'Busy'})[0], 409)
        finally:
            self.server.artwork.running.clear()
        workspace = self.server.artwork.workspace / p['id']
        workspace.mkdir()
        (workspace / 'temporary.txt').write_text('owned artwork scratch data', encoding='utf-8')
        self.assertEqual(self.request('POST', '/api/projects/' + p['id'] + '/archive', {'version': 1})[0], 200)
        self.assertEqual(self.request('DELETE', '/api/projects/' + p['id'], {'version': 2})[0], 200)
        with self.server.store.connect() as db:
            self.assertEqual(db.execute('SELECT count(*) FROM artwork_jobs WHERE project_id=?', (p['id'],)).fetchone()[0], 0)
        self.assertFalse(workspace.exists())


if __name__ == '__main__': unittest.main()
