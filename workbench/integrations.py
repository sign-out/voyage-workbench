"""HTTP integration routes separated from local project persistence."""
import json
import os
import threading
import time
from contextlib import nullcontext
from .voyage import Client, VoyageError
from .agent import Proposals
from . import document


def initialize(server):
    from .world_agent import WorldAgent
    from .credentials import CredentialStore
    from pathlib import Path
    from .schema_catalog import SchemaCatalog
    from .base_world import BaseWorld
    directory = Path(server.store.path).resolve().parent
    server.schema_catalog = SchemaCatalog(directory / 'schema')
    server.base_world = BaseWorld(directory / 'base-world', server.schema_catalog)
    server.store.schema_catalog = server.schema_catalog
    server.store.base_world = server.base_world
    server.world_agent = WorldAgent(server.store)
    from .artwork import Artwork
    server.artwork = Artwork(server.store, server.world_agent.assets)
    server.voyage = Client()
    server.credentials = CredentialStore(Path(server.store.path).resolve().parent / 'creator-credentials.json')
    server.credential_error = None
    try:
        saved = server.credentials.load()
        environment = 'alpha'
        if saved['keys'].get(environment):
            server.voyage.configure(saved['keys'][environment], environment)
    except (OSError, ValueError, KeyError, TypeError):
        server.credential_error = 'Saved Creator API key could not be loaded. Check its owner-only access and file format.'
    server.proposals = Proposals(server.store)
    server.remote_lock = threading.Lock()
    from .publication import initialize as initialize_publication
    initialize_publication(server)
    with server.store.connect() as db:
        db.executescript('''CREATE TABLE IF NOT EXISTS remote_links
          (project_id TEXT PRIMARY KEY,short_id TEXT NOT NULL,environment TEXT NOT NULL,etag TEXT NOT NULL,baseline TEXT NOT NULL);
          CREATE TABLE IF NOT EXISTS remote_operations
          (id INTEGER PRIMARY KEY,project_id TEXT NOT NULL,created REAL NOT NULL,status TEXT NOT NULL,detail TEXT NOT NULL);
          CREATE TABLE IF NOT EXISTS mod_attachments
          (project_id TEXT NOT NULL,short_id TEXT NOT NULL,text TEXT NOT NULL,title TEXT NOT NULL,
           filename TEXT NOT NULL,sections TEXT NOT NULL,updated REAL NOT NULL,
           PRIMARY KEY(project_id,short_id));''')
    from .uploads import Uploads
    server.uploads = Uploads(server.store, server.voyage, server.world_agent.assets)


def route(handler, method, path, body):
    from .uploads import route as uploads_route
    if uploads_route(handler, method, path, body):
        return True
    from .artwork import route as artwork_route
    if artwork_route(handler, method, path, body):
        return True
    from .publication import route as publication_route
    if publication_route(handler, method, path, body):
        return True
    from .schema_catalog import route as schema_route
    from .base_world import route as base_route
    if schema_route(handler, method, path, body) or base_route(handler, method, path, body):
        return True
    from .assets import route as asset_route
    if asset_route(handler, method, path, body):
        return True
    from .world_agent import route as world_route
    if world_route(handler, method, path, body):
        return True
    server, store = handler.server, handler.server.store
    def respond(value, status=200):
        handler.respond(status,value)
        return True
    if path == '/api/connection':
        if method == 'GET':
            with server.remote_lock:
                try:
                    saved = server.credentials.load()
                    saved_envs = sorted(saved['keys'])
                except (OSError, ValueError, KeyError, TypeError):
                    saved_envs = []
                return respond({**server.voyage.status(), 'savedEnvironments': saved_envs,
                                'storage': 'Windows account encryption' if os.name == 'nt' else 'Owner-only local file',
                                'credentialError': server.credential_error})
        if method == 'POST':
            with server.remote_lock:
                environment = body.get('environment', 'alpha')
                candidate = body.get('key', '')
                if not isinstance(candidate, str):
                    raise ValueError('Creator API key must be text.')
                try:
                    saved = server.credentials.load()
                except (OSError, ValueError, KeyError, TypeError):
                    if not candidate.strip():
                        raise ValueError('Saved Creator API key could not be loaded. Enter a replacement key.') from None
                    saved = {'keys': {}}
                key = candidate.strip() or saved['keys'].get(environment, '')
                if not key:
                    raise ValueError('No saved Creator API key for this environment. Enter one first.')
                Client().configure(key, environment)
                server.credentials.save(environment, candidate.strip() if candidate.strip() else None)
                server.voyage.configure(key, environment)
                server.credential_error = None
                return respond({**server.voyage.status(), 'savedEnvironments': sorted(server.credentials.load()['keys'])})
        if method == 'DELETE':
            with server.remote_lock:
                environment = body.get('environment', server.voyage.environment)
                saved = server.credentials.forget(environment)
                current = 'alpha'
                server.voyage.configure(saved['keys'].get(current, ''), current)
                return respond({**server.voyage.status(), 'savedEnvironments': sorted(saved['keys'])})
    if path == '/api/agent/status' and method == 'GET':
        return respond(server.proposals.status())
    if path == '/api/agent/proposals' and method == 'POST':
        project_id=body.get('projectId')
        if project_id:
            with store.connect() as db:
                current=store.project(db,project_id)
                if current['version']!=body.get('version'):
                    return respond({'error':'Local project version changed. Reload before generating.'},409)
        return respond(server.proposals.start(body.get('text',''),body.get('path',[]),body.get('instruction',''),project_id,body.get('version')),202)
    if path.startswith('/api/agent/proposals/') and path.endswith('/cancel') and method == 'POST':
        return respond(server.proposals.cancel(path.split('/')[-2]))
    if path.startswith('/api/agent/proposals/') and method == 'GET':
        return respond(server.proposals.get(path.rsplit('/',1)[-1]))
    if path == '/api/remote/list' and method == 'POST':
        with server.remote_lock:
            return respond(server.voyage.list_worlds(body.get('page',0)))
    if path == '/api/remote/mods' and method == 'POST':
        from .mods import catalog
        with server.remote_lock:
            return respond({'mods': catalog(server.voyage.list_mods(body.get('shortIds', [])))})
    if path == '/api/mods/inspect' and method == 'POST':
        from .mods import references
        return respond({'mods': references(body.get('text', ''))})
    if path == '/api/mods/export' and method == 'POST':
        from .mods import export
        return respond({'text': export(body.get('text', ''), body.get('mods'))})
    if path == '/api/community/validate' and method == 'POST':
        from .community_validation import validate
        return respond(validate(body.get('text'), body.get('consent')))
    if path == '/api/remote/validate' and method == 'POST':
        with server.remote_lock:
            return respond(server.voyage.validate(body.get('text','')))
    if path == '/api/remote/download' and method == 'POST':
        sid=body.get('shortId')
        if not isinstance(sid,str) or not sid.strip():
            raise ValueError('Enter a world shortId.')
        with server.remote_lock:
            remote=server.voyage.download(sid.strip())
            title=json.loads(document.section(remote['text'],['title']))
            project=store.create(title,remote['text'])
            with store.connect() as db:
                db.execute('INSERT INTO remote_links VALUES (?,?,?,?,?)',(project['id'],sid.strip(),remote['environment'],remote['etag'],remote['text']))
            project['remote']={k:v for k,v in remote.items() if k!='text'}
            return respond(project,201)
    parts=path.strip('/').split('/')
    if len(parts) >= 4 and parts[:2] == ['api', 'projects'] and parts[3] == 'mod-files':
        pid=parts[2]
        from .mods import attachment
        with store.connect() as db:
            store.project(db,pid)
            if len(parts)==4 and method=='GET':
                rows=db.execute('SELECT short_id,title,filename,sections,updated FROM mod_attachments WHERE project_id=? ORDER BY updated DESC',(pid,)).fetchall()
                return respond({'mods':[{'shortId':r['short_id'],'title':r['title'],'filename':r['filename'],
                                        'sections':json.loads(r['sections']),'updated':r['updated'],'source':'attached JSON'} for r in rows]})
            if len(parts)==4 and method=='POST':
                raw=body.get('text')
                if not isinstance(raw,str) or len(raw.encode('utf-8'))>8*1024*1024:
                    raise ValueError('Mod JSON must be text no larger than 8 MiB.')
                info=attachment(raw,body.get('shortId',''),body.get('filename','mod.json'))
                db.execute('INSERT INTO mod_attachments(project_id,short_id,text,title,filename,sections,updated) VALUES (?,?,?,?,?,?,?) '
                           'ON CONFLICT(project_id,short_id) DO UPDATE SET text=excluded.text,title=excluded.title,filename=excluded.filename,sections=excluded.sections,updated=excluded.updated',
                           (pid,info['shortId'],raw,info['title'],info['filename'],json.dumps(info['sections']),time.time()))
                return respond(info)
            if len(parts)==5 and parts[4]=='detach' and method=='POST':
                sid=body.get('shortId')
                if not isinstance(sid,str) or not sid:
                    raise ValueError('Enter a mod short ID to detach.')
                count=db.execute('DELETE FROM mod_attachments WHERE project_id=? AND short_id=?',(pid,sid)).rowcount
                if not count:
                    raise KeyError('Attached mod not found')
                return respond({'detached':True,'shortId':sid})
            if len(parts)==5 and parts[4]=='download' and method=='POST':
                sid=body.get('shortId')
                row=db.execute('SELECT text,filename FROM mod_attachments WHERE project_id=? AND short_id=?',(pid,sid)).fetchone()
                if not row:
                    raise KeyError('Attached mod not found')
                return respond({'text':row['text'],'filename':row['filename']})
    if len(parts)==4 and parts[:2]==['api','projects'] and parts[3]=='proposals' and method=='GET':
        return respond({'jobs':server.proposals.list(parts[2])})
    if len(parts)==4 and parts[:2]==['api','projects'] and parts[3]=='remote-refresh' and method=='POST':
        pid=parts[2]
        applying = body.get('apply') is True
        with server.remote_lock, (server.world_agent.lock if applying else nullcontext()), (server.proposals.lock if applying else nullcontext()):
            if applying and (pid in server.world_agent.running or any(job.get('projectId') == pid and job.get('status') == 'running' for job in server.proposals.jobs.values())):
                return respond({'error':'Wait for the active agent run to finish or cancel it before applying a remote refresh.'},409)
            with store.connect() as db:
                project=store.project(db,pid)
                if type(body.get('version')) is not int or body['version'] != project['version']:
                    return respond({'error':'Local project changed; reload before refreshing from Voyage.'},409)
                link=db.execute('SELECT * FROM remote_links WHERE project_id=?',(pid,)).fetchone()
                if link is None:
                    raise ValueError('This project is not linked to a Voyage world.')
                link=dict(link)
                if link['environment'] != server.voyage.environment:
                    raise ValueError('Connection environment differs from this project’s remote origin.')
            remote=server.voyage.download(link['short_id'])
            if remote['environment'] != link['environment']:
                raise ValueError('Downloaded world came from the wrong environment.')
            matched = 'unchanged' if remote['text']==link['baseline'] else 'matches-local' if remote['text']==project['text'] else None
            if matched:
                with store.connect() as db:
                    db.execute('UPDATE remote_links SET etag=?,baseline=? WHERE project_id=?',(remote['etag'],remote['text'],pid))
                    db.execute("UPDATE remote_operations SET status='reconciled',detail=? WHERE project_id=? AND status='unknown'",
                               ('Authoritative draft downloaded and compared',pid))
                    current=store.project(db,pid)
                current['remote']={'shortId':link['short_id'],'environment':link['environment'],'etag':remote['etag']}
                return respond({'status':matched,'project':current,'hasLocalChanges':project['text']!=link['baseline']})
            if body.get('apply') is not True:
                try:
                    changes=document.diff(project['text'],remote['text'])
                except ValueError:
                    changes=[]
                return respond({'status':'diverged','remoteText':remote['text'],'etag':remote['etag'],
                                'changes':changes,'hasLocalChanges':project['text']!=link['baseline'],
                                'shortId':link['short_id']})
            if body.get('expectedEtag') != remote['etag']:
                return respond({'error':'Voyage changed since the preview. Refresh again before applying.'},409)
            applied=store.revisions.import_changes(store,pid,{'text':remote['text'],'version':project['version'],
                                                                'reason':'Refresh linked draft from Voyage'})
            with store.connect() as db:
                db.execute('UPDATE remote_links SET etag=?,baseline=? WHERE project_id=?',(remote['etag'],remote['text'],pid))
                db.execute("UPDATE remote_operations SET status='reconciled',detail=? WHERE project_id=? AND status='unknown'",
                           ('Authoritative draft applied to local project',pid))
            applied['project']['remote']={'shortId':link['short_id'],'environment':link['environment'],'etag':remote['etag']}
            return respond({'status':'applied','project':applied['project'],'changes':applied['changes']})
    if len(parts)==4 and parts[:2]==['api','projects'] and parts[3]=='remote-save' and method=='POST':
        pid=parts[2]
        with server.remote_lock:
            with store.connect() as db:
                project=store.project(db,pid)
                if body.get('version') != project['version']:
                    return respond({'error':'Local project changed; reload before remote saving.'},409)
                link=db.execute('SELECT * FROM remote_links WHERE project_id=?',(pid,)).fetchone()
                if link is None:
                    raise ValueError('Download a remote world first to establish its identity and ETag. Raw imports can be exported for Studio.')
                if link['environment'] != server.voyage.environment:
                    raise ValueError('Connection environment differs from this project’s remote origin.')
                pending=db.execute("SELECT id FROM remote_operations WHERE project_id=? AND status='unknown'",(pid,)).fetchone()
                if pending:
                    raise ValueError('A prior remote save needs reconciliation. Use Refresh linked world to compare the live draft in this project before saving again.')
                store.checkpoint(db,pid,project['text'],'Before remote save')
                operation=db.execute('INSERT INTO remote_operations(project_id,created,status,detail) VALUES (?,?,?,?)',(pid,time.time(),'unknown','Save dispatched; verify remote before retry')).lastrowid
            try:
                remote=server.voyage.save(project['text'],link['short_id'],link['etag'])
            except VoyageError as error:
                # A returned 4xx or a read-only validation failure did not replace the draft.
                if error.rejected or any(s in str(error) for s in ['identity','Enter a Creator']):
                    with store.connect() as db:
                        db.execute('UPDATE remote_operations SET status=?,detail=? WHERE id=?',('rejected',str(error),operation))
                raise
            with store.connect() as db:
                db.execute('UPDATE remote_links SET etag=?,baseline=? WHERE project_id=?',(remote['etag'],remote['text'],pid))
                db.execute('UPDATE remote_operations SET status=?,detail=? WHERE id=?',('verified','Read back completed',operation))
                current=store.project(db,pid)
                current['remote']={'shortId':link['short_id'],'environment':link['environment'],'etag':remote['etag']}
            return respond({'project':current,'changes':remote['changes'],'remoteText':remote['text'],'localChangedDuringSave':current['version']!=project['version']})
    return False
