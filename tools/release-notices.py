import hashlib
import html
import json
import shutil
import tarfile
import zipfile
from pathlib import Path

root = Path(__file__).resolve().parents[1]
retained = root / '.release-compliance/retained/third-party'
output = root / 'apps/workbench/public/third-party'
version = json.loads((root / 'package.json').read_text())['version']
manifest = json.loads((retained / 'source-manifest.json').read_text())
for entry in manifest:
    source = retained / 'sources' / entry['file']
    with source.open('rb') as stream:
        if hashlib.file_digest(stream, 'sha256').hexdigest() != entry['sha256']:
            raise ValueError('Retained source hash mismatch: ' + entry['package'])
shutil.rmtree(output, ignore_errors=True)
output.mkdir(parents=True)
shutil.copyfile(root / 'docs/DEPENDENCY_SOURCE_OFFER.txt', output / 'SOURCE-OFFER.txt')
for source in (retained / 'notices').rglob('*'):
    if source.is_file() and source.name.lower().startswith(('license', 'copying', 'copyright', 'notice')):
        destination = output / 'licenses' / source.relative_to(retained / 'notices')
        destination.parent.mkdir(parents=True, exist_ok=True)
        shutil.copyfile(source, destination)
with zipfile.ZipFile(retained / 'sources/proot.zip') as archive:
    license_path = next(name for name in archive.namelist() if name.endswith('/COPYING'))
    (output / 'licenses/PROOT-COPYING.txt').write_bytes(archive.read(license_path))
for package, paths in {
    'libtalloc.tar.gz': ['talloc-2.5.0/LICENSE'],
    'libelf.tar.bz2': ['elfutils-0.196/COPYING-LGPLV3', 'elfutils-0.196/COPYING-GPLV2'],
    'codex.tar.gz': ['LICENSE', 'NOTICE'],
}.items():
    with tarfile.open(retained / 'sources' / package) as archive:
        for suffix in paths:
            matches = [member for member in archive.getmembers() if member.isfile() and (member.name == suffix or member.name.endswith('/' + suffix))]
            if not matches:
                if suffix == 'NOTICE':
                    continue
                raise ValueError('Missing upstream license: ' + package + '/' + suffix)
            source = archive.extractfile(matches[0])
            (output / 'licenses' / (package.split('.')[0] + '-' + Path(suffix).name + '.txt')).write_bytes(source.read())
commit = 'dac98bdfcc372ea38f0ecf3f4cbe5fb28c16c05f'
voice = root / '.desktop-runtime/windows/codex-resources/voice'
voice_manifest = json.loads((voice / 'manifest.json').read_text())
sources = {
    'workbenchVersion': version,
    'components': manifest,
    'termuxBuildSystem': 'https://github.com/termux/termux-packages/archive/' + commit + '.tar.gz',
    'termuxRecipesAndPatches': 'https://github.com/termux/termux-packages/tree/' + commit + '/packages',
    'rhino': {'version': '1.8.0', 'source': 'https://github.com/mozilla/rhino/archive/refs/tags/Rhino1_8_0_Release.tar.gz'},
    'electron': {'version': '44.5.1', 'source': 'https://github.com/electron/electron/archive/refs/tags/v44.5.1.tar.gz', 'notices': 'licenses/LICENSES.chromium.html'},
    'windowsVoice': json.loads((voice / 'sources.json').read_text()),
    'windowsVoiceBuildCommit': voice_manifest['buildCommit'],
    'windowsVoiceBuildScripts': 'https://github.com/openai/codex/tree/' + voice_manifest['buildCommit'] + '/third_party/voice',
}
lock = json.loads((root / 'package-lock.json').read_text())
sources['javascript'] = []
for package_path, metadata in lock['packages'].items():
    if not package_path.startswith('node_modules/') or metadata.get('dev'):
        continue
    package_dir = root / package_path
    package_name = package_path.rsplit('node_modules/', 1)[-1]
    notice_files = sorted(source for source in package_dir.glob('*') if source.is_file() and source.name.lower().startswith(('license', 'copying', 'copyright', 'notice')))
    for source in notice_files:
        destination = output / 'licenses/javascript' / package_name / source.name
        destination.parent.mkdir(parents=True, exist_ok=True)
        shutil.copyfile(source, destination)
    sources['javascript'].append({'package': package_name, 'version': metadata.get('version'), 'license': metadata.get('license'), 'url': metadata.get('resolved'), 'integrity': metadata.get('integrity'), 'notices': [str((Path('licenses/javascript') / package_name / source.name).as_posix()) for source in notice_files]})
rhino_source = retained / 'sources/rhino-1.8.0.tar.gz'
with tarfile.open(rhino_source) as archive:
    license_path = next(member for member in archive.getmembers() if member.isfile() and member.name.endswith('/LICENSE.txt'))
    (output / 'licenses/RHINO-LICENSE.txt').write_bytes(archive.extractfile(license_path).read())
for name in ['termux-binary-provenance.json', 'termux-arm64-binary-provenance.json', 'codex-binary-provenance.json']:
    shutil.copyfile(retained / name, output / name)
provider_cache = root / '.android-lab/provider-runtimes'
if any((root / 'android/app/src/main/jniLibs').glob('*/libcursorlab_*.so')):
    raise ValueError('Cursor qualification-only native libraries must not enter a distribution.')
if any((root / 'android/app/src/main/jniLibs').glob('*/libclaude.so')) and not (provider_cache / 'provenance.json').exists():
    raise ValueError('Bundled Claude runtime needs pinned provenance and license notices. Run package_provider_runtimes.py first.')
if (provider_cache / 'provenance.json').exists():
    provider_manifest = json.loads((provider_cache / 'provenance.json').read_text())
    for entry in provider_manifest:
        binary = root / 'android/app/src/main/jniLibs' / entry['abi'] / 'libclaude.so'
        with binary.open('rb') as stream:
            if hashlib.file_digest(stream, 'sha256').hexdigest() != entry['binarySha256']:
                raise ValueError('Official Claude binary changed: ' + entry['abi'])
    shutil.copyfile(provider_cache / 'provenance.json', output / 'provider-runtime-provenance.json')
    for required in ['CLAUDE-CODE-LICENSE.md', 'MUSL-COPYRIGHT.txt']:
        if not (provider_cache / 'notices' / required).is_file():
            raise ValueError('Missing provider runtime notice: ' + required)
    for notice in (provider_cache / 'notices').glob('*'):
        shutil.copyfile(notice, output / 'licenses' / notice.name)
cursor_cache = root / '.android-lab/cursor-runtime'
if any((root / 'android/app/src/main/jniLibs').glob('*/libcursor-node.so')):
    cursor_sources = json.loads((retained / 'cursor-source-manifest.json').read_text())
    for entry in cursor_sources:
        with (retained / 'sources' / entry['file']).open('rb') as stream:
            if hashlib.file_digest(stream, 'sha256').hexdigest() != entry['sha256']:
                raise ValueError('Cursor dependency source hash mismatch: ' + entry['file'])
    sources['cursorDependencies'] = cursor_sources
    cursor_manifest = json.loads((cursor_cache / 'provenance.json').read_text())
    for entry in cursor_manifest:
        for name, expected in entry['binaries'].items():
            with (root / 'android/app/src/main/jniLibs' / entry['abi'] / name).open('rb') as stream:
                if hashlib.file_digest(stream, 'sha256').hexdigest() != expected:
                    raise ValueError('Official Cursor dependency changed: ' + entry['abi'] + '/' + name)
    shutil.copyfile(cursor_cache / 'provenance.json', output / 'cursor-runtime-provenance.json')
    if not (cursor_cache / 'notices/NODE-LICENSE.txt').is_file():
        raise ValueError('Missing Node runtime notice')
    for notice in (cursor_cache / 'notices').glob('*'):
        shutil.copyfile(notice, output / 'licenses' / ('CURSOR-' + notice.name))
(output / 'SOURCES.json').write_text(json.dumps(sources, indent=2) + '\n')
shutil.copyfile(voice / 'manifest.json', output / 'windows-voice-manifest.json')
links = ''.join('<li><a href="' + html.escape(str(path.relative_to(output)), quote=True) + '">' + html.escape(str(path.relative_to(output))) + '</a></li>' for path in sorted(output.rglob('*')) if path.is_file())
source_links = ''.join('<li><a href="' + html.escape(entry['url'], quote=True) + '">' + html.escape(entry['package']) + ' — pinned upstream source</a></li>' for entry in manifest)
source_links += ''.join('<li><a href="' + html.escape(entry['url'], quote=True) + '">' + html.escape(entry['file']) + ' — Cursor runtime source/build recipe</a></li>' for entry in sources.get('cursorDependencies', []))
source_links += '<li><a href="' + sources['termuxBuildSystem'] + '">Pinned Termux build system, recipes, and patches</a></li><li><a href="' + sources['windowsVoiceBuildScripts'] + '">Pinned Windows voice build and packaging scripts</a></li><li><a href="' + sources['rhino']['source'] + '">Rhino 1.8.0 source</a></li>'
(output / 'index.html').write_text('<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Third-party notices</title><body><h1>Voyage Workbench ' + html.escape(version) + ' — third-party notices</h1><pre style="white-space:pre-wrap">' + html.escape((output / 'SOURCE-OFFER.txt').read_text()) + '</pre><h2>Direct third-party source and build access</h2><ul>' + source_links + '</ul><h2>Notices and pinned provenance</h2><ul>' + links + '</ul></body></html>')
print('Prepared bundled notices and authorized source offer for ' + version + '; no source archives copied into app assets')
