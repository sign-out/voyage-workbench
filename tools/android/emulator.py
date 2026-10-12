#!/usr/bin/env python3
"""Start/stop only Voyage's Android 16 lab emulator, with a bounded resource budget."""
import argparse
import os
from pathlib import Path
import subprocess
import time

NAME = 'voyage-api36'
SERIAL = 'emulator-5556'


def main():
    parser=argparse.ArgumentParser()
    parser.add_argument('action',choices=['start','stop','status'])
    parser.add_argument('--window',action='store_true')
    args=parser.parse_args()
    root=Path(os.environ.get('VOYAGE_ANDROID_TOOLS',Path.home()/'.local/share/voyage-android'))
    sdk=root/'sdk'; jdk=root/'jdk'
    env=dict(os.environ,JAVA_HOME=str(jdk),ANDROID_HOME=str(sdk))
    adb=[str(sdk/'platform-tools/adb'),'-s',SERIAL]
    current=subprocess.run(adb+['emu','avd','name'],capture_output=True,text=True)
    attached=current.returncode==0
    if attached and current.stdout.splitlines()[0]!=NAME:
        raise SystemExit('Port 5556 belongs to another AVD; leaving it alone.')
    if args.action=='status':
        print('Running '+NAME if attached else NAME+' is stopped');return
    if args.action=='stop':
        if attached: subprocess.run(adb+['emu','kill'],check=True)
        return
    if not attached:
        listing=subprocess.check_output([str(sdk/'emulator/emulator'),'-list-avds'],text=True)
        if NAME not in listing.splitlines():
            subprocess.run([str(sdk/'cmdline-tools/latest/bin/avdmanager'),'create','avd','-n',NAME,
                '-k','system-images;android-36;default;x86_64','--device','pixel_6'],input='no\n',text=True,env=env,check=True)
        subprocess.run([str(sdk/'emulator/emulator'),'-accel-check'],check=True)
        command=[str(sdk/'emulator/emulator'),'-avd',NAME,'-no-audio','-no-boot-anim','-no-snapshot','-gpu','software','-memory','2048','-cores','2','-port','5556']
        if not args.window: command.append('-no-window')
        with (root/'emulator.log').open('ab') as log:
            subprocess.Popen(command,stdout=log,stderr=subprocess.STDOUT,env=env,start_new_session=True)
    end=time.monotonic()+180
    while time.monotonic()<end:
        result=subprocess.run(adb+['shell','getprop','sys.boot_completed'],capture_output=True,text=True)
        if result.stdout.strip()=='1':
            print(NAME+' booted on '+SERIAL);return
        time.sleep(1)
    raise SystemExit('Emulator has not booted within 180 seconds. Inspect '+str(root/'emulator.log'))


if __name__=='__main__': main()
