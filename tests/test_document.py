import unittest
import json
from pathlib import Path

from workbench import document as d


class DocumentTests(unittest.TestCase):
    def test_numbers_are_lossless(self):
        values = d.parse('[90071992547409931234567890,-0,1.00000000000000000001,1e999,1E+03]')
        self.assertEqual([v.lexeme for v in values], ['90071992547409931234567890', '-0', '1.00000000000000000001', '1e999', '1E+03'])

    def test_reject_invalid(self):
        for source in ('NaN', 'Infinity', '-Infinity', '01', '1.', '1e', '+1', '[1,]', '{"a":1,}', '{"a":1,"a":2}', '{"a":1,"\\u0061":2}', 'true false', '"bad\nstring"', '{', '[', ''):
            with self.subTest(source=source), self.assertRaises(ValueError):
                d.parse(source)

    def test_strings_and_scalar_types(self):
        self.assertEqual(d.parse(r'{"a\"b":"line\n\u263a","x":[true,false,null]}'), {'a"b': 'line\n☺', 'x': [True, False, None]})

    def test_span_replacement(self):
        text = ' \r\n{ "a\\u0062" : [ 1E+09, {"x": "a\\\"b"} ], "huge":900719925474099312345 }\n'
        changed = d.replace(text, ['ab', 1, 'x'], '  {"ok":-0} \n')
        self.assertEqual(changed, text.replace('"a\\\"b"', '{"ok":-0}'))
        self.assertEqual(d.section(text, ['ab', 0]), '1E+09')
        self.assertEqual(d.replace(' \n1\r\n', [], ' 2 '), ' \n2\r\n')

    def test_invalid_paths_and_values(self):
        for path in (['missing'], ['a', -1], ['a', True], ['a', '0'], ['a', 1], 'a'):
            with self.subTest(path=path), self.assertRaises(ValueError):
                d.section('{"a":[0]}', path)
        with self.assertRaises(ValueError):
            d.replace('{"a":1}', ['a'], '{"x":1,"x":2}')

    def test_inspect_formats(self):
        cases = [(' {"heroesVersion":36,"triggers":{}}', 'game-state', []), ('{"shortId":"x","initialGameState":{}}', 'world', ['initialGameState']), ('{"world":{"initialGameState":{}}}', 'world-wrapper', ['world', 'initialGameState']), ('{"data":{"world":{"initialGameState":{}}}}', 'response', ['data', 'world', 'initialGameState'])]
        for text, kind, path in cases:
            with self.subTest(kind=kind):
                result = d.inspect(text)
                self.assertEqual(result['format'], kind)
                self.assertEqual(result['gameStatePath'], path)
                self.assertFalse(result['errors'])
        self.assertEqual(d.inspect('no')['format'], 'invalid')
        self.assertTrue(d.inspect('{}')['errors'])

    def test_validation_is_structural(self):
        good = '{"triggers":{"a":{"name":"a","recurring":true,"scope":"party","phase":"state","conditions":[{"type":"action"}],"effects":[],"script":"not valid JavaScript"}}}'
        self.assertFalse(d.validate(good)['errors'])
        self.assertTrue(d.validate(good)['warnings'])
        bad = '{"triggers":{"a":{"name":"b","recurring":1,"scope":false,"conditions":[{}],"effects":{},"script":[]},"b":0},"npcs":[]}'
        self.assertGreaterEqual(len(d.validate(bad)['errors']), 7)
        self.assertTrue(d.validate('{"world":{"initialGameState":[]}}')['errors'])

    def test_diff_lexemes_order_and_arrays(self):
        self.assertEqual(d.diff('{"a":"\\u0061"}', '{ "a": "a" }'), [])
        result = d.diff('{"a":1,"b":true,"gone":0}', '{"b":1,"a":1.0,"new":null}')
        self.assertEqual([(c['path'], c['kind']) for c in result], [([], 'order'), (['a'], 'replace'), (['b'], 'replace'), (['gone'], 'remove'), (['new'], 'add')])
        self.assertEqual(result[1]['before'], '1')
        self.assertEqual(result[1]['after'], '1.0')
        result = d.diff('{"a":[{"x":1,"y":2}]}', '{"a":[{"y":2,"x":1}]}')
        self.assertEqual([(c['path'], c['kind']) for c in result], [(['a'], 'replace')])
        self.assertEqual(d.diff('[true]', '[1]')[0]['kind'], 'replace')

    def test_mutation_preserves_surroundings_and_values(self):
        text = ' \n{"target": {"a": 1E+999, "b": "\\u0062"},"safe": 123456789012345678901}\n'
        added = d.mutate(text, ['target'], 'add', 'c', '-0')
        self.assertEqual(d.section(added, ['target', 'c']), '-0')
        self.assertEqual(added[:added.index('{"a"')], text[:text.index('{"a"')])
        removed = d.mutate(text, ['target'], 'remove', 'a')
        self.assertEqual(d.section(removed, ['target', 'b']), '"\\u0062"')
        self.assertTrue(removed.endswith(',"safe": 123456789012345678901}\n'))
        self.assertEqual(d.mutate(' { } ', [], 'add', 'a', '1'), ' { "a": 1} ')
        self.assertEqual(d.mutate('[ ]', [], 'append', value_text='-0'), '[ -0]')
        self.assertEqual(d.mutate('[1E+9,2]', [], 'remove', 1), '[1E+9]')
        self.assertEqual(d.mutate('[1]', [], 'remove', 0), '[]')

    def test_mutation_rejections(self):
        cases = [('{"a":1}', 'add', 'a', '2'), ('{}', 'remove', 'a', None), ('[]', 'remove', -1, None), ('[]', 'remove', True, None), ('[]', 'add', 'a', '1'), ('{}', 'append', None, '1'), ('1', 'add', 'a', '1')]
        for text, action, key, value in cases:
            with self.subTest(text=text, action=action), self.assertRaises(ValueError):
                d.mutate(text, [], action, key, value)

    def test_describe_never_emits_numeric_values(self):
        result = d.describe('{"huge":123456789012345678901,"items":[1],"name":"hello"}', [])
        self.assertEqual(result['children'][0], {'key': 'huge', 'type': 'number', 'preview': '123456789012345678901'})
        self.assertEqual(result['children'][1]['preview'], '1 entries')
        self.assertEqual(d.describe('"x"', [])['children'], [])

    def test_reference_warnings_only_for_documented_fields(self):
        state = {'heroesVersion': 36, 'realms': {'realm': {}}, 'regions': {'region': {'realm': 'realm'}}, 'locations': {'place': {'region': 'region'}}, 'factions': {'guild': {}}, 'npcs': {'npc': {'currentLocation': 'place', 'faction': 'guild', 'futureField': 'unknown'}}, 'storyStarts': {'start': {'locations': ['place']}}}
        self.assertEqual(len(d.validate(json.dumps(state))['warnings']), 1)
        state['regions']['region']['realm'] = 'lost realm'
        state['locations']['place']['region'] = 'lost region'
        state['npcs']['npc'].update(currentLocation='lost place', faction='lost guild')
        state['storyStarts']['start']['locations'].append('lost start')
        result = d.validate(json.dumps(state))
        self.assertFalse(result['errors'])
        self.assertEqual(len(result['warnings']), 6)
        self.assertTrue(all('unresolved reference' in item for item in result['warnings'][:-1]))

    def test_reference_check_ignores_empty_dynamic_and_unknown_shapes(self):
        source = '{"npcs":{"a":{"currentLocation":"","faction":null,"otherReference":"unknown"},"b":{"currentLocation":{},"faction":[]}},"storyStarts":{"x":{"locations":null}},"triggers":{}}'
        result = d.validate(source)
        self.assertEqual(len(result['warnings']), 1)
        self.assertFalse(result['errors'])

    def test_hostile_keys_are_plain_data(self):
        source = '{"__proto__":{"constructor":{"prototype":1}},"../../etc/passwd":-0,"a/b~c":2}'
        self.assertEqual(d.section(source, ['__proto__', 'constructor', 'prototype']), '1')
        self.assertEqual(d.section(source, ['../../etc/passwd']), '-0')
        changed = d.replace(source, ['__proto__', 'constructor', 'prototype'], '9007199254740993')
        self.assertEqual(changed, source.replace(':1}', ':9007199254740993}'))
        self.assertEqual(d.mutate('{}', [], 'add', '__proto__', '{}'), '{"__proto__": {}}')

    def test_depth_has_explicit_graceful_limit(self):
        normal = '[' * d.MAX_DEPTH + '0' + ']' * d.MAX_DEPTH
        d.parse(normal)
        excessive = '[' * (d.MAX_DEPTH + 1) + '0' + ']' * (d.MAX_DEPTH + 1)
        with self.assertRaisesRegex(ValueError, 'nesting exceeds'):
            d.parse(excessive)
        self.assertIn('nesting exceeds', d.validate(excessive)['errors'][0])
        self.assertEqual(d.inspect(excessive)['format'], 'invalid')

    def test_scalar_roots_are_json_but_not_worlds(self):
        for source in ('null', 'true', '42', '"world"', '[]'):
            with self.subTest(source=source):
                d.parse(source)
                self.assertTrue(d.validate(source)['errors'])
                self.assertEqual(d.inspect(source)['gameStatePath'], None)

    def test_surrogate_escapes_preserved_and_transport_safe(self):
        source = r'{"pair":"\ud83d\ude00","lone":"\ud800","\udfff":1,"x":0}'
        self.assertEqual(d.parse(source)['pair'], '😀')
        self.assertEqual(d.section(source, ['lone']), r'"\ud800"')
        self.assertEqual(d.replace(source, ['x'], '1'), source[:-2] + '1}')
        json.dumps(d.describe(source, []), ensure_ascii=True).encode('utf-8')
        with self.assertRaisesRegex(ValueError, 'Raw surrogate'):
            d.parse('"' + chr(0xD800) + '"')

    def test_all_templates_preserve_existing_json_verbatim(self):
        fixture_dir = Path(__file__).resolve().parents[1] / 'fixtures'
        sources = sorted(fixture_dir.glob('*.json'))
        self.assertTrue(sources)
        for path in sources:
            with self.subTest(template=path.name):
                source = path.read_bytes().decode('utf-8')
                report = d.inspect(source)
                self.assertFalse(report['errors'])
                state_path = report['gameStatePath']
                raw = d.section(source, state_path)
                self.assertEqual(d.replace(source, state_path, raw).encode('utf-8'), source.encode('utf-8'))
                self.assertEqual(d.diff(source, source), [])

    def test_many_precise_values_and_escapes_survive_single_edit(self):
        members = [f'"k{i}":{{"n":9007199254740993000{i},"s":"\\u0061\\n\\\\"}}' for i in range(500)]
        source = '{\r\n' + ',\r\n'.join(members) + '\r\n}'
        changed = d.replace(source, ['k250', 'n'], '1e999')
        self.assertEqual(changed, source.replace('9007199254740993000250', '1e999'))
        differences = d.diff(source, changed)
        self.assertEqual(len(differences), 1)
        self.assertEqual(differences[0]['path'], ['k250', 'n'])


if __name__ == '__main__':
    unittest.main()
