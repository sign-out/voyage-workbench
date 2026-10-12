#!/usr/bin/env python3
"""Fetch checksum-verified PRoot/tracing dependencies for the disposable lab APK."""
import argparse
import gzip
import hashlib
import io
import json
from pathlib import Path
import re
import subprocess
import tarfile
import urllib.request

ROOT = Path(__file__).resolve().parents[2] / '.android-lab/termux'
BASE = 'https://packages.termux.dev/apt/termux-main/'


def main():
    global ROOT
    parser=argparse.ArgumentParser(); parser.add_argument('--arch',default='x86_64',choices=['x86_64','aarch64']); args=parser.parse_args()
    if args.arch=='aarch64': ROOT=ROOT.parent/'termux-arm64'
    ROOT.mkdir(parents=True, exist_ok=True)
    text = gzip.decompress(urllib.request.urlopen(BASE+'dists/stable/main/binary-'+args.arch+'/Packages.gz', timeout=30).read()).decode()
    index = {}
    for block in text.split('\n\n'):
        fields = dict(line.split(': ',1) for line in block.splitlines() if ': ' in line and not line.startswith(' '))
        if 'Package' in fields:
            index[fields['Package']] = fields
    pending = ['proot','strace','ncurses']; done = {}
    while pending:
        name = pending.pop()
        if name in done: continue
        package = index[name]
        data = urllib.request.urlopen(BASE+package['Filename'], timeout=30).read()
        if hashlib.sha256(data).hexdigest() != package['SHA256']: raise RuntimeError('Checksum mismatch: '+name)
        archive = ROOT / (name+'.deb'); archive.write_bytes(data)
        member = next(n for n in subprocess.check_output(['ar','t',str(archive)],text=True).splitlines() if n.startswith('data.tar'))
        body = subprocess.check_output(['ar','p',str(archive),member])
        with tarfile.open(fileobj=io.BytesIO(body)) as tf:
            # Only regular files are needed; never extract package symlinks.
            tf.extractall(ROOT/'unpacked', members=[m for m in tf.getmembers() if m.isfile()], filter='data')
        done[name] = {key:package.get(key) for key in ['Version','Filename','SHA256','Homepage']}
        for dependency in package.get('Depends','').split(','):
            dep = re.split(r'[ (|]',dependency.strip())[0]
            if dep: pending.append(dep)
        print(name,package['Version'],flush=True)
    (ROOT/'packages.json').write_text(json.dumps(done,indent=2)+'\n')


if __name__ == '__main__': main()
