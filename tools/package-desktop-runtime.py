#!/usr/bin/env python3
from pathlib import Path
import urllib.request,json,tarfile,hashlib,base64,shutil
root=Path(__file__).resolve().parents[1];out=root/'.desktop-runtime';(out/'windows').mkdir(parents=True,exist_ok=True);(out/'linux').mkdir(parents=True,exist_ok=True)
meta=json.load(urllib.request.urlopen('https://registry.npmjs.org/@openai/codex/0.156.1-win32-x64'))
archive=out/'codex-windows.tgz'
if not archive.exists():urllib.request.urlretrieve(meta['dist']['tarball'],archive)
algorithm,digest=meta['dist']['integrity'].split('-',1)
assert base64.b64encode(hashlib.new(algorithm,archive.read_bytes()).digest()).decode()==digest
shutil.rmtree(out/'windows');(out/'windows').mkdir()
with tarfile.open(archive) as tf:
 for member in tf.getmembers():
  marker='/x86_64-pc-windows-msvc/'
  if marker in member.name and member.isfile():
   relative=Path(member.name.split(marker,1)[1])
   if relative.is_absolute() or '..' in relative.parts:raise ValueError('Unsafe archive path')
   target=out/'windows'/relative;target.parent.mkdir(parents=True,exist_ok=True);target.write_bytes(tf.extractfile(member).read())
for name in ['codex','codex-code-mode-host']:shutil.copy2(Path.home()/'.t3/tools/codex/0.156.1/bin'/name,out/'linux'/name)
(out/'provenance.json').write_text(json.dumps({'codexVersion':'0.156.1','windows':meta['dist'],'source':'https://github.com/openai/codex','license':'Apache-2.0'},indent=2))
print('Desktop runtimes ready')
