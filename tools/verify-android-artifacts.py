import hashlib
import io
import json
import os
import re
import subprocess
import zipfile
from pathlib import Path

root = Path(__file__).resolve().parents[1]
version = json.loads((root / 'package.json').read_text())['version']
gradle = (root / 'android/app/build.gradle').read_text()
code = re.search(r'versionCode\s+(\d+)', gradle).group(1)
sdk_line = next(line for line in (root / 'android/local.properties').read_text().splitlines() if line.startswith('sdk.dir='))
sdk = Path(sdk_line.split('=', 1)[1])
build_tools = max((sdk / 'build-tools').iterdir(), key=lambda directory: tuple(int(part) for part in directory.name.split('.') if part.isdigit()))
apks = sorted((root / 'android/app/build/outputs/apk/release').glob('*.apk'))
if len(apks) != 3:
    raise ValueError('Expected ARM64, x86-64 and universal release APKs.')
expected = {}
keystore = Path.home() / '.android/debug.keystore'
certificate = subprocess.run(['keytool', '-exportcert', '-keystore', str(keystore), '-alias', 'androiddebugkey', '-storepass:env', 'VOYAGE_ANDROID_PASSWORD'], env={**os.environ, 'VOYAGE_ANDROID_PASSWORD': 'android'}, check=True, capture_output=True).stdout
signer_digest = hashlib.sha256(certificate).hexdigest()
for source in (root / 'dist').rglob('*'):
    if source.is_file():
        expected['assets/public/' + source.relative_to(root / 'dist').as_posix()] = source
for name in ['core-native.js', 'tools-plan.json', 'tools-work.json', 'cursor-sdk.cjs', 'cursor-runner.cjs']:
    expected['assets/' + name] = root / 'android/app/src/main/assets' / name
for source in (root / 'android/app/src/main/assets').glob('cursor-sdk-*.zip'):
    expected['assets/' + source.name] = source
for source in (root / 'android/app/src/main/assets').glob('*runtime-*.json'):
    expected['assets/' + source.name] = source
for apk in apks:
    signing = subprocess.run([str(build_tools / 'apksigner'), 'verify', '--print-certs', str(apk)], check=True, capture_output=True, text=True).stdout
    if 'Signer #1 certificate SHA-256 digest: ' + signer_digest not in signing:
        raise ValueError('Android update-signing identity changed: ' + apk.name)
    badging = subprocess.run([str(build_tools / 'aapt'), 'dump', 'badging', str(apk)], check=True, capture_output=True, text=True).stdout
    if f"versionName='{version}'" not in badging or f"versionCode='{code}'" not in badging or "name='dev.voyage.workbench'" not in badging:
        raise ValueError('Stale Android package metadata: ' + apk.name)
    if 'application-debuggable' in badging or 'application-testOnly' in badging:
        raise ValueError('Debug or test-only Android package cannot be released: ' + apk.name)
    with zipfile.ZipFile(apk) as archive:
        names = archive.namelist()
        if any('libcursorlab_' in name or name.endswith(('.jks', '.keystore', '.p12', '.pfx', '.map')) or name.rsplit('/', 1)[-1] in ['auth.json', 'credentials.bin', '.env'] for name in names):
            raise ValueError('Private/development material in APK: ' + apk.name)
        for name, source in expected.items():
            if hashlib.sha256(archive.read(name)).digest() != hashlib.sha256(source.read_bytes()).digest():
                raise ValueError('Stale Android asset: ' + apk.name + ': ' + name)
        abis = sorted({name.split('/')[1] for name in names if name.startswith('lib/')})
        required = ['arm64-v8a', 'x86_64'] if 'universal' in apk.name else ['arm64-v8a'] if 'arm64-v8a' in apk.name else ['x86_64'] if 'x86_64' in apk.name else []
        if not required or abis != required:
            raise ValueError('Unexpected APK architecture: ' + apk.name)
        for abi in abis:
            metadata = json.loads(archive.read('assets/cursor-runtime-' + abi + '.json'))
            if metadata.get('archives') != ['cursor-sdk-common.zip', 'cursor-sdk-' + abi + '.zip']:
                raise ValueError('Unexpected Cursor archive layout: ' + abi)
            restored = {}
            for name in metadata['archives']:
                with zipfile.ZipFile(io.BytesIO(archive.read('assets/' + name))) as sdk_archive:
                    for entry in sdk_archive.infolist():
                        if entry.is_dir():
                            continue
                        if entry.filename in restored:
                            raise ValueError('Duplicate Cursor SDK entry: ' + entry.filename)
                        restored[entry.filename] = hashlib.sha256(sdk_archive.read(entry)).digest()
            with zipfile.ZipFile(root / '.android-lab/cursor-runtime' / ('cursor-sdk-' + abi + '.zip')) as original:
                original_files = {entry.filename: hashlib.sha256(original.read(entry)).digest() for entry in original.infolist() if not entry.is_dir()}
            if restored != original_files:
                raise ValueError('Factored Cursor SDK differs from original vendor files: ' + abi)
            for source in (root / 'android/app/src/main/jniLibs' / abi).glob('*.so'):
                if hashlib.sha256(archive.read('lib/' + abi + '/' + source.name)).digest() != hashlib.sha256(source.read_bytes()).digest():
                    raise ValueError('Changed Android runtime: ' + source.name)
    print(apk.name + ': signature, version, current UI/core, notices and native runtimes verified')
