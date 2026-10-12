#!/usr/bin/env python3
"""Run native app instrumentation; optionally use and then remove a temporary CLI login."""
import argparse,subprocess,shlex
from pathlib import Path
p=argparse.ArgumentParser();p.add_argument('--with-agent',action='store_true');args=p.parse_args()
adb=str(Path.home()/'.local/share/voyage-android/sdk/platform-tools/adb');base=[adb,'-s','emulator-5556'];package='dev.voyage.workbench'
def run(*cmd,**kw):return subprocess.run(base+list(cmd),check=True,**kw)
run('install','-r','android/app/build/outputs/apk/debug/app-debug.apk')
run('install','-r','android/app/build/outputs/apk/androidTest/debug/app-debug-androidTest.apk')
if args.with_agent:
    run('shell',shlex.join(['run-as',package,'mkdir','-p','files/provider']))
    run('shell',shlex.join(['run-as',package,'sh','-c','umask 077; cat > files/provider/auth.json']),input=(Path.home()/'.codex/auth.json').read_bytes())
try:run('shell','am','instrument','-w','-e','class','dev.voyage.workbench.WorkbenchTest',package+'.test/androidx.test.runner.AndroidJUnitRunner')
finally:
    if args.with_agent:run('shell',shlex.join(['run-as',package,'rm','-f','files/provider/auth.json']))
