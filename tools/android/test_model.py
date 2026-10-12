#!/usr/bin/env python3
"""Exercise one synthetic Android Codex task using a temporary private auth copy.

Requires an already signed-in local Codex CLI. Credentials are never printed or
stored in the repository. The app and this runner both clean the temporary copy.
"""
import argparse
import json
import os
from pathlib import Path
import shlex
import subprocess
import time

PACKAGE = 'dev.voyage.runtimeprobe'


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--serial', default='emulator-5556')
    parser.add_argument('--mode', choices=['model','proot-model'], default='proot-model')
    args = parser.parse_args()
    root = Path(os.environ.get('VOYAGE_ANDROID_TOOLS', Path.home()/'.local/share/voyage-android'))
    adb = [str(root/'sdk/platform-tools/adb'),'-s',args.serial]
    evidence = Path(__file__).resolve().parents[2]/'.android-lab/evidence'
    evidence.mkdir(parents=True,exist_ok=True)

    def shell(*command, **kwargs):
        return subprocess.run(adb+['shell',shlex.join(command)],capture_output=True,check=True,**kwargs)

    def start(mode):
        shell('run-as',PACKAGE,'rm','-f','files/service-report.json')
        shell('am','start','--activity-clear-top','-n',PACKAGE+'/.MainActivity','--es','mode',mode)

    def poll(seconds):
        end=time.monotonic()+seconds
        while time.monotonic()<end:
            try:
                return json.loads(shell('run-as',PACKAGE,'cat','files/service-report.json').stdout)
            except subprocess.CalledProcessError:
                time.sleep(.5)
        raise TimeoutError('Android task did not produce a final report')

    shell('pm','grant',PACKAGE,'android.permission.POST_NOTIFICATIONS')
    start('reset-fixture'); poll(15)
    auth=Path(os.environ.get('CODEX_HOME',Path.home()/'.codex'))/'auth.json'
    shell('run-as',PACKAGE,'mkdir','-p','files/provider')
    try:
        shell('run-as',PACKAGE,'sh','-c','umask 077; cat > files/provider/auth.json',input=auth.read_bytes())
        start(args.mode)
        result=poll(250)
        (evidence/'android-model.json').write_text(json.dumps(result,indent=2)+'\n')
        print(json.dumps(result,indent=2),flush=True)
        if result['state']!='PROPOSAL_READY' or not result['activeUnchanged'] or not result['candidatePresent']:
            raise SystemExit(1)
    finally:
        shell('run-as',PACKAGE,'rm','-f','files/provider/auth.json')
        log=shell('run-as',PACKAGE,'cat','files/provider-stderr.log').stdout
        (evidence/'android-model-stderr.log').write_bytes(log)


if __name__=='__main__': main()
