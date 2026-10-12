#!/usr/bin/env bash
set -euo pipefail
cd -- "$(dirname -- "$0")"

if [[ ${1:-} == --check ]]; then
  if ! command -v python3 >/dev/null 2>&1; then printf 'Python 3.10+ is missing. Run this installer without --check to install it.\n' >&2; exit 1; fi
  if [[ -x .venv/bin/python ]]; then .venv/bin/python -m workbench.setup --check
  else python3 -m workbench.setup --check; fi
  exit
fi

need_install=()
command -v python3 >/dev/null 2>&1 || need_install+=(python3)
command -v git >/dev/null 2>&1 || need_install+=(git)
command -v curl >/dev/null 2>&1 || need_install+=(curl)
if (( ${#need_install[@]} )); then
  printf 'Installing missing system packages: %s\n' "${need_install[*]}"
  if command -v apt-get >/dev/null 2>&1; then sudo apt-get update && sudo apt-get install -y "${need_install[@]}"
  elif command -v dnf >/dev/null 2>&1; then sudo dnf install -y "${need_install[@]}"
  elif command -v pacman >/dev/null 2>&1; then sudo pacman -S --needed "${need_install[@]}"
  elif command -v zypper >/dev/null 2>&1; then sudo zypper install -y "${need_install[@]}"
  else printf 'Install Python 3.10+, Git, and curl with your distribution package manager.\n' >&2; exit 1
  fi
fi

python3 - <<'PY'
import sys
if sys.version_info < (3, 10):
    raise SystemExit('Python 3.10+ is required; install a newer Python and rerun this script.')
PY

if [[ ! -x .venv/bin/python ]]; then
  if ! python3 -m venv .venv; then
    if command -v apt-get >/dev/null 2>&1; then
      sudo apt-get install -y python3-venv
      python3 -m venv .venv
    else
      printf 'Install the Python venv/ensurepip package for your distribution, then rerun this installer.\n' >&2
      exit 1
    fi
  fi
fi
.venv/bin/python -m pip install -r requirements.txt

if ! command -v tailscale >/dev/null 2>&1; then
  printf 'Installing Tailscale from its official installer.\n'
  if command -v pacman >/dev/null 2>&1; then sudo pacman -S --needed tailscale
  else
    installer=$(mktemp)
    trap 'rm -f "$installer"' EXIT
    curl -fsSL https://tailscale.com/install.sh -o "$installer"
    sh "$installer"
    rm -f "$installer"
    trap - EXIT
  fi
fi

if ! command -v codex >/dev/null 2>&1 && [[ ! -x "$HOME/.local/bin/codex" ]]; then
  printf 'Installing Codex CLI from its official standalone installer.\n'
  installer=$(mktemp)
  trap 'rm -f "$installer"' EXIT
  curl -fsSL https://chatgpt.com/codex/install.sh -o "$installer"
  sh "$installer"
  rm -f "$installer"
  trap - EXIT
fi
export PATH="$HOME/.local/bin:$PATH"
.venv/bin/python -m workbench.setup --codex --tailscale
printf '\nInstallation is ready. Run ./start-workbench-tailnet.sh\n'
