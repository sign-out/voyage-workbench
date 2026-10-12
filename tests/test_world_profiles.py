import tempfile
import time
import unittest
from pathlib import Path
from types import SimpleNamespace

from workbench.base_world import BaseWorld
from workbench.schema_catalog import SchemaCatalog
from workbench.server import Store
from workbench.world_agent import WorldAgent, TOOLSET_VERSION
from workbench.world_tools import WorldTools


class WorldProfileTests(unittest.TestCase):
    def test_active_base_source_is_read_only_and_informs_validation(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            store = Store(root / 'world.sqlite')
            base = BaseWorld(root / 'base', SchemaCatalog(root / 'schema'))
            good = '{"heroesVersion":36,"newRules":{"enabled":true},"npcs":{}}'
            base.prepare(good, 'custom-world.json')
            base.edit(good)
            base.check(SimpleNamespace(environment='test', validate=lambda text: {'data': {'valid': True}}))
            base.activate()
            bad = good.replace('true', '"wrong"')
            project = store.create('World', bad)
            stage = store.revisions.stage(project['id'], 'profile-test', bad)
            tools = WorldTools(store.revisions, project['id'], stage['path'], bad, lambda note: None, lambda commit: None,
                schema_profile=base.validation_profile,
                base_template=lambda: {'text': base.template_text(), 'source': base.status()})
            result = tools.call('world_base_template', {})
            self.assertEqual(result['text'], good)
            self.assertTrue(result['source']['verified'])
            self.assertNotIn('text', result['source'])
            self.assertTrue(any('newRules' in issue and 'boolean' in issue for issue in tools.call('world_validate', {})['warnings']))
            self.assertEqual(store.revisions.stage_text(stage['path']), bad)

    def test_old_toolset_replays_history_once_then_resumes_upgraded_thread(self):
        calls = []
        class Session:
            def __init__(self, **kwargs):
                self.kwargs = kwargs
            def run(self, message, cancel):
                calls.append((self.kwargs['thread_id'], message, self.kwargs['tools']))
                self.kwargs['on_thread']('upgraded-thread')
                return {'status': 'completed', 'text': 'Ready'}
        with tempfile.TemporaryDirectory() as directory:
            store = Store(Path(directory) / 'world.sqlite')
            project = store.create('World', '{"heroesVersion":36}')
            agent = WorldAgent(store, Session)
            with store.connect() as db:
                agent.chat(db, project['id'])
                db.execute('UPDATE world_chats SET thread_id=?,image_enabled=1,toolset_version=0,memory=? WHERE project_id=?',
                           ('older-thread', 'Hopeful setting', project['id']))
                agent.message(db, project['id'], 'user', 'Remember the silver harbor')
            try:
                for _ in range(2):
                    run = agent.start(project['id'], {'version': 1, 'message': 'Inspect the base world'})
                    deadline = time.monotonic() + 5
                    while project['id'] in agent.running and time.monotonic() < deadline:
                        time.sleep(.01)
                    self.assertNotIn(project['id'], agent.running)
                    self.assertEqual(agent.get(project['id'])['runs'][0]['status'], 'complete')
                self.assertIsNone(calls[0][0])
                self.assertIn('Remember the silver harbor', calls[0][1])
                self.assertIn('Hopeful setting', calls[0][1])
                self.assertTrue(any(tool['name'] == 'world_base_template' for tool in calls[0][2]))
                self.assertEqual(calls[1][0], 'upgraded-thread')
                with store.connect() as db:
                    self.assertEqual(agent.chat(db, project['id'])['toolset_version'], TOOLSET_VERSION)
            finally:
                agent.close()


if __name__ == '__main__':
    unittest.main()
