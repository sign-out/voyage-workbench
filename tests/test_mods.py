import json
import unittest

from workbench import mods
from workbench.voyage import Client


class ModOverlayTests(unittest.TestCase):
    def test_export_switches_only_mod_references_and_keeps_precise_numbers(self):
        source = '{"title":"A","initialGameState":{"big":9007199254740993,"fraction":1.000},"mods":[{"shortId":"a","version":null},{"shortId":"b","version":2}],"future":true}'
        self.assertEqual(mods.export(source), source)
        base = mods.export(source, [])
        self.assertIn('"big":9007199254740993,"fraction":1.000', base)
        self.assertIn('"future":true', base)
        self.assertEqual(mods.references(base), [])
        selected = mods.export(source, [{'shortId': 'b', 'version': 2}])
        self.assertEqual(mods.references(selected), [{'shortId': 'b', 'version': 2}])
        self.assertEqual(json.loads(selected)['initialGameState'], json.loads(source)['initialGameState'])

    def test_missing_mod_field_and_wrapped_world(self):
        source = '{"world":{"title":"A","initialGameState":{"big":9007199254740993}}}'
        output = mods.export(source, [{'shortId': 'snow', 'version': None}])
        self.assertEqual(mods.references(output), [{'shortId': 'snow', 'version': None}])
        self.assertIn('9007199254740993', output)
        self.assertEqual(mods.export(source, []), source)

    def test_rejects_duplicate_invalid_and_malformed_mods(self):
        for candidate in ('{"mods":{}}', '{"mods":["x"]}', '{"mods":[{"shortId":"x","version":0}]}',
                          '{"mods":[{"shortId":"x"},{"shortId":"x"}]}'):
            with self.assertRaises(ValueError):
                mods.references(candidate)
        with self.assertRaises(ValueError):
            mods.export('{"mods":[]}', [{'shortId': 'x', 'version': -1}])

    def test_catalog_uses_observed_mod_sets_and_pending_ids(self):
        payload = {'data': {'myMods': [{'shortId': 'a', 'title': 'Herbalism'}],
                            'bookmarkedMods': [{'shortId': 'b', 'name': 'Weather'}],
                            'pendingModsMetadata': [{'shortId': 'c', 'title': 'Secret'}]}}
        entries = mods.catalog(payload)
        self.assertEqual({x['shortId']: x['title'] for x in entries}, {'a': 'Herbalism', 'b': 'Weather', 'c': 'Secret'})
        client = Client()
        calls = []
        client.request = lambda method, path: (calls.append((method, path)) or (json.dumps(payload), None))
        self.assertEqual(client.list_mods(['a b'])['data']['myMods'][0]['title'], 'Herbalism')
        self.assertEqual(calls, [('GET', '/mods?pendingModShortId=a+b')])

    def test_attachment_matches_explicit_short_id_and_summarizes_content(self):
        raw='{"shortId":"abc","title":"Forest Weather","initialGameState":{"heroesVersion":36,"locations":{"Rainwood":{}},"triggers":{},"fraction":1.000}}'
        info=mods.attachment(raw,'abc','weather.json')
        self.assertEqual(info['title'],'Forest Weather')
        self.assertEqual(info['sections'],[{'name':'locations','entries':1},{'name':'fraction','entries':1}])
        with self.assertRaisesRegex(ValueError,'does not match'):
            mods.attachment(raw,'other','weather.json')
        self.assertEqual(mods.attachment('{"locations":{"A":{}}}','abc','forest.json')['title'],'forest')
