#!/usr/bin/env python3
"""One real subscription-backed Codex turn against a synthetic, staged world."""
import argparse
import hashlib
import json
import os
from pathlib import Path
import shutil
import sys
import tempfile
import threading

REPO = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(REPO))
from workbench.codex_rpc import CodexSession


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--codex', type=Path, required=True)
    args = parser.parse_args()
    base = '{"title":"Android runtime fixture","counter":9007199254740993,"unknown":{"keep":"unchanged"}}'
    with tempfile.TemporaryDirectory(prefix='voyage-desktop-smoke-') as name:
        root = Path(name)
        home = root / 'provider'; home.mkdir(mode=0o700)
        auth = Path(os.environ.get('CODEX_HOME', Path.home() / '.codex')) / 'auth.json'
        if not auth.is_file(): raise RuntimeError('Sign into the local Codex CLI first')
        shutil.copyfile(auth, home / 'auth.json'); (home / 'auth.json').chmod(0o600)
        task = root / 'task'; task.mkdir()
        (task / 'world.json').write_text(base)
        candidate = None
        calls = []

        def call(tool, arguments):
            nonlocal candidate
            if tool != 'world_set_title' or arguments != {'title':'Android runtime verified'}:
                raise ValueError('Request outside Work Order')
            candidate = base.replace('Android runtime fixture', arguments['title'])
            calls.append(tool)
            return {'staged':True, 'activeUnchanged':True}

        class Session(CodexSession):
            def _command(self):
                command = super()._command()
                command[0] = str(args.codex.resolve())
                return command

            def _environment(self):
                return dict(super()._environment(), CODEX_HOME=str(home))

        os.environ['PATH'] = str(args.codex.resolve().parent) + os.pathsep + os.environ['PATH']
        session = Session(task, [{'name':'world_set_title', 'description':'Stage the approved title in the candidate world.',
            'inputSchema':{'type':'object','properties':{'title':{'type':'string'}},'required':['title'],'additionalProperties':False}}],
            'Use world_set_title for this synthetic fixture. No other actions are needed. Preserve all unrelated data.', on_tool=call, timeout=180)
        result = session.run('Approved Work Order: set the candidate title to exactly Android runtime verified using world_set_title, then briefly confirm.', threading.Event())
        report = {'status':result['status'], 'toolCalls':calls, 'activeUnchanged':(task/'world.json').read_text()==base,
                  'candidateProduced':candidate is not None, 'largeIntegerPreserved':candidate is not None and '9007199254740993' in candidate,
                  'baseHash':hashlib.sha256(base.encode()).hexdigest(), 'response':result['text'], 'error':result.get('error')}
        print(json.dumps(report,indent=2))
        if result['status'] != 'completed' or not candidate or not report['activeUnchanged']: raise SystemExit(1)


if __name__ == '__main__': main()
