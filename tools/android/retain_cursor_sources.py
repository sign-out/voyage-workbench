"""Retain exact source archives and Debian build recipes for Cursor's runtime."""
import json
import re
import shutil
from pathlib import Path
from package_provider_runtimes import ROOT, fetch

SOURCES = [
    ('g/glibc/glibc_2.36-9+deb12u14.dsc', 'cfe1f0b8dc1fa211ce5a45b3725cc38b29f88667f1140ebdca6de35cf9c6f1fd'),
    ('g/gcc-12/gcc-12_12.2.0-14+deb12u1.dsc', '3aed0b189189c744dc9f4b74798a51d3e512ea85e492568db788a927c88e20ba'),
    ('z/zlib/zlib_1.2.13.dfsg-1.dsc', '3fa1e6b2fc525062aa88207dda52fed8e045373c809d362fe8a2bfbf7cf515a8'),
]


def main():
    retained = ROOT / '.release-compliance/retained/third-party'
    destination = retained / 'sources'
    destination.mkdir(parents=True, exist_ok=True)
    entries = []
    for relative, checksum in SOURCES:
        url = 'https://deb.debian.org/debian/pool/main/' + relative
        descriptor = fetch(url, destination / Path(relative).name, 'sha256', checksum)
        entries.append({'file': descriptor.name, 'url': url, 'sha256': checksum})
        checksums = descriptor.read_text().split('Checksums-Sha256:\n', 1)[1].split('\nFiles:', 1)[0]
        for line in checksums.splitlines():
            match = re.fullmatch(r' ([a-f0-9]{64}) (\d+) ([A-Za-z0-9_.+~-]+)', line)
            if not match:
                raise ValueError('Invalid Debian source checksum record')
            digest, size, name = match.groups()
            source_url = url.rsplit('/', 1)[0] + '/' + name
            source = fetch(source_url, destination / name, 'sha256', digest)
            if source.stat().st_size != int(size):
                raise ValueError('Debian source size mismatch: ' + name)
            entries.append({'file': name, 'url': source_url, 'sha256': digest})
    packaging = retained / 'workbench-runtime-packaging'
    packaging.mkdir(exist_ok=True)
    for name in ['package_cursor_runtime.py', 'package_provider_runtimes.py', 'retain_cursor_sources.py', 'sdk_archives.py', 'cursor-sdk-package-lock.json']:
        shutil.copyfile(ROOT / 'tools/android' / name, packaging / name)
    (retained / 'cursor-source-manifest.json').write_text(json.dumps(entries, indent=2) + '\n')
    print('Retained and verified Cursor dependency sources and Debian recipes', flush=True)


if __name__ == '__main__':
    main()
