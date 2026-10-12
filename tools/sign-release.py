import argparse
import json
import os
import shutil
import subprocess
import tempfile
from pathlib import Path


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--windows-file', type=Path)
    parser.add_argument('--detached-file', '--linux-archive', dest='detached_file', type=Path)
    args = parser.parse_args()
    if bool(args.windows_file) == bool(args.detached_file):
        parser.error('Choose one Windows executable or detached-signature artifact.')
    os.umask(0o077)
    root = Path(__file__).resolve().parents[1]
    directory = Path.home() / '.local/share/voyage-signing'
    config = json.loads((directory / 'windows-test.json').read_text())
    env = {**os.environ, 'VOYAGE_SIGN_PASSWORD': config['password']}
    if args.windows_file:
        source = args.windows_file.resolve(strict=True)
        signer = os.environ.get('VOYAGE_OSSLSIGNCODE') or shutil.which('osslsigncode') or str(root / '.build-tools/signing/build/osslsigncode')
        if source.suffix.lower() != '.exe':
            raise ValueError('Windows signing requires an EXE.')
        with tempfile.TemporaryDirectory(prefix='.voyage-sign-', dir=source.parent) as temporary:
            signed = Path(temporary) / source.name
            subprocess.run([signer, 'sign', '-pkcs12', str(directory / config['certificate']), '-readpass', '-', '-h', 'sha256', '-n', 'Voyage Workbench Test Build', '-in', str(source), '-out', str(signed)], input=(config['password'] + '\n').encode(), check=True, capture_output=True)
            subprocess.run([signer, 'verify', '-CAfile', str(directory / 'windows-test.pem'), '-in', str(signed)], check=True, capture_output=True)
            signed.chmod(source.stat().st_mode & 0o777)
            signed.replace(source)
        print('Signed and verified Windows executable: ' + source.name)
    else:
        source = args.detached_file.resolve(strict=True)
        with tempfile.TemporaryDirectory(prefix='voyage-detached-sign-') as temporary:
            key = Path(temporary) / 'key.pem'
            signature = Path(temporary) / 'signature'
            subprocess.run(['openssl', 'pkcs12', '-in', str(directory / config['certificate']), '-nocerts', '-out', str(key), '-passin', 'env:VOYAGE_SIGN_PASSWORD', '-passout', 'env:VOYAGE_SIGN_PASSWORD'], check=True, capture_output=True, env=env)
            subprocess.run(['openssl', 'dgst', '-sha256', '-sign', str(key), '-passin', 'env:VOYAGE_SIGN_PASSWORD', '-out', str(signature), str(source)], check=True, capture_output=True, env=env)
            subprocess.run(['openssl', 'dgst', '-sha256', '-verify', str(directory / 'public-key.pem'), '-signature', str(signature), str(source)], check=True, capture_output=True)
            source.with_name(source.name + '.sig').write_bytes(signature.read_bytes())
        print('Signed and verified artifact: ' + source.name)


if __name__ == '__main__':
    main()
