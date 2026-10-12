param([int]$Port = 8765, [int]$TailscalePort = 8443)
$ErrorActionPreference = 'Stop'
Set-Location -LiteralPath $PSScriptRoot
$env:PYTHONUTF8 = '1'
$admin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
if (-not $admin) {
    Write-Host 'Requesting Administrator access for Tailscale Serve...'
    $arguments = @('-NoProfile','-ExecutionPolicy','Bypass','-File',('"' + $PSCommandPath + '"'),'-Port',$Port,'-TailscalePort',$TailscalePort)
    Start-Process powershell.exe -ArgumentList $arguments -Verb RunAs
    exit
}
if (Test-Path '.venv\Scripts\python.exe') { & '.\.venv\Scripts\python.exe' -m workbench.setup --check; if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }; & '.\.venv\Scripts\python.exe' -m workbench.server --port $Port --tailscale --tailscale-port $TailscalePort }
elseif (Get-Command py -ErrorAction SilentlyContinue) { & py -3 -m workbench.setup --check; if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }; & py -3 -m workbench.server --port $Port --tailscale --tailscale-port $TailscalePort }
else { & python -m workbench.setup --check; if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }; & python -m workbench.server --port $Port --tailscale --tailscale-port $TailscalePort }
