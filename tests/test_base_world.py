import http.client
import json
import tempfile
import threading
import unittest
from pathlib import Path
from types import SimpleNamespace
from workbench import document, schema
from workbench.base_world import BaseWorld, derive
from workbench.schema_catalog import SchemaCatalog
from workbench.server import Server


SOURCE = '''{"shortId":"source","title":"An evocative world","initialGameState":{
 "heroesVersion":37,"realms":{"Moon":{"name":"Moon"}},
 "aiInstructions":{"generateStory":{"custom":"Always praise the moon"}},
 "storySettings":{"worldBackground":"Moon people","questGenerationGuidance":"Moon quests"},
 "mods":[{"shortId":"flavor-mod"}],"embeddings":{"private":"runtime"},
 "futureSettings":{"limit":9007199254740993,"prompt":"Moon prompt"},
 "characterCreationMusic":"nonfantasy",
 "relationshipStages":[{"name":"Moon ally","minScore":-100,"maxScore":100}],
 "successLevelSettings":{"firstSuccessfulTierId":"moon-win","tiers":[
 {"id":"moon-lose","name":"Doom","minScore":null,"maxScore":1.000,"prompt":"Moon doom"},
 {"id":"moon-win","name":"Win","minScore":1.000,"maxScore":null,"prompt":"Moon win"}]}
}}'''


class BaseWorldTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.root = Path(self.tmp.name)
        self.catalog = SchemaCatalog(self.root / 'schema')
        self.base = BaseWorld(self.root / 'base-world', self.catalog)

    def tearDown(self):
        self.tmp.cleanup()

    def client(self, valid=True):
        return SimpleNamespace(environment='alpha', validate=lambda text: {'data': {'valid': valid, 'errors': [] if valid else ['Required field missing']}})

    def test_strips_flavor_runtime_overlays_and_optional_instructions_losslessly(self):
        text, summary, warnings = derive(SOURCE)
        state = document.parse(text)
        self.assertNotIn('Moon', text)
        self.assertNotIn('moon', text)
        self.assertNotIn('embeddings', state)
        self.assertEqual(state['mods'], [])
        self.assertEqual(state['aiInstructions'], {})
        self.assertEqual(state['realms'], {})
        self.assertEqual(state['storySettings'], {'worldBackground': ''})
        self.assertEqual(state['characterCreationMusic'], 'nonfantasy')
        self.assertIn('9007199254740993', text)
        self.assertIn('1.000', text)
        self.assertEqual(state['successLevelSettings']['firstSuccessfulTierId'], 'tier2')
        self.assertIn('embeddings', summary['removedSections'])
        self.assertTrue(any('futureSettings' in w for w in warnings))
        self.assertEqual(document.validate(text)['errors'], [])

    def test_required_codec_fields_blank_strings_and_keep_literal_discriminators(self):
        profile = {'root': {'_type': 'required', 'fields': {
            'heroesVersion': 'number', 'storySettings': {'_type': 'required', 'fields': {'worldBackground': 'string'}},
            'requiredEnum': {'_type': 'literal', 'value': 'mechanical'},
            'instructions': {'_type': 'partial', 'fields': {'flavor': 'string'}}}}}
        text, _, _ = derive(SOURCE, profile)
        state = document.parse(text)
        self.assertEqual(state['requiredEnum'], 'mechanical')
        self.assertEqual(state['instructions'], {})
        self.assertEqual(schema.check(state, profile['root']), [])

    def test_exact_official_pass_required_and_edits_invalidate_activation(self):
        self.base.prepare(SOURCE, 'source.json')
        with self.assertRaises(ValueError):
            self.base.activate()
        self.base.check(self.client(False))
        with self.assertRaises(ValueError):
            self.base.activate()
        checked = self.base.check(self.client())['candidate']
        with self.assertRaises(ValueError):
            self.base.activate('wrong-hash')
        self.base.activate(checked['sha256'])
        previous = self.base.template_text()
        self.base.edit(previous.replace('37', '38', 1))
        with self.assertRaises(ValueError):
            self.base.activate()
        self.assertEqual(self.base.template_text(), previous)
        self.assertTrue(list((self.root / 'base-world/history').glob('*.json')))

    def test_checked_default_persists_and_reset_retains_candidate(self):
        self.base.prepare(SOURCE, 'source.json')
        self.base.check(self.client())
        self.base.activate()
        fresh = BaseWorld(self.root / 'base-world', self.catalog)
        self.assertEqual(fresh.template_text(), self.base.template_text())
        self.assertFalse(fresh.status()['bundled'])
        fresh.reset()
        self.assertTrue(fresh.status()['bundled'])
        self.assertIsNotNone(fresh.status()['candidate'])

    def test_checked_base_shape_extends_advisory_checks_without_inventing_required_fields(self):
        self.base.prepare(SOURCE, 'source.json')
        self.base.check(self.client())
        self.base.activate()
        profile = self.base.validation_profile()
        self.assertTrue(any('futureSettings' in w for w in schema.validate('{"heroesVersion":37,"futureSettings":{"limit":"wrong"}}', profile)))
        self.assertFalse(any('missing' in w for w in schema.validate('{"heroesVersion":37}', profile)))

    def test_bad_persistent_state_falls_back_without_preventing_startup(self):
        self.base.directory.mkdir()
        self.base.path.write_text('{broken', encoding='utf-8')
        fresh = BaseWorld(self.base.directory, self.catalog)
        self.assertTrue(fresh.status()['bundled'])
        self.assertIn('could not be loaded', fresh.status()['lastError'])

    def test_officially_accepted_updated_shape_overrides_stale_bundled_type(self):
        self.base.prepare(SOURCE, 'source.json')
        # Simulate a future version whose official codec has changed this field.
        self.base.edit('{"heroesVersion":38,"storySettings":{"worldBackground":true}}')
        self.base.check(self.client())
        self.base.activate()
        profile = self.base.validation_profile()
        self.assertEqual(schema.validate(self.base.template_text(), profile), [])
        self.assertTrue(any('boolean' in w for w in schema.validate('{"heroesVersion":38,"storySettings":{"worldBackground":"stale"}}', profile)))

    def test_invalid_inputs_do_not_replace_candidate(self):
        self.base.prepare(SOURCE, 'source.json')
        digest = self.base.status()['candidate']['sha256']
        for text in ['{"heroesVersion":1,"heroesVersion":2}', '{bad', '{}']:
            with self.assertRaises(ValueError):
                self.base.prepare(text, 'bad.json')
        with self.assertRaises(ValueError):
            self.base.edit(SOURCE)
        self.assertEqual(self.base.status()['candidate']['sha256'], digest)

    def test_minimization_keeps_only_fields_accepted_by_official_checks(self):
        def official(text):
            state = document.parse(text)
            valid = isinstance(state.get('storySettings'), dict) and state['storySettings'].get('worldBackground') == ''
            return {'data': {'valid': valid, 'errors': [] if valid else ['Required worldBackground']}}
        client = SimpleNamespace(environment='alpha', validate=official)
        self.base.prepare(SOURCE, 'source.json')
        candidate = self.base.check(client)['candidate']
        original = candidate['text']
        job = self.base.minimize_start(candidate['sha256'])['minimization']
        while job['phase'] != 'complete':
            result = self.base.minimize_step(job['id'], client)
            job = result['minimization']
        self.assertGreater(job['removed'], 0)
        self.assertEqual(document.parse(result['candidate']['text']), {'heroesVersion': document.Number('37'), 'storySettings': {'worldBackground': ''}})
        self.assertEqual(result['candidate']['validationHash'], result['candidate']['sha256'])
        self.assertTrue(result['candidate']['verified'])
        self.assertEqual(self.base.status()['bundled'], True)  # Pruning has not activated anything.
        self.assertNotEqual(original, result['candidate']['text'])

    def test_minimization_connection_failure_and_edits_preserve_checked_candidate(self):
        self.base.prepare(SOURCE, 'source.json')
        candidate = self.base.check(self.client())['candidate']
        job = self.base.minimize_start(candidate['sha256'])['minimization']
        def offline(text):
            raise ValueError('Connection unavailable')
        with self.assertRaises(ValueError):
            self.base.minimize_step(job['id'], SimpleNamespace(environment='alpha', validate=offline))
        self.assertEqual(self.base.status()['candidate'], candidate)
        self.assertEqual(self.base.status()['minimization']['checked'], 0)
        self.base.edit(candidate['text'])
        with self.assertRaises(ValueError):
            self.base.minimize_step(job['id'], self.client())


class BaseWorldRoutesTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.root = Path(self.tmp.name)
        self.server = Server(('127.0.0.1', 0), self.root / 'db.sqlite')
        self.thread = threading.Thread(target=self.server.serve_forever, daemon=True)
        self.thread.start()
        self.cookie = self.token = None
        self.token = self.request('GET', '/api/session')[1]['token']

    def tearDown(self):
        self.server.shutdown()
        self.server.world_agent.close()
        self.server.proposals.close()
        self.server.server_close()
        self.thread.join()
        self.tmp.cleanup()

    def request(self, method, path, body=None):
        conn = http.client.HTTPConnection('127.0.0.1', self.server.server_port, timeout=5)
        headers = {'Content-Type': 'application/json'}
        if self.cookie:
            headers['Cookie'] = self.cookie
        if self.token:
            headers['X-Workbench-Token'] = self.token
        conn.request(method, path, json.dumps(body) if body is not None else None, headers)
        response = conn.getresponse()
        if path == '/api/session':
            self.cookie = response.getheader('Set-Cookie').split(';')[0]
        value = json.loads(response.read())
        status = response.status
        conn.close()
        return status, value

    def test_upload_check_activate_and_new_project_use_same_base(self):
        self.assertEqual(self.request('POST', '/api/base-world/derive', {'text': SOURCE})[0], 200)
        self.server.voyage.validate = lambda text: {'data': {'valid': True, 'errors': [], 'warnings': []}}
        self.assertEqual(self.request('POST', '/api/base-world/check', {})[0], 200)
        checked = self.request('GET', '/api/base-world')[1]['candidate']
        self.assertEqual(self.request('POST', '/api/base-world/activate', {'sha256': checked['sha256']})[0], 200)
        status, project = self.request('POST', '/api/templates/blank-world', {})
        self.assertEqual(status, 201)
        self.assertEqual(project['text'], checked['text'])
        self.assertEqual(self.request('GET', '/api/templates')[1]['templates'][0]['id'], 'blank-world')
        warnings = self.request('POST', '/api/validate', {'text': '{"heroesVersion":37,"futureSettings":{"limit":"bad"}}'})[1]['warnings']
        self.assertTrue(any('futureSettings' in warning for warning in warnings))

    def test_owned_download_is_read_only_and_only_sanitized_candidate_persists(self):
        calls = []
        self.server.voyage.download = lambda sid: (calls.append(sid) or {'text': SOURCE, 'environment': 'alpha'})
        status, value = self.request('POST', '/api/base-world/derive', {'shortId': 'source'})
        self.assertEqual(status, 200)
        self.assertEqual(calls, ['source'])
        self.assertNotIn('Moon', value['candidate']['text'])
        self.assertEqual(self.request('GET', '/api/projects')[1]['projects'], [])
        self.assertNotIn('Moon people', self.server.base_world.path.read_text(encoding='utf-8'))


if __name__ == '__main__':
    unittest.main()
