"""Explicit publication actions and recoverable, idempotent API requests."""
import json
import time
import uuid
from . import document
from .voyage import VoyageError, editable_world


def initialize(server):
    with server.store.connect() as db:
        db.execute('''CREATE TABLE IF NOT EXISTS publication_operations
          (id TEXT PRIMARY KEY,project_id TEXT NOT NULL,created REAL NOT NULL,kind TEXT NOT NULL,
           environment TEXT NOT NULL,short_id TEXT NOT NULL,request_body TEXT NOT NULL,
           status TEXT NOT NULL,result TEXT,detail TEXT NOT NULL)''')


def linked(db, pid, client):
    row = db.execute('SELECT * FROM remote_links WHERE project_id=?', (pid,)).fetchone()
    if not row:
        raise ValueError('Create a Voyage draft or download an owned world first.')
    if row['environment'] != client.environment:
        raise ValueError('Connect to this world’s ' + row['environment'] + ' environment first.')
    return dict(row)


def create_body(project):
    text = project['text']
    info = document.inspect(text)
    if info['errors']:
        raise ValueError('Fix local JSON before creating a Voyage draft.')
    state = document.section(text, info['gameStatePath'])
    fields = ['"title":' + json.dumps(project['name'], ensure_ascii=True), '"initialGameState":' + state]
    if info['gameStatePath']:
        parent = info['gameStatePath'][:-1]
        envelope = document.parse(document.section(text, parent))
        for key in ('description', 'advancedDescription', 'discordThreadUrl', 'image', 'isLocked', 'isMod', 'isUnremixable', 'tags'):
            if key in envelope:
                fields.append(json.dumps(key) + ':' + document.section(text, parent + [key]))
    fields.append('"visibility":"private"')
    return '{"world":{' + ','.join(fields) + '}}'


def synchronized(project, remote):
    try:
        return not document.diff(editable_world(project['text']), editable_world(remote['text']))
    except (ValueError, TypeError):
        return False


def route(handler, method, path, body):
    parts = path.strip('/').split('/')
    if len(parts) not in (4, 5) or parts[:2] != ['api', 'projects'] or parts[3] != 'publication':
        return False
    server, store, pid = handler.server, handler.server.store, parts[2]
    action = parts[4] if len(parts) == 5 else 'status'
    with server.remote_lock, server.world_agent.lock, server.proposals.lock:
        with store.connect() as db:
            project = store.project(db, pid)
            rows = db.execute('SELECT id,kind,environment,short_id,created,status,detail,result FROM publication_operations WHERE project_id=? ORDER BY created DESC LIMIT 20', (pid,)).fetchall()
            operations = [{**dict(row), 'result': json.loads(row['result']) if row['result'] else None} for row in rows]
            link_row = db.execute('SELECT * FROM remote_links WHERE project_id=?', (pid,)).fetchone()
        if method == 'GET' and action == 'status':
            value = {'linked': bool(link_row), 'operations': operations, 'name': project['name']}
            if link_row:
                value['remote'] = {k: link_row[k] for k in ('short_id', 'environment', 'etag')}
                if server.voyage.key and server.voyage.environment == link_row['environment']:
                    try:
                        remote = server.voyage.download(link_row['short_id'])
                        world = document.parse(remote['text'])
                        value.update(synchronized=synchronized(project, remote), remoteTitle=world.get('title'),
                            draftCurrent=remote['etag'] == link_row['etag'],
                            metadata={k: v for k, v in json.loads(remote['text']).items() if k != 'initialGameState' and
                                      (k in ('title', 'visibility', 'shortId') or any(s in k.lower() for s in ('publish', 'moderation', 'status')))})
                        value['moderation'] = server.voyage.moderation(link_row['short_id'])
                    except VoyageError as error:
                        value['remoteError'] = str(error)
                else:
                    value['connectionRequired'] = True
            handler.respond(200, value)
            return True
        if method != 'POST' or action not in ('validate', 'create', 'publish', 'unpublish', 'moderation', 'retry'):
            return False
        if type(body.get('version')) is not int or body['version'] != project['version']:
            handler.respond(409, {'error': 'Project changed; reload before continuing.'})
            return True
        if pid in server.world_agent.running or any(j.get('projectId') == pid and j.get('status') == 'running' for j in server.proposals.jobs.values()):
            handler.respond(409, {'error': 'Wait for the active agent run or cancel it before changing publication.'})
            return True
        if action == 'validate':
            handler.respond(200, server.voyage.validate(project['text'], 'publish'))
            return True
        if not server.voyage.key:
            raise ValueError('Connect your Creator API key first.')
        with store.connect() as db:
            if db.execute("SELECT 1 FROM remote_operations WHERE project_id=? AND status='unknown'", (pid,)).fetchone():
                raise ValueError('Refresh linked world to reconcile the prior remote save first.')
            pending = db.execute("SELECT * FROM publication_operations WHERE project_id=? AND status='unknown' ORDER BY created DESC LIMIT 1", (pid,)).fetchone()
            if action == 'retry':
                operation = db.execute('SELECT * FROM publication_operations WHERE project_id=? AND id=?', (pid, body.get('operationId'))).fetchone()
                if not operation or operation['status'] not in ('unknown', 'rejected'):
                    raise ValueError('No unresolved publication request to retry.')
                operation = dict(operation)
                if operation['environment'] != server.voyage.environment:
                    raise ValueError('Reconnect to the original request’s environment.')
                action = operation['kind']
                # Inspect current Studio draft/moderation before exact replay.
                if action != 'create':
                    server.voyage.download(operation['short_id'])
                    server.voyage.moderation(operation['short_id'])
            else:
                if pending:
                    raise ValueError('An earlier publication action has an unknown outcome. Inspect status and retry that exact request before starting another.')
                if action == 'create':
                    if link_row:
                        raise ValueError('This project already has a Voyage draft.')
                    validation = server.voyage.validate(project['text'])
                    if validation.get('data', validation).get('valid') is not True:
                        raise ValueError('Draft validation must pass before creating a Voyage draft.')
                    sid, payload = '', create_body(project)
                else:
                    link = linked(db, pid, server.voyage)
                    sid = link['short_id']
                    remote = server.voyage.download(sid)
                    if action in ('publish', 'moderation'):
                        if not synchronized(project, remote) or link['etag'] != remote['etag']:
                            raise ValueError('Save the latest title and world to Voyage, then refresh/review any remote changes before publishing or running moderation.')
                    if action == 'publish':
                        validation = server.voyage.validate(remote['text'], 'publish')
                        if validation.get('data', validation).get('valid') is not True:
                            raise ValueError('Publish validation did not pass. Run publish checks to see the issues.')
                    payload = '{"forceFullCheck":' + ('true' if body.get('forceFullCheck') is True else 'false') + '}' if action == 'moderation' else '{}'
                operation = {'id': uuid.uuid4().hex, 'project_id': pid, 'created': time.time(), 'kind': action,
                             'environment': server.voyage.environment, 'short_id': sid, 'request_body': payload,
                             'status': 'unknown', 'result': None, 'detail': 'Dispatched; exact idempotency key retained'}
                store.checkpoint(db, pid, project['text'], 'Before Voyage ' + action)
                db.execute('INSERT INTO publication_operations VALUES (?,?,?,?,?,?,?,?,?,?)', tuple(operation[k] for k in
                    ('id', 'project_id', 'created', 'kind', 'environment', 'short_id', 'request_body', 'status', 'result', 'detail')))
        try:
            if action == 'publish' and not operation['result']:
                # The endpoint publishes the live draft. Recheck right before
                # dispatch, including on a deliberate retry of a rejected call.
                with store.connect() as db:
                    latest_link = linked(db, pid, server.voyage)
                latest = server.voyage.download(operation['short_id'])
                if not synchronized(project, latest) or latest['etag'] != latest_link['etag']:
                    raise VoyageError('The live draft changed before publication. Refresh and review it first.', rejected=True)
                if body.get('operationId'):
                    valid = server.voyage.validate(latest['text'], 'publish')
                    if valid.get('data', valid).get('valid') is not True:
                        raise VoyageError('Publish validation did not pass for the current draft.', rejected=True)
            result = json.loads(operation['result']) if operation['result'] else server.voyage.publication_request(action, operation['short_id'], operation['request_body'], operation['id'])
            # Persist the successful response before read-back/linking can fail.
            with store.connect() as db:
                db.execute('UPDATE publication_operations SET result=? WHERE id=?', (json.dumps(result), operation['id']))
            if action == 'create':
                data = result.get('data', result)
                world = data.get('world', data) if isinstance(data, dict) else {}
                sid = world.get('shortId')
                if not isinstance(sid, str) or not sid:
                    raise VoyageError('Draft creation response had no shortId. Inspect your owned worlds before retrying.')
                remote = server.voyage.download(sid)
                # Preserve edits made after an earlier uncertain creation.
                current = project
                state_path = document.inspect(current['text'])['gameStatePath']
                text = document.replace(remote['text'], ['initialGameState'], document.section(current['text'], state_path))
                text = document.replace(text, ['title'], json.dumps(current['name'], ensure_ascii=True))
                applied = store.revisions.import_changes(store, pid, {'text': text, 'version': current['version'], 'reason': 'Link newly created Voyage draft'})
                project = applied['project']
                with store.connect() as db:
                    previous = db.execute('SELECT short_id,environment FROM remote_links WHERE project_id=?', (pid,)).fetchone()
                    if previous and (previous['short_id'] != sid or previous['environment'] != remote['environment']):
                        raise ValueError('This project was linked elsewhere; reconcile the recorded creation before continuing.')
                    db.execute('INSERT OR REPLACE INTO remote_links VALUES (?,?,?,?,?)', (pid, sid, remote['environment'], remote['etag'], remote['text']))
            else:
                remote = server.voyage.download(operation['short_id'])
            with store.connect() as db:
                if action != 'create' and synchronized(project, remote):
                    db.execute('UPDATE remote_links SET etag=?,baseline=? WHERE project_id=?', (remote['etag'], remote['text'], pid))
                db.execute("UPDATE publication_operations SET status='verified',detail=? WHERE id=?", ('Voyage acknowledged action; draft read back', operation['id']))
                project = store.project(db, pid)
            handler.respond(200, {'project': project, 'result': result, 'kind': action})
        except (VoyageError, ValueError, KeyError, TypeError) as error:
            # Once a success response is recorded, read-back failure is unknown.
            with store.connect() as db:
                recorded = db.execute('SELECT result FROM publication_operations WHERE id=?', (operation['id'],)).fetchone()['result']
                rejected = getattr(error, 'rejected', False) and not recorded
                db.execute('UPDATE publication_operations SET status=?,detail=? WHERE id=?', ('rejected' if rejected else 'unknown', str(error), operation['id']))
            raise
        return True
