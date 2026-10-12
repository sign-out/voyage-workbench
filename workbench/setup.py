"""Portable interactive readiness checks for local Voyage Workbench installs."""
import argparse
import json
import os
from pathlib import Path
import shutil
import subprocess
import sys
from . import tailnet

MIN_PYTHON=(3,10)


def codex_binary():
    found=shutil.which('codex')
    if found:return found
    if os.name=='nt':
        for path in (Path(os.environ.get('APPDATA',''))/'npm'/'codex.cmd', Path(os.environ.get('ProgramFiles',''))/'nodejs'/'codex.cmd'):
            if path.is_file():return str(path)
    else:
        path=Path.home()/'.local'/'bin'/'codex'
        if path.is_file():return str(path)
    return None


def status_message():
    lines=[]
    lines.append('Python '+sys.version.split()[0]+(' OK' if sys.version_info>=MIN_PYTHON else ' requires 3.10 or newer'))
    for label,executable in [('Git',shutil.which('git')),('Codex CLI',codex_binary()),('Tailscale',tailnet.binary())]:
        lines.append(label+': '+(executable or 'missing'))
    try:
        from PIL import Image
        lines.append('Local image slicing: Pillow ready')
    except ImportError:
        lines.append('Local image slicing: '+('ImageMagick ready' if shutil.which('magick') else 'missing; rerun the installer to prepare Pillow'))
    try:
        state=tailnet.status()
        lines.append('Tailscale connection: '+state.get('BackendState','unavailable'))
    except ValueError as exc:
        lines.append('Tailscale connection: '+str(exc))
    return '\n'.join(lines)


def ensure_codex_login():
    binary=codex_binary()
    if not binary:raise ValueError('Install the Codex CLI first, then rerun the setup script')
    if subprocess.run([binary,'login','status'],stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL,timeout=15).returncode==0:
        print('Codex is signed in.',flush=True);return
    if not sys.stdin.isatty():raise ValueError('Codex sign-in is required. Run codex login from an interactive terminal.')
    print('Codex needs a sign-in. Complete the browser or device prompt shown next.',flush=True)
    if subprocess.run([binary,'login'],timeout=600).returncode:
        raise ValueError('Codex sign-in did not complete')


def ensure_tailnet():
    if not tailnet.binary():raise ValueError('Install Tailscale first, then rerun the setup script')
    try:
        state=tailnet.status()
    except ValueError:
        state={}
    if state.get('BackendState')=='Running' and state.get('Self',{}).get('DNSName'):
        if os.name!='nt':
            try:tailnet.command('serve','status','--json')
            except ValueError as exc:
                if 'access denied' not in str(exc).lower():raise
                user=os.environ.get('USER')
                if not user:raise ValueError('USER is not set; configure a Tailscale operator')
                print('Granting this user Tailscale Serve access; sudo may ask for your password.',flush=True)
                if subprocess.run(['sudo',tailnet.binary(),'set','--operator='+user],timeout=60).returncode:
                    raise ValueError('Could not grant Tailscale operator access')
        print('Tailscale is connected to '+state['Self']['DNSName'].rstrip('.'),flush=True)
        return state
    if not sys.stdin.isatty():
        raise ValueError('Tailscale needs interactive sign-in. Run the installer or tailscale up in a terminal.')
    if os.name!='nt' and shutil.which('systemctl'):
        print('Starting the Tailscale system service; sudo may ask for your password.',flush=True)
        if subprocess.run(['sudo','systemctl','enable','--now','tailscaled'],timeout=60).returncode:
            raise ValueError('Could not start tailscaled; check the service installation')
    print('Tailscale sign-in is needed. Open the login URL printed by tailscale up, finish in your browser, then return here.',flush=True)
    if os.name=='nt':
        command=[tailnet.binary(),'up']
    else:
        command=['sudo',tailnet.binary(),'up']
    if subprocess.run(command,timeout=600).returncode:
        raise ValueError('Tailscale sign-in did not complete')
    for attempt in range(3):
        state=tailnet.status()
        if state.get('BackendState')=='Running' and state.get('Self',{}).get('DNSName'):
            break
        input('Finish Tailscale sign-in in the browser, then press Enter to check again: ')
    else:
        raise ValueError('Tailscale is still not connected. Run tailscale status and retry setup.')
    if os.name!='nt':
        user=os.environ.get('USER')
        if not user:raise ValueError('USER is not set; run sudo tailscale set --operator=<your-user>')
        print('Allowing the current user to register its private Tailscale Serve endpoint.',flush=True)
        if subprocess.run(['sudo',tailnet.binary(),'set','--operator='+user],timeout=60).returncode:
            raise ValueError('Could not grant the current user Tailscale operator access')
    print('Tailscale is connected to '+state['Self']['DNSName'].rstrip('.'),flush=True)
    return state


def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--check',action='store_true',help='Check dependencies without modifying the system')
    parser.add_argument('--tailscale',action='store_true',help='Guide Tailscale sign-in and private access')
    parser.add_argument('--codex',action='store_true',help='Guide Codex CLI sign-in')
    args=parser.parse_args()
    print(status_message(),flush=True)
    if sys.version_info<MIN_PYTHON:parser.error('Python 3.10 or newer is required')
    if not shutil.which('git'):parser.error('Git is required for project revision history')
    if args.check:return
    try:
        if args.codex:ensure_codex_login()
        if args.tailscale:ensure_tailnet()
    except (ValueError,subprocess.TimeoutExpired) as exc:
        parser.error(str(exc))
    print('Environment ready. Start the builder with the platform launcher.',flush=True)

if __name__=='__main__':main()
