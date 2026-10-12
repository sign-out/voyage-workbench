"""Lossless editing of Voyage mod references, without flattening applied content."""
import json

from . import document


def _world(text):
    root = document.parse(text)
    if not isinstance(root, dict):
        raise ValueError('World JSON must be an object.')
    if isinstance(root.get('data'), dict) and isinstance(root['data'].get('world'), dict):
        return root['data']['world'], ['data', 'world']
    if isinstance(root.get('world'), dict):
        return root['world'], ['world']
    return root, []


def references(text):
    world, path = _world(text)
    mods = json.loads(document.section(text, path + ['mods'])) if 'mods' in world else []
    if not isinstance(mods, list):
        raise ValueError('World mods must be an array.')
    seen = set()
    for index, mod in enumerate(mods):
        if not isinstance(mod, dict):
            raise ValueError(f'Mod {index + 1} must be an object.')
        sid = mod.get('shortId')
        version = mod.get('version')
        if not isinstance(sid, str) or not sid.strip() or sid != sid.strip():
            raise ValueError(f'Mod {index + 1} needs a nonempty shortId.')
        if sid in seen:
            raise ValueError(f'Mod {sid} occurs more than once.')
        if version is not None and (type(version) is not int or version < 1):
            raise ValueError(f'Mod {sid} version must be a positive integer or null.')
        seen.add(sid)
    return mods


def export(text, selected=None):
    """Return the original document with only its mod reference list changed."""
    existing = references(text)
    if selected is None:
        selected = existing
    if not isinstance(selected, list):
        raise ValueError('Selected mods must be an array.')
    # Validate the proposed stack independently of the current one.
    references('{"mods":' + json.dumps(selected, ensure_ascii=True) + '}')
    if selected == existing:
        return text
    world, path = _world(text)
    value = json.dumps(selected, ensure_ascii=True, separators=(',', ':'))
    if 'mods' in world:
        return document.replace(text, path + ['mods'], value)
    return document.mutate(text, path, 'add', 'mods', value)


def catalog(payload):
    """Reduce the Creator API mod sets to safe display metadata."""
    data = payload.get('data', payload) if isinstance(payload, dict) else {}
    if not isinstance(data, dict):
        return []
    result = {}
    for bucket in ('myMods', 'bookmarkedMods', 'pendingModsMetadata', 'remixSourceMetadata'):
        items = data.get(bucket, [])
        if isinstance(items, dict):
            items = list(items.values())
        if not isinstance(items, list):
            continue
        for item in items:
            if not isinstance(item, dict):
                continue
            record = next((item[key] for key in ('world', 'mod', 'metadata') if isinstance(item.get(key), dict)), item)
            sid = record.get('shortId') or item.get('shortId')
            if not isinstance(sid, str) or not sid:
                continue
            label = next((record.get(k) for k in ('title', 'name', 'displayName') if isinstance(record.get(k), str) and record[k]), sid)
            result[sid] = {'shortId': sid, 'title': label, 'source': bucket,
                           'description': record.get('description', '') if isinstance(record.get('description'), str) else ''}
    return list(result.values())


def attachment(text, short_id='', filename='mod.json'):
    """Inspect a local mod file; do not infer that its contents are reversible."""
    root = document.parse(text)
    if not isinstance(root, dict):
        raise ValueError('Attached mod JSON must be an object.')
    world, _ = _world(text)
    embedded = world.get('shortId')
    if embedded is not None and (not isinstance(embedded, str) or not embedded.strip()):
        raise ValueError('The mod file has an invalid shortId.')
    if not isinstance(short_id, str):
        raise ValueError('Mod short ID must be text.')
    short_id = short_id.strip() or embedded
    if not short_id or len(short_id) > 128 or any(ord(c) < 33 for c in short_id):
        raise ValueError('Enter the short ID for this mod file.')
    if embedded and embedded != short_id:
        raise ValueError('The file shortId does not match the selected overlay.')
    if not isinstance(filename, str) or not filename.lower().endswith('.json'):
        raise ValueError('Attach a JSON file.')
    state = world.get('initialGameState', world)
    if not isinstance(state, dict):
        raise ValueError('Mod initialGameState must be an object.')
    title = next((world.get(k) for k in ('title', 'name') if isinstance(world.get(k), str) and world[k].strip()), None)
    if not title:
        title = filename[:-5].strip() or short_id
    sections = [{'name': key, 'entries': len(value) if isinstance(value, (dict, list)) else 1}
                for key, value in state.items() if key not in ('shortId', 'mods', 'heroesVersion', 'configVersion')
                and value not in ({}, [], '', None)]
    return {'shortId': short_id, 'title': title[:200], 'source': 'attached JSON',
            'filename': filename[:200], 'sections': sections}
