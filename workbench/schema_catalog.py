"""Persistent, bounded community-schema refresh with a bundled fallback."""
import hashlib
import json
import os
from pathlib import Path
import tempfile
import threading
import time
import urllib.error
import urllib.request

URL = 'https://api.unofficial.voyage/schema.json'
MAX_BYTES = 8 * 1024 * 1024
CODECS = {'literal', 'required', 'partial', 'record', 'array', 'intersection', 'union', 'refined'}
PRIMITIVES = {'string', 'number', 'boolean', 'null', 'unknown', 'any'}


class SchemaRefreshError(ValueError):
    pass


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        raise SchemaRefreshError('Schema redirects are not allowed; the existing schema remains active.')


def normalize(payload):
    """Accept codec roots or explicit section-schema collections, not guesses."""
    nodes = 0
    def codec(value, depth=0):
        nonlocal nodes
        nodes += 1
        if nodes > 250000 or depth > 100:
            raise SchemaRefreshError('Schema nesting or node limit exceeded.')
        if isinstance(value, str):
            if value not in PRIMITIVES:
                raise SchemaRefreshError('Unsupported schema primitive: ' + value[:80])
            return
        if not isinstance(value, dict) or value.get('_type') not in CODECS:
            raise SchemaRefreshError('Unsupported schema format; expected documented Voyage codec definitions.')
        kind = value['_type']
        if kind in ('required', 'partial'):
            fields = value.get('fields')
            if not isinstance(fields, dict):
                raise SchemaRefreshError('Schema object fields must be a map.')
            for child in fields.values():
                codec(child, depth + 1)
        elif kind in ('array', 'record', 'refined'):
            codec(value.get('codomain' if kind == 'record' else 'of'), depth + 1)
        elif kind in ('intersection', 'union'):
            children = value.get('parts' if kind == 'intersection' else 'of')
            if not isinstance(children, list) or not children:
                raise SchemaRefreshError('Schema combinations must contain types.')
            for child in children:
                codec(child, depth + 1)
        elif 'value' not in value or isinstance(value['value'], (list, dict)):
            raise SchemaRefreshError('Schema literal must contain a scalar value.')

    source = payload
    if isinstance(source, dict) and '_type' not in source:
        if isinstance(source.get('schema'), dict) and '_type' in source['schema']:
            source = source['schema']
        elif 'sections' in source:
            source = source['sections']
        elif 'schemas' in source:
            source = source['schemas']
    if isinstance(source, dict) and '_type' in source:
        codec(source)
        return {'root': source}
    if isinstance(source, dict):
        entries = [{'section': key, 'schema': value.get('schema') if isinstance(value, dict) and 'schema' in value else value}
                   for key, value in source.items()]
    elif isinstance(source, list):
        entries = source
    else:
        raise SchemaRefreshError('Schema must contain a root codec or section definitions.')
    references = []
    seen = set()
    for entry in entries:
        if not isinstance(entry, dict) or not isinstance(entry.get('section'), str) or not entry['section']:
            raise SchemaRefreshError('Each schema section needs a name and codec.')
        if entry['section'] in seen:
            raise SchemaRefreshError('Duplicate schema section: ' + entry['section'])
        seen.add(entry['section'])
        if entry.get('schema') is None:
            continue
        codec(entry['schema'])
        references.append({'section': entry['section'], 'schema': entry['schema']})
    if not references:
        raise SchemaRefreshError('The downloaded schema contains no usable sections.')
    return {'sections': references}


class SchemaCatalog:
    def __init__(self, directory):
        self.directory = Path(directory)
        self.path = self.directory / 'community-schema.json'
        self.lock = threading.RLock()
        self.cached = None
        self.profile = None
        self.last_error = None
        if self.path.exists():
            try:
                if self.path.stat().st_size > MAX_BYTES * 6 + 4096:
                    raise SchemaRefreshError('Cached schema exceeds its size limit.')
                record = json.loads(self.path.read_text(encoding='utf-8'))
                source = record['text']
                if record.get('formatVersion') != 1 or record.get('url') != URL or not isinstance(source, str) or len(source.encode('utf-8')) > MAX_BYTES:
                    raise SchemaRefreshError('Cached schema has invalid provenance.')
                digest = hashlib.sha256(source.encode('utf-8')).hexdigest()
                if digest != record.get('sha256'):
                    raise SchemaRefreshError('Cached schema checksum does not match.')
                profile = normalize(json.loads(source))
                cached = {key: record[key] for key in ('sha256', 'fetchedAt', 'url')}
                self.profile, self.cached = profile, cached
            except (OSError, ValueError, TypeError, KeyError, RecursionError) as exc:
                self.last_error = 'Could not load cached schema; using bundled fallback: ' + str(exc)

    def status(self):
        with self.lock:
            return {'source': 'refreshed-community' if self.cached else 'bundled-community',
                    'url': URL, 'sha256': self.cached['sha256'] if self.cached else None,
                    'fetchedAt': self.cached['fetchedAt'] if self.cached else None,
                    'lastError': self.last_error, 'advisory': True,
                    'format': 'Voyage codec', 'refreshAvailable': True}

    def validation_profile(self):
        with self.lock:
            if not self.profile:
                return None  # Existing bundled checks and default tests remain unchanged.
            return {**self.profile, 'sourceLabel': 'Refreshed community schema',
                    'sourceHash': self.cached['sha256'], 'fetchedAt': self.cached['fetchedAt'],
                    'observedRequirements': False}

    def refresh(self):
        with self.lock:
            try:
                request = urllib.request.Request(URL, headers={'Accept': 'application/json',
                    'Accept-Encoding': 'identity', 'User-Agent': 'VoyageWorkbench/1.0'})
                with urllib.request.build_opener(NoRedirect()).open(request, timeout=25) as response:
                    declared = response.headers.get('Content-Length')
                    if declared and int(declared) > MAX_BYTES:
                        raise SchemaRefreshError('Downloaded schema exceeds 8 MiB.')
                    data = response.read(MAX_BYTES + 1)
                if len(data) > MAX_BYTES:
                    raise SchemaRefreshError('Downloaded schema exceeds 8 MiB.')
                source = data.decode('utf-8')
                profile = normalize(json.loads(source))
                record = {'formatVersion': 1, 'url': URL, 'fetchedAt': time.time(),
                          'sha256': hashlib.sha256(data).hexdigest(), 'text': source}
                self.directory.mkdir(parents=True, exist_ok=True)
                temporary = None
                try:
                    with tempfile.NamedTemporaryFile(mode='w', encoding='utf-8', dir=self.directory, delete=False) as handle:
                        temporary = Path(handle.name)
                        json.dump(record, handle, ensure_ascii=True)
                        handle.flush()
                        os.fsync(handle.fileno())
                    os.replace(temporary, self.path)
                finally:
                    if temporary and temporary.exists():
                        temporary.unlink()
                changed = not self.cached or self.cached['sha256'] != record['sha256']
                self.cached = {key: record[key] for key in ('sha256', 'fetchedAt', 'url')}
                self.profile = profile
                self.last_error = None
                return {**self.status(), 'changed': changed}
            except (OSError, ValueError, TypeError, KeyError, RecursionError) as exc:
                self.last_error = 'Schema refresh failed; existing checks remain active: ' + str(exc)
                raise SchemaRefreshError(self.last_error) from None


def route(handler, method, path, body):
    if path == '/api/schema/status' and method == 'GET':
        handler.respond(200, handler.server.schema_catalog.status())
        return True
    if path == '/api/schema/refresh' and method == 'POST':
        handler.respond(200, handler.server.schema_catalog.refresh())
        return True
    return False
