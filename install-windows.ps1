param([switch]$Check)
$ErrorActionPreference = 'Stop'
Set-Location -LiteralPath $PSScriptRoot

function Refresh-Path {
    $env:Path = [Environment]::GetEnvironmentVariable('Path','Machine') + ';' + [Environment]::GetEnvironmentVariable('Path','User') + ';' + $env:Path
}
function Require-Command($name) {
    if (-not (Get-Command $name -ErrorAction SilentlyContinue)) { throw "$name is unavailable after installation. Open a new PowerShell window and rerun this script." }
}
function Install-IfMissing($command, $package) {
    if (-not (Get-Command $command -ErrorAction SilentlyContinue)) {
        Write-Host "Installing $package through winget..."
        & winget install --id $package --exact --accept-source-agreements --accept-package-agreements
        if ($LASTEXITCODE -ne 0) { throw "Could not install $package" }
        Refresh-Path
    }
}
function Test-PythonVersion([string]$command, [string[]]$versionArgs) {
    try {
        & $command @versionArgs -c 'import sys; sys.exit(0 if sys.version_info >= (3, 10) else 1)' *> $null
        return $LASTEXITCODE -eq 0
    } catch { return $false }
}
function Find-SupportedPython {
    if (Get-Command py -ErrorAction SilentlyContinue) {
        if (Test-PythonVersion 'py' @('-3.14')) { return @{ Command = 'py'; Args = @('-3.14') } }
        if (Test-PythonVersion 'py' @('-3')) { return @{ Command = 'py'; Args = @('-3') } }
    }
    if ((Get-Command python -ErrorAction SilentlyContinue) -and (Test-PythonVersion 'python' @())) {
        return @{ Command = 'python'; Args = @() }
    }
    return $null
}

if (-not $Check) {
    $admin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
    if (-not $admin) {
        Write-Host 'Requesting Administrator access for package installation and Tailscale Serve setup...'
        $arguments = @('-NoProfile','-ExecutionPolicy','Bypass','-File',('"' + $PSCommandPath + '"'))
        $process = Start-Process powershell.exe -ArgumentList $arguments -Verb RunAs -Wait -PassThru
        exit $process.ExitCode
    }
}

if ($Check) {
    if (Test-Path '.venv\Scripts\python.exe') {
        & '.\.venv\Scripts\python.exe' -m workbench.setup --check
        exit $LASTEXITCODE
    }
    $python = Find-SupportedPython
    if (-not $python) { Write-Host 'Python 3.10+ is missing.'; exit 1 }
    $pythonCommand = $python.Command
    $pythonArgs = $python.Args
    & $pythonCommand @pythonArgs -m workbench.setup --check
    exit $LASTEXITCODE
}

Require-Command winget
Install-IfMissing git 'Git.Git'
if (-not (Find-SupportedPython)) {
    Write-Host 'Installing a supported Python version through winget...'
    & winget install --id 'Python.Python.3.14' --exact --accept-source-agreements --accept-package-agreements
    if ($LASTEXITCODE -ne 0) { throw 'Could not install Python 3.14' }
    Refresh-Path
}
Install-IfMissing node 'OpenJS.NodeJS.LTS'
if (-not (Get-Command tailscale -ErrorAction SilentlyContinue) -and -not (Test-Path (Join-Path $env:ProgramFiles 'Tailscale\tailscale.exe'))) { Install-IfMissing tailscale 'Tailscale.Tailscale' }
Refresh-Path
if (-not (Get-Command codex -ErrorAction SilentlyContinue)) {
    Write-Host 'Installing Codex CLI from its official npm package...'
    & npm.cmd install -g '@openai/codex'
    if ($LASTEXITCODE -ne 0) { throw 'Could not install Codex CLI' }
    Refresh-Path
}
Require-Command git
$python = Find-SupportedPython
if (-not $python) { throw 'Python 3.10+ is unavailable after installation. Open a new PowerShell window and rerun this script.' }
$pythonCommand = $python.Command
$pythonArgs = $python.Args
if (-not (Test-Path '.venv\Scripts\python.exe')) {
    & $pythonCommand @pythonArgs -m venv .venv
    if ($LASTEXITCODE -ne 0) { throw 'Could not prepare the project Python environment' }
}
& '.\.venv\Scripts\python.exe' -m pip install -r requirements.txt
if ($LASTEXITCODE -ne 0) { throw 'Could not install local image processing dependencies' }
Write-Host 'Checking Codex and Tailscale sign-in. Follow their browser prompts when shown.'
& '.\.venv\Scripts\python.exe' -m workbench.setup --codex --tailscale
if ($LASTEXITCODE -ne 0) { throw 'Environment setup did not complete' }
Write-Host 'Installation is ready. Run .\start-workbench-tailnet.ps1'
