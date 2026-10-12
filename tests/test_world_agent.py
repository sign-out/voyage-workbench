import json
import tempfile
import threading
import time
import unittest
from pathlib import Path
from workbench.server import Store, Conflict
from workbench.world_agent import WorldAgent
from workbench.codex_rpc import CodexError
from workbench.world_tools import WorldTools

class FakeSession:
    seen=[]
    callbacks=[]
    def __init__(self,**kwargs):self.kw=kwargs;self.seen.append(kwargs.get('thread_id'));self.callbacks.append(kwargs)
    def run(self,message,cancel):
        self.kw['on_thread']('persistent-thread')
        self.kw['on_tool']('world_edit',{'operations':[{'action':'replace','path':['worldName'],'value':'"Agent world"'}],'message':'Rename world'})
        self.kw['on_tool']('world_remember',{'note':'Keep a hopeful tone.'})
        return {'status':'completed','text':'World renamed.'}

class WorldAgentTests(unittest.TestCase):
    def setUp(self):
        self.temp=tempfile.TemporaryDirectory();self.store=Store(Path(self.temp.name)/'db.sqlite')
        text=(Path(__file__).resolve().parents[1]/'fixtures/blank-world.json').read_text()
        text=text.replace('{','{"worldName":"Original","n":9007199254740993,',1)
        self.project=self.store.create('Test',text)
        self.agent=WorldAgent(self.store,FakeSession)
    def tearDown(self):self.agent.close();self.temp.cleanup()
    def run_agent(self):
        with self.store.connect() as db:p=self.store.project(db,self.project['id'])
        run=self.agent.start(p['id'],{'message':'Rename this world','version':p['version']})
        deadline=time.monotonic()+5
        while time.monotonic()<deadline:
            data=self.agent.get(p['id']);found=next(r for r in data['runs'] if r['id']==run['id'])
            if found['status']!='running':
                self.assertEqual(found['status'],'complete',found);return found
            time.sleep(.01)
        self.fail('Run did not finish')
    def test_isolation_apply_restore_and_memory(self):
        pid=self.project['id'];run=self.run_agent()
        with self.store.connect() as db:self.assertEqual(self.store.project(db,pid)['text'],self.project['text'])
        self.assertIn('hopeful',self.agent.get(pid)['memory'])
        proposal=self.agent.proposal(pid,run['id']);self.assertEqual(len(proposal['changes']),1)
        applied=self.agent.action(pid,run['id'],'apply',{'version':1})
        with self.assertRaises(ValueError):FakeSession.callbacks[-1]['on_tool']('world_remember',{'note':'Late mutation'})
        FakeSession.callbacks[-1]['on_event']('item/agentMessage/delta',{'delta':'late'})
        self.assertEqual(self.agent.get(pid)['runs'][0]['status'],'applied')
        self.assertIn('9007199254740993',applied['text']);self.assertIn('Agent world',applied['text'])
        original=self.agent.revisions(pid)['revisions'][-1]['commit']
        restored=self.agent.revisions(pid,{'commit':original,'version':applied['version']})
        self.assertEqual(restored['text'],self.project['text'])
        self.assertGreaterEqual(len(self.agent.revisions(pid)['revisions']),3)
        self.run_agent();self.assertEqual(FakeSession.seen[-1],'persistent-thread')
    def test_stale_and_cross_project_rejected(self):
        run=self.run_agent();pid=self.project['id']
        other=self.store.create('Other',self.project['text'])
        with self.assertRaises(KeyError):self.agent.proposal(other['id'],run['id'])
        self.store.change(pid,{'version':1,'text':'{"worldName":"Manual"}'},'save')
        with self.assertRaises(Conflict):self.agent.action(pid,run['id'],'apply',{'version':2})
    def test_refine_discard_and_restart(self):
        run=self.run_agent();next_run=self.run_agent()
        statuses={r['id']:r['status'] for r in self.agent.get(self.project['id'])['runs']}
        self.assertEqual(statuses[run['id']],'superseded')
        self.agent.action(self.project['id'],next_run['id'],'discard',{})
        reopened=WorldAgent(self.store,FakeSession)
        self.assertEqual(reopened.get(self.project['id'])['runs'][0]['status'],'discarded')
        self.assertEqual(len(reopened.get(self.project['id'])['messages']),5)
    def test_cancel_retains_commits_and_blocks_late_edits(self):
        ready=threading.Event()
        class WaitingSession(FakeSession):
            def run(inner,message,cancel):
                inner.kw['on_tool']('world_edit',{'operations':[{'action':'replace','path':['worldName'],'value':'"Partial"'}],'message':'Partial change'})
                ready.set();cancel.wait(3)
                with self.assertRaises(ValueError):inner.kw['on_tool']('world_remember',{'note':'Too late'})
                return {'status':'interrupted','text':'Cancelled.'}
        self.agent.session_factory=WaitingSession
        pid=self.project['id'];run=self.agent.start(pid,{'message':'Work','version':1})
        self.assertTrue(ready.wait(3));self.agent.action(pid,run['id'],'cancel',{});self.agent.close()
        self.assertEqual(self.agent.get(pid)['runs'][0]['status'],'cancelled')
        self.assertEqual(len(self.agent.proposal(pid,run['id'])['changes']),1)
        with self.store.connect() as db:self.assertEqual(self.store.project(db,pid)['text'],self.project['text'])

    def test_legacy_conversation_replays_visible_memory_into_image_capable_thread(self):
        first=self.run_agent()
        pid=self.project['id']
        with self.store.connect() as db:
            db.execute('UPDATE world_chats SET image_enabled=0 WHERE project_id=?',(pid,))
        class MigratingSession(FakeSession):
            seen_prompts=[]
            def run(inner,message,cancel):
                inner.seen_prompts.append(message)
                inner.kw['on_thread']('image-capable-thread')
                return {'status':'completed','text':'Ready for images.'}
        self.agent.session_factory=MigratingSession
        self.run_agent()
        self.assertIsNone(FakeSession.seen[-1])
        self.assertIn('World renamed.',MigratingSession.seen_prompts[-1])
        self.assertIn('Keep a hopeful tone.',MigratingSession.seen_prompts[-1])
        with self.store.connect() as db:
            chat=self.agent.chat(db,pid)
            self.assertEqual(chat['thread_id'],'image-capable-thread')
            self.assertEqual(chat['image_enabled'],1)
        self.run_agent()
        self.assertEqual(FakeSession.seen[-1],'image-capable-thread')

    def test_copied_workspace_recovers_missing_native_thread(self):
        self.run_agent();pid=self.project['id']
        class MissingThreadSession(FakeSession):
            resumed=[]
            prompts=[]
            def run(inner,message,cancel):
                inner.resumed.append(inner.kw['thread_id'])
                inner.prompts.append(message)
                if inner.kw['thread_id']:
                    raise CodexError('thread/resume: Thread not found')
                inner.kw['on_thread']('moved-machine-thread')
                return {'status':'completed','text':'Recovered visible context.'}
        self.agent.session_factory=MissingThreadSession
        result=self.run_agent()
        self.assertEqual(result['status'],'complete')
        self.assertEqual(MissingThreadSession.resumed[-2:],['persistent-thread',None])
        self.assertIn('World renamed.',MissingThreadSession.prompts[-1])
        with self.store.connect() as db:self.assertEqual(self.agent.chat(db,pid)['thread_id'],'moved-machine-thread')

    def test_generated_image_persisted_without_world_edits(self):
        import base64
        class ImageSession(FakeSession):
            def run(inner,message,cancel):
                self.assertTrue(inner.kw['image_generation'])
                inner.kw['on_event']('image/completed',{'item':{'id':'native-image','result':base64.b64encode(b'\x89PNG\r\n\x1a\nimage').decode(),'revisedPrompt':'Harbor map'}})
                return {'status':'completed','text':'Image generated.'}
        self.agent.session_factory=ImageSession
        run=self.run_agent();data=self.agent.get(self.project['id'])
        self.assertEqual(len(data['assets']),1)
        self.assertEqual(data['assets'][0]['runId'],run['id'])
        self.assertEqual(self.agent.proposal(self.project['id'],run['id'])['changes'],[])
        self.assertEqual(WorldAgent(self.store,FakeSession).get(self.project['id'])['assets'],data['assets'])

    def test_restart_recovers_commit_ahead_of_database(self):
        run=self.run_agent();pid=self.project['id']
        recovered_text=self.project['text'].replace('"Original"','"Recovered final batch"')
        with self.store.connect() as db:
            raw=self.agent.get_run(db,pid,run['id'])
            latest=self.store.revisions.stage_commit(raw['stagePath'],recovered_text,'Final committed batch')
            raw['status']='running';self.agent.persist(db,raw)
        recovered=WorldAgent(self.store,FakeSession)
        result=recovered.get(pid)['runs'][0]
        self.assertEqual(result['status'],'interrupted');self.assertEqual(result['commit'],latest)
        changes=recovered.proposal(pid,run['id'])['changes']
        self.assertEqual(len(changes),1)
        self.assertEqual(changes[0]['after'],'"Recovered final batch"')
        with self.store.connect() as db:
            self.assertEqual(self.store.project(db,pid)['text'],self.project['text'])
        applied=recovered.action(pid,run['id'],'apply',{'version':1})
        self.assertEqual(applied['text'],recovered_text)

    def test_applied_run_rejects_late_edits_and_thread_updates(self):
        run=self.run_agent();pid=self.project['id'];callbacks=FakeSession.callbacks[-1]
        applied=self.agent.action(pid,run['id'],'apply',{'version':1})
        with self.store.connect() as db:
            raw=self.agent.get_run(db,pid,run['id'])
            old_thread=self.agent.chat(db,pid)['thread_id']
        stage_head=self.store.revisions.stage_head(raw['stagePath'])
        with self.assertRaisesRegex(ValueError,'no longer active'):
            callbacks['on_tool']('world_edit',{'message':'Late write','operations':[{'action':'replace','path':['worldName'],'value':'"Too late"'}]})
        callbacks['on_event']('item/agentMessage/delta',{'delta':'late text'})
        callbacks['on_thread']('stale-thread-must-not-replace-current')
        self.assertEqual(self.store.revisions.stage_head(raw['stagePath']),stage_head)
        with self.store.connect() as db:
            self.assertEqual(self.agent.get_run(db,pid,run['id']),raw)
            self.assertEqual(self.agent.chat(db,pid)['thread_id'],old_thread)
            self.assertEqual(self.store.project(db,pid)['text'],applied['text'])

    def test_timeout_rejects_delayed_worker_callbacks(self):
        class TimeoutSession(FakeSession):
            def run(inner,message,cancel):
                inner.kw['on_thread']('timeout-thread')
                raise TimeoutError('Simulated model timeout')
        self.agent.session_factory=TimeoutSession
        pid=self.project['id'];started=self.agent.start(pid,{'message':'Work','version':1})
        deadline=time.monotonic()+5
        while time.monotonic()<deadline:
            state=self.agent.get(pid)['runs'][0]
            if state['status']!='running':break
            time.sleep(.01)
        self.assertEqual(state['status'],'failed')
        callbacks=FakeSession.callbacks[-1]
        with self.assertRaisesRegex(ValueError,'no longer active'):
            callbacks['on_tool']('world_edit',{'message':'Delayed worker','operations':[{'action':'replace','path':['worldName'],'value':'"Late after timeout"'}]})
        callbacks['on_event']('item/agentMessage/delta',{'delta':'late text'})
        callbacks['on_thread']('late-thread')
        self.assertEqual(self.agent.get(pid)['runs'][0],state)
        self.assertEqual(self.agent.proposal(pid,started['id'])['changes'],[])
        with self.store.connect() as db:
            self.assertEqual(self.agent.chat(db,pid)['thread_id'],'timeout-thread')

    def test_tool_batch_atomic(self):
        pid=self.project['id'];stage=self.store.revisions.stage(pid,'atomic',self.project['text'])
        tools=WorldTools(self.store.revisions,pid,stage['path'],self.project['text'],lambda x:x,lambda x:None)
        with self.assertRaises((KeyError,ValueError)):
            tools.call('world_edit',{'message':'Bad batch','operations':[{'action':'replace','path':['worldName'],'value':'"Changed"'},{'action':'replace','path':['missing'],'value':'3'}]})
        self.assertEqual(self.store.revisions.stage_text(stage['path']),self.project['text'])

if __name__=='__main__':unittest.main()
