import hashlib
import json
import shutil
import subprocess
import tarfile
from pathlib import Path

root = Path(__file__).resolve().parents[1]
version = json.loads((root / 'package.json').read_text())['version']
output = root / 'releases' / ('test-' + version)
if output.exists():
    raise ValueError('Release staging directory already exists. Inspect it before replacing artifacts.')
subprocess.run([str(root / 'tools/npm'), 'run', 'verify:artifacts'], cwd=root, check=True)
output.mkdir()
copies = [(root / 'releases' / ('Voyage Workbench ' + version + '.exe'), 'Voyage-Workbench-' + version + '-windows-x64.exe')]
for abi in ['arm64-v8a', 'x86_64', 'universal']:
    copies.append((root / 'android/app/build/outputs/apk/release' / ('app-' + abi + '-release.apk'), 'Voyage-Workbench-' + version + '-android-' + abi + '.apk'))
for source, name in copies:
    shutil.copyfile(source, output / name)
archive = output / ('Voyage-Workbench-' + version + '-linux-x64.tar.gz')
with tarfile.open(archive, 'w:gz') as package:
    package.add(root / 'releases/linux-unpacked', arcname='linux-unpacked')
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
