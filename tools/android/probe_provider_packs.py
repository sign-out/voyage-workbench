"""Exercise local prototype splits only on the dedicated disposable lab emulator."""
import argparse
import json
from pathlib import Path
import subprocess
import zipfile

from prototype_provider_packs import PROVIDERS, certificate, file_digest


def check_catalog(directory, full_apk, signer):
    catalog = json.loads((directory / 'catalog.json').read_text())
    if not isinstance(catalog.get('prototype'), bool) or catalog.get('distributionApproved') is not False:
        raise ValueError('Expected an audited provider-pack build catalog')
    if catalog.get('package') != 'dev.voyage.workbench':
        raise ValueError('Unexpected package identity')
    if file_digest(full_apk) != catalog['sourceApkSha256']:
        raise ValueError('Full APK differs from the prototype source')
    if certificate(signer, full_apk) != catalog['signerSha256']:
        raise ValueError('Full APK certificate differs from the catalog')
    if set(catalog['packs']) != {'base', 'shared', *PROVIDERS}:
        raise ValueError('Incomplete prototype pack set')
    files = {}
    for name, pack in catalog['packs'].items():
        expected_filename = f'{name}.apk' if catalog['prototype'] else 'Voyage-Workbench-' + catalog['version'] + '-android-' + (
            catalog['abi'] + '-lightweight.apk' if name == 'base' else 'runtime-' + catalog['abi'] + '-' + name + '.apk')
        if pack['file'] != expected_filename:
            raise ValueError('Unexpected pack filename')
        path = directory / pack['file']
        if path.stat().st_size != pack['bytes'] or file_digest(path) != pack['sha256']:
            raise ValueError(f'Pack integrity check failed: {name}')
        if certificate(signer, path) != catalog['signerSha256']:
            raise ValueError(f'Pack signer differs: {name}')
        files[name] = path
    if not catalog['prototype']:
        with zipfile.ZipFile(files['base']) as archive:
            embedded = json.loads(archive.read('assets/runtime-pack-catalog.json'))
        for name in ('shared', *PROVIDERS):
            for key in ('file', 'bytes', 'sha256', 'requires'):
                if embedded['packs'][name][key] != catalog['packs'][name][key]:
                    raise ValueError('Embedded runtime catalog differs from verified APKs')
    return files


def probe(args):
    adb = args.sdk / 'platform-tools/adb'
    command = [str(adb), '-s', args.serial]

    def device(*arguments, success=True):
        result = subprocess.run(command + [str(argument) for argument in arguments],
                                capture_output=True, text=True, timeout=180)
        output = result.stdout + result.stderr
        if success and (result.returncode or 'Failure [' in output or 'FAILURES!!!' in output):
            raise RuntimeError(output)
        return result.returncode, output

    if not args.serial.startswith('emulator-'):
        raise ValueError('This destructive lab probe cannot target a physical phone')
    _, name = device('emu', 'avd', 'name')
    if name.splitlines()[0].strip() != 'voyage-provider-packs-api36':
        raise ValueError('Use only the dedicated voyage-provider-packs-api36 AVD')
    _, abi = device('shell', 'getprop', 'ro.product.cpu.abi')
    catalog = json.loads((args.packs / 'catalog.json').read_text())
    if abi.strip() != catalog['abi']:
        raise ValueError('Emulator ABI differs from the packs')
    signer = args.sdk / 'build-tools' / args.build_tools / 'apksigner'
    files = check_catalog(args.packs, args.full_apk, signer)
    if certificate(signer, args.test_apk) != catalog['signerSha256']:
        raise ValueError('Instrumentation APK must use the same signing identity')

    def install(*paths, inherit=False):
        arguments = ['install-multiple', '--no-incremental', '-r']
        if inherit:
            arguments += ['-p', catalog['package']]
        device(*arguments, *paths)

    def smoke(label, providers, initialize=False):
        _, output = device('shell', 'am', 'instrument', '-w', '-e', 'class',
                           'dev.voyage.workbench.ProviderPackTest#installedPacksExposeOnlySelectedOfficialRuntimes', '-e', 'providers', providers,
                           '-e', 'packState', 'initialize' if initialize else 'preserve',
                           'dev.voyage.workbench.test/androidx.test.runner.AndroidJUnitRunner')
        if 'OK (1 test)' not in output:
            raise RuntimeError(output)
        print(f'{label}: passed', flush=True)

    install(args.full_apk)
    device('install', '--no-incremental', '-r', args.test_apk)
    smoke('Full build / initialize encrypted and local-state fixtures', 'codex,claude,cursor', True)
    install(files['base'])
    smoke('Full to editor-only / retained state', 'editor')
    status, output = device('install-multiple', '--no-incremental', '-r', '-p', catalog['package'],
                            files['claude'], success=False)
    if status == 0:
        print('Platform accepted incomplete pack: production must enforce catalog dependencies', flush=True)
        _, checked = device('shell', 'am', 'instrument', '-w', '-e', 'class',
                            'dev.voyage.workbench.ProviderPackTest#incompleteProviderNeverBecomesAnApiFallback',
                            '-e', 'incomplete', 'true', 'dev.voyage.workbench.test/androidx.test.runner.AndroidJUnitRunner')
        if 'OK (1 test)' not in checked:
            raise RuntimeError(checked)
        print('Incomplete provider blocked before inference or fallback: passed', flush=True)
    elif 'INSTALL_FAILED_MISSING_SPLIT' in output:
        print('Platform rejected incomplete pack', flush=True)
    else:
        raise RuntimeError(f'Unexpected incomplete-install outcome: {output}')
    install(files['base'])
    smoke('Editor restored after incomplete-install probe / retained state', 'editor')
    install(files['shared'], files['claude'], inherit=True)
    smoke('Claude only / CLI version without inference', 'claude')
    install(files['cursor'], inherit=True)
    smoke('Add Cursor only / SDK status without inference', 'claude,cursor')
    install(files['codex'], inherit=True)
    smoke('Add Codex only / app-server initialization without inference', 'codex,claude,cursor')
    install(args.full_apk)
    smoke('Return to full build / encrypted and local state retained', 'codex,claude,cursor')


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--serial', required=True)
    parser.add_argument('--sdk', required=True, type=Path)
    parser.add_argument('--build-tools', default='36.0.0')
    parser.add_argument('--packs', required=True, type=Path)
    parser.add_argument('--full-apk', required=True, type=Path)
    parser.add_argument('--test-apk', required=True, type=Path)
    probe(parser.parse_args())


if __name__ == '__main__':
    main()
