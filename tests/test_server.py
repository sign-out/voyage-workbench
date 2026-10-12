import http.client
import json
import sqlite3
import tempfile
import threading
import unittest
from pathlib import Path

from workbench.server import Server, Store


class ServerTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.root = Path(self.tmp.name)
        (self.root / 'index.html').write_text('<h1>Workbench</h1>')
        self.server = Server(('127.0.0.1', 0), self.root / 'db.sqlite', self.root, self.root / 'fixtures')
        self.thread = threading.Thread(target=self.server.serve_forever, daemon=True)
        self.thread.start()
        self.cookie = None
        self.token = None
        status, data, headers = self.request('GET', '/api/session')
        self.assertEqual(status, 200)
        self.cookie = headers['Set-Cookie'].split(';')[0]
        self.token = data['token']

    def tearDown(self):
        self.server.shutdown()
        self.server.server_close()
        self.thread.join()
        self.tmp.cleanup()

    def request(self, method, path, body=None, headers=None):
        conn = http.client.HTTPConnection('127.0.0.1', self.server.server_port, timeout=5)
        base = {'Content-Type': 'application/json'}
        if self.cookie:
            base['Cookie'] = self.cookie
        if self.token:
            base['X-Workbench-Token'] = self.token
        base.update(headers or {})
        conn.request(method, path, json.dumps(body) if body is not None else None, base)
        response = conn.getresponse()
        raw = response.read()
        result = json.loads(raw) if response.getheader('Content-Type', '').startswith('application/json') else raw
        output = response.status, result, dict(response.getheaders())
        conn.close()
        return output

    def create(self, text='{"heroesVersion":36,"unknown":9007199254740993}'):
        status, project, _ = self.request('POST', '/api/projects', {'name': 'Test world', 'text': text})
        self.assertEqual(status, 201)
        return project

    def test_asset_download_is_authenticated_and_project_scoped(self):
        import base64
        p=self.create();other=self.create()
        data=b'\x89PNG\r\n\x1a\n'+b'test'
        a=self.server.world_agent.assets.capture(p['id'],'run',{'id':'image','result':base64.b64encode(data).decode()})
        status,result,headers=self.request('GET',a['url']+'?download=1')
        self.assertEqual(status,200);self.assertEqual(result,data)
        self.assertEqual(headers['Content-Type'],'image/png');self.assertIn('attachment',headers['Content-Disposition'])
        self.assertEqual(self.request('GET',a['url'].replace(p['id'],other['id']))[0],404)
        self.cookie=None
        self.assertEqual(self.request('GET',a['url'])[0],401)

    def test_mod_overlay_routes_preserve_source_and_validate_stack(self):
        source='{"heroesVersion":36,"huge":9007199254740993,"mods":[{"shortId":"a","version":null}]}'
        status, inspected, _ = self.request('POST', '/api/mods/inspect', {'text': source})
        self.assertEqual(status, 200)
        self.assertEqual(inspected['mods'], [{'shortId': 'a', 'version': None}])
        status, base, _ = self.request('POST', '/api/mods/export', {'text': source, 'mods': []})
        self.assertEqual(status, 200)
        self.assertIn('9007199254740993', base['text'])
        self.assertEqual(json.loads(base['text'])['mods'], [])
        self.assertEqual(self.request('POST', '/api/mods/export', {'text': source, 'mods': [{'shortId':'a','version':0}]})[0], 400)

    def test_map_routes_edit_game_state_without_touching_other_fields(self):
        source='{"heroesVersion":36,"huge":9007199254740993,"realms":{"Earth":{}},"regions":{},"locations":{}}'
        status,view,_=self.request('POST','/api/map/inspect',{'text':source})
        self.assertEqual(status,200)
        self.assertEqual(view['regions'],[])
        status,edited,_=self.request('POST','/api/map/edit',{'text':source,'action':'add-region','data':{'key':'Coast','realm':'Earth','x':0,'y':0}})
        self.assertEqual(status,200)
        self.assertIn('9007199254740993',edited['text'])
        self.assertEqual(self.request('POST','/api/map/inspect',{'text':edited['text']})[1]['regions'][0]['key'],'Coast')

    def test_mod_attachment_routes_are_project_scoped_and_keep_original_json(self):
        p=self.create();other=self.create()
        uri='/api/projects/'+p['id']+'/mod-files'
        raw='{"shortId":"forest","title":"Forest Pack","initialGameState":{"locations":{"Oak":{}},"huge":9007199254740993}}'
        status,info,_=self.request('POST',uri,{'shortId':'forest','filename':'forest.json','text':raw})
        self.assertEqual(status,200)
        self.assertEqual(info['title'],'Forest Pack')
        self.assertEqual(self.request('GET',uri)[1]['mods'][0]['shortId'],'forest')
        self.assertEqual(self.request('GET','/api/projects/'+other['id']+'/mod-files')[1]['mods'],[])
        self.assertEqual(self.request('POST',uri+'/download',{'shortId':'forest'})[1]['text'],raw)
        self.assertEqual(self.request('POST',uri,{'shortId':'wrong','filename':'forest.json','text':raw})[0],400)
        self.assertEqual(self.request('POST',uri+'/detach',{'shortId':'forest'})[0],200)
        self.assertEqual(self.request('GET',uri)[1]['mods'],[])

    def test_tailnet_host_origin_and_secure_cookie(self):
        self.server.external_origin='https://builder.example.ts.net:8443'
        host={'Host':'builder.example.ts.net:8443'}
        status,_,headers=self.request('GET','/api/session',headers=host)
        self.assertEqual(status,200);self.assertIn('; Secure',headers['Set-Cookie'])
        self.assertEqual(self.request('GET','/api/session',headers={**host,'Origin':'https://builder.example.ts.net:8443'})[0],200)
        self.assertEqual(self.request('GET','/api/session',headers={**host,'Origin':'http://builder.example.ts.net:8443'})[0],403)
        self.assertEqual(self.request('GET','/api/session',headers={'Host':'another.example.ts.net:8443'})[0],403)
        self.assertEqual(self.request('GET','/api/session',headers={'X-Forwarded-Host':'another.example.ts.net'})[0],200)

    def test_world_chat_memory_and_revision_routes(self):
        p=self.create();uri='/api/projects/'+p['id']
        status,chat,_=self.request('GET',uri+'/chat')
        self.assertEqual(status,200);self.assertEqual(chat['messages'],[])
        self.assertTrue(any(t['name']=='world_edit' for t in chat['tools']))
        self.assertEqual(self.request('POST',uri+'/chat/memory',{'memory':'Hopeful adventure'})[0],200)
        self.assertEqual(self.request('GET',uri+'/chat')[1]['memory'],'Hopeful adventure')
        revisions=self.request('GET',uri+'/revisions')[1]['revisions']
        self.assertEqual(len(revisions),1)
        self.assertEqual(self.request('POST',uri+'/revisions/restore',{'commit':revisions[0]['commit'],'version':0})[0],409)
        self.assertEqual(self.request('POST',uri+'/chat',{'message':'Hi','version':0})[0],409)
        self.assertEqual(self.request('POST',uri+'/revisions/restore',{'commit':revisions[0]['commit'],'version':1})[0],200)

    def test_original_invalid_buffers_conflicts_restore_and_restart(self):
        p = self.create()
        uri = '/api/projects/' + p['id']
        status, changed, _ = self.request('PUT', uri, {'version': p['version'], 'text': '{unfinished'})
        self.assertEqual(status, 200)
        self.assertEqual(changed['text'], '{unfinished')
        self.assertEqual(changed['original'], p['text'])
        self.assertEqual(self.request('PUT', uri, {'version': p['version'], 'text': '{}'})[0], 409)
        status, restored, _ = self.request('POST', uri + '/restore', {
            'version': changed['version'], 'checkpointId': p['checkpoints'][0]['id']})
        self.assertEqual(status, 200)
        self.assertEqual(restored['text'], p['text'])
        self.assertEqual(len(restored['checkpoints']), 2)
        store = Store(self.root / 'db.sqlite')
        with store.connect() as db:
            self.assertEqual(store.project(db, p['id'])['text'], p['text'])
            safety = db.execute('SELECT text FROM checkpoints WHERE reason=?', ('Before restore',)).fetchone()
            self.assertEqual(safety['text'], '{unfinished')

    def test_checkpoint_version_and_cross_project_restore(self):
        a, b = self.create(), self.create()
        uri = '/api/projects/' + a['id']
        status, cp, _ = self.request('POST', uri + '/checkpoints', {'version': 1, 'reason': 'Review'})
        self.assertEqual(status, 200)
        self.assertEqual(cp['version'], 2)
        self.assertEqual(self.request('POST', uri + '/restore', {
            'version': 2, 'checkpointId': b['checkpoints'][0]['id']})[0], 404)

    def test_security_boundaries(self):
        self.assertEqual(self.request('GET', '/api/projects', headers={'Host': 'evil.example'})[0], 403)
        self.assertEqual(self.request('GET', '/api/session', headers={'Origin': 'https://evil.example'})[0], 403)
        self.assertEqual(self.request('GET', '/api/projects', headers={'Cookie': ''})[0], 401)
        self.assertEqual(self.request('POST', '/api/projects', {}, {'X-Workbench-Token': ''})[0], 403)
        self.assertEqual(self.request('GET', '/%2e%2e/server.py')[0], 404)
        self.assertEqual(self.request('GET', '/')[0], 200)
        self.assertEqual(self.request('POST', '/api/projects', {'name': 'bad', 'text': 4})[0], 400)

    def test_templates_and_list(self):
        fixtures = self.root / 'fixtures'
        fixtures.mkdir()
        (fixtures / 'blank-world.json').write_text('{"heroesVersion":36}')
        status, listed, _ = self.request('GET', '/api/templates')
        self.assertEqual(status, 200)
        self.assertEqual(listed['templates'][0]['id'], 'blank-world')
        status, project, _ = self.request('POST', '/api/templates/blank-world', {})
        self.assertEqual(status, 201)
        self.assertEqual(project['text'], '{"heroesVersion":36}')
        self.assertEqual(len(self.request('GET', '/api/projects')[1]['projects']), 1)

    def test_trash_restore_versioning_and_read_only_state(self):
        p = self.create()
        uri = '/api/projects/' + p['id']
        self.assertEqual(self.request('DELETE', uri, {'version': 1})[0], 409)
        self.assertEqual(self.request('POST', uri + '/archive', {'version': 0})[0], 409)
        status, archived, _ = self.request('POST', uri + '/archive', {'version': 1})
        self.assertEqual(status, 200)
        self.assertTrue(archived['archived'])
        self.assertIsInstance(archived['archived_at'], float)
        self.assertEqual(archived['version'], 2)
        self.assertEqual(self.request('GET', '/api/projects')[1]['projects'], [])
        self.assertEqual(self.request('GET', '/api/projects/trash')[1]['projects'][0]['id'], p['id'])
        self.assertEqual(self.request('GET', uri)[1]['text'], p['text'])
        self.assertEqual(self.request('PUT', uri, {'version': 2, 'text': '{}'})[0], 409)
        self.assertEqual(self.request('POST', uri + '/chat/memory', {'memory': 'x'})[0], 409)
        self.assertEqual(self.request('POST', uri + '/unarchive', {'version': 1})[0], 409)
        status, restored, _ = self.request('POST', uri + '/unarchive', {'version': 2})
        self.assertEqual(status, 200)
        self.assertFalse(restored['archived'])
        self.assertIsNone(restored['archived_at'])
        self.assertEqual(restored['version'], 3)
        self.assertEqual(self.request('GET', '/api/projects/trash')[1]['projects'], [])

    def test_permanent_delete_cleans_owned_files_and_history(self):
        import base64
        p, other = self.create(), self.create()
        pid = p['id']
        uri = '/api/projects/' + pid
        store = self.server.store
        stage = store.revisions.stage(pid, 'fixture-stage', p['text'])
        asset = self.server.world_agent.assets.capture(pid, 'fixture-run', {'id': 'fixture-image', 'result': base64.b64encode(b'\x89PNG\r\n\x1a\nfixture').decode()})
        asset_path = self.root / 'assets' / (asset['id'] + '.png')
        job = {'id': 'fixture-job', 'projectId': pid, 'status': 'complete'}
        self.server.proposals.jobs[job['id']] = job
        with store.connect() as db:
            db.execute('INSERT INTO agent_runs VALUES (?,?)', (job['id'], json.dumps(job)))
            db.execute('INSERT INTO world_chats(project_id,thread_id,memory) VALUES (?,?,?)', (pid, 'native-thread', 'remember'))
            db.execute('INSERT INTO world_messages VALUES (?,?,?,?,?,?)', ('message', pid, 'user', 'hello', 1, 'run'))
            db.execute('INSERT INTO world_runs VALUES (?,?,?)', ('run', pid, '{}'))
            db.execute('INSERT INTO remote_links VALUES (?,?,?,?,?)', (pid, 'remote-world', 'production', 'etag', '{}'))
            db.execute('INSERT INTO remote_operations(project_id,created,status,detail) VALUES (?,?,?,?)', (pid, 1, 'verified', 'saved'))
        self.request('POST', uri + '/archive', {'version': 1})
        self.assertEqual(self.request('DELETE', uri, {'version': 1})[0], 409)
        self.assertEqual(self.request('DELETE', uri, {'version': 2}, {'X-Workbench-Token': ''})[0], 403)
        status, result, _ = self.request('DELETE', uri, {'version': 2})
        self.assertEqual(status, 200)
        self.assertEqual(result, {'deleted': True, 'id': pid})
        self.assertEqual(self.request('GET', uri)[0], 404)
        self.assertEqual(self.request('GET', '/api/projects/' + other['id'])[0], 200)
        self.assertFalse(asset_path.exists())
        self.assertFalse(Path(stage['path']).exists())
        self.assertFalse((store.revisions.root / 'stage-registry' / 'fixture-stage.json').exists())
        self.assertFalse(store.revisions._repo(pid).exists())
        self.assertTrue(store.revisions._repo(other['id']).exists())
        self.assertNotIn(job['id'], self.server.proposals.jobs)
        with store.connect() as db:
            for table in ('checkpoints', 'world_assets', 'world_chats', 'world_messages', 'world_runs', 'remote_links', 'remote_operations'):
                self.assertEqual(db.execute('SELECT count(*) FROM ' + table + ' WHERE project_id=?', (pid,)).fetchone()[0], 0)
            self.assertEqual(db.execute('SELECT count(*) FROM agent_runs WHERE id=?', (job['id'],)).fetchone()[0], 0)
        self.assertEqual(list(self.root.glob('.purge-*')), [])

    def test_lifecycle_refuses_active_world_or_section_agents(self):
        p = self.create()
        uri = '/api/projects/' + p['id']
        self.server.world_agent.running[p['id']] = (threading.Event(), None)
        self.assertEqual(self.request('POST', uri + '/archive', {'version': 1})[0], 409)
        self.server.world_agent.running.clear()
        self.server.proposals.jobs['active'] = {'projectId': p['id'], 'status': 'running'}
        self.assertEqual(self.request('POST', uri + '/archive', {'version': 1})[0], 409)
        self.server.proposals.jobs.clear()
        self.assertEqual(self.request('POST', uri + '/archive', {'version': 1})[0], 200)

    def test_legacy_database_migrates_without_changing_content(self):
        legacy = self.root / 'legacy.sqlite'
        with sqlite3.connect(legacy) as db:
            db.execute('CREATE TABLE projects(id TEXT PRIMARY KEY,name TEXT,text TEXT,original TEXT,version INTEGER,updated REAL)')
            db.execute('INSERT INTO projects VALUES (?,?,?,?,?,?)', ('legacy', 'Old world', '{unfinished', '{}', 7, 1))
        store = Store(legacy)
        with store.connect() as db:
            project = store.project(db, 'legacy')
            self.assertEqual(project['text'], '{unfinished')
            self.assertEqual(project['version'], 7)
            self.assertFalse(project['archived'])
            self.assertIsNone(project['archived_at'])

    def remote_fixture(self):
        text='{"shortId":"fixture","title":"Remote fixture","initialGameState":{"heroesVersion":36,"counter":9007199254740993}}'
        self.server.voyage.configure('not-a-real-key')
        calls=[]
        def request(method,path,body=None,etag=None):
            calls.append((method,path,body,etag))
            if path=='/validate':return '{"data":{"valid":true,"errors":[],"warnings":[]}}',None
            if method=='PUT':return '{}',None
            return '{"data":{"world":'+text+'}}','"fixture-rev"'
        self.server.voyage.request=request
        status,p,_=self.request('POST','/api/remote/download',{'shortId':'fixture'})
        self.assertEqual(status,201)
        return p,calls

    def test_remote_download_save_journal_and_readback(self):
        p,calls=self.remote_fixture()
        status,result,_=self.request('POST','/api/projects/'+p['id']+'/remote-save',{'version':1})
        self.assertEqual(status,200)
        self.assertEqual(result['changes'],[])
        put=next(c for c in calls if c[0]=='PUT')
        self.assertEqual(put[3],'"fixture-rev"')
        self.assertIn('9007199254740993',put[2])
        with self.server.store.connect() as db:
            self.assertEqual(db.execute('SELECT status FROM remote_operations').fetchone()[0],'verified')
            self.assertEqual(db.execute("SELECT count(*) FROM checkpoints WHERE reason='Before remote save'").fetchone()[0],1)

    def test_remote_unknown_outcome_blocks_blind_retry(self):
        from workbench.voyage import VoyageError
        p,calls=self.remote_fixture()
        def failed(*a,**k):raise VoyageError('Connection failed; outcome unknown')
        self.server.voyage.save=failed
        uri='/api/projects/'+p['id']+'/remote-save'
        self.assertEqual(self.request('POST',uri,{'version':1})[0],400)
        status,result,_=self.request('POST',uri,{'version':1})
        self.assertEqual(status,400)
        self.assertIn('prior remote save',result['error'])

    def test_remote_save_rejects_wrong_environment_and_stale_local_version(self):
        p,_=self.remote_fixture()
        uri='/api/projects/'+p['id']+'/remote-save'
        self.assertEqual(self.request('POST',uri,{'version':0})[0],409)
        self.server.voyage.environment='production'
        status,result,_=self.request('POST',uri,{'version':1})
        self.assertEqual(status,400)
        self.assertIn('environment',result['error'])

    def test_api_preserves_invalid_section_draft_and_surrogate_escapes(self):
        status,result,_=self.request('POST','/api/replace-draft',{'text':'{"heroesVersion":36,"npcs":{}}','path':['npcs'],'value':'{"unfinished":'})
        self.assertEqual(status,200)
        self.assertIn('"unfinished":',result['text'])
        status,result,_=self.request('POST','/api/describe',{'text':r'{"\ud800":"\ud800"}','path':[]})
        self.assertEqual(status,200)
        self.assertEqual(len(result['children']),1)



if __name__ == '__main__':
    unittest.main()
