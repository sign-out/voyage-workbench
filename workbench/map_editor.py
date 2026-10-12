"""Spatial projection and targeted map edits for Voyage GameState JSON."""
import json
import math

from . import document


def _state(text):
    info = document.inspect(text)
    path = info.get('gameStatePath')
    if path is None:
        raise ValueError('Open a world with a recognizable GameState to use the map.')
    state = document.parse(document.section(text, path))
    if not isinstance(state, dict):
        raise ValueError('GameState must be an object.')
    return state, path


def _number(value):
    try:
        number = float(value.lexeme if isinstance(value, document.Number) else value)
    except (TypeError, ValueError, OverflowError, AttributeError):
        return None
    return number if math.isfinite(number) else None


def _records(state, key):
    value = state.get(key, {})
    if not isinstance(value, dict):
        raise ValueError(f'{key} must be an object to edit the map.')
    return value


def inspect(text):
    state, _ = _state(text)
    realms, regions, locations = (_records(state, key) for key in ('realms', 'regions', 'locations'))
    size = _number(state.get('locationSettings', {}).get('regionSize')) if isinstance(state.get('locationSettings'), dict) else None
    size = size if size and size > 0 else 100
    settings = state.get('locationSettings', {})
    feather = settings.get('regionMapBorderFeatheringEnabled', True) if isinstance(settings, dict) else True
    output = {'regionSize': size, 'regionMapBorderFeatheringEnabled': feather if type(feather) is bool else True,
              'realms': [], 'regions': [], 'locations': [], 'warnings': []}
    travel = _number(settings.get('avgTravelDistance')) if isinstance(settings, dict) else None
    if travel is not None and travel > size:
        output['warnings'].append('locationSettings.avgTravelDistance exceeds regionSize; review travel distances after changing region width.')
    output['realms'] = [{'key': key, 'name': value.get('name', key) if isinstance(value, dict) else key}
                        for key, value in realms.items()]
    occupied = {}
    for key, value in regions.items():
        if not isinstance(value, dict):
            output['warnings'].append(f'Region {key!r} is not an object.')
            continue
        x, y, realm = _number(value.get('x')), _number(value.get('y')), value.get('realm')
        realm = realm if isinstance(realm,str) else ''
        image = value.get('images', {}).get('map', {}) if isinstance(value.get('images'), dict) else {}
        image_url = image.get('imageUrl', '') if isinstance(image, dict) else ''
        output['regions'].append({'key': key, 'name': value.get('name', key), 'realm': realm if isinstance(realm, str) else '',
                                  'x': x, 'y': y, 'basicInfo': value.get('basicInfo', ''),
                                  'imageUrl': image_url if isinstance(image_url, str) else ''})
        if realm not in realms:
            output['warnings'].append(f'Region {key!r} refers to an unknown realm.')
        if x is None or y is None or not x.is_integer() or not y.is_integer():
            output['warnings'].append(f'Region {key!r} needs integer x/y grid coordinates.')
        else:
            cell = (realm, int(x), int(y))
            if cell in occupied:
                output['warnings'].append(f'Regions {occupied[cell]!r} and {key!r} overlap at {cell[1]}, {cell[2]}.')
            occupied[cell] = key
    for key, value in locations.items():
        if not isinstance(value, dict):
            output['warnings'].append(f'Location {key!r} is not an object.')
            continue
        x, y = _number(value.get('x')), _number(value.get('y'))
        region = value.get('region', '')
        region = region if isinstance(region,str) else ''
        radius = _number(value.get('radius'))
        output['locations'].append({'key': key, 'name': value.get('name', key), 'region': region if isinstance(region, str) else '',
                                    'x': x, 'y': y, 'radius': radius, 'basicInfo': value.get('basicInfo', ''),
                                    'complexityType': value.get('complexityType', ''), 'detailType': value.get('detailType', '')})
        if region not in regions:
            output['warnings'].append(f'Location {key!r} refers to an unknown region.')
        if x is None or y is None or abs(x) > size/2 or abs(y) > size/2:
            output['warnings'].append(f'Location {key!r} is outside its region map or lacks coordinates.')
    # A realm's placed cells should be connected by shared edges.
    for realm in realms:
        cells = {(int(r['x']), int(r['y'])) for r in output['regions'] if r['realm'] == realm and
                 r['x'] is not None and r['y'] is not None and r['x'].is_integer() and r['y'].is_integer()}
        if not cells:
            continue
        seen, queue = set(), [next(iter(cells))]
        while queue:
            cell = queue.pop()
            if cell in seen:
                continue
            seen.add(cell)
            queue.extend((cell[0]+dx, cell[1]+dy) for dx,dy in ((1,0),(-1,0),(0,1),(0,-1)) if (cell[0]+dx,cell[1]+dy) in cells-seen)
        if seen != cells:
            output['warnings'].append(f'Realm {realm!r} has disconnected region cells.')
    return output


def _name(value, label):
    if not isinstance(value, str) or not value.strip() or len(value) > 120:
        raise ValueError(f'{label} must be 1–120 characters.')
    return value.strip()


def _coord(value, label, integer=False, limit=None):
    try:
        valid = type(value) in (int, float) and math.isfinite(value) and (not integer or int(value) == value)
    except (ValueError, OverflowError):
        valid = False
    if not valid:
        raise ValueError(f'{label} must be a finite {"integer" if integer else "number"}.')
    if limit is not None and abs(value) > limit:
        raise ValueError(f'{label} must be within ±{limit:g}.')
    return int(value) if integer else value


def _put(text, path, key, value):
    raw = json.dumps(value, ensure_ascii=True, separators=(',', ':'))
    target = document.parse(document.section(text, path))
    return document.replace(text, path+[key], raw) if key in target else document.mutate(text, path, 'add', key, raw)


def _ensure_section(text, path, state, section):
    return text if section in state else document.mutate(text, path, 'add', section, '{}')


def edit(text, action, data):
    state, path = _state(text)
    if action == 'set-settings':
        allowed = {'regionSize', 'regionMapBorderFeatheringEnabled'}
        if not isinstance(data, dict) or not data or set(data) - allowed:
            raise ValueError('Choose regionSize or regionMapBorderFeatheringEnabled.')
        values = {}
        for field, value in data.items():
            if field == 'regionSize':
                value = _coord(value, 'Region width')
                if value <= 0:
                    raise ValueError('Region width must be positive.')
            elif type(value) is not bool:
                raise ValueError('Region image feathering must be a boolean.')
            values[field] = value
        if 'locationSettings' not in state:
            # Defaults from the documented locationSettings example. No
            # existing settings, coordinates, or unknown fields are replaced.
            defaults = {'regionSize': 100, 'simpleRadius': 2, 'complexRadius': 5,
                        'regionLocationCount': 8, 'avgTravelDistance': 20,
                        'minTravelDistance': 5, 'newRegionGenerationEnabled': True,
                        'regionMapBorderFeatheringEnabled': True, 'encountersEnabled': False}
            text = document.mutate(text, path, 'add', 'locationSettings', json.dumps(defaults))
        elif not isinstance(state['locationSettings'], dict):
            raise ValueError('locationSettings must be an object before editing map settings.')
        for field, value in values.items():
            text = _put(text, path + ['locationSettings'], field, value)
        return text
    realms, regions, locations = (_records(state, key) for key in ('realms', 'regions', 'locations'))
    size = _number(state.get('locationSettings', {}).get('regionSize')) if isinstance(state.get('locationSettings'), dict) else None
    size = size if size and size > 0 else 100
    key = _name(data.get('key'), 'Name') if action not in ('move-region', 'move-location', 'place-region') else _name(data.get('key'), 'Key')
    if action == 'add-realm':
        if key in realms:
            raise ValueError('A realm with this name already exists.')
        text = _ensure_section(text, path, state, 'realms')
        return document.mutate(text, path+['realms'], 'add', key, json.dumps({'name':key,'basicInfo':''}))
    if action == 'add-region':
        realm = data.get('realm')
        if realm not in realms:
            raise ValueError('Choose an existing realm first.')
        if key in regions:
            raise ValueError('A region with this name already exists.')
        x, y = _coord(data.get('x'), 'Region x', True), _coord(data.get('y'), 'Region y', True)
        if any(isinstance(r,dict) and r.get('realm')==realm and _number(r.get('x'))==x and _number(r.get('y'))==y for r in regions.values()):
            raise ValueError('That realm grid cell already contains a region.')
        text = _ensure_section(text, path, state, 'regions')
        return document.mutate(text, path+['regions'], 'add', key, json.dumps({'name':key,'basicInfo':'','x':x,'y':y,'realm':realm}))
    if action == 'place-region':
        if key not in regions or not isinstance(regions[key], dict):
            raise ValueError('Region not found.')
        realm = data.get('realm')
        if realm not in realms:
            raise ValueError('Choose an existing realm first.')
        x, y = _coord(data.get('x'), 'Region x', True), _coord(data.get('y'), 'Region y', True)
        if any(other != key and isinstance(r, dict) and r.get('realm') == realm and
               _number(r.get('x')) == x and _number(r.get('y')) == y for other, r in regions.items()):
            raise ValueError('That realm grid cell already contains a region.')
        text = _put(text, path+['regions', key], 'realm', realm)
        text = _put(text, path+['regions', key], 'x', x)
        return _put(text, path+['regions', key], 'y', y)
    if action == 'move-region':
        if key not in regions or not isinstance(regions[key], dict):
            raise ValueError('Region not found.')
        x, y = _coord(data.get('x'), 'Region x', True), _coord(data.get('y'), 'Region y', True)
        realm = regions[key].get('realm')
        if any(other!=key and isinstance(r,dict) and r.get('realm')==realm and _number(r.get('x'))==x and _number(r.get('y'))==y for other,r in regions.items()):
            raise ValueError('That realm grid cell already contains a region.')
        text = _put(text, path+['regions',key], 'x', x)
        return _put(text, path+['regions',key], 'y', y)
    if action == 'add-location':
        region = data.get('region')
        if region not in regions:
            raise ValueError('Choose an existing region first.')
        if key in locations:
            raise ValueError('A location with this name already exists.')
        x, y = _coord(data.get('x'), 'Location x', limit=size/2), _coord(data.get('y'), 'Location y', limit=size/2)
        text = _ensure_section(text, path, state, 'locations')
        value = {'name':key,'basicInfo':'','x':x,'y':y,'region':region,'radius':2,'complexityType':'simple','detailType':'basic','areas':{}}
        return document.mutate(text, path+['locations'], 'add', key, json.dumps(value))
    if action == 'move-location':
        if key not in locations or not isinstance(locations[key], dict):
            raise ValueError('Location not found.')
        x, y = _coord(data.get('x'), 'Location x', limit=size/2), _coord(data.get('y'), 'Location y', limit=size/2)
        text = _put(text, path+['locations',key], 'x', x)
        return _put(text, path+['locations',key], 'y', y)
    if action == 'set-field':
        kind, field, value = data.get('kind'), data.get('field'), data.get('value')
        allowed = {'region': {'basicInfo','imageUrl'}, 'location': {'basicInfo','radius','complexityType','detailType','region'}}
        if kind not in allowed or field not in allowed[kind]:
            raise ValueError('This map field is not editable here.')
        records = regions if kind=='region' else locations
        section = 'regions' if kind=='region' else 'locations'
        if key not in records or not isinstance(records[key], dict):
            raise ValueError('Map record not found.')
        if field == 'radius':
            value = _coord(value, 'Radius')
            if value <= 0:
                raise ValueError('Radius must be positive.')
        elif not isinstance(value, str):
            raise ValueError('Field value must be text.')
        elif field == 'region' and value not in regions:
            raise ValueError('Choose an existing region.')
        elif field == 'complexityType' and value not in ('simple','complex','wilderness'):
            raise ValueError('Choose simple, complex, or wilderness.')
        elif field == 'detailType' and value not in ('basic','detailed'):
            raise ValueError('Choose basic or detailed.')
        elif field == 'imageUrl' and value and not value.startswith('https://'):
            raise ValueError('Map image URL must start with https://.')
        if field == 'imageUrl':
            record = records[key]
            record_path = path+[section,key]
            if 'images' not in record:
                text = document.mutate(text, record_path, 'add', 'images', '{}')
            images = record.get('images', {})
            if not isinstance(images, dict):
                raise ValueError('Region images must be an object.')
            if 'map' not in images:
                text = document.mutate(text, record_path+['images'], 'add', 'map', '{}')
            return _put(text, record_path+['images','map'], 'imageUrl', value)
        return _put(text, path+[section,key], field, value)
    if action == 'delete-location':
        if key not in locations:
            raise ValueError('Location not found.')
        return document.mutate(text, path+['locations'], 'remove', key)
    if action == 'delete-region':
        if key not in regions:
            raise ValueError('Region not found.')
        if any(isinstance(loc,dict) and loc.get('region')==key for loc in locations.values()):
            raise ValueError('Move or remove this region’s locations before deleting it.')
        return document.mutate(text, path+['regions'], 'remove', key)
    raise ValueError('Unknown map action.')
