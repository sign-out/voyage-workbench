import json
import io
import urllib.error
import tempfile
import unittest
from unittest.mock import patch
from pathlib import Path
from workbench.voyage import Client, VoyageError
from workbench.agent import Proposals
from workbench import document


class IntegrationTests(unittest.TestCase):
    def test_alpha_default_and_production_disabled(self):
        client = Client()
        self.assertEqual(client.environment, 'alpha')
        client.configure('test-key')
        self.assertEqual(client.status()['environment'], 'alpha')
        with self.assertRaisesRegex(VoyageError, 'Production.*disabled'):
            client.configure('production-key', 'production')
        self.assertEqual(client.environment, 'alpha')
        self.assertEqual(client.key, 'test-key')

    def test_creator_access_rejection_explains_recovery(self):
        client = Client()
        client.configure('test-key')
        payload = {'error': {'code': 'creator_api_access_required', 'message': 'Creator API access is required'},
                   'requestId': 'c91c40de-00a9-49bc-8ef6-58a65b74955f'}
        failure = urllib.error.HTTPError('https://api.aidungeon.com', 403, 'Forbidden', {},
                                         io.BytesIO(json.dumps(payload).encode()))
        with patch('urllib.request.OpenerDirector.open', side_effect=failure):
            with self.assertRaises(VoyageError) as caught:
                client.list_worlds()
        self.assertEqual(caught.exception.code, 'creator_api_access_required')
        self.assertTrue(caught.exception.rejected)
        self.assertIn('Studio → Settings → API keys', str(caught.exception))
        self.assertIn('Local editing remains available', str(caught.exception))
        self.assertIn(payload['requestId'], str(caught.exception))

    def test_official_validation_preserves_numeric_tokens(self):
        client=Client();client.configure('test-key')
        requests=[]
        def request(method,path,body=None,etag=None):
            requests.append((method,path,body,etag))
            return '{"data":{"valid":true,"errors":[],"warnings":[]}}',None
        client.request=request
        client.validate('{"heroesVersion":36,"huge":9223372036854775807,"fraction":1.000}')
        self.assertIn('9223372036854775807',requests[0][2]);self.assertIn('1.000',requests[0][2])
        self.assertEqual(requests[0][1],'/validate')

    def test_download_requires_etag_and_known_envelope(self):
        client=Client()
        client.request=lambda *a:('{"data":{"world":{"shortId":"x","initialGameState":{"big":9007199254740993}}}}','"rev"')
        self.assertIn('9007199254740993',client.download('x')['text'])
        client.request=lambda *a:('{"data":{"world":{}}}',None)
        with self.assertRaises(VoyageError):client.download('x')
        client.request=lambda *a:('{"unexpected":{}}','"rev"')
        with self.assertRaises(VoyageError):client.download('x')

    def test_save_validates_identity_then_conditional_put_and_readback(self):
        client=Client();calls=[]
        text='{"shortId":"x","title":"T","initialGameState":{"heroesVersion":36}}'
        def request(method,path,body=None,etag=None):
            calls.append((method,path,body,etag))
            if path=='/validate':return '{"data":{"valid":true}}',None
            if method=='PUT':return '{}',None
            return '{"data":{"world":'+text+'}}','"next"'
        client.request=request
        self.assertEqual(client.save(text,'x','"old"')['changes'],[])
        self.assertEqual([c[0] for c in calls],['POST','PUT','GET'])
        self.assertEqual(calls[1][3],'"old"')
        self.assertEqual(calls[1][2],'{"world":'+text+'}')
        with self.assertRaises(VoyageError):client.save(text,'other','"old"')

    def test_no_put_when_official_validation_fails(self):
        client=Client();calls=[]
        client.request=lambda *args:(calls.append(args) or ('{"data":{"valid":false}}',None))
        with self.assertRaises(VoyageError):client.save('{"shortId":"x","initialGameState":{}}','x','"rev"')
        self.assertEqual(len(calls),1)

    def test_draft_buffer_can_be_invalid_without_losing_other_text(self):
        original='{ "a": 9007199254740993, "b": {} }'
        draft=document.replace_draft(original,['b'],'{"unfinished":')
        self.assertEqual(draft,'{ "a": 9007199254740993, "b": {"unfinished": }')
        self.assertTrue(document.validate(draft)['errors'])

    def test_proposal_replaces_only_selected_section_and_disables_execution_features(self):
        proposals=Proposals();jid='test';proposals.jobs[jid]={'status':'running'}
        class FakeProcess:
            returncode=0
            def communicate(self,**kwargs):return (None,None)
        def fake_popen(args,**kwargs):
            self.assertIn('read-only',args);self.assertIn('--ignore-user-config',args)
            for feature in ['shell_tool','plugins','hooks','apps']:
                self.assertIn(feature,args)
            self.assertNotIn('VOYAGE_API_KEY',kwargs['env'])
            self.assertEqual(kwargs['encoding'],'utf-8')
            output=Path(args[args.index('-o')+1])
            output.write_text(json.dumps({'replacement':'"new"','explanation':'雪'},ensure_ascii=False),encoding='utf-8')
            return FakeProcess()
        read_text = Path.read_text
        def windows_default(path, *args, **kwargs):
            return read_text(path, *args, encoding=kwargs.get('encoding') or 'cp1252')
        with patch('workbench.agent.executable',return_value='/fake/codex'),patch('workbench.agent.subprocess.Popen',side_effect=fake_popen),patch.object(Path,'read_text',windows_default):
            proposals.run(jid,'{"title":"old","big":9007199254740993}','"old"',['title'],'Change title')
        result=proposals.get(jid)
        self.assertEqual(result['status'],'complete')
        self.assertEqual(result['text'],'{"title":"new","big":9007199254740993}')
        self.assertEqual(result['explanation'],'雪')

    def test_cached_schema_warns_on_known_types_but_allows_unknown_fields(self):
        from workbench.schema import validate
        self.assertTrue(any('successLevelSettings is missing' in warning for warning in validate('{"heroesVersion":36,"npcs":{"A":{"name":"A","futureField":123}}}')))
        warnings=validate('{"heroesVersion":36,"npcs":{"A":{"name":123}}}')
        self.assertTrue(any('expected string' in w for w in warnings))

    def test_observed_success_level_requirement_is_advisory(self):
        from workbench.schema import validate
        valid='{"heroesVersion":36,"successLevelSettings":{"firstSuccessfulTierId":"success","tiers":[{"id":"success","name":"Success","minScore":0,"maxScore":null,"prompt":""}]}}'
        self.assertFalse(any('successLevelSettings' in warning for warning in validate(valid)))
        malformed='{"heroesVersion":36,"successLevelSettings":{"tiers":[{"id":1,"name":"Success","minScore":"0","prompt":""}]}}'
        warnings=validate(malformed)
        self.assertTrue(any('firstSuccessfulTierId' in warning for warning in warnings))
        self.assertTrue(any('tiers[0].id' in warning for warning in warnings))
        self.assertTrue(any('tiers[0].minScore' in warning for warning in warnings))
        self.assertTrue(any('tiers[0].maxScore' in warning for warning in warnings))

    def test_local_validation_loads_bundled_references_as_utf8_on_windows(self):
        from workbench import schema
        read_text = Path.read_text
        def windows_default(path, *args, **kwargs):
            if not kwargs.get('encoding'):
                kwargs['encoding'] = 'cp1252'
            return read_text(path, *args, **kwargs)
        schema.references.cache_clear()
        try:
            with patch.object(Path, 'read_text', windows_default):
                self.assertTrue(any('successLevelSettings is missing' in warning for warning in schema.validate('{"heroesVersion":36,"npcs":{}}')))
        finally:
            schema.references.cache_clear()


    def test_proposals_survive_restart_and_running_jobs_become_interrupted(self):
        from workbench.server import Store
        with tempfile.TemporaryDirectory() as directory:
            store=Store(Path(directory)/'db.sqlite')
            proposals=Proposals(store)
            proposals.jobs['one']={'id':'one','status':'complete','created':1,'projectId':'p','text':'{}','baseText':'{}'}
            proposals.jobs['two']={'id':'two','status':'running','created':2,'projectId':'p'}
            proposals.persist('one');proposals.persist('two')
            recovered=Proposals(store)
            self.assertEqual(recovered.get('one')['text'],'{}')
            self.assertEqual(recovered.get('two')['status'],'interrupted')
            self.assertEqual(len(recovered.list('p')),2)
            self.assertNotIn('text',recovered.list('p')[1])

    def test_cancel_before_process_launch_never_runs_codex(self):
        proposals=Proposals()
        proposals.jobs['cancel']={'id':'cancel','status':'running'}
        proposals.cancel('cancel')
        with patch('workbench.agent.subprocess.Popen') as process:
            proposals.run('cancel','{}','{}',[],'test')
            process.assert_not_called()
        self.assertEqual(proposals.get('cancel')['status'],'cancelled')


    def test_cancelling_active_owned_process_stops_it(self):
        import subprocess, sys, threading, time
        proposals=Proposals();proposals.jobs['active']={'id':'active','status':'running'}
        real_popen=subprocess.Popen
        started=threading.Event()
        def sleeper(args,**kwargs):
            process=real_popen([sys.executable,'-c','import time; time.sleep(30)'],stdin=subprocess.PIPE,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL,text=True,start_new_session=True)
            started.set()
            return process
        with patch('workbench.agent.executable',return_value='/fake/codex'),patch('workbench.agent.subprocess.Popen',side_effect=sleeper):
            worker=threading.Thread(target=proposals.run,args=('active','{}','{}',[],'test'))
            worker.start();self.assertTrue(started.wait(5))
            proposals.cancel('active');worker.join(5)
            self.assertFalse(worker.is_alive())
            self.assertEqual(proposals.get('active')['status'],'cancelled')


if __name__=='__main__':unittest.main()
