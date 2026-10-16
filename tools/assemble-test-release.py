import hashlib
import argparse
import json
import os
import shutil
import subprocess
import sys
import tarfile
from pathlib import Path

root = Path(__file__).resolve().parents[1]
parser = argparse.ArgumentParser()
parser.add_argument('--provider-packs', type=Path)
args = parser.parse_args()
artifact_root = Path(os.environ.get('VOYAGE_ARTIFACT_ROOT', str(root / 'releases')))
if not artifact_root.is_absolute():
    artifact_root = root / artifact_root
version = json.loads((root / 'package.json').read_text())['version']
output = root / 'releases' / ('test-' + version)
if output.exists():
    raise ValueError('Release staging directory already exists. Inspect it before replacing artifacts.')
subprocess.run([str(root / 'tools/npm'), 'run', 'verify:artifacts'], cwd=root, check=True)
output.mkdir()
copies = [(artifact_root / ('Voyage Workbench ' + version + '.exe'), 'Voyage-Workbench-' + version + '-windows-x64.exe')]
for abi in ['arm64-v8a', 'x86_64', 'universal']:
    copies.append((root / 'android/app/build/outputs/apk/release' / ('app-' + abi + '-release.apk'), 'Voyage-Workbench-' + version + '-android-' + abi + '.apk'))
for source, name in copies:
    shutil.copyfile(source, output / name)
shutil.copyfile(root / 'LICENSE', output / 'LICENSE.txt')
(output / 'SOURCE.txt').write_text(
    'Voyage Workbench ' + version + ' — corresponding application source\n\n'
    'License: GNU General Public License version 2 only (GPL-2.0-only).\n'
    'The complete license accompanies this release as LICENSE.txt.\n\n'
    'Source, tests and build instructions:\n'
    'https://github.com/sign-out/voyage-workbench/tree/v' + version + '-test\n\n'
    'Source is maintained in that separate repository, not as an asset here.\n'
    'Third-party runtimes retain their own terms; bundled notices and source\n'
    'offers identify their exact upstream versions and build materials.\n'
    'Private signing keys, credentials and user projects are not distributed.\n'
    'This program comes WITHOUT ANY WARRANTY. See LICENSE.txt for details.\n',
    encoding='utf-8')
if args.provider_packs:
    sys.path.insert(0, str(root / 'tools/android'))
    from probe_provider_packs import check_catalog
    sdk = Path((root / 'android/local.properties').read_text().split('sdk.dir=', 1)[1].splitlines()[0])
    for abi in ['arm64-v8a', 'x86_64']:
        files = check_catalog(args.provider_packs / abi,
                              root / 'android/app/build/outputs/apk/release' / ('app-' + abi + '-release.apk'),
                              sdk / 'build-tools/36.0.0/apksigner')
        for source in files.values():
            shutil.copyfile(source, output / source.name)
archive = output / ('Voyage-Workbench-' + version + '-linux-x64.tar.gz')
with tarfile.open(archive, 'w:gz') as package:
    package.add(artifact_root / 'linux-unpacked', arcname='linux-unpacked')
    package.add(root / 'releases/run-linux.sh', arcname='run-linux.sh')
subprocess.run(['python3', str(root / 'tools/sign-release.py'), '--detached-file', str(archive)], check=True)
signing = Path.home() / '.local/share/voyage-signing'
identity = json.loads((signing / 'windows-test.json').read_text())
manifest = {'version': version, 'channel': 'test', 'signer': {'kind': 'self-signed-test', 'publicKeySha256': identity['publicKeySha256'], 'certificatePem': (signing / 'windows-test.pem').read_text(), 'publicKeyPem': (signing / 'public-key.pem').read_text()}, 'artifacts': []}
for artifact in sorted(output.iterdir()):
    with artifact.open('rb') as stream:
        manifest['artifacts'].append({'file': artifact.name, 'bytes': artifact.stat().st_size, 'sha256': hashlib.file_digest(stream, 'sha256').hexdigest()})
checksums = output / 'checksums.json'
checksums.write_text(json.dumps(manifest, indent=2) + '\n')
subprocess.run(['python3', str(root / 'tools/sign-release.py'), '--detached-file', str(checksums)], check=True)
print('Verified signed test artifacts staged locally: ' + str(output))
print('No application source, private signing material or user data included. Nothing published.')
