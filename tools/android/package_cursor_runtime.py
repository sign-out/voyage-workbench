"""Package pinned, unmodified Node and official Cursor SDK files for Android."""
import hashlib
import io
import json
from pathlib import Path, PurePosixPath
import subprocess
import tarfile
import zipfile
from package_provider_runtimes import ROOT, fetch

CACHE = ROOT / '.android-lab/cursor-runtime'
SDK_VERSION = '1.0.37'
NODE_VERSION = '24.5.0'
TARGETS = {
    'x86_64': ('x64', 'amd64', 'x86_64-linux-gnu', '32edb1f2aeaf8ea0d484af33bf3b5d8330d7d33c9cd8c70f811b8a643822e613', [
        'ba4f88f73dbc3ae9055f3c20f4523bfdbaf1ad13ff95e258924f77d20b4fbedf',
        '5cd3171216d4ab0fc911cfe9c35509bf2dd8f47761c43b7f6a4296701551a24d',
        '3016e62cb4b7cd8038822870601f5ed131befe942774d0f745622cc77d8a88f7',
        'd7dd1d1411fedf27f5e27650a6eff20ef294077b568f4c8c5e51466dc7c08ce4']),
    'arm64-v8a': ('arm64', 'arm64', 'aarch64-linux-gnu', '313367534186a8551d68b39fbc2a6cc36638e583fb5dc75dcf5da3c6582bff3b', [
        '01f4330719fd4f65580e16ea5a0527f372fca750e8f588d26deaf09f2d3b1cf4',
        '26e138c677a985775331373828a6c286c551ff397cb735d00e2383cb273d1cb2',
        '576926b283613db80168ddf76380a3bd877602778cf0d226caa7bfbfa71eacf3',
        '52b8b8a145bbe1956bba82034f77022cbef0c3d0885c9e32d9817a7932fe1913'])}
DEBIAN = [('g/glibc', 'libc6_2.36-9+deb12u14'), ('g/gcc-12', 'libstdc++6_12.2.0-14+deb12u1'),
          ('g/gcc-12', 'libgcc-s1_12.2.0-14+deb12u1'), ('z/zlib', 'zlib1g_1.2.13.dfsg-1')]


def main():
    CACHE.mkdir(parents=True, exist_ok=True)
    notices = CACHE / 'notices'
    notices.mkdir(exist_ok=True)
    lock = json.loads((ROOT / 'tools/android/cursor-sdk-package-lock.json').read_text())
    records = []
    assets = ROOT / 'android/app/src/main/assets'
    for abi, (cpu, debian_cpu, triplet, node_hash, debian_hashes) in TARGETS.items():
        destination = ROOT / 'android/app/src/main/jniLibs' / abi
        binaries, aliases, components = {}, {}, []

        def binary(name, data):
            machine = 62 if abi == 'x86_64' else 183
            if data[:4] != b'\x7fELF' or int.from_bytes(data[18:20], 'little') != machine:
                raise ValueError('Wrong Cursor dependency ABI: ' + name)
            (destination / name).write_bytes(data)
            binaries[name] = hashlib.sha256(data).hexdigest()

        node_url = 'https://nodejs.org/dist/v' + NODE_VERSION + '/node-v' + NODE_VERSION + '-linux-' + cpu + '.tar.xz'
        archive = fetch(node_url, CACHE / (abi + '-node.tar.xz'), 'sha256', node_hash)
        with tarfile.open(archive) as source:
            prefix = 'node-v' + NODE_VERSION + '-linux-' + cpu + '/'
            binary('libcursor-node.so', source.extractfile(prefix + 'bin/node').read())
            (notices / 'NODE-LICENSE.txt').write_bytes(source.extractfile(prefix + 'LICENSE').read())
        components.append({'url': node_url, 'sha256': node_hash})
        for (group, package), digest in zip(DEBIAN, debian_hashes):
            url = 'https://deb.debian.org/debian/pool/main/' + group + '/' + package + '_' + debian_cpu + '.deb'
            archive = fetch(url, CACHE / (package + '_' + debian_cpu + '.deb'), 'sha256', digest)
            payload = subprocess.check_output(['ar', 'p', str(archive), 'data.tar.xz'])
            with tarfile.open(fileobj=io.BytesIO(payload)) as source:
                for member in source.getmembers():
                    if member.isfile() and member.name.endswith('/copyright'):
                        (notices / (package + '-COPYRIGHT.txt')).write_bytes(source.extractfile(member).read())
                    if not member.isfile() or '/share/' in member.name or '/' + triplet + '/' not in member.name or '.so' not in member.name:
                        continue
                    name = PurePosixPath(member.name).name
                    if not name.startswith(('ld-linux-', 'libc.so.', 'libm.so.', 'libdl.so.', 'libpthread.so.', 'libutil.so.', 'libstdc++.so.', 'libgcc_s.so.', 'libz.so.')):
                        continue
                    packaged = 'libcursor-' + name.replace('.', '_') + '.so'
                    binary(packaged, source.extractfile(member).read())
                    aliases[name] = packaged
                for member in source.getmembers():
                    if member.issym() and '/' + triplet + '/' in member.name:
                        target = PurePosixPath(member.linkname).name
                        if target in aliases:
                            aliases[PurePosixPath(member.name).name] = aliases[target]
            components.append({'url': url, 'sha256': digest})
        native = {}
        with zipfile.ZipFile(assets / ('cursor-sdk-' + abi + '.zip'), 'w', zipfile.ZIP_DEFLATED) as output:
            for path, entry in lock['packages'].items():
                if not path or entry.get('optional') and path != 'node_modules/@cursor/sdk-linux-' + cpu:
                    continue
                archive = fetch(entry['resolved'], CACHE / (path.replace('/', '_') + '.tgz'), 'sha512', entry['integrity'].removeprefix('sha512-'))
                with tarfile.open(archive) as source:
                    for member in source.getmembers():
                        if not member.isfile():
                            continue
                        relative = PurePosixPath(member.name).relative_to('package')
                        if '..' in relative.parts:
                            raise ValueError('Unsafe SDK archive member')
                        data = source.extractfile(member).read()
                        installed = path + '/' + str(relative)
                        if data[:4] == b'\x7fELF':
                            name = 'libcursor-sdk-' + hashlib.sha256(installed.encode()).hexdigest()[:16] + '.so'
                            binary(name, data)
                            native[installed] = name
                        else:
                            output.writestr(installed, data)
                        if 'license' in relative.name.lower() or relative.name.lower().startswith(('notice', 'copying')):
                            (notices / (path.replace('/', '_') + '-' + relative.name)).write_bytes(data)
                components.append({'url': entry['resolved'], 'integrity': entry['integrity']})
        metadata = {'sdkVersion': SDK_VERSION, 'nodeVersion': NODE_VERSION, 'libraries': aliases, 'native': native}
        (assets / ('cursor-runtime-' + abi + '.json')).write_text(json.dumps(metadata) + '\n')
        records.append({'provider': 'cursor', 'abi': abi, 'sdkVersion': SDK_VERSION, 'nodeVersion': NODE_VERSION,
                        'components': components, 'binaries': binaries})
        print(abi, 'official Cursor SDK', SDK_VERSION, 'packaged', flush=True)
    (CACHE / 'provenance.json').write_text(json.dumps(records, indent=2) + '\n')


if __name__ == '__main__':
    main()
