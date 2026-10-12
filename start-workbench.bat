@echo off
cd /d "%~dp0"
set "PYTHONUTF8=1"
if exist ".venv\Scripts\python.exe" (
  ".venv\Scripts\python.exe" -m workbench.server %*
  pause
  exit /b
)
where py >nul 2>&1
if %errorlevel%==0 (
  py -3 -m workbench.server %*
) else (
  python -m workbench.server %*
)
pause
