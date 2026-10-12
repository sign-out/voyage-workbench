#!/usr/bin/env python3
"""Install an isolated Linux Android SDK/JDK for the Voyage runtime experiment.

No root, shell-profile changes, or system package changes. Re-running keeps the SDK.
"""
import hashlib
import json
import os
from pathlib import Path
import shutil
import subprocess
import tarfile
import urllib.request
import xml.etree.ElementTree as ET
import zipfile

ROOT = Path(os.environ.get('VOYAGE_ANDROID_TOOLS', Path.home() / '.local/share/voyage-android'))
SDK = ROOT / 'sdk'
CACHE = ROOT / 'downloads'


def download(url, name, checksum=None, algorithm='sha256'):
    CACHE.mkdir(parents=True, exist_ok=True)
    dest = CACHE / name
    if not dest.exists():
        print('Downloading ' + url, flush=True)
        subprocess.run(['curl', '--fail', '--location', '--retry', '3', '--output', str(dest) + '.partial', url], check=True)
        Path(str(dest) + '.partial').replace(dest)
    if checksum:
        with dest.open('rb') as source:
            actual = hashlib.file_digest(source, algorithm).hexdigest()
        if actual != checksum:
            raise RuntimeError('Checksum mismatch: ' + str(dest))
    return dest


def main():
    ROOT.mkdir(parents=True, exist_ok=True)
    jdk = ROOT / 'jdk'
    if not (jdk / 'bin/java').exists():
        base = 'https://download.java.net/java/GA/jdk21.0.2/f2283984656d49d69e91c558476027ac/13/GPL/openjdk-21.0.2_linux-x64_bin.tar.gz'
        checksum = urllib.request.urlopen(base + '.sha256', timeout=30).read().decode().split()[0]
        archive = download(base, 'openjdk-21.0.2.tar.gz', checksum)
        unpack = ROOT / 'jdk-unpack'
        unpack.mkdir(exist_ok=True)
        with tarfile.open(archive) as tf:
            tf.extractall(unpack, filter='data')
        next(unpack.iterdir()).rename(jdk)
        unpack.rmdir()
    manager = SDK / 'cmdline-tools/latest/bin/sdkmanager'
    if not manager.exists():
        repo = ET.fromstring(urllib.request.urlopen('https://dl.google.com/android/repository/repository2-3.xml', timeout=30).read())
        package = next(p for p in repo.findall('remotePackage') if p.attrib['path'] == 'cmdline-tools;latest')
        complete = next(a.find('complete') for a in package.findall('archives/archive') if a.findtext('host-os') == 'linux')
        archive = download('https://dl.google.com/android/repository/' + complete.findtext('url'),
                           complete.findtext('url'), complete.findtext('checksum'), 'sha1')
        unpack = ROOT / 'sdk-unpack'
        unpack.mkdir(exist_ok=True)
        with zipfile.ZipFile(archive) as zf:
            zf.extractall(unpack)
            for item in zf.infolist():
                mode = item.external_attr >> 16
                if mode:
                    (unpack / item.filename).chmod(mode & 0o777)
        manager.parent.parent.parent.mkdir(parents=True, exist_ok=True)
        (unpack / 'cmdline-tools').rename(manager.parent.parent)
        shutil.rmtree(unpack)
    env = dict(os.environ, JAVA_HOME=str(jdk), ANDROID_HOME=str(SDK), ANDROID_SDK_ROOT=str(SDK))
    env['PATH'] = str(jdk / 'bin') + ':' + env['PATH']
    packages = ['platform-tools', 'emulator', 'platforms;android-36', 'build-tools;36.0.0', 'system-images;android-36;default;x86_64']
    android_cli = manager.parent / 'android'
    if android_cli.exists():
        subprocess.run([str(android_cli), '--no-metrics', '--sdk=' + str(SDK), 'sdk', 'install', *packages],
                       input='y\n' * 100, text=True, env=env, check=True)
    else:
        subprocess.run([str(manager), '--sdk_root=' + str(SDK), '--licenses'], input='y\n' * 100, text=True, env=env, check=True)
        subprocess.run([str(manager), '--sdk_root=' + str(SDK), *packages], input='y\n' * 100, text=True, env=env, check=True)
    manifest = {'root': str(ROOT), 'sdk': str(SDK), 'jdk': str(jdk), 'packages': packages}
    (ROOT / 'environment.json').write_text(json.dumps(manifest, indent=2) + '\n')
    print(json.dumps(manifest, indent=2))


if __name__ == '__main__':
    main()
