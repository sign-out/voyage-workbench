import importlib.util
import io
import json
from pathlib import Path
import sys
import tempfile
from types import SimpleNamespace
import unittest
from unittest.mock import patch
import xml.etree.ElementTree as ElementTree
import zipfile


SPEC = importlib.util.spec_from_file_location(
    'provider_packs', Path(__file__).resolve().parents[1] / 'tools/android/prototype_provider_packs.py'
)
packs = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(packs)
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'tools/android'))
import probe_provider_packs as probe


class ProviderPackTests(unittest.TestCase):
    def test_embedded_catalog_pins_release_and_qualified_provider_versions(self):
        catalog = {'package': 'dev.voyage.workbench', 'versionCode': 13, 'version': '0.2.11',
                   'abi': 'arm64-v8a', 'signerSha256': 'certificate', 'packs': {
                       name: {'file': name + '.apk', 'bytes': 123, 'sha256': 'a' * 64,
                              'requires': [] if name == 'shared' else ['shared']}
                       for name in ('shared', *packs.PROVIDERS)}}
        with zipfile.ZipFile(io.BytesIO(), 'w') as source:
            source.writestr('assets/public/third-party/codex-binary-provenance.json', '{"codexVersion":"qualified-codex"}')
            source.writestr('assets/provider-runtimes.json', '{"claude-code":{"version":"qualified-claude"}}')
            source.writestr('assets/cursor-runtime-arm64-v8a.json', '{"sdkVersion":"qualified-cursor"}')
            address = 'https://github.com/sign-out/voyage-workbench-downloads/releases/download/v0.2.11-test'
            result = packs.download_catalog(catalog, source, address)
            self.assertEqual('qualified-codex', result['packs']['codex']['version'])
            self.assertEqual('qualified-cursor', result['packs']['cursor']['version'])
            self.assertEqual(address + '/claude.apk', result['packs']['claude']['url'])
            for invalid in ('http://github.com/sign-out/repo/releases/download/v0.2.11-test',
                            address.replace('0.2.11', '0.2.10'), address.replace('sign-out', 'someone-else')):
                with self.subTest(address=invalid), self.assertRaises(ValueError):
                    packs.download_catalog(catalog, source, invalid)

    def test_plan_only_installs_selected_providers_and_missing_dependencies(self):
        self.assertEqual(['base'], packs.plan_packs([]))
        self.assertEqual(['base', 'shared', 'claude'], packs.plan_packs(['claude']))
        self.assertEqual(['cursor'], packs.plan_packs(['cursor'], ['base', 'shared', 'claude']))
        self.assertEqual([], packs.plan_packs(['claude'], ['base', 'shared', 'claude']))
        self.assertEqual(['shared'], packs.plan_packs(['claude'], ['base', 'claude']))
        with self.assertRaises(ValueError):
            packs.plan_packs(['unknown'])

    def test_native_dependency_ownership(self):
        for abi in packs.ABIS:
            for filename in packs.SHARED:
                self.assertEqual('shared', packs.owner(f'lib/{abi}/{filename}', abi))
            for provider, filenames in packs.PROVIDER_FILES.items():
                for filename in filenames:
                    self.assertEqual(provider, packs.owner(f'lib/{abi}/{filename}', abi))
            self.assertEqual('cursor', packs.owner(f'lib/{abi}/libcursor-node.so', abi))
            other = next(candidate for candidate in packs.ABIS if candidate != abi)
            self.assertIsNone(packs.owner(f'lib/{other}/libcodex.so', abi))

    def test_cursor_archives_only_ship_once_for_selected_abi(self):
        self.assertEqual('cursor', packs.owner('assets/cursor-sdk-common.zip', 'arm64-v8a'))
        self.assertEqual('cursor', packs.owner('assets/cursor-sdk-arm64-v8a.zip', 'arm64-v8a'))
        self.assertIsNone(packs.owner('assets/cursor-sdk-x86_64.zip', 'arm64-v8a'))
        self.assertEqual('base', packs.owner('assets/cursor-runner.cjs', 'arm64-v8a'))
        self.assertEqual('base', packs.owner('META-INF/LICENSE.txt', 'arm64-v8a'))
        self.assertIsNone(packs.owner('META-INF/CERT.RSA', 'arm64-v8a'))

    def test_unknown_and_unsafe_entries_fail_closed(self):
        for name in ('lib/arm64-v8a/libnew-provider.so', 'lib/armeabi/libcodex.so',
                     '../escape', '/absolute', 'folder\\escape', 'assets/cursor-sdk-new.zip'):
            with self.subTest(name=name), self.assertRaises(ValueError):
                packs.owner(name, 'arm64-v8a')

    def test_manifest_keeps_identity_and_requires_shared_pack(self):
        for group in ('shared', *packs.PROVIDERS):
            root = ElementTree.fromstring(packs.split_manifest('dev.voyage.workbench', '12', group))
            self.assertEqual('dev.voyage.workbench', root.get('package'))
            self.assertEqual('12', root.get(f'{{{packs.ANDROID}}}versionCode'))
            self.assertEqual(f'provider_{group}', root.get('split'))
            self.assertEqual('false', root.find('application').get(f'{{{packs.ANDROID}}}hasCode'))
            dependency = root.find('uses-split')
            if group == 'shared':
                self.assertIsNone(dependency)
            else:
                self.assertEqual('provider_shared', dependency.get(f'{{{packs.ANDROID}}}name'))

    def test_partition_accounts_for_each_payload_once(self):
        with zipfile.ZipFile(io.BytesIO(), 'w') as archive:
            archive.writestr('AndroidManifest.xml', b'base')
            for abi in packs.ABIS:
                for filename in packs.SHARED | set().union(*packs.PROVIDER_FILES.values()) | {'libcursor-node.so'}:
                    archive.writestr(f'lib/{abi}/{filename}', b'vendor bytes')
                archive.writestr(f'assets/cursor-sdk-{abi}.zip', b'sdk')
            archive.writestr('assets/cursor-sdk-common.zip', b'common')
            groups = packs.partition(archive, 'arm64-v8a')
            flattened = [name for names in groups.values() for name in names]
            self.assertEqual(len(flattened), len(set(flattened)))
            self.assertFalse(any('x86_64' in name for name in flattened))
            self.assertEqual(['AndroidManifest.xml'], groups['base'])
            self.assertNotIn('lib/arm64-v8a/libclaude.so', groups['codex'])

    def test_missing_provider_is_rejected(self):
        with zipfile.ZipFile(io.BytesIO(), 'w') as archive:
            archive.writestr('AndroidManifest.xml', b'base')
            with self.assertRaises(ValueError):
                packs.partition(archive, 'arm64-v8a')

    def test_copy_keeps_source_headers_and_vendor_bytes_unchanged(self):
        source_bytes = io.BytesIO()
        with zipfile.ZipFile(source_bytes, 'w') as source:
            source.writestr('padding', b'different offsets')
            source.writestr('vendor', b'exact official bytes')
        with zipfile.ZipFile(source_bytes) as source:
            offset = source.getinfo('vendor').header_offset
            expected = packs.payload_hashes(source, ['vendor'])
            output = io.BytesIO()
            with zipfile.ZipFile(output, 'w') as target:
                packs.copy_entries(source, target, ['vendor'])
            self.assertEqual(offset, source.getinfo('vendor').header_offset)
            self.assertEqual(expected, packs.payload_hashes(source, ['vendor']))
            with zipfile.ZipFile(output) as target:
                self.assertEqual(expected, packs.payload_hashes(target, ['vendor']))

    def test_probe_refuses_physical_devices_before_calling_adb(self):
        with patch.object(probe.subprocess, 'run') as command:
            with self.assertRaises(ValueError):
                probe.probe(SimpleNamespace(sdk=Path('/unused'), serial='physical-phone'))
            command.assert_not_called()

    def test_catalog_requires_matching_payloads_signers_and_safe_paths(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            full = root / 'full.apk'
            full.write_bytes(b'qualified full APK')
            catalog = {'prototype': True, 'distributionApproved': False,
                       'package': 'dev.voyage.workbench', 'signerSha256': 'fixture-signer',
                       'sourceApkSha256': packs.file_digest(full), 'packs': {}}
            for name in ('base', 'shared', *packs.PROVIDERS):
                artifact = root / f'{name}.apk'
                artifact.write_bytes(name.encode())
                catalog['packs'][name] = {'file': artifact.name, 'bytes': artifact.stat().st_size,
                                         'sha256': packs.file_digest(artifact)}
            metadata = root / 'catalog.json'
            metadata.write_text(json.dumps(catalog))
            with patch.object(probe, 'certificate', return_value='fixture-signer'):
                self.assertEqual(set(catalog['packs']), set(probe.check_catalog(root, full, 'signer')))
                (root / 'claude.apk').write_bytes(b'tampered')
                with self.assertRaisesRegex(ValueError, 'integrity'):
                    probe.check_catalog(root, full, 'signer')
                (root / 'claude.apk').write_bytes(b'claude')
                catalog['packs']['claude']['file'] = '../claude.apk'
                metadata.write_text(json.dumps(catalog))
                with self.assertRaisesRegex(ValueError, 'filename'):
                    probe.check_catalog(root, full, 'signer')
            catalog['packs']['claude']['file'] = 'claude.apk'
            metadata.write_text(json.dumps(catalog))
            with patch.object(probe, 'certificate', side_effect=['fixture-signer', 'other-signer']):
                with self.assertRaisesRegex(ValueError, 'signer differs'):
                    probe.check_catalog(root, full, 'signer')
