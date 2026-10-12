"""Immutable project image assets, captured only from provider image results."""
import base64
import hashlib
from pathlib import Path
import re
import time

MAX_IMAGE = 32 * 1024 * 1024

class Assets:
    def __init__(self,store):
        self.store=store
        self.root=Path(store.path).resolve().parent/'assets'
        self.root.mkdir(exist_ok=True)
        with store.connect() as db:
            db.execute('''CREATE TABLE IF NOT EXISTS world_assets
            (id TEXT PRIMARY KEY, project_id TEXT NOT NULL, run_id TEXT NOT NULL, item_id TEXT NOT NULL,
             mime TEXT NOT NULL, extension TEXT NOT NULL, prompt TEXT NOT NULL, created REAL NOT NULL,
             sha256 TEXT NOT NULL, bytes INTEGER NOT NULL, UNIQUE(project_id,run_id,item_id))''')

            columns={row['name'] for row in db.execute('PRAGMA table_info(world_assets)')}
            if 'metadata' not in columns:
                db.execute("ALTER TABLE world_assets ADD COLUMN metadata TEXT NOT NULL DEFAULT '{}'")

    def capture(self,pid,rid,item,metadata=None):
        value=item.get('result')
        if not isinstance(value,str) or not value:raise ValueError('Image provider returned no image data')
        if value.startswith('data:'):
            header,value=value.split(',',1)
            if ';base64' not in header:raise ValueError('Expected base64 image data')
        if len(value)>MAX_IMAGE*4//3+8:raise ValueError('Image exceeds 32 MiB asset limit')
        try:data=base64.b64decode(value,validate=True)
        except ValueError as exc:raise ValueError('Image result is not valid base64') from exc
        if not data or len(data)>MAX_IMAGE:raise ValueError('Image exceeds asset size bounds')
        if data.startswith(b'\x89PNG\r\n\x1a\n'):mime,ext='image/png','png'
        elif data.startswith(b'\xff\xd8\xff'):mime,ext='image/jpeg','jpg'
        elif data.startswith(b'RIFF') and data[8:12]==b'WEBP':mime,ext='image/webp','webp'
        else:raise ValueError('Only PNG, JPEG and WebP image results are supported')
        item_id=item.get('id')
        if not isinstance(item_id,str) or not item_id:raise ValueError('Image result needs an item ID')
        sha=hashlib.sha256(data).hexdigest()
        asset_id=hashlib.sha256((pid+'\0'+rid+'\0'+item_id).encode()).hexdigest()
        target=self.root/(asset_id+'.'+ext)
        if target.is_symlink():raise ValueError('Asset destination cannot be a symbolic link')
        with self.store.connect() as db:
            self.store.project(db,pid)
            row=db.execute('SELECT * FROM world_assets WHERE id=?',(asset_id,)).fetchone()
            if row:
                if row['sha256']!=sha:raise ValueError('Provider attempted to overwrite an immutable image result')
                return self.public(row)
            # Exclusive creation makes incomplete DB writes recoverable without overwriting images.
            if target.exists():
                if hashlib.sha256(target.read_bytes()).hexdigest()!=sha:raise ValueError('Asset content conflict')
            else:
                with target.open('xb') as f:f.write(data)
            prompt=item.get('revisedPrompt') or ''
            import json
            db.execute('INSERT INTO world_assets (id,project_id,run_id,item_id,mime,extension,prompt,created,sha256,bytes,metadata) VALUES (?,?,?,?,?,?,?,?,?,?,?)',(asset_id,pid,rid,item_id,mime,ext,str(prompt)[:24000],time.time(),sha,len(data),json.dumps(metadata or {})))
            return self.public(db.execute('SELECT * FROM world_assets WHERE id=?',(asset_id,)).fetchone())

    def public(self,row):
        import json
        return {'id':row['id'],'url':'/api/projects/'+row['project_id']+'/assets/'+row['id'],
                'mime':row['mime'],'prompt':row['prompt'],'created':row['created'],'runId':row['run_id'],'sha256':row['sha256'],'bytes':row['bytes'],'metadata':json.loads(row['metadata'])}

    def capture_bytes(self,pid,rid,item_id,data,prompt='',metadata=None):
        return self.capture(pid,rid,{'id':item_id,'result':base64.b64encode(data).decode('ascii'),'revisedPrompt':prompt},metadata)

    def reference_path(self,pid,asset_id):
        # Ownership and hash are verified before attaching a file to native Codex.
        _,_,name=self.read(pid,asset_id)
        return str((self.root/name).resolve())

    def list(self,pid):
        with self.store.connect() as db:
            self.store.project(db,pid)
            return [self.public(row) for row in db.execute('SELECT * FROM world_assets WHERE project_id=? ORDER BY created DESC',(pid,))]

    def read(self,pid,asset_id):
        if not re.fullmatch('[0-9a-f]{64}',asset_id):raise KeyError('Image not found')
        with self.store.connect() as db:
            row=db.execute('SELECT * FROM world_assets WHERE project_id=? AND id=?',(pid,asset_id)).fetchone()
            if not row:raise KeyError('Image not found')
            target=self.root/(row['id']+'.'+row['extension'])
            if target.is_symlink():raise ValueError('Asset cannot be a symbolic link')
            data=target.read_bytes()
            if hashlib.sha256(data).hexdigest()!=row['sha256']:raise ValueError('Asset integrity check failed')
            return data,row['mime'],row['id']+'.'+row['extension']


def route(handler,method,path,body):
    parts=path.strip('/').split('/')
    if method!='GET' or len(parts)!=5 or parts[:2]!=['api','projects'] or parts[3]!='assets':return False
    data,mime,name=handler.server.world_agent.assets.read(parts[2],parts[4])
    handler.send_response(200)
    handler.send_header('Content-Type',mime)
    handler.send_header('Content-Length',str(len(data)))
    handler.send_header('Cache-Control','private, max-age=3600')
    handler.send_header('X-Content-Type-Options','nosniff')
    if 'download=1' in handler.path:handler.send_header('Content-Disposition','attachment; filename="'+name+'"')
    handler.end_headers();handler.wfile.write(data)
    return True
