import json
import os
import re
import subprocess
import time
import xml.etree.ElementTree as ET
from pathlib import Path

DEVICE = 'R5CY40AMQ7N'
OUTPUT = Path('docs/showcase')
TOOLS = ['World', 'Map', 'Characters', 'Mod overlays', 'Changes', 'Validation', 'Planning', 'Proposals', 'Artwork', 'Asset library', 'Music', 'Mechanics & AI', 'Publish', 'Base template', 'History', 'Models & agents', 'Voyage sync', 'Connection', 'World tools', 'Settings']


def adb(*args):
    return subprocess.check_output(['adb', '-s', DEVICE, *args])


def nodes():
    adb('shell', 'uiautomator', 'dump', '/sdcard/voyage-showcase-ui.xml')
    return list(ET.fromstring(adb('shell', 'cat', '/sdcard/voyage-showcase-ui.xml')).iter('node'))


def tap(label, scroll=False):
    for attempt in range(12 if scroll else 1):
        for node in nodes():
            if label in [node.get('text'), node.get('content-desc')]:
                bounds = list(map(int, re.findall(r'\d+', node.get('bounds'))))
                left, top, right, bottom = bounds
                limit = 2200 if label == 'All tools' else 1940
                if right > left and top >= 250 and bottom > top and bottom <= limit:
                    adb('shell', 'input', 'tap', str((left + right) // 2), str((top + bottom) // 2))
                    time.sleep(.5)
                    return
        if scroll:
            adb('shell', 'input', 'swipe', '540', '1840', '540', '850', '450')
    raise RuntimeError('Could not find visible control: ' + label)


def capture(identifier):
    time.sleep(.6)
    (OUTPUT / ('mobile-' + identifier + '.png')).write_bytes(adb('exec-out', 'screencap', '-p'))
    content = [{'text': node.get('text'), 'description': node.get('content-desc')} for node in nodes() if node.get('text') or node.get('content-desc')]
    (OUTPUT / ('mobile-' + identifier + '.json')).write_text(json.dumps(content, indent=2))


if __name__ == '__main__':
    OUTPUT.mkdir(parents=True, exist_ok=True)
    start = int(os.environ.get('SHOWCASE_START', '0'))
    for index, name in enumerate(TOOLS[start:], start):
        tap('All tools')
        tap(name, scroll=True)
        identifier = str(index + 1).zfill(2)
        capture(identifier)
        print('Captured native', name, flush=True)
        if name == 'World':
            tap('Open editor')
            capture('world-form')
            tap('Switch to JSON view')
            capture('world-json')
            tap('Switch to Form view')
        if name == 'World tools':
            for extra, label in [('impact', 'Reference impact'), ('inventory', 'Asset inventory'), ('batch', 'Batch edit')]:
                tap(label, scroll=True)
                capture(extra)
