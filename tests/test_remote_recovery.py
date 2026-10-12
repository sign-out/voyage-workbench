import http.client
import io
import json
import os
import tempfile
import threading
import unittest
import urllib.error
from pathlib import Path
from unittest.mock import patch

from workbench.server import Server
from workbench.voyage import Client, VoyageError, editable_world


class RemoteRecoveryTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.root = Path(self.tmp.name)
        (self.root / 'index.html').write_text('test', encoding='utf-8')
        self.db_path = self.root / 'db.sqlite'
        self.start_server()

    def start_server(self):
        self.server = Server(('127.0.0.1', 0), self.db_path, self.root, self.root / 'fixtures')
        self.thread = threading.Thread(target=self.server.serve_forever, daemon=True)
        self.thread.start()
        self.cookie = None
        self.token = None
        status, data = self.request('GET', '/api/session')
        self.assertEqual(status, 200)
        self.token = data['token']

    def stop_server(self):
        self.server.shutdown()
        self.server.server_close()
        self.thread.join()

    def tearDown(self):
        self.stop_server()
        self.tmp.cleanup()

    def request(self, method, path, body=None):
        connection = http.client.HTTPConnection('127.0.0.1', self.server.server_port, timeout=5)
        headers = {'Content-Type': 'application/json'}
        if self.cookie:
            headers['Cookie'] = self.cookie
        if self.token:
            headers['X-Workbench-Token'] = self.token
        connection.request(method, path, json.dumps(body) if body is not None else None, headers)
        response = connection.getresponse()
        raw = response.read()
        if path == '/api/session':
            self.cookie = response.getheader('Set-Cookie').split(';')[0]
        connection.close()
        return response.status, json.loads(raw)

    def linked_project(self):
        base = '{"shortId":"fixture","title":"World","initialGameState":{"heroesVersion":36,"n":1}}'
        status, project = self.request('POST', '/api/projects', {'name':'World','text':base})
        self.assertEqual(status, 201)
        self.server.voyage.configure('test-key', 'alpha')
        with self.server.store.connect() as db:
            db.execute('INSERT INTO remote_links VALUES (?,?,?,?,?)', (project['id'],'fixture','alpha','"old"',base))
            db.execute('INSERT INTO remote_operations(project_id,created,status,detail) VALUES (?,?,?,?)',
                       (project['id'],1,'unknown','Test uncertain save'))
        return project, base

    def test_http_400_is_specific_and_definitely_rejected(self):
        client = Client()
        client.configure('test-key')
        payload = io.BytesIO(b'{"error":{"code":"invalid_world","message":"Missing required field"},"requestId":"req-123"}')
        response_error = urllib.error.HTTPError('https://example.test', 400, 'Bad Request', {}, payload)
        with patch('workbench.voyage.urllib.request.build_opener') as opener:
            opener.return_value.open.side_effect = response_error
            with self.assertRaises(VoyageError) as caught:
                client.request('PUT','/worlds/x','{}','"etag"')
        self.assertTrue(caught.exception.rejected)
        self.assertEqual(caught.exception.status_code, 400)
        self.assertIn('invalid_world',str(caught.exception))
        self.assertIn('Missing required field',str(caught.exception))
        self.assertIn('req-123',str(caught.exception))

    def test_replace_shape_excludes_download_only_fields_without_rounding(self):
        source = ('{"shortId":"fixture","title":"World","mods":[{"shortId":"m"}],'
                  '"loadStatus":"complete","canSafelySave":true,'
                  '"initialGameState":{"heroesVersion":36,"precise":9007199254740993,"fraction":1.000}}')
        body = editable_world(source)
        self.assertIn('"precise":9007199254740993,"fraction":1.000',body)
        self.assertNotIn('loadStatus',body)
        self.assertNotIn('canSafelySave',body)
        self.assertNotIn('"mods"',body)
        client = Client()
        requests = []
        def fake_request(method,path,data=None,etag=None):
            requests.append((method,path,data,etag))
            if method == 'POST':
                return '{"data":{"valid":true}}', None
            if method == 'PUT':
                return '{}', None
            return '{"data":{"world":'+source+'}}', '"next"'
        client.request = fake_request
        client.save(source,'fixture','"old"')
        self.assertEqual(requests[1][2],'{"world":'+body+'}')

    def test_key_persists_outside_projects_and_can_be_forgotten(self):
        status, result = self.request('POST','/api/connection',{'environment':'alpha','key':'test-secret'})
        self.assertEqual(status, 200)
        self.assertEqual(result['savedEnvironments'], ['alpha'])
        path = self.root / 'creator-credentials.json'
        self.assertTrue(path.exists())
        if os.name != 'nt':
            self.assertEqual(path.stat().st_mode & 0o077, 0)
        self.assertNotIn('test-secret',json.dumps(self.request('GET','/api/connection')[1]))
        self.stop_server()
        self.start_server()
        self.assertEqual(self.request('GET','/api/connection')[1]['environment'], 'alpha')
        self.assertTrue(self.request('GET','/api/connection')[1]['connected'])
        self.assertEqual(self.server.voyage.key, 'test-secret')
        self.assertEqual(self.request('DELETE','/api/connection',{'environment':'alpha'})[0],200)
        self.assertFalse(self.request('GET','/api/connection')[1]['connected'])

    def test_remote_refresh_reconciles_same_draft_and_applies_divergence(self):
        project, base = self.linked_project()
        pid = project['id']
        remote = base
        etag = '"next"'
        self.server.voyage.download = lambda sid: {'text':remote,'etag':etag,'shortId':sid,'environment':'alpha'}
        uri = '/api/projects/' + pid + '/remote-refresh'
        status, result = self.request('POST',uri,{'version':1})
        self.assertEqual((status,result['status']), (200,'unchanged'))
        with self.server.store.connect() as db:
            self.assertEqual(db.execute('SELECT status FROM remote_operations').fetchone()[0], 'reconciled')
        remote = '{"shortId":"fixture","title":"World","initialGameState":{"heroesVersion":36,"n":2}}'
        status, preview = self.request('POST',uri,{'version':1})
        self.assertEqual((status,preview['status']), (200,'diverged'))
        self.assertEqual(preview['etag'],etag)
        self.assertEqual(self.request('POST',uri,{'version':1,'apply':True,'expectedEtag':'"stale"'})[0],409)
        status, applied = self.request('POST',uri,{'version':1,'apply':True,'expectedEtag':etag})
        self.assertEqual((status,applied['status']), (200,'applied'))
        self.assertEqual(applied['project']['text'],remote)
        self.assertEqual(applied['project']['version'],2)
        with self.server.store.connect() as db:
            self.assertEqual(db.execute('SELECT baseline FROM remote_links WHERE project_id=?',(pid,)).fetchone()[0],remote)
            self.assertTrue(db.execute("SELECT 1 FROM checkpoints WHERE project_id=? AND reason='Before external JSON import'",(pid,)).fetchone())

    def test_rejected_save_does_not_block_next_attempt(self):
        project,_ = self.linked_project()
        pid = project['id']
        with self.server.store.connect() as db:
            db.execute("UPDATE remote_operations SET status='reconciled' WHERE project_id=?",(pid,))
        calls = []
        def rejected(*args):
            calls.append(args)
            raise VoyageError('Voyage HTTP 400 (invalid_world): rejected', rejected=True, status_code=400)
        self.server.voyage.save = rejected
        uri = '/api/projects/' + pid + '/remote-save'
        self.assertEqual(self.request('POST',uri,{'version':1})[0],400)
        self.assertEqual(self.request('POST',uri,{'version':1})[0],400)
        self.assertEqual(len(calls),2)
        with self.server.store.connect() as db:
            self.assertEqual(db.execute("SELECT count(*) FROM remote_operations WHERE status='unknown'").fetchone()[0],0)


if __name__ == '__main__':
    unittest.main()
