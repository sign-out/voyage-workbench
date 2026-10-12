#!/usr/bin/env python3
"""Package the tested Codex/PRoot runtime for each available Android ABI."""
from pathlib import Path
import shutil,subprocess,re,json,tarfile,urllib.request
ROOT=Path(__file__).resolve().parents[2]
assets=ROOT/'android/app/src/main/assets';assets.mkdir(parents=True,exist_ok=True)
arm=ROOT/'.android-lab/arm64';arm.mkdir(parents=True,exist_ok=True)
if not (arm/'codex-code-mode-host').exists():
    metadata=json.load(urllib.request.urlopen('https://registry.npmjs.org/@openai/codex/0.156.1-linux-arm64'))
    archive=arm/'package.tgz'
    if not archive.exists(): urllib.request.urlretrieve(metadata['dist']['tarball'],archive)
    with tarfile.open(archive) as t:
        for name in ['codex','codex-code-mode-host']:
            members=[m for m in t.getmembers() if m.name.endswith('/bin/'+name)]
            if not members:raise RuntimeError('Missing '+name)
            (arm/name).write_bytes(t.extractfile(members[0]).read())
for abi,termux,codex in [('x86_64','termux',Path.home()/'.t3/tools/codex/0.156.1/bin'),('arm64-v8a','termux-arm64',arm)]:
    dest=ROOT/'android/app/src/main/jniLibs'/abi;dest.mkdir(parents=True,exist_ok=True)
    prefix=ROOT/'.android-lab'/termux/'unpacked/data/data/com.termux/files/usr'
    for name in ['codex','codex-code-mode-host']:shutil.copyfile(codex/name,dest/('lib'+name+'.so'))
    shutil.copyfile(prefix/'bin/proot',dest/'libproot.so');shutil.copyfile(prefix/'libexec/proot/loader',dest/'libloader.so')
    aliases={}
    for library in (prefix/'lib').glob('*.so*'):
        dynamic=subprocess.check_output(['readelf','-d',library],text=True)
        match=re.search(r'SONAME.*?\[(.*?)\]',dynamic);soname=match[1] if match else library.name
        packaged=soname.split('.so')[0]+'.so';shutil.copyfile(library,dest/packaged);aliases[soname]=packaged
    (assets/('runtime-libs-'+abi+'.json')).write_text(json.dumps(aliases))
    print(abi,'packaged')
