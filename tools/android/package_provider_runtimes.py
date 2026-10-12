#!/usr/bin/env python3
"""Package unmodified, pinned official agent executables for Android/PRoot."""
import base64
import hashlib
import json
from pathlib import Path
import shutil
import tarfile
import urllib.request

ROOT = Path(__file__).resolve().parents[2]
CACHE = ROOT / '.android-lab/provider-runtimes'
VERSION = '2.1.295'
TARGETS = {
    'x86_64': ('x64', 'x86_64', 'S/cMn4k8uzumMYMPATbx0i14ooSi8cLFr/WMyfFKQc8H/FRMhaZ4rWCmBJnttWP2s93YiU5KsAifYf3324DtFg==', '4990a5e0ba312e478f94cfe431a70efef1538004eb361c8ae424516848be45bb'),
    'arm64-v8a': ('arm64', 'aarch64', 'ao8kyoHS+XXIu6QieUthb5VilbkEtbCBEzbam97fWF/67vzZrogJX/RiJMhLZbrKX9L5avo7sh+eK6k85BDPlA==', 'ac281d1e7f9e9c447c51e309317b975f48be6edaf3ab91ae73b959cf86703782'),
}


def fetch(url, destination, algorithm, expected):
    if not destination.exists():
        temporary = destination.with_suffix('.download')
        with urllib.request.urlopen(url, timeout=120) as source, temporary.open('wb') as output:
            shutil.copyfileobj(source, output)
        temporary.replace(destination)
    with destination.open('rb') as source:
        digest = hashlib.file_digest(source, algorithm).digest()
    actual = base64.b64encode(digest).decode() if algorithm == 'sha512' else digest.hex()
    if actual != expected:
        raise ValueError('Provider runtime checksum mismatch: ' + destination.name)
    return destination


def member_bytes(archive, path):
    with tarfile.open(archive) as source:
        member = source.getmember(path)
        if not member.isfile():
            raise ValueError('Expected regular runtime file: ' + path)
        return source.extractfile(member).read()


def main():
    CACHE.mkdir(parents=True, exist_ok=True)
    notices = CACHE / 'notices'
    notices.mkdir(exist_ok=True)
    license_url = 'https://git.musl-libc.org/cgit/musl/plain/COPYRIGHT?h=v1.2.5'
    fetch(license_url, notices / 'MUSL-COPYRIGHT.txt', 'sha256', 'f9bc4423732350eb0b3f7ed7e91d530298476f8fec0c6c427a1c04ade22655af')
    provenance = []
    for abi, (cpu, alpine, integrity, musl_hash) in TARGETS.items():
        package = '@anthropic-ai/claude-code-linux-' + cpu + '-musl'
        url = 'https://registry.npmjs.org/' + package + '/-/claude-code-linux-' + cpu + '-musl-' + VERSION + '.tgz'
        archive = fetch(url, CACHE / (abi + '-claude.tgz'), 'sha512', integrity)
        musl_url = 'https://dl-cdn.alpinelinux.org/alpine/v3.22/main/' + alpine + '/musl-1.2.5-r12.apk'
        musl = fetch(musl_url, CACHE / (abi + '-musl.apk'), 'sha256', musl_hash)
        destination = ROOT / 'android/app/src/main/jniLibs' / abi
        destination.mkdir(parents=True, exist_ok=True)
        binary = member_bytes(archive, 'package/claude')
        loader = member_bytes(musl, 'lib/ld-musl-' + alpine + '.so.1')
        machine = {'x86_64': 62, 'arm64-v8a': 183}[abi]
        for name, data in [('libclaude.so', binary), ('libmusl-loader.so', loader)]:
            if data[:4] != b'\x7fELF' or int.from_bytes(data[18:20], 'little') != machine:
                raise ValueError('Wrong provider runtime ABI: ' + name)
            (destination / name).write_bytes(data)
        (notices / 'CLAUDE-CODE-LICENSE.md').write_bytes(member_bytes(archive, 'package/LICENSE.md'))
        (notices / ('CLAUDE-CODE-README-' + abi + '.md')).write_bytes(member_bytes(archive, 'package/README.md'))
        provenance.append({'provider': 'claude-code', 'abi': abi, 'version': VERSION, 'url': url,
                           'integrity': 'sha512-' + integrity, 'binarySha256': hashlib.sha256(binary).hexdigest(),
                           'musl': {'version': '1.2.5-r12', 'url': musl_url, 'sha256': musl_hash,
                                    'source': 'https://musl.libc.org/releases/musl-1.2.5.tar.gz'}})
        print(abi, 'official Claude Code', VERSION, 'packaged', flush=True)
    (CACHE / 'provenance.json').write_text(json.dumps(provenance, indent=2) + '\n')
    assets = ROOT / 'android/app/src/main/assets'
    (assets / 'provider-runtimes.json').write_text(json.dumps({'claude-code': {'version': VERSION, 'abis': list(TARGETS)}}) + '\n')
    from package_cursor_runtime import main as cursor_main
    cursor_main()


if __name__ == '__main__':
    main()
