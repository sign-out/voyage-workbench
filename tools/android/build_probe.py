#!/usr/bin/env python3
"""Build the disposable native runtime probe without Gradle or system changes."""
import argparse
import json
import os
import re
from pathlib import Path
import shutil
import subprocess
import zipfile

REPO = Path(__file__).resolve().parents[2]


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--codex', type=Path, required=True, help='Static Linux Codex executable; companion must be beside it')
    parser.add_argument('--abi', choices=['x86_64','arm64-v8a'], default='x86_64')
    args = parser.parse_args()
    root = Path(os.environ.get('VOYAGE_ANDROID_TOOLS', Path.home() / '.local/share/voyage-android'))
    sdk, jdk = root / 'sdk', root / 'jdk'
    env = dict(os.environ, JAVA_HOME=str(jdk))
    env['PATH'] = str(jdk / 'bin') + ':' + env['PATH']
    header = args.codex.read_bytes()[:20]
    machine = int.from_bytes(header[18:20], 'little')
    if header[:4] != b'\x7fELF' or machine != {'x86_64':62,'arm64-v8a':183}[args.abi]:
        raise ValueError('Codex binary does not match the selected ABI')
    build = REPO / ('.android-lab/build' if args.abi == 'x86_64' else '.android-lab/build-arm64')
    build.mkdir(parents=True, exist_ok=True)
    for name in ['classes', 'dex']:
        shutil.rmtree(build / name, ignore_errors=True)
        (build / name).mkdir()
    source = REPO / 'experiments/android-agent'
    android = sdk / 'platforms/android-36/android.jar'
    bt = sdk / 'build-tools/36.0.0'

    def run(*command):
        subprocess.run([str(x) for x in command], env=env, check=True)

    run(jdk / 'bin/javac', '-source', '8', '-target', '8', '-classpath', android, '-d', build / 'classes', *source.glob('src/**/*.java'))
    run(bt / 'd8', '--lib', android, '--min-api', '28', '--output', build / 'dex', *sorted((build / 'classes').rglob('*.class')))
    raw = build / 'unsigned.apk'
    run(bt / 'aapt2', 'link', '-I', android, '--manifest', source / 'AndroidManifest.xml', '-o', raw)
    with zipfile.ZipFile(raw, 'a', compression=zipfile.ZIP_DEFLATED) as zf:
        zf.write(build / 'dex/classes.dex', 'classes.dex')
        zf.write(args.codex, 'lib/' + args.abi + '/libcodex.so')
        companion = args.codex.parent / 'codex-code-mode-host'
        if companion.exists():
            zf.write(companion, 'lib/' + args.abi + '/libcodex-code-mode-host.so')
        termux = REPO / '.android-lab/termux/unpacked/data/data/com.termux/files/usr'
        if termux.exists() and args.abi == 'x86_64':
            for binary in ['strace', 'proot']:
                zf.write(termux / 'bin' / binary, 'lib/x86_64/lib' + binary + '.so')
            aliases = {}
            for library in (termux / 'lib').glob('*.so*'):
                dynamic = subprocess.check_output(['readelf','-d',str(library)],text=True)
                match = re.search(r'SONAME.*?\[(.*?)\]',dynamic)
                soname = match.group(1) if match else library.name
                packaged = soname.split('.so')[0] + '.so'
                zf.write(library, 'lib/x86_64/' + packaged)
                aliases[soname] = packaged
            zf.writestr('assets/runtime-libs.json',json.dumps(aliases))
            for loader in (termux / 'libexec/proot').glob('*'):
                if loader.is_file() and loader.name == 'loader':
                    zf.write(loader, 'lib/x86_64/lib' + loader.name + '.so')
        else:
            zf.writestr('assets/runtime-libs.json','{}')
    aligned = build / 'aligned.apk'
    run(bt / 'zipalign', '-f', '4', raw, aligned)
    key = root / 'probe-debug.keystore'
    if not key.exists():
        run(jdk / 'bin/keytool', '-genkeypair', '-keystore', key, '-storepass', 'android', '-keypass', 'android', '-alias', 'androiddebugkey',
            '-keyalg', 'RSA', '-keysize', '2048', '-validity', '365', '-dname', 'CN=Voyage Runtime Lab')
    apk = build / 'voyage-runtime-probe.apk'
    run(bt / 'apksigner', 'sign', '--ks', key, '--ks-pass', 'pass:android', '--out', apk, aligned)
    run(bt / 'apksigner', 'verify', apk)
    print(json.dumps({'apk': str(apk), 'bytes': apk.stat().st_size}))


if __name__ == '__main__':
    main()
