#!/usr/bin/env python3
"""Fault-inject the disposable app using its own UID; never adb root or permissive SELinux."""
import argparse
import json
import os
from pathlib import Path
import subprocess
import time

PACKAGE = 'dev.voyage.runtimeprobe'


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--serial', default='emulator-5556')
    args = parser.parse_args()
    root = Path(os.environ.get('VOYAGE_ANDROID_TOOLS', Path.home()/'.local/share/voyage-android'))
    adb = [str(root/'sdk/platform-tools/adb'),'-s',args.serial]

    def run(*command, check=True):
        return subprocess.run(adb+list(command),capture_output=True,text=True,check=check).stdout.strip()

    def report():
        try: return json.loads(run('shell','run-as',PACKAGE,'cat','files/service-report.json'))
        except (subprocess.CalledProcessError,ValueError): return None

    def wait(predicate, timeout=15):
        end=time.monotonic()+timeout
        while time.monotonic()<end:
            value=report()
            if value and predicate(value): return value
            time.sleep(0.3)
        raise AssertionError('Timed out; last report: '+str(report()))

    def start(mode):
        run('shell','run-as',PACKAGE,'rm','-f','files/service-report.json')
        run('shell','am','start','--activity-clear-top','-n',PACKAGE+'/.MainActivity','--es','mode',mode)

    results=[]
    run('shell','pm','grant',PACKAGE,'android.permission.POST_NOTIFICATIONS')
    run('shell','am','force-stop',PACKAGE)
    start('reset-fixture'); wait(lambda v:v['state']=='IDLE')
    start('hold'); first=wait(lambda v:v['state']=='RUNNING' and int(v['heartbeat'])>=2)
    ui=run('shell','pidof',PACKAGE).split()[0]
    service=run('shell','pidof',PACKAGE+':agent').split()[0]
    assert ui != service
    run('shell','run-as',PACKAGE,'kill','-9',ui)
    after=wait(lambda v:int(v['heartbeat'])>int(first['heartbeat'])+1)
    assert service in run('shell','pidof',PACKAGE+':agent').split()
    results.append({'test':'UI process death leaves agent service working','passed':True,'before':first['heartbeat'],'after':after['heartbeat']})

    run('shell','run-as',PACKAGE,'kill','-9',service)
    start('recover'); recovered=wait(lambda v:v['state']=='INTERRUPTED')
    assert recovered['activeUnchanged'] and recovered['largeIntegerPreserved']
    results.append({'test':'Agent process death recovers as INTERRUPTED without replay','passed':True,'report':recovered})

    start('hold'); wait(lambda v:v['state']=='RUNNING' and int(v['heartbeat'])>=2)
    run('shell','am','force-stop',PACKAGE)
    time.sleep(2)
    assert not run('shell','pidof',PACKAGE+':agent',check=False)
    start('recover'); recovered=wait(lambda v:v['state']=='INTERRUPTED')
    results.append({'test':'Force-stop stays stopped until explicit reopen; recovery preserves world','passed':True,'report':recovered})

    start('hold'); wait(lambda v:v['state']=='RUNNING' and int(v['heartbeat'])>=2)
    start('stop'); stopped=wait(lambda v:v['state']=='CANCELED')
    results.append({'test':'User stop journals CANCELED','passed':True,'report':stopped})

    start('candidate-fixture'); proposal=wait(lambda v:v['state']=='PROPOSAL_READY')
    assert proposal['activeUnchanged'] and proposal['candidatePresent']
    start('edit-fixture'); edited=wait(lambda v:not v['activeUnchanged'])
    start('accept'); conflict=wait(lambda v:v['state']=='FAILED')
    assert conflict['activeHash']==edited['activeHash']
    results.append({'test':'Stale proposal cannot overwrite a newer manual edit','passed':True,'report':conflict})

    start('reset-fixture'); wait(lambda v:v['state']=='IDLE')
    start('candidate-fixture'); wait(lambda v:v['state']=='PROPOSAL_READY')
    run('shell','am','force-stop',PACKAGE)
    start('accept'); accepted=wait(lambda v:v['state']=='ACCEPTED')
    assert accepted['largeIntegerPreserved'] and not accepted['activeUnchanged']
    results.append({'test':'Candidate survives restart; explicit acceptance preserves numeric token','passed':True,'report':accepted})

    result={'androidRelease':run('shell','getprop','ro.build.version.release'),'api':run('shell','getprop','ro.build.version.sdk'),
            'abi':run('shell','getprop','ro.product.cpu.abi'),'selinux':run('shell','getenforce'),'tests':results}
    print(json.dumps(result,indent=2))


if __name__=='__main__': main()
