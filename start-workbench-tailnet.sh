#!/usr/bin/env sh
set -eu
cd "$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)"
task_python=python3
if [ -x .venv/bin/python ]; then task_python=.venv/bin/python; fi
"$task_python" -m workbench.setup --check
exec "$task_python" -m workbench.server --tailscale "$@"
