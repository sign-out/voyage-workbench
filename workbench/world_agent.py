"""Durable project conversations with isolated Git authoring runs."""
import hashlib
import json
import threading
import time
import uuid
from .codex_rpc import CodexSession, CodexError
from .world_tools import WorldTools, TOOLS, INSTRUCTIONS
from . import document

TOOLSET_VERSION = 1  # Includes world_base_template and selected schema profiles.


def digest(text):
    return hashlib.sha256(text.encode('utf-8')).hexdigest()


class WorldAgent:
    def __init__(self, store, session_factory=CodexSession):
        self.store, self.session_factory = store, session_factory
        from .assets import Assets
        self.assets = Assets(store)
        self.lock = threading.RLock()
        self.running = {}
        with store.connect() as db:
            db.executescript('''CREATE TABLE IF NOT EXISTS world_chats(project_id TEXT PRIMARY KEY,thread_id TEXT,memory TEXT NOT NULL DEFAULT '',image_enabled INTEGER NOT NULL DEFAULT 0);
            CREATE TABLE IF NOT EXISTS world_messages(id TEXT PRIMARY KEY,project_id TEXT,role TEXT,text TEXT,created REAL,run_id TEXT);
            CREATE TABLE IF NOT EXISTS world_runs(id TEXT PRIMARY KEY,project_id TEXT,payload TEXT);''')
            columns={row['name'] for row in db.execute('PRAGMA table_info(world_chats)')}
            if 'image_enabled' not in columns:
                db.execute('ALTER TABLE world_chats ADD COLUMN image_enabled INTEGER NOT NULL DEFAULT 0')
            if 'toolset_version' not in columns:
                db.execute('ALTER TABLE world_chats ADD COLUMN toolset_version INTEGER NOT NULL DEFAULT 0')
            for row in db.execute('SELECT * FROM world_runs').fetchall():
                run = json.loads(row['payload'])
                if run['status'] == 'running':
                    run.update(status='interrupted', error='Workbench restarted. Isolated commits are retained.')
                    try:
                        run['commit']=store.revisions.stage_head(run['stagePath'])
                    except (ValueError, OSError) as exc:
                        run['error']+=' Could not recover worktree HEAD: '+str(exc)
                    self.persist(db, run)

    def persist(self, db, run):
        db.execute('INSERT OR REPLACE INTO world_runs VALUES (?,?,?)', (run['id'], run['projectId'], json.dumps(run)))

    def message(self, db, pid, role, text, rid=None):
        db.execute('INSERT INTO world_messages VALUES (?,?,?,?,?,?)', (uuid.uuid4().hex,pid,role,text,time.time(),rid))

    def chat(self, db, pid):
        self.store.project(db,pid)
        db.execute('INSERT OR IGNORE INTO world_chats(project_id) VALUES (?)',(pid,))
        return dict(db.execute('SELECT * FROM world_chats WHERE project_id=?',(pid,)).fetchone())

    def get_run(self, db, pid, rid):
        row=db.execute('SELECT payload FROM world_runs WHERE id=? AND project_id=?',(rid,pid)).fetchone()
        if not row: raise KeyError('World run not found')
        return json.loads(row['payload'])

    def get(self,pid):
        with self.lock, self.store.connect() as db:
            chat=self.chat(db,pid)
            runs=[json.loads(r[0]) for r in db.execute('SELECT payload FROM world_runs WHERE project_id=? ORDER BY rowid DESC',(pid,))]
            messages=[dict(r) for r in db.execute('SELECT id,role,text,created,run_id AS runId FROM world_messages WHERE project_id=? ORDER BY rowid',(pid,))]
            for run in runs:
                if run['status']=='running' and run.get('assistantText'):
                    messages.append({'id':run['id'],'role':'assistant','text':run['assistantText'],'created':run['created']})
            return {'messages':messages,'runs':[{k:v for k,v in r.items() if k not in ('baseText','stagePath','baseHash')} for r in runs], 'memory':chat['memory'],'tools':TOOLS+[{'name':'image_generation','description':'Generate map art, tiles, portraits and item icons. Images are saved as immutable project assets; ask for them in the conversation.'}],'assets':self.assets.list(pid)}

    def memory(self,pid,value,append=False):
        if not isinstance(value,str) or len(value)>16000: raise ValueError('Memory must be at most 16000 characters')
        with self.lock,self.store.connect() as db:
            chat=self.chat(db,pid)
            value=(chat['memory']+'\n'+value).strip() if append else value
            if len(value)>16000: raise ValueError('World memory is full; edit the pinned memory first')
            db.execute('UPDATE world_chats SET memory=? WHERE project_id=?',(value,pid))
            return value

    def start(self,pid,body):
        from .server import Conflict
        instruction=body.get('message')
        if not isinstance(instruction,str) or not instruction.strip() or len(instruction)>24000: raise ValueError('Message must be 1–24000 characters')
        with self.lock,self.store.connect() as db:
            db.execute('BEGIN IMMEDIATE')
            current=self.store.project(db,pid)
            if type(body.get('version')) is not int or body.get('version')!=current['version']: raise Conflict('World changed; reload before starting a run')
            if pid in self.running: raise Conflict('This world already has a running conversation')
            if document.inspect(current['text'])['errors']: raise ValueError('Fix the world JSON before starting the agent')
            chat=self.chat(db,pid)
            chat['needs_upgrade']=bool(chat['thread_id']) and (not bool(chat['image_enabled']) or chat['toolset_version'] != TOOLSET_VERSION)
            prior_messages=[dict(row) for row in db.execute('SELECT role,text FROM world_messages WHERE project_id=? ORDER BY rowid',(pid,))] if chat['needs_upgrade'] else []
            rid=uuid.uuid4().hex
            stage=self.store.revisions.stage(pid,rid,current['text'])
            run={'id':rid,'projectId':pid,'status':'running','created':time.time(),'instruction':instruction.strip(),'baseVersion':current['version'],'baseHash':digest(current['text']),'baseText':current['text'],'stagePath':str(stage['path']),'branch':stage['branch'],'baseCommit':stage['baseCommit'],'commit':stage['baseCommit'],'assistantText':'','tools':[]}
            previous=db.execute('SELECT payload FROM world_runs WHERE project_id=? ORDER BY rowid DESC LIMIT 1',(pid,)).fetchone()
            continued=False
            if previous:
                old=json.loads(previous[0])
                if old['status']=='complete' and old['baseHash']==run['baseHash'] and old['baseVersion']==run['baseVersion']:
                    text=self.store.revisions.read(pid,old['commit'])
                    run['commit']=self.store.revisions.stage_commit(run['stagePath'],text,'Continue previous proposal')
                    old['status']='superseded';self.persist(db,old);continued=True
            self.message(db,pid,'user',instruction,rid)
            self.persist(db,run)
            cancel=threading.Event()
            self.running[pid]=(cancel,None)
        thread=threading.Thread(target=self.execute,args=(run,chat,cancel,continued,prior_messages),daemon=True)
        with self.lock:self.running[pid]=(cancel,thread)
        thread.start()
        return {'id':rid,'status':'running'}

    def execute(self,run,chat,cancel,continued,prior_messages):
        pid=run['projectId']
        def persist():
            with self.store.connect() as db:self.persist(db,run)
        def active():
            return run['status']=='running' and not cancel.is_set() and self.running.get(pid,(None,))[0] is cancel
        def committed(commit):run['commit']=commit
        def tool(name,args):
            with self.lock:
                if not active():raise ValueError('Run is no longer active')
                event={'name':name,'status':'running','summary':''};run['tools'].append(event);persist()
                try:
                    result=world.call(name,args)
                    event.update(status='complete',summary=(str(result.get('changeCount'))+' changes committed') if 'changeCount' in result else 'Done')
                    persist();return result
                except Exception as exc:
                    event.update(status='failed',summary=str(exc));persist();raise
        last_stream_save=[0.0]
        def event(method,params):
            if method=='image/completed':
                with self.lock:
                    if not active():return
                    item=params.get('item',{})
                    run['tools']=[t for t in run['tools'] if not (t['name']=='image_generation' and t['status']=='running')]
                    try:
                        asset=self.assets.capture(pid,run['id'],item)
                        run['tools'].append({'name':'image_generation','status':'complete','summary':'Image saved to project gallery','assetId':asset['id']})
                    except (ValueError,OSError) as exc:
                        run['tools'].append({'name':'image_generation','status':'failed','summary':str(exc)})
                        run['error']='Image could not be saved: '+str(exc)
                    persist()
            if method=='item/started' and params.get('item',{}).get('type')=='imageGeneration':
                with self.lock:
                    if active():
                        run['tools'].append({'name':'image_generation','status':'running','summary':'Generating artwork…'});persist()
            if method=='item/agentMessage/delta':
                with self.lock:
                    if not active():return
                    run['assistantText']+=params.get('delta','')
                    if time.monotonic()-last_stream_save[0]>.4:
                        persist();last_stream_save[0]=time.monotonic()
        def on_thread(tid):
            with self.lock:
                if not active():return
                with self.store.connect() as db:db.execute('UPDATE world_chats SET thread_id=?,image_enabled=1,toolset_version=? WHERE project_id=?',(tid,TOOLSET_VERSION,pid))
        catalog=getattr(self.store,'schema_catalog',None)
        base_world=getattr(self.store,'base_world',None)
        world=WorldTools(self.store.revisions,pid,run['stagePath'],run['baseText'],lambda note:self.memory(pid,note,True),committed,
                         schema_profile=base_world.validation_profile if base_world is not None else catalog.validation_profile if catalog is not None else None,
                         base_template=(lambda:{'text':base_world.template_text(),'source':base_world.status()}) if base_world is not None else None)
        history='\n'.join(m['role']+': '+m['text'] for m in prior_messages)
        if len(history)>40000:history=history[-40000:]
        prompt=('Previous visible project conversation (restored after application tool upgrade):\n'+history+'\n\n' if history else '')+'Fresh working-world version: '+str(run['baseVersion'])+'. '+('Stage continues your previous unaccepted proposal.' if continued else 'Stage starts from the saved working world. Earlier proposals are not included unless already applied; do not silently restore them.')+'\nPinned world memory:\n'+chat['memory']+'\nCreator message:\n'+run['instruction']
        try:
            session=self.session_factory(cwd=run['stagePath'],tools=TOOLS,instructions=INSTRUCTIONS,thread_id=chat['thread_id'] if chat['image_enabled'] and not chat['needs_upgrade'] else None,on_event=event,on_tool=tool,on_thread=on_thread,image_generation=True,timeout=600)
            try:
                result=session.run(prompt,cancel)
            except CodexError as exc:
                # A copied workspace can retain a native thread ID whose rollout
                # lives only in the previous machine's Codex home. Resume fails
                # before any model turn or world tool executes, so replay the
                # visible transcript in a fresh native thread once.
                if not chat['thread_id'] or not str(exc).startswith('thread/resume:') or cancel.is_set():
                    raise
                with self.store.connect() as db:
                    older=[dict(row) for row in db.execute('SELECT role,text FROM world_messages WHERE project_id=? AND run_id!=? ORDER BY rowid',(pid,run['id']))]
                replay='\n'.join(m['role']+': '+m['text'] for m in older)[-40000:]
                prompt='Previous visible project conversation (restored on this machine):\n'+replay+'\n\n'+prompt
                session=self.session_factory(cwd=run['stagePath'],tools=TOOLS,instructions=INSTRUCTIONS,thread_id=None,on_event=event,on_tool=tool,on_thread=on_thread,image_generation=True,timeout=600)
                result=session.run(prompt,cancel)
            with self.lock:
                run['assistantText']=result.get('text','')
                run['status']='cancelled' if cancel.is_set() or result['status']=='interrupted' else 'complete' if result['status']=='completed' else 'failed'
                if result.get('error'):run['error']=str(result['error'])
        except Exception as exc:
            with self.lock:run.update(status='cancelled' if cancel.is_set() else 'failed',error=str(exc))
        finally:
            with self.lock,self.store.connect() as db:
                self.persist(db,run)
                if run['assistantText']:self.message(db,pid,'assistant',run['assistantText'],run['id'])
                if run.get('error'):self.message(db,pid,'system',run['error'],run['id'])
                self.running.pop(pid,None)

    def proposal(self,pid,rid):
        with self.lock,self.store.connect() as db:
            run=self.get_run(db,pid,rid)
            return {'changes':document.diff(run['baseText'],self.store.revisions.read(pid,run['commit'])),'commit':run['commit'],'baseCommit':run['baseCommit'],'status':run['status']}

    def action(self,pid,rid,action,body):
        from .server import Conflict
        with self.lock,self.store.connect() as db:
            db.execute('BEGIN IMMEDIATE');run=self.get_run(db,pid,rid)
            if action=='cancel':
                if run['status']=='running' and pid in self.running:self.running[pid][0].set()
                return {'status':run['status']}
            if run['status'] not in ('complete','failed','cancelled','interrupted'):raise Conflict('This proposal is not available for review')
            if action=='discard':
                run['status']='discarded';self.persist(db,run);self.message(db,pid,'system','Proposal discarded; isolated Git commits retained.',rid)
                return {'status':'discarded'}
            current=self.store.project(db,pid)
            if type(body.get('version')) is not int or body.get('version')!=current['version'] or current['version']!=run['baseVersion'] or digest(current['text'])!=run['baseHash']:raise Conflict('Working world changed since this proposal. Start a new turn against the latest world.')
            text=self.store.revisions.read(pid,run['commit'])
            self.store.checkpoint(db,pid,current['text'],'Before world-agent proposal')
            self.store.revisions.ensure(pid,current['text'])
            self.store.revisions.commit(pid,text,'Apply world agent: '+run['instruction'][:150])
            db.execute('UPDATE projects SET name=?,text=?,version=version+1,updated=? WHERE id=?',(self.store.name_for(text,current['name']),text,time.time(),pid))
            run['status']='applied';self.persist(db,run);self.message(db,pid,'system','Applied proposal '+run['commit'][:12]+' to the local world.',rid)
            return self.store.project(db,pid)

    def revisions(self,pid,body=None):
        from .server import Conflict
        with self.lock,self.store.connect() as db:
            db.execute('BEGIN IMMEDIATE');current=self.store.project(db,pid)
            self.store.revisions.ensure(pid,current['text'])
            if body is None:return {'revisions':self.store.revisions.history(pid)}
            if type(body.get('version')) is not int or body.get('version')!=current['version']:raise Conflict('World changed; reload before restoring')
            text=self.store.revisions.read(pid,body.get('commit',''))
            self.store.checkpoint(db,pid,current['text'],'Before Git restore')
            self.store.revisions.commit(pid,text,'Restore '+body['commit'][:12])
            db.execute('UPDATE projects SET name=?,text=?,version=version+1,updated=? WHERE id=?',(self.store.name_for(text,current['name']),text,time.time(),pid))
            self.message(db,pid,'system','Restored Git revision '+body['commit'][:12]+'.')
            return self.store.project(db,pid)

    def close(self):
        with self.lock:active=list(self.running.values())
        for cancel,_ in active:cancel.set()
        for _,thread in active:
            if thread:thread.join(timeout=4)


def route(handler,method,path,body):
    parts=path.strip('/').split('/')
    if len(parts)<4 or parts[:2]!=['api','projects'] or parts[3] not in ('chat','revisions'):return False
    agent=handler.server.world_agent;pid=parts[2];tail=parts[3:]
    if tail==['chat'] and method=='GET':result=agent.get(pid)
    elif tail==['chat'] and method=='POST':result=agent.start(pid,body)
    elif tail==['chat','memory'] and method=='POST':result={'memory':agent.memory(pid,body.get('memory'))}
    elif len(tail)==4 and tail[:2]==['chat','runs'] and tail[3]=='proposal' and method=='GET':result=agent.proposal(pid,tail[2])
    elif len(tail)==4 and tail[:2]==['chat','runs'] and tail[3] in ('cancel','apply','discard') and method=='POST':result=agent.action(pid,tail[2],tail[3],body)
    elif tail==['revisions'] and method=='GET':result=agent.revisions(pid)
    elif tail==['revisions','restore'] and method=='POST':result=agent.revisions(pid,body)
    else:return False
    handler.respond(200,result);return True
