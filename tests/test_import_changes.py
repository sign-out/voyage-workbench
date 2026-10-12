"""External edits become one exact, recoverable, optimistic Git revision."""
from contextlib import contextmanager
from pathlib import Path
import sqlite3
import tempfile
import unittest
from unittest.mock import patch

from workbench.server import Store, Conflict


class ImportChangesTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.store = Store(Path(self.temp.name) / 'workbench.db')
        self.before = '{"title":"Before","n":90071992547409939999}\n'
        self.project = self.store.create('Imported world', self.before)
        self.pid = self.project['id']

    def tearDown(self):
        self.temp.cleanup()

    def imported(self, text, **extra):
        return self.store.revisions.import_changes(self.store, self.pid,
            {'text': text, 'version': self.project['version'], **extra})

    def test_one_main_revision_exact_source_and_restore_points(self):
        before_history = self.store.revisions.history(self.pid)
        text = ' \r\n{"title":"After","n":90071992547409939999,"e":1.234567890123456789e999}\r\n'
        result = self.imported(text, filename='external.json')
        p = result['project']
        self.assertEqual(p['text'], text)
        self.assertEqual(p['original'], self.before)
        self.assertEqual(p['version'], 2)
        history = self.store.revisions.history(self.pid)
        self.assertEqual(len(history), len(before_history) + 1)
        self.assertEqual(history[0]['commit'], result['commit'])
        self.assertEqual(history[0]['reason'], 'Import external JSON: external.json')
        self.assertEqual(self.store.revisions.read(self.pid, result['baseCommit']), self.before)
        self.assertEqual(self.store.revisions.read(self.pid, result['commit']), text)
        self.assertEqual(len(p['checkpoints']), 3)
        prior = next(c for c in p['checkpoints'] if c['reason'] == 'Before external JSON import')
        restored = self.store.change(self.pid, {'version': 2, 'checkpointId': prior['id']}, 'restore')
        self.assertEqual(restored['text'], self.before)
        stages = list((self.store.revisions.root / 'stage-registry').glob('import-*.json'))
        self.assertEqual(len(stages), 1)

    def test_stale_version_and_invalid_version_do_not_stage(self):
        self.store.change(self.pid, {'text': '{"changed":true}', 'version': 1}, 'save')
        for version in [1, True, '2', None]:
            with self.assertRaises(Conflict):
                self.imported('{}', version=version)
        self.assertEqual(list((self.store.revisions.root / 'stages').iterdir()), [])

    def test_invalid_json_is_rejected_without_changes(self):
        for text in ['{', '{"a":1,"a":2}', '{"bad":NaN}']:
            with self.assertRaises(ValueError):
                self.imported(text)
        with self.store.connect() as db:
            self.assertEqual(self.store.project(db, self.pid)['text'], self.before)
        self.assertEqual(len(self.store.revisions.history(self.pid)), 1)

    def test_invalid_working_buffer_is_preserved_before_valid_import(self):
        self.project = self.store.change(self.pid, {'text': '{unfinished', 'version': 1}, 'save')
        result = self.imported('{"repaired":true}')
        self.assertEqual(result['changes'][0]['before'], '{unfinished')
        self.assertEqual(self.store.revisions.read(self.pid, result['baseCommit']), '{unfinished')

    def test_archived_project_rejects_import(self):
        self.project = self.store.archive(self.pid, 1)
        with self.assertRaises(Conflict):
            self.imported('{}')
        self.assertEqual(len(self.store.revisions.history(self.pid)), 1)

    def test_same_document_still_records_named_import(self):
        result = self.imported(self.before, reason='Reimport reviewed source')
        self.assertEqual(result['changes'], [])
        self.assertNotEqual(result['commit'], result['baseCommit'])
        self.assertEqual(len(self.store.revisions.history(self.pid)), 2)

    def test_database_commit_failure_restores_main(self):
        original_connect = self.store.connect
        @contextmanager
        def failing_connect():
            with original_connect() as db:
                yield db
                raise sqlite3.OperationalError('simulated commit failure')
        with patch.object(self.store, 'connect', failing_connect):
            with self.assertRaises(sqlite3.OperationalError):
                self.imported('{"changed":true}')
        with self.store.connect() as db:
            restored = self.store.project(db, self.pid)
        self.assertEqual(restored['version'], 1)
        self.assertEqual(restored['text'], self.before)
        self.assertEqual(len(restored['checkpoints']), 1)
        self.assertEqual(len(self.store.revisions.history(self.pid)), 1)
        self.assertEqual((self.store.revisions._repo(self.pid) / 'world.json').read_text(), self.before)
