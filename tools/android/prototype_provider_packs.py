"""Build signed optional-provider APKs from an already qualified full APK."""
import argparse
import copy
import hashlib
import json
import os
from pathlib import Path, PurePosixPath
import re
import shutil
import subprocess
import tempfile
import xml.etree.ElementTree as ElementTree
import zipfile


PROVIDERS = ('codex', 'claude', 'cursor')
ABIS = ('arm64-v8a', 'x86_64')
ANDROID = 'http://schemas.android.com/apk/res/android'
ElementTree.register_namespace('android', ANDROID)
SHARED = {
    'libandroid-shmem.so', 'libandroid-support.so', 'libargp.so', 'libbz2.so',
    'libdw.so', 'libelf.so', 'libjson-c.so', 'libloader.so', 'liblzma.so',
    'libncursesw.so', 'libproot.so', 'libtalloc.so', 'libz.so', 'libzstd.so',
}
PROVIDER_FILES = {
    'codex': {'libcodex.so', 'libcodex-code-mode-host.so'},
    'claude': {'libclaude.so', 'libmusl-loader.so'},
}


def plan_packs(selected, installed=()):
    selected = set(selected)
    installed = set(installed)
    if not selected <= set(PROVIDERS) or not installed <= {'base', 'shared', *PROVIDERS}:
        raise ValueError('Unknown provider or installed pack')
    required = {'base'}
    if selected:
        required |= {'shared', *selected}
    return [name for name in ('base', 'shared', *PROVIDERS) if name in required - installed]


def owner(name, abi):
    path = PurePosixPath(name)
    if path.is_absolute() or '..' in path.parts or '\\' in name:
        raise ValueError(f'Unsafe APK entry: {name}')
    if name.startswith('lib/'):
        if len(path.parts) != 3 or path.parts[1] not in ABIS:
            raise ValueError(f'Unclassified native entry: {name}')
        if path.parts[1] != abi:
            return None
        filename = path.name
        if filename in SHARED:
            return 'shared'
        for provider, filenames in PROVIDER_FILES.items():
            if filename in filenames:
                return provider
        if filename.startswith('libcursor-') and filename.endswith('.so'):
            return 'cursor'
        raise ValueError(f'Unclassified native library: {name}')
    if name.startswith('assets/cursor-sdk-') and name.endswith('.zip'):
        if path.name == 'cursor-sdk-common.zip' or path.name == f'cursor-sdk-{abi}.zip':
            return 'cursor'
        if path.name in {f'cursor-sdk-{candidate}.zip' for candidate in ABIS}:
            return None
        raise ValueError(f'Unclassified SDK archive: {name}')
    if name.upper() == 'META-INF/MANIFEST.MF' or re.fullmatch(
        r'META-INF/[^/]+\.(SF|RSA|DSA|EC)', name, re.IGNORECASE
    ):
        return None
    return 'base'


def partition(archive, abi):
    if abi not in ABIS:
        raise ValueError(f'Unsupported ABI: {abi}')
    groups = {name: [] for name in ('base', 'shared', *PROVIDERS)}
    seen = set()
    for entry in archive.infolist():
        if entry.filename in seen:
            raise ValueError(f'Duplicate APK entry: {entry.filename}')
        seen.add(entry.filename)
        if entry.is_dir():
            continue
        group = owner(entry.filename, abi)
        if group is not None:
            groups[group].append(entry.filename)
    for group, names in groups.items():
        if not names:
            raise ValueError(f'Full APK is missing {group} payload for {abi}')
    required = SHARED | set().union(*PROVIDER_FILES.values())
    missing = {f'lib/{abi}/{name}' for name in required} - seen
    if missing:
        raise ValueError(f'Missing runtime files: {sorted(missing)}')
    required_assets = {f'assets/cursor-sdk-{abi}.zip', 'assets/cursor-sdk-common.zip'}
    if not required_assets <= seen:
        raise ValueError('Full APK does not contain the factored Cursor SDK')
    return groups


def split_manifest(package, version_code, split):
    attributes = {'package': package, 'split': f'provider_{split}',
                  f'{{{ANDROID}}}versionCode': version_code,
                  f'{{{ANDROID}}}isFeatureSplit': 'true'}
    root = ElementTree.Element('manifest', attributes)
    if split != 'shared':
        ElementTree.SubElement(root, 'uses-split', {f'{{{ANDROID}}}name': 'provider_shared'})
    ElementTree.SubElement(root, 'application', {
        f'{{{ANDROID}}}hasCode': 'false', f'{{{ANDROID}}}extractNativeLibs': 'true',
    })
    return ElementTree.tostring(root, encoding='utf-8', xml_declaration=True)


def run(arguments):
    result = subprocess.run([str(argument) for argument in arguments], capture_output=True, text=True)
    if result.returncode:
        raise RuntimeError(f'{Path(arguments[0]).name} failed: {result.stderr.strip()}')
    return result.stdout


def certificate(apksigner, apk):
    output = run([apksigner, 'verify', '--print-certs', apk])
    digests = re.findall(r'^Signer #\d+ certificate SHA-256 digest: ([0-9a-f]+)$', output, re.MULTILINE)
    if len(digests) != 1:
        raise ValueError('Expected exactly one APK signer')
    return digests[0]


def file_digest(path):
    with path.open('rb') as stream:
        return hashlib.file_digest(stream, 'sha256').hexdigest()


def payload_hashes(archive, names):
    result = {}
    for name in names:
        with archive.open(name) as stream:
            result[name] = hashlib.file_digest(stream, 'sha256').hexdigest()
    return result


def copy_entries(source, target, names):
    for name in names:
        entry = copy.copy(source.getinfo(name))
        with source.open(entry) as incoming, target.open(entry, 'w', force_zip64=True) as outgoing:
            shutil.copyfileobj(incoming, outgoing)


def download_catalog(catalog, source, release_url):
    if not re.fullmatch(r'https://github\.com/sign-out/voyage-workbench(?:-downloads)?/releases/download/v[0-9.]+-test', release_url):
        raise ValueError('Expected a versioned Workbench GitHub release download URL')
    if not release_url.endswith('/v' + catalog['version'] + '-test'):
        raise ValueError('Runtime release URL does not match the application version')
    codex = json.loads(source.read('assets/public/third-party/codex-binary-provenance.json'))['codexVersion']
    claude = json.loads(source.read('assets/provider-runtimes.json'))['claude-code']['version']
    cursor = json.loads(source.read('assets/cursor-runtime-' + catalog['abi'] + '.json'))['sdkVersion']
    versions = {'shared': catalog['version'], 'codex': codex, 'claude': claude, 'cursor': cursor}
    return {'format': 1, **{name: catalog[name] for name in ('package', 'versionCode', 'version', 'abi', 'signerSha256')},
            'packs': {name: {key: pack[key] for key in ('file', 'bytes', 'sha256', 'requires')} |
                      {'version': versions[name], 'url': release_url + '/' + pack['file']}
                      for name, pack in catalog['packs'].items() if name != 'base'}}


def build(args):
    if args.output.exists():
        raise ValueError('Output already exists; use a new prototype directory')
    if not os.environ.get(args.password_env):
        raise ValueError('Set the signing password environment variable first')
    tools = args.sdk / 'build-tools' / args.build_tools
    aapt = tools / 'aapt2'
    signer = tools / 'apksigner'
    aligner = tools / 'zipalign'
    expected_certificate = certificate(signer, args.full_apk)
    badging = run([aapt, 'dump', 'badging', args.full_apk])
    identity = re.search(r"^package: name='([^']+)' versionCode='(\d+)' versionName='([^']*)'", badging)
    if not identity or identity[1] != 'dev.voyage.workbench':
        raise ValueError('Expected a qualified Voyage Workbench full APK')
    package, version_code, version = identity.groups()
    args.output.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory(prefix='.provider-packs-', dir=args.output.parent) as temporary:
        work = Path(temporary)
        output = work / 'output'
        output.mkdir()
        catalog = {'prototype': not bool(args.release_url), 'distributionApproved': False, 'package': package,
                   'versionCode': int(version_code), 'version': version, 'abi': args.abi,
                   'signerSha256': expected_certificate, 'sourceApkSha256': file_digest(args.full_apk),
                   'installSets': {'editor': plan_packs([]), **{
                       provider: plan_packs([provider]) for provider in PROVIDERS
                   }},
                   'packs': {}}
        with zipfile.ZipFile(args.full_apk) as source:
            groups = partition(source, args.abi)
            for group in ('shared', *PROVIDERS, 'base'):
                names = groups[group]
                unsigned = work / f'{group}-unsigned.apk'
                if group == 'base':
                    with zipfile.ZipFile(unsigned, 'w'):
                        pass
                else:
                    manifest = work / f'{group}.xml'
                    manifest.write_bytes(split_manifest(package, version_code, group))
                    run([aapt, 'link', '-I', args.sdk / 'platforms/android-36/android.jar',
                         '--manifest', manifest, '-o', unsigned])
                with zipfile.ZipFile(unsigned, 'a') as target:
                    copy_entries(source, target, names)
                    if group == 'base' and args.release_url:
                        target.writestr('assets/runtime-pack-catalog.json', json.dumps(download_catalog(catalog, source, args.release_url)), compress_type=zipfile.ZIP_DEFLATED)
                aligned = work / f'{group}-aligned.apk'
                run([aligner, '-P', '16', '-f', '4', unsigned, aligned])
                filename = f'{group}.apk'
                if args.release_url:
                    prefix = f'Voyage-Workbench-{version}-android-'
                    filename = prefix + (f'{args.abi}-lightweight.apk' if group == 'base' else f'runtime-{args.abi}-{group}.apk')
                final = output / filename
                run([signer, 'sign', '--ks', args.keystore, '--ks-key-alias', args.alias,
                     '--ks-pass', f'env:{args.password_env}', '--key-pass', f'env:{args.password_env}',
                     '--out', final, aligned])
                if certificate(signer, final) != expected_certificate:
                    raise ValueError('Signing identity differs from the full APK')
                run([aligner, '-c', '-P', '16', '4', final])
                with zipfile.ZipFile(final) as packaged:
                    expected = payload_hashes(source, names)
                    if payload_hashes(packaged, names) != expected:
                        raise ValueError(f'Payload changed in {group}')
                catalog['packs'][group] = {
                    'file': final.name, 'bytes': final.stat().st_size, 'sha256': file_digest(final),
                    'requires': [] if group in ('base', 'shared') else ['shared'],
                    'payloadSha256': expected,
                }
        (output / 'catalog.json').write_text(json.dumps(catalog, indent=2) + '\n')
        output.rename(args.output)
    print(json.dumps({'output': str(args.output), 'abi': args.abi,
                      'bytes': {name: pack['bytes'] for name, pack in catalog['packs'].items()}}, indent=2))


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--full-apk', required=True, type=Path)
    parser.add_argument('--abi', required=True, choices=ABIS)
    parser.add_argument('--sdk', required=True, type=Path)
    parser.add_argument('--build-tools', default='36.0.0')
    parser.add_argument('--keystore', required=True, type=Path)
    parser.add_argument('--alias', required=True)
    parser.add_argument('--password-env', required=True)
    parser.add_argument('--output', required=True, type=Path)
    parser.add_argument('--release-url', help='Embed a signed, version-pinned download catalog in the lightweight base')
    build(parser.parse_args())


if __name__ == '__main__':
    main()
