import hashlib
import json
import os
import secrets
import subprocess
import tempfile
from pathlib import Path


def run(*arguments, env=None, input=None):
    return subprocess.run(arguments, check=True, capture_output=True, env=env, input=input).stdout


def main():
    os.umask(0o077)
    directory = Path.home() / '.local/share/voyage-signing'
    directory.mkdir(parents=True, exist_ok=True, mode=0o700)
    directory.chmod(0o700)
    config = directory / 'windows-test.json'
    keystore = Path.home() / '.android/debug.keystore'
    if not keystore.is_file():
        raise ValueError('Existing Android development signing key is missing.')
    keystore.chmod(0o600)
    certificate_env = {**os.environ, 'VOYAGE_ANDROID_PASSWORD': 'android'}
    android_certificate = run('keytool', '-exportcert', '-keystore', str(keystore), '-storepass:env', 'VOYAGE_ANDROID_PASSWORD', '-alias', 'androiddebugkey', '-rfc', env=certificate_env)
    android_public_pem = run('openssl', 'x509', '-pubkey', '-noout', input=android_certificate)
    android_public = run('openssl', 'pkey', '-pubin', '-outform', 'DER', input=android_public_pem)
    if config.exists():
        data = json.loads(config.read_text())
        if not (directory / data['certificate']).is_file():
            raise ValueError('Existing signing certificate is missing. Restore it; do not rotate silently.')
        if data['publicKeySha256'] != hashlib.sha256(android_public).hexdigest():
            raise ValueError('Android signing key changed. Resolve the identity mismatch before building.')
        print('Existing Windows test-signing identity retained; no key rotation.')
        return
    password = secrets.token_urlsafe(48)
    env = {**os.environ, 'VOYAGE_ANDROID_PASSWORD': 'android', 'VOYAGE_SIGN_PASSWORD': password}
    with tempfile.TemporaryDirectory(prefix='voyage-signing-', dir=directory) as temporary:
        temporary = Path(temporary)
        exported = temporary / 'android.p12'
        key = temporary / 'key.pem'
        certificate = temporary / 'certificate.pem'
        run('keytool', '-importkeystore', '-noprompt', '-srckeystore', str(keystore), '-srcstorepass:env', 'VOYAGE_ANDROID_PASSWORD', '-srcalias', 'androiddebugkey', '-destkeystore', str(exported), '-deststoretype', 'PKCS12', '-deststorepass:env', 'VOYAGE_SIGN_PASSWORD', '-destkeypass:env', 'VOYAGE_SIGN_PASSWORD', env=env)
        run('openssl', 'pkcs12', '-in', str(exported), '-nocerts', '-out', str(key), '-passin', 'env:VOYAGE_SIGN_PASSWORD', '-passout', 'env:VOYAGE_SIGN_PASSWORD', env=env)
        run('openssl', 'req', '-new', '-x509', '-key', str(key), '-passin', 'env:VOYAGE_SIGN_PASSWORD', '-out', str(certificate), '-days', '3650', '-subj', '/CN=Voyage Workbench Test Builds/O=Voyage Workbench', '-addext', 'extendedKeyUsage=codeSigning', '-addext', 'keyUsage=critical,digitalSignature', '-addext', 'basicConstraints=critical,CA:FALSE', env=env)
        run('openssl', 'pkcs12', '-export', '-inkey', str(key), '-in', str(certificate), '-out', str(directory / 'windows-test.pfx'), '-name', 'Voyage Workbench Test Builds', '-passin', 'env:VOYAGE_SIGN_PASSWORD', '-passout', 'env:VOYAGE_SIGN_PASSWORD', env=env)
        public = run('openssl', 'pkey', '-in', str(key), '-passin', 'env:VOYAGE_SIGN_PASSWORD', '-pubout', '-outform', 'DER', env=env)
        if android_public != public:
            raise ValueError('Windows and Android signing keys differ.')
        (directory / 'windows-test.pem').write_bytes(certificate.read_bytes())
        (directory / 'public-key.pem').write_bytes(run('openssl', 'x509', '-in', str(certificate), '-pubkey', '-noout'))
        data = {'certificate': 'windows-test.pfx', 'password': password, 'publicKeySha256': hashlib.sha256(public).hexdigest(), 'kind': 'self-signed-test', 'sharedWith': 'Android development signing key'}
        temporary_config = directory / 'windows-test.json.tmp'
        temporary_config.write_text(json.dumps(data, indent=2) + '\n')
        temporary_config.replace(config)
    print('Windows test certificate created with the same Android public key; Android keystore unchanged.')
    print('Signing material stays in the owner-only user signing directory, outside the repository.')


if __name__ == '__main__':
    main()
