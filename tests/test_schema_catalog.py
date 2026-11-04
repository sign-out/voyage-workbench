import hashlib
import io
import json
from pathlib import Path
import tempfile
import unittest
import urllib.error
from unittest.mock import patch

from workbench import schema
from workbench.schema_catalog import SchemaCatalog, SchemaRefreshError, NoRedirect, URL, MAX_BYTES, normalize


ROOT_CODEC = {'_type': 'partial', 'fields': {'heroesVersion': {'_type': 'literal', 'value': 36},
    'newSetting': {'_type': 'required', 'fields': {'enabled': 'boolean'}}}}


class Response(io.BytesIO):
    def __init__(self, data, headers=None):
        super().__init__(data)
        self.headers = headers or {}


class SchemaCatalogTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.directory = Path(self.tmp.name)

    def tearDown(self):
        self.tmp.cleanup()

    def refresh(self, catalog, payload=ROOT_CODEC, headers=None):
        data = json.dumps(payload).encode()
        with patch('workbench.schema_catalog.urllib.request.build_opener') as build:
            build.return_value.open.return_value = Response(data, headers)
            result = catalog.refresh()
            self.assertIsInstance(build.call_args.args[0], NoRedirect)
            request = build.return_value.open.call_args.args[0]
            self.assertEqual(request.full_url, URL)
            self.assertNotIn('Authorization', request.headers)
        return result

    def test_refresh_persists_hash_and_validates_new_fields_after_restart(self):
        catalog = SchemaCatalog(self.directory)
        self.assertIsNone(catalog.validation_profile())
        result = self.refresh(catalog)
        self.assertEqual(result['source'], 'refreshed-community')
        self.assertTrue(result['changed'])
        self.assertEqual(result['sha256'], hashlib.sha256(json.dumps(ROOT_CODEC).encode()).hexdigest())
        restarted = SchemaCatalog(self.directory)
        self.assertEqual(restarted.status()['sha256'], result['sha256'])
        warnings = schema.validate('{"heroesVersion":36,"newSetting":{"enabled":"yes"}}', restarted.validation_profile())
        self.assertTrue(any('enabled' in issue and 'boolean' in issue for issue in warnings))
        self.assertFalse(any('successLevelSettings' in issue for issue in warnings))
        self.assertFalse(self.refresh(restarted)['changed'])

    def test_failed_refresh_keeps_previous_cache_and_profile(self):
        catalog = SchemaCatalog(self.directory)
        self.refresh(catalog)
        before = catalog.path.read_bytes()
        with patch('workbench.schema_catalog.urllib.request.build_opener') as build:
            build.return_value.open.side_effect = urllib.error.HTTPError(URL, 403, 'Forbidden', {}, None)
            with self.assertRaises(SchemaRefreshError):
                catalog.refresh()
        self.assertEqual(catalog.path.read_bytes(), before)
        self.assertEqual(catalog.status()['source'], 'refreshed-community')
        self.assertIn('403', catalog.status()['lastError'])
        with self.assertRaises(SchemaRefreshError):
            self.refresh(catalog, {'unknown': 'new-codec'})
        self.assertEqual(catalog.path.read_bytes(), before)

    def test_version_mismatch_skips_cross_version_checks_without_migrating(self):
        root = {'_type': 'intersection', 'parts': [ROOT_CODEC,
            {'_type': 'partial', 'fields': {'triggerDefinitions': {'_type': 'record', 'codomain': 'unknown'}}}]}
        for profile in (normalize(root), normalize({'sections': [
                {'section': 'heroesVersion', 'schema': {'_type': 'literal', 'value': 36}},
                {'section': 'newSetting', 'schema': {'_type': 'required', 'fields': {'enabled': 'boolean'}}}]})):
            for source in ('{"heroesVersion":37,"newSetting":[]}', '{"initialGameState":{"newSetting":[]}}', '{"heroesVersion":"36","newSetting":[]}', '{"heroesVersion":1e99999999999999999999,"newSetting":[]}'):
                before = source
                warnings = schema.validate(source, profile)
                self.assertEqual(len(warnings), 1)
                self.assertIn('Schema checks were skipped', warnings[0])
                self.assertEqual(source, before)
            self.assertTrue(any('expected object' in warning for warning in schema.validate('{"heroesVersion":36,"newSetting":[]}', profile)))

    def test_corrupt_or_partial_cache_falls_back_to_existing_default(self):
        (self.directory / 'community-schema.json').write_text('{bad')
        catalog = SchemaCatalog(self.directory)
        self.assertIsNone(catalog.validation_profile())
        self.assertEqual(catalog.status()['source'], 'bundled-community')
        self.assertIsNotNone(catalog.status()['lastError'])
        self.assertTrue(any('successLevelSettings is missing' in issue for issue in schema.validate('{"heroesVersion":36}')))

    def test_bounds_and_redirects_are_rejected(self):
        catalog = SchemaCatalog(self.directory)
        with self.assertRaises(SchemaRefreshError):
            self.refresh(catalog, headers={'Content-Length': str(MAX_BYTES + 1)})
        self.assertFalse(catalog.path.exists())
        with self.assertRaises(SchemaRefreshError):
            NoRedirect().redirect_request(None, None, 302, '', {}, 'https://other.example/schema.json')
        root = 'string'
        for _ in range(105):
            root = {'_type': 'array', 'of': root}
        with self.assertRaises(SchemaRefreshError):
            normalize(root)

    def test_explicit_supported_shapes_and_duplicate_rejection(self):
        self.assertIn('root', normalize(ROOT_CODEC))
        self.assertIn('root', normalize({'version': 'v36', 'schema': ROOT_CODEC}))
        for payload in ({'narratorStyle': 'string'}, {'schemas': {'narratorStyle': 'string'}},
                        {'sections': [{'section': 'narratorStyle', 'schema': 'string'}]}):
            profile = normalize(payload)
            self.assertTrue(schema.validate('{"heroesVersion":36,"narratorStyle":false}', profile))
        with self.assertRaises(SchemaRefreshError):
            normalize([{'section': 'x', 'schema': 'string'}, {'section': 'x', 'schema': 'number'}])
        with self.assertRaises(SchemaRefreshError):
            normalize({'type': 'object', 'properties': {}})


    def test_serialized_string_enums_and_undefined_alternatives_are_checked(self):
        root = {'_type': 'partial', 'fields': {'time': '"dawn" | "morning" | "noon"',
            'optional': {'_type': 'union', 'of': ['number', 'undefined']}}}
        before = json.dumps(root)
        profile = normalize(root)
        self.assertEqual(json.dumps(root), before)
        self.assertEqual(schema.validate('{"initialGameState":{"time":"dawn","optional":1}}', profile), [])
        self.assertTrue(schema.validate('{"initialGameState":{"time":"bogus"}}', profile))
        self.assertTrue(schema.validate('{"initialGameState":{"optional":"bogus"}}', profile))
        self.assertEqual(schema.validate('{"initialGameState":{}}', profile), [])
        for invalid in ('"dawn" | arbitraryType', 'unknownType', '"dawn" |'):
            with self.assertRaises(SchemaRefreshError):normalize({'time': invalid})


if __name__ == '__main__':
    unittest.main()
