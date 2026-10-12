import tempfile
from pathlib import Path
import unittest

from workbench.server import Store, Conflict


class StoreRevisionTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.store = Store(Path(self.temp.name) / 'store.sqlite')

    def tearDown(self):
        self.temp.cleanup()

    def test_create_save_invalid_draft_checkpoint_and_restore(self):
        original = ' \r\n{"n":90071992547409931234567890}\r\n'
        project = self.store.create('World', original)
        pid = project['id']
        initial = self.store.revisions.history(pid)
        self.assertEqual([r['reason'] for r in initial], ['Initial import'])
        self.assertEqual(self.store.revisions.read(pid, initial[0]['commit']), original)
        changed = self.store.change(pid, {'version': 1, 'text': '{unfinished'}, 'save')
        saved_history = self.store.revisions.history(pid)
        self.assertEqual([r['reason'] for r in saved_history], ['Save working copy', 'Initial import'])
        self.assertEqual(self.store.revisions.read(pid, saved_history[0]['commit']), '{unfinished')
        checkpoint = self.store.change(pid, {'version': changed['version'], 'reason': 'Before review'}, 'checkpoints')
        checkpoint_history = self.store.revisions.history(pid)
        self.assertEqual(checkpoint_history[0]['reason'], 'Before review')
        self.assertNotEqual(checkpoint_history[0]['commit'], saved_history[0]['commit'])
        restored = self.store.change(pid, {'version': checkpoint['version'], 'checkpointId': project['checkpoints'][0]['id']}, 'restore')
        self.assertEqual(restored['text'], original)
        self.assertEqual(restored['original'], original)
        final_history = self.store.revisions.history(pid)
        self.assertEqual([r['reason'] for r in final_history[:2]], ['Restore checkpoint', 'Before restore'])
        self.assertEqual(self.store.revisions.read(pid, final_history[0]['commit']), original)
        self.assertEqual(self.store.revisions.read(pid, final_history[1]['commit']), '{unfinished')
        self.assertEqual(len(restored['checkpoints']), 3)

    def test_conflict_and_invalid_requests_do_not_create_commits(self):
        project = self.store.create('World', '{}')
        pid = project['id']
        history = self.store.revisions.history(pid)
        with self.assertRaises(Conflict):
            self.store.change(pid, {'version': 0, 'text': '{"bad":1}'}, 'save')
        for action, fields in [('save', {'text': 42}), ('checkpoints', {'reason': ''}), ('restore', {'checkpointId': 'missing'}), ('unknown', {})]:
            with self.subTest(action=action), self.assertRaises((ValueError, KeyError)):
                self.store.change(pid, {'version': 1, **fields}, action)
        self.assertEqual(self.store.revisions.history(pid), history)

    def test_existing_sqlite_project_gets_current_baseline_before_save(self):
        # Simulate an existing pre-Git database without relying on repository deletion.
        pid = 'legacy'
        with self.store.connect() as db:
            db.execute('INSERT INTO projects(id,name,text,original,version,updated) VALUES (?,?,?,?,?,?)', (pid, 'Legacy', '{"current":1}', '{"original":1}', 7, 0))
        self.assertEqual(self.store.revisions.history(pid), [])
        self.store.change(pid, {'version': 7, 'text': '{"new":2}'}, 'save')
        history = self.store.revisions.history(pid)
        self.assertEqual([r['reason'] for r in history], ['Save working copy', 'Initial import'])
        self.assertEqual(self.store.revisions.read(pid, history[1]['commit']), '{"current":1}')

    def test_git_baseline_resynchronizes_before_save(self):
        project = self.store.create('World', '{}')
        pid = project['id']
        self.store.revisions.commit(pid, '{"ahead":1}', 'Git ahead of database')
        changed = self.store.change(pid, {'version': 1, 'text': '{"saved":2}'}, 'save')
        history = self.store.revisions.history(pid)
        self.assertEqual([r['reason'] for r in history[:2]], ['Save working copy', 'Sync working copy'])
        self.assertEqual(self.store.revisions.read(pid, history[1]['commit']), '{}')
        self.assertEqual(self.store.revisions.read(pid, history[0]['commit']), changed['text'])

    def test_reopening_store_preserves_both_histories(self):
        project = self.store.create('World', '{}')
        changed = self.store.change(project['id'], {'version': 1, 'text': '{"n":-0}'}, 'save')
        reopened = Store(self.store.path)
        with reopened.connect() as db:
            self.assertEqual(reopened.project(db, project['id'])['text'], changed['text'])
        self.assertEqual(reopened.revisions.history(project['id']), self.store.revisions.history(project['id']))


if __name__ == '__main__':
    unittest.main()
