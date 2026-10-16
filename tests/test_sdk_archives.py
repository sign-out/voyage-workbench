import tempfile
import unittest
from pathlib import Path
import zipfile

from tools.android.sdk_archives import archive_entries, factor_sdk_archives


class SdkArchiveTests(unittest.TestCase):
    def test_factoring_reconstructs_each_architecture_exactly(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            sources = {}
            original = {}
            for abi in ['arm64-v8a', 'x86_64']:
                source = root / (abi + '.zip')
                original[abi] = {'node_modules/sdk/index.js': b'shared', 'platform.json': abi.encode(), 'platform/' + abi + '.json': b'only this ABI'}
                with zipfile.ZipFile(source, 'w') as archive:
                    for name, data in original[abi].items():
                        archive.writestr(name, data)
                sources[abi] = source
            outputs = factor_sdk_archives(sources, root / 'output')
            for abi, names in outputs.items():
                restored = {}
                for name in names:
                    records = archive_entries(root / 'output' / name)
                    self.assertFalse(restored.keys() & records.keys())
                    restored.update(records)
                self.assertEqual(restored, original[abi])
            self.assertEqual(archive_entries(root / 'output/cursor-sdk-common.zip'), {'node_modules/sdk/index.js': b'shared'})
            self.assertEqual(outputs, factor_sdk_archives(sources, root / 'output'))
            with self.assertRaises(ValueError):
                factor_sdk_archives({abi: root / 'output' / names[1] for abi, names in outputs.items()}, root / 'output')

    def test_invalid_archive_paths_and_duplicate_names_are_rejected(self):
        for name in ['../escape', '/absolute', 'folder/../../escape', 'folder\\escape']:
            with self.subTest(name=name), tempfile.TemporaryDirectory() as directory:
                source = Path(directory) / 'invalid.zip'
                with zipfile.ZipFile(source, 'w') as archive:
                    archive.writestr(name, b'invalid')
                with self.assertRaises(ValueError):
                    archive_entries(source)
        with tempfile.TemporaryDirectory() as directory:
            source = Path(directory) / 'duplicate.zip'
            with zipfile.ZipFile(source, 'w') as archive:
                archive.writestr('duplicate', b'first')
                with self.assertWarns(UserWarning):
                    archive.writestr('duplicate', b'second')
            with self.assertRaises(ValueError):
                archive_entries(source)
