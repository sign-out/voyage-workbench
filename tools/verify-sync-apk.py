import hashlib
import json
import os
from pathlib import Path
import re
import subprocess
import sys
import zipfile

root = Path(__file__).resolve().parents[1]
artifact = Path(sys.argv[1]) if len(sys.argv) > 1 else root / 'releases/sync-0.1.0-test/Voyage-Sync-0.1.0-test-android.apk'
sdk = Path(os.environ.get('ANDROID_HOME', Path.home() / '.local/share/voyage-android/sdk'))
build_tools = max((sdk / 'build-tools').iterdir(), key=lambda directory: tuple(int(part) for part in directory.name.split('.') if part.isdigit()))
badging = subprocess.check_output([str(build_tools / 'aapt'), 'dump', 'badging', str(artifact)], text=True)
if "name='dev.voyage.sync'" not in badging or "versionCode='1'" not in badging or "versionName='0.1.0-test'" not in badging or "sdkVersion:'26'" not in badging:
    raise ValueError('Unexpected companion identity, version or Android minimum')
if 'application-debuggable' in badging or 'application-testOnly' in badging:
    raise ValueError('Expected a non-debuggable internal release APK')
permissions = re.findall(r"uses-permission: name='([^']+)'", badging)
if permissions != ['android.permission.INTERNET']:
    raise ValueError('Unexpected companion permissions: ' + repr(permissions))
signature = subprocess.check_output([str(build_tools / 'apksigner'), 'verify', '--print-certs', str(artifact)], text=True)
certificate = re.search(r'Signer #1 certificate SHA-256 digest: ([a-f0-9]+)', signature).group(1)
assets = root / 'android/sync/build/generated/sync-assets'
with zipfile.ZipFile(artifact) as archive:
    names = archive.namelist()
    if any(name.startswith('lib/') or name.endswith(('.so', '.map', '.jks', '.keystore', '.zip')) for name in names):
        raise ValueError('A runtime, source map or private/build artifact leaked into the micro APK')
    expected = {'assets/' + filename.name for filename in assets.iterdir() if filename.is_file()}
    if {name for name in names if name.startswith('assets/')} != expected:
        raise ValueError('Unexpected companion assets')
    for name in expected:
        if archive.read(name) != (assets / name.removeprefix('assets/')).read_bytes():
            raise ValueError('Stale companion asset: ' + name)
    forbidden = [b'Ldev/voyage/workbench/AgentService;', b'Ldev/voyage/workbench/Host;', b'Ldev/voyage/workbench/CliRuntime;', b'Lorg/mozilla/javascript/', b'Lcom/getcapacitor/']
    for name in names:
        if name.endswith('.dex') and any(marker in archive.read(name) for marker in forbidden):
            raise ValueError('Full Workbench classes leaked into the companion')
if artifact.stat().st_size > 2 * 1024 * 1024:
    raise ValueError('Companion APK exceeds the 2 MiB package budget')
digest = hashlib.sha256(artifact.read_bytes()).hexdigest()
checksum = artifact.with_name(artifact.name + '.sha256')
if not checksum.exists() or checksum.read_text().split()[0] != digest:
    raise ValueError('Missing or incorrect companion SHA-256 sidecar')
print(json.dumps({'artifact': str(artifact), 'bytes': artifact.stat().st_size, 'sha256': digest, 'certificateSha256': certificate, 'permissions': permissions, 'minimumAndroid': 8, 'nativeLibraries': 0, 'verifiedAssets': len(expected)}, indent=2))
