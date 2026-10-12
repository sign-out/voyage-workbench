"""Explicit private Tailscale Serve registration for the loopback workbench."""
import json
import os
from pathlib import Path
import shutil
import subprocess
from urllib.parse import urlsplit


def origin(value):
    parsed=urlsplit(value)
    if parsed.scheme!='https' or not parsed.hostname or not parsed.hostname.endswith('.ts.net') or parsed.username or parsed.password or parsed.path not in ('','/') or parsed.query or parsed.fragment:
        raise ValueError('Tailscale origin must be an HTTPS .ts.net hostname, with an optional port')
    port=parsed.port
    return 'https://'+parsed.hostname+((':'+str(port)) if port and port!=443 else '')


def binary():
    found=shutil.which('tailscale')
    if found:return found
    if os.name=='nt':
        for root in (os.environ.get('ProgramFiles'),os.environ.get('ProgramFiles(x86)')):
            if root:
                path=Path(root)/'Tailscale'/'tailscale.exe'
                if path.is_file():return str(path)
    return None


def status():
    return json.loads(command('status','--json'))


def command(*args):
    try:
        executable=binary()
        if not executable:raise ValueError('Install Tailscale before enabling tailnet access')
        result=subprocess.run([executable,*args],capture_output=True,text=True,encoding='utf-8',errors='replace',timeout=20)
    except FileNotFoundError as exc:
        raise ValueError('Install Tailscale before enabling tailnet access') from exc
    except subprocess.TimeoutExpired as exc:
        raise ValueError('Tailscale timed out; check tailscale status and HTTPS setup') from exc
    if result.returncode:
        raise ValueError((result.stderr or result.stdout).strip() or 'Tailscale command failed')
    return result.stdout


def register(local_port,https_port=8443):
    status=json.loads(command('status','--json'))
    if status.get('BackendState')!='Running':
        raise ValueError('Tailscale is not connected. Start tailscaled and run tailscale up first.')
    dns=status.get('Self',{}).get('DNSName','').rstrip('.')
    public=origin('https://'+dns+(':'+str(https_port) if https_port!=443 else ''))
    target='http://127.0.0.1:'+str(local_port)
    existing=json.loads(command('serve','status','--json') or '{}')
    port_config=existing.get('TCP',{}).get(str(https_port))
    host=urlsplit(public).hostname+':'+str(https_port)
    web=existing.get('Web',{}).get(host,{})
    if existing.get('AllowFunnel',{}).get(host):
        raise ValueError('This port has public Funnel access. Choose a different private HTTPS port.')
    if port_config or web:
        handlers=web.get('Handlers',{})
        if port_config!={'HTTPS':True} or handlers!={'/':{'Proxy':target}}:
            raise ValueError('Tailscale port is already used by another service; choose --tailscale-port with a free port')
    output=command('serve','--bg','--https='+str(https_port),target)
    registered=json.loads(command('serve','status','--json') or '{}')
    if (registered.get('TCP',{}).get(str(https_port))!={'HTTPS':True} or
        registered.get('Web',{}).get(host,{}).get('Handlers',{}).get('/')!={'Proxy':target} or
        registered.get('AllowFunnel',{}).get(host)):
        raise ValueError('Tailscale Serve did not register its private HTTPS endpoint. '+output.strip())
    return public
