import base64
import io
import json
from pathlib import Path
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
DIRECTORY = ROOT / 'docs/showcase'
features = json.loads((DIRECTORY / 'features.json').read_text())
screens = {}
for platform in ['mobile', 'desktop']:
    for feature in features:
        for identifier, title in [[feature['id'], 'Tool overview'], *feature['extras']]:
            file = DIRECTORY / f'{platform}-{identifier}.png'
            if not file.exists():
                if identifier == feature['id']:
                    raise RuntimeError(f'Missing required actual-app screenshot: {file}')
                continue
            image = Image.open(file).convert('RGB')
            encoded = io.BytesIO()
            image.save(encoded, 'WEBP', quality=90, method=6)
            screens[f'{platform}-{identifier}'] = {'src': 'data:image/webp;base64,' + base64.b64encode(encoded.getvalue()).decode(), 'width': image.width, 'height': image.height}

template = (DIRECTORY / 'template.html').read_text()
page = template.replace('__FEATURE_DATA__', json.dumps(features, ensure_ascii=False).replace('</', '<\\/')).replace('__SCREEN_DATA__', json.dumps(screens))
destination = ROOT / 'docs/voyage-workbench-showcase.html'
destination.write_text(page)
print(f'{destination}: {len(features)} tools × 2 platforms, {len(screens)} embedded screenshots, {destination.stat().st_size / 1024 / 1024:.1f} MiB')
