import json
import os
from pathlib import Path
import subprocess
import tempfile
from concurrent.futures import ThreadPoolExecutor
import unittest
from unittest.mock import patch

from workbench.revisions import Revisions


class RevisionTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.root = Path(self.temp.name) / 'revisions'
        self.revisions = Revisions(self.root)

    def tearDown(self):
        self.temp.cleanup()

    def test_exact_bytes_history_read_and_rollback(self):
        original = ' \r\n{"huge":9007199254740993456789,"unicode":"☀","n":-0}\r\n'
        first = self.revisions.ensure('project', original)
        second = self.revisions.commit('project', original.replace('-0', '1E+999'), 'Change number\n\nRetain exact spelling')
        history = self.revisions.history('project')
        self.assertEqual([x['commit'] for x in history], [second, first])
        self.assertEqual(history[0]['reason'], 'Change number\n\nRetain exact spelling')
        self.assertTrue(history[0]['created'])
        self.assertEqual(self.revisions.read('project', first), original)
        self.assertEqual(self.revisions.read('project', first[:10]), original)
        restored = self.revisions.commit('project', self.revisions.read('project', first), 'Rollback after review')
        self.assertEqual(self.revisions.read('project', restored), original)
        self.assertEqual((self.root / 'repos/project/world.json').read_bytes(), original.encode())
        self.assertEqual(len(self.revisions.history('project')), 3)

    def test_ensure_sync_and_no_change_commits(self):
        first = self.revisions.ensure('p', '{}')
        self.assertEqual(self.revisions.ensure('p', '{}'), first)
        self.assertEqual(self.revisions.commit('p', '{}', 'No change'), first)
        second = self.revisions.ensure('p', '{"x":1}')
        self.assertNotEqual(second, first)
        self.assertEqual(self.revisions.history('p')[0]['reason'], 'Sync working copy')
        third = self.revisions.commit('p', '{"x":1}', 'Deliberate checkpoint', allow_empty=True)
        self.assertNotEqual(third, second)
        self.assertEqual(len(self.revisions.history('p')), 3)

    def test_initial_commit_uses_requested_reason(self):
        commit = self.revisions.commit('new', '{}', 'Create a custom baseline')
        self.assertEqual(self.revisions.history('new'), [{'commit': commit, 'reason': 'Create a custom baseline', 'created': self.revisions.history('new')[0]['created']}])

    def test_worktree_isolation_and_persistent_registration(self):
        main = self.revisions.ensure('p', '{"n":1}')
        stage = self.revisions.stage('p', 'run-1', '{"n":1}')
        self.assertEqual(stage['branch'], 'agent/run-1')
        self.assertEqual(stage['baseCommit'], main)
        agent = self.revisions.stage_commit(stage['path'], '{"n":2}', 'Agent proposal')
        self.assertNotEqual(agent, main)
        self.assertEqual(self.revisions.stage_head(stage['path']), agent)
        self.assertEqual(self.revisions.stage_text(stage['path']), '{"n":2}')
        self.assertEqual(self.revisions.history('p')[0]['commit'], main)
        self.assertEqual((self.root / 'repos/p/world.json').read_text(), '{"n":1}')
        self.assertEqual(self.revisions.read('p', agent), '{"n":2}')
        reopened = Revisions(self.root)
        self.assertEqual(reopened.stage_text(stage['path']), '{"n":2}')
        applied = reopened.commit('p', reopened.stage_text(stage['path']), 'Apply reviewed proposal')
        self.assertEqual(reopened.read('p', applied), '{"n":2}')
        self.assertEqual(len(reopened.history('p')), 2)

    def test_stage_duplicate_run_is_rejected_before_sync(self):
        stage = self.revisions.stage('p', 'run', '{}')
        with self.assertRaises(ValueError):
            self.revisions.stage('p', 'run', '{"unexpected":1}')
        self.assertEqual(self.revisions.read('p', stage['baseCommit']), '{}')
        self.assertEqual(len(self.revisions.history('p')), 1)
        with self.assertRaises(ValueError):
            self.revisions.stage('other', 'run', '{}')

    def test_unsafe_ids_commits_and_paths(self):
        for bad in ('', '..', '../outside', 'a/b', 'a b', '--help', 'a;id', 'a\x00b'):
            # Leading hyphens are allowed IDs, passed only as path components.
            if bad == '--help':
                self.revisions.ensure(bad, '{}')
                continue
            with self.subTest(bad=bad), self.assertRaises(ValueError):
                self.revisions.ensure(bad, '{}')
            with self.subTest(run=bad), self.assertRaises(ValueError):
                self.revisions.stage('valid', bad, '{}')
        self.revisions.ensure('p', '{}')
        for commit in ('main', 'HEAD', '--help', 'abcdefg', '1234', 'deadbeef:world.json', 'deadbeef^{commit}'):
            with self.subTest(commit=commit), self.assertRaises(ValueError):
                self.revisions.read('p', commit)
        for path in (str(self.root.parent), 'relative', str(self.root / 'stages/unregistered')):
            with self.subTest(path=path), self.assertRaises(ValueError):
                self.revisions.stage_text(path)

    def test_empty_and_unknown_history(self):
        self.assertEqual(self.revisions.history('missing'), [])
        with self.assertRaises(ValueError):
            self.revisions.read('missing', 'deadbeef')

    def test_symlink_paths_are_rejected(self):
        outside = Path(self.temp.name) / 'outside'
        outside.mkdir()
        (self.root / 'repos/link').symlink_to(outside)
        with self.assertRaises(ValueError):
            self.revisions.ensure('link', '{}')
        stage = self.revisions.stage('p', 'run', '{}')
        alias = self.root / 'stages/alias'
        alias.symlink_to(stage['path'])
        with self.assertRaises(ValueError):
            self.revisions.stage_head(alias)

    def test_global_git_configuration_and_hooks_are_disabled(self):
        hook_dir = Path(self.temp.name) / 'hooks'
        hook_dir.mkdir()
        marker = Path(self.temp.name) / 'hook-ran'
        hook = hook_dir / 'pre-commit'
        hook.write_text('#!/bin/sh\ntouch "' + str(marker) + '"\nexit 1\n')
        hook.chmod(0o700)
        config = Path(self.temp.name) / 'gitconfig'
        config.write_text('[core]\n hooksPath = ' + str(hook_dir) + '\n autocrlf = true\n[commit]\n gpgSign = true\n')
        with patch.dict(os.environ, {'GIT_CONFIG_GLOBAL': str(config), 'GIT_DIR': '/invalid/repository', 'GIT_WORK_TREE': '/invalid/tree', 'GIT_CONFIG_COUNT': '1', 'GIT_CONFIG_KEY_0': 'commit.gpgSign', 'GIT_CONFIG_VALUE_0': 'true'}):
            head = self.revisions.ensure('p', '{}\r\n')
        self.assertFalse(marker.exists())
        self.assertEqual(self.revisions.read('p', head), '{}\r\n')
        subprocess.run(['git', '-C', str(self.root / 'repos/p'), 'config', 'core.hooksPath', str(hook_dir)], check=True)
        self.revisions.commit('p', '{"x":1}', 'Local hook still disabled')
        self.assertFalse(marker.exists())

    def test_threaded_commits_are_serialized_across_instances(self):
        self.revisions.ensure('p', '{}')
        def update(i):
            return Revisions(self.root).commit('p', json.dumps({'n': i}), f'Update {i}')
        with ThreadPoolExecutor(max_workers=4) as pool:
            commits = list(pool.map(update, range(8)))
        self.assertEqual(len(set(commits)), 8)
        self.assertEqual(len(self.revisions.history('p')), 9)

    def test_commit_does_not_include_unrelated_staged_files(self):
        self.revisions.ensure('p', '{}')
        repo = self.root / 'repos/p'
        (repo / 'unrelated.txt').write_text('not part of a world revision')
        subprocess.run(['git', '-C', str(repo), 'add', 'unrelated.txt'], check=True)
        self.revisions.commit('p', '{"edit":true}', 'World only')
        names = subprocess.run(['git', '-C', str(repo), 'ls-tree', '--name-only', 'HEAD'], check=True, capture_output=True, text=True).stdout
        self.assertEqual(names, 'world.json\n')


if __name__ == '__main__':
    unittest.main()
