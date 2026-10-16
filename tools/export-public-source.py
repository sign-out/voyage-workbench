"""Export an audited source-only snapshot without modifying the workspace index."""
import argparse
import hashlib
from pathlib import Path
import shutil
import subprocess

ROOT = Path(__file__).resolve().parents[1]
EXCLUDED = {'index(1).html', 'LC_v6_9_2_TIME_COMMAND_HARDENING.json',
            'Voyage_Workbench_Prototype.html', 'voyage-creator-api-agent-specification(1).md',
            'android/app/src/main/assets/core-native.js'}


def export(destination):
    if destination.exists():
        raise ValueError('Snapshot destination already exists')
    files = sorted(set(subprocess.check_output(
        ['git', 'ls-files', '--cached', '--others', '--exclude-standard'], cwd=ROOT, text=True).splitlines()))
    destination.mkdir(mode=0o700, parents=True)
    copied = []
    for relative in files:
        source = ROOT / relative
        ignored = subprocess.run(['git', 'check-ignore', '--no-index', '-q', '--', relative], cwd=ROOT).returncode == 0
        if ignored or source.is_symlink() or not source.is_file() or relative in EXCLUDED:
            continue
        if relative.startswith(('docs/evidence/', 'docs/showcase/', 'docs/voyage-workbench-showcase', 'releases/')):
            continue
        if source.suffix.lower() in {'.zip', '.apk', '.exe', '.pfx', '.p12', '.keystore', '.jks', '.db', '.sqlite', '.log'}:
            continue
        target = destination / relative
        target.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(source, target)
        copied.append(relative)
    for relative in copied:
        for attempt in range(3):
            before = hashlib.sha256((ROOT / relative).read_bytes()).digest()
            if hashlib.sha256((destination / relative).read_bytes()).digest() == before:
                break
            shutil.copy2(ROOT / relative, destination / relative)
        else:
            raise ValueError('Source is actively changing; retry snapshot export later: ' + relative)
    print('Exported source-only snapshot: ' + str(destination) + ' (' + str(len(copied)) + ' files). Review and scan before publication.')


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('destination', type=Path)
    export(parser.parse_args().destination)
