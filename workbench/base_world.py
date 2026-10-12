"""Content-free starting worlds, reviewed and checked before activation.

A source world is evidence of shape, not evidence that every field is required.
The community codec supplies required fields/enums; official draft validation
is the authority for accepting a candidate. No source world is overwritten.
"""
import hashlib
import json
import os
from pathlib import Path
import tempfile
import threading
import time
import uuid
from . import document, schema

ROOT = Path(__file__).resolve().parent.parent
MAX_BYTES = 8 * 1024 * 1024
RUNTIME = {'engineState', 'uiState', 'characters', 'partyState', 'memoryBank',
           'summaryState', 'embeddings', 'triggerWritable', 'systemResults',
           'turnData', 'studioSession', 'chatLog', 'embeddingModel',
           'embeddingDimension', 'stateEdited', 'compatibilityRevision'}


def dumps(value, indent=0):
    """Readable JSON preserving the exact spelling of all source numbers."""
    if isinstance(value, document.Number):
        return value.lexeme
    if isinstance(value, dict):
        if not value:
            return '{}'
        pad = '  ' * (indent + 1)
        return '{\n' + ',\n'.join(pad + json.dumps(k, ensure_ascii=True) + ': ' + dumps(v, indent + 1)
                                  for k, v in value.items()) + '\n' + '  ' * indent + '}'
    if isinstance(value, list):
        return '[' + ', '.join(dumps(v, indent + 1) for v in value) + ']'
    return json.dumps(value, ensure_ascii=True)


def blank(value, codec=None):
    """Keep mechanics/types, clear prose and collections; omit optional fields."""
    if isinstance(codec, str):
        return {'string': '', 'number': value if isinstance(value, document.Number) else document.Number('0'),
                'boolean': value if type(value) is bool else False, 'null': None}.get(codec, blank(value))
    if isinstance(codec, dict):
        kind = codec.get('_type')
        if kind == 'literal':
            result = codec['value']
            return document.Number(str(result)) if type(result) in (int, float) else result
        if kind in ('record', 'array'):
            return {} if kind == 'record' else []
        if kind in ('required', 'partial'):
            if kind == 'partial':
                return {}
            source = value if isinstance(value, dict) else {}
            return {k: blank(source.get(k), child) for k, child in codec.get('fields', {}).items()}
        if kind == 'intersection':
            result = {}
            for part in codec.get('parts', []):
                item = blank(value, part)
                if isinstance(item, dict):
                    result.update(item)
                else:
                    return item
            return result
        if kind == 'union':
            choices = codec.get('of', [])
            matching = [part for part in choices if not schema.check(value, part)]
            return blank(value, (matching or choices or [None])[0])
        if kind == 'refined':
            result = blank(value, codec.get('of'))
            if schema.check(result, codec):
                return document.Number(str(codec.get('min', 0))) if isinstance(result, document.Number) else result
            return result
    if isinstance(value, dict):
        return {k: blank(v) for k, v in value.items()}
    if isinstance(value, list):
        return []
    if isinstance(value, str):
        return ''
    return value


def derive(text, profile=None):
    if not isinstance(text, str) or len(text.encode('utf-8')) > MAX_BYTES:
        raise ValueError('Source world JSON must be UTF-8 text no larger than 8 MiB.')
    info = document.inspect(text)
    if info['errors']:
        raise ValueError('Fix source JSON first: ' + '; '.join(info['errors'][:3]))
    source = document.parse(document.section(text, info['gameStatePath']))
    codecs = {r['section']: r['schema'] for r in schema.references() if r.get('schema')}
    if profile:
        codecs.update({r['section']: r['schema'] for r in profile.get('sections', []) if r.get('schema')})
    warnings = []
    if profile and 'root' in profile:
        result = blank(source, profile['root'])
        # A partial root defines optional sections; use only the observed ones.
        if not result:
            fields = profile['root'].get('fields', {})
            result = {k: blank(v, fields[k]) for k, v in source.items() if k in fields and k not in RUNTIME}
    else:
        result = {}
        for key, value in source.items():
            if key in RUNTIME:
                continue
            if key == 'heroesVersion':
                result[key] = value
            elif key in codecs:
                result[key] = blank(value, codecs[key])
            elif key == 'mods':
                result[key] = []
            elif key == 'unassignedAreas':
                result[key] = {}
            elif key.endswith(('Settings', 'Configuration')):
                result[key] = blank(value)
                warnings.append(key + ': inferred from source; not covered by the selected schema. Review official validation.')
            else:
                warnings.append('Removed unrecognized section ' + key + '; restore it in the candidate if official validation requires it.')
    if not isinstance(result, dict):
        raise ValueError('The selected schema does not describe a GameState object.')
    result.setdefault('heroesVersion', source.get('heroesVersion', document.Number('36')))
    # Known nonempty/linked structural definitions; names/prompts have no flavor.
    if 'relationshipStages' in source:
        result['relationshipStages'] = [{'name': 'Neutral', 'minScore': document.Number('-100'), 'maxScore': document.Number('100')}]
    settings = source.get('successLevelSettings', {})
    tiers = settings.get('tiers') if isinstance(settings, dict) else None
    if isinstance(tiers, list) and tiers and all(isinstance(t, dict) for t in tiers):
        neutral = [{'id': 'tier' + str(i + 1), 'name': 'Tier ' + str(i + 1),
                    'minScore': t.get('minScore'), 'maxScore': t.get('maxScore'), 'prompt': ''}
                   for i, t in enumerate(tiers)]
        first = next((i for i, t in enumerate(tiers) if t.get('id') == settings.get('firstSuccessfulTierId')), 0)
    else:
        neutral = [{'id': 'tier1', 'name': 'Tier 1', 'minScore': None, 'maxScore': document.Number('0'), 'prompt': ''},
                   {'id': 'tier2', 'name': 'Tier 2', 'minScore': document.Number('0'), 'maxScore': None, 'prompt': ''}]
        first = 1
        warnings.append('Added neutral success-level definitions for the observed draft requirement; official validation is still required.')
    result['successLevelSettings'] = {'firstSuccessfulTierId': neutral[first]['id'], 'tiers': neutral}
    candidate = dumps(result)
    report = document.validate(candidate)
    report['warnings'].extend(schema.validate(candidate, profile))
    return candidate, {'sourceSections': len(source), 'candidateSections': len(result),
                        'removedSections': [k for k in source if k not in result],
                        'clearedContent': 'Authored records, mod overlays, prose, prompts and optional schema fields'}, warnings + report['warnings']


def inferred(value):
    """Advisory shape of a checked base; presence is not proof of necessity."""
    if isinstance(value, document.Number):
        return 'number'
    if isinstance(value, dict):
        return {'_type': 'partial', 'fields': {k: inferred(v) for k, v in value.items()}} if value else {'_type': 'record', 'codomain': 'unknown'}
    if isinstance(value, list):
        return {'_type': 'array', 'of': inferred(value[0]) if value else 'unknown'}
    if value is None:
        return 'unknown'  # A null example cannot establish the non-null type.
    return 'boolean' if type(value) is bool else 'string'


class BaseWorld:
    def __init__(self, directory, catalog):
        self.directory, self.catalog = Path(directory), catalog
        self.path = self.directory / 'state.json'
        self.lock = threading.RLock()
        self.state = {'candidate': None, 'active': None, 'minimization': None}
        self.last_error = None
        if self.path.exists():
            try:
                if self.path.stat().st_size > MAX_BYTES * 12:
                    raise ValueError('Saved base world exceeds its size limit.')
                value = json.loads(self.path.read_text(encoding='utf-8'))
                for key in ('candidate', 'active'):
                    record = value[key]
                    if record:
                        if record.get('sha256') != self.digest(record['text']):
                            raise ValueError('Saved base-world checksum does not match.')
                        document.parse(record['text'])
                        if key == 'active' and (not record.get('verified') or record.get('validationHash') != record['sha256']):
                            raise ValueError('Saved active base has no matching official validation.')
                self.state = value
            except (OSError, ValueError, KeyError, TypeError, RecursionError) as exc:
                self.last_error = 'Saved base world could not be loaded; using bundled fallback: ' + str(exc)

    @staticmethod
    def digest(text):
        return hashlib.sha256(text.encode('utf-8')).hexdigest()

    def _persist(self):
        self.directory.mkdir(parents=True, exist_ok=True)
        with tempfile.NamedTemporaryFile(mode='w', encoding='utf-8', dir=self.directory, delete=False) as handle:
            temp = Path(handle.name)
            try:
                json.dump(self.state, handle, ensure_ascii=True)
                handle.flush()
                os.fsync(handle.fileno())
            except BaseException:
                temp.unlink(missing_ok=True)
                raise
        try:
            os.replace(temp, self.path)
        finally:
            temp.unlink(missing_ok=True)

    def _archive(self, record):
        if record:
            folder = self.directory / 'history'
            folder.mkdir(parents=True, exist_ok=True)
            (folder / (str(time.time_ns()) + '-' + record['id'] + '.json')).write_text(json.dumps(record, ensure_ascii=True), encoding='utf-8')

    def status(self):
        with self.lock:
            job = self.state.get('minimization')
            progress = {k: v for k, v in job.items() if k != 'queue'} if job else None
            return {'candidate': self.state['candidate'], 'active': self.state['active'] or
                    {'name': 'Bundled blank world', 'filename': 'blank-world.json', 'source': 'bundled', 'verified': False},
                    'bundled': not bool(self.state['active']), 'schema': self.catalog.status(), 'lastError': self.last_error,
                    'minimization': progress}

    def template_text(self):
        with self.lock:
            return self.state['active']['text'] if self.state['active'] else (ROOT / 'fixtures/blank-world.json').read_text(encoding='utf-8')

    def validation_profile(self):
        profile = self.catalog.validation_profile()
        with self.lock:
            active = self.state['active']
            if not active:
                return profile
            return self._checked_profile(active['text'])

    def _checked_profile(self, text):
        profile = self.catalog.validation_profile()
        state = document.parse(text)
        if profile and 'root' in profile and not schema.check(state, profile['root']):
            return profile
        references = profile.get('sections', schema.references()) if profile else schema.references()
        refs = {r['section']: r for r in references if r.get('schema')}
        for k, v in state.items():
            # A checked base may demonstrate that a bundled required field
            # or type is stale. Prefer its observed shape in those sections.
            if k not in refs or schema.check(v, refs[k]['schema']):
                refs[k] = {'section': k, 'schema': inferred(v)}
        return {'sections': list(refs.values()), 'sourceLabel': 'Selected schema + officially checked base shape (advisory)',
                'observedRequirements': False}

    def prepare(self, text, filename, source='upload'):
        candidate, summary, warnings = derive(text, self.catalog.validation_profile())
        with self.lock:
            self._archive(self.state['candidate'])
            self.state['minimization'] = None
            self.state['candidate'] = {'id': uuid.uuid4().hex, 'text': candidate, 'sha256': self.digest(candidate),
                'filename': Path(str(filename)).name[:180], 'name': 'Custom minimal base world', 'source': source,
                'summary': summary, 'warnings': warnings, 'verified': False, 'validation': None, 'created': time.time()}
            self._persist()
            return self.status()

    def edit(self, text):
        if not isinstance(text, str) or len(text.encode('utf-8')) > MAX_BYTES:
            raise ValueError('Candidate must be JSON text no larger than 8 MiB.')
        info = document.inspect(text)
        if info['errors']:
            raise ValueError('Fix candidate JSON: ' + '; '.join(info['errors'][:3]))
        # Candidate is always a GameState, not an envelope or world identity.
        if info['gameStatePath'] != []:
            raise ValueError('Edit the candidate GameState directly, without a world envelope.')
        with self.lock:
            if not self.state['candidate']:
                raise ValueError('Prepare a candidate first.')
            self._archive(self.state['candidate'])
            self.state['minimization'] = None
            self.state['candidate'] = {**self.state['candidate'], 'id': uuid.uuid4().hex,
                'text': text, 'sha256': self.digest(text), 'verified': False, 'validation': None}
            self._persist()
            return self.status()

    def check(self, client):
        with self.lock:
            candidate = self.state['candidate']
            if not candidate:
                raise ValueError('Prepare a candidate first.')
            result = client.validate(candidate['text'])
            data = result.get('data', result)
            if not isinstance(data, dict) or type(data.get('valid')) is not bool:
                raise ValueError('Official validator returned an unsupported response; candidate is unverified.')
            self.state['minimization'] = None
            self.state['candidate'] = {**candidate, 'verified': data['valid'] is True, 'validation': data,
                'validationHash': candidate['sha256'], 'environment': client.environment, 'checked': time.time()}
            if data['valid'] is True:
                report = document.validate(candidate['text'])
                report['warnings'].extend(schema.validate(candidate['text'], self._checked_profile(candidate['text'])))
                self.state['candidate']['warnings'] = report['warnings']
            self._persist()
            return self.status()

    def activate(self, expected_hash=None):
        with self.lock:
            candidate = self.state['candidate']
            if not candidate or not candidate.get('verified') or candidate.get('validationHash') != self.digest(candidate['text']):
                raise ValueError('The exact candidate must pass official Voyage draft validation before activation.')
            if expected_hash is not None and expected_hash != candidate['sha256']:
                raise ValueError('Candidate changed. Reload its preview before activation.')
            self._archive(self.state['active'])
            self.state['active'] = dict(candidate)
            self._persist()
            return self.status()

    def minimize_start(self, expected_hash):
        """Start a bounded greedy deletion search; each step is one remote probe.

        This finds individually removable fields, not a mathematical global
        minimum. No request is issued until the user explicitly starts it.
        """
        with self.lock:
            candidate = self.state['candidate']
            if not candidate or not candidate.get('verified') or candidate['sha256'] != expected_hash or candidate.get('validationHash') != self.digest(candidate['text']):
                raise ValueError('Validate and review the current candidate before minimizing it.')
            queue = []
            def walk(value, path):
                if isinstance(value, dict):
                    for key, child in value.items():
                        if path == [] and key == 'heroesVersion':
                            continue
                        queue.append(path + [key])
                        walk(child, path + [key])
                elif isinstance(value, list):
                    # Reverse order so accepted deletions do not shift later probes.
                    for i in range(len(value) - 1, -1, -1):
                        queue.append(path + [i])
                        walk(value[i], path + [i])
            walk(document.parse(candidate['text']), [])
            self._archive(candidate)
            capped = len(queue) > 120
            queue = queue[:120]
            self.state['minimization'] = {'id': uuid.uuid4().hex, 'phase': 'pending' if queue else 'complete',
                'queue': queue, 'checked': 0, 'total': len(queue), 'remaining': len(queue), 'removed': 0,
                'last': None, 'capped': capped, 'candidateHash': candidate['sha256']}
            self._persist()
            return self.status()

    def minimize_step(self, job_id, client):
        with self.lock:
            job = self.state.get('minimization')
            if not job or job['id'] != job_id:
                raise ValueError('The minimization candidate changed. Start again with the current candidate.')
            candidate = self.state['candidate']
            if candidate['sha256'] != job['candidateHash']:
                raise ValueError('Candidate changed during minimization. Review and validate it again.')
            if not job['queue']:
                return self.status()
            path = job['queue'][0]
            trial = None
            try:
                trial = document.mutate(candidate['text'], path[:-1], 'remove', key=path[-1])
                if document.validate(trial)['errors']:
                    trial = None
            except ValueError:
                pass  # An ancestor was already removed by a successful probe.
            accepted = False
            if trial is not None:
                # Connection failures leave the current probe queued for retry.
                result = client.validate(trial)
                data = result.get('data', result)
                if not isinstance(data, dict) or type(data.get('valid')) is not bool:
                    raise ValueError('Official validator returned an unsupported response. Current candidate is preserved.')
                accepted = data['valid'] is True
                if accepted:
                    digest = self.digest(trial)
                    self.state['candidate'] = {**candidate, 'id': uuid.uuid4().hex, 'text': trial, 'sha256': digest,
                        'verified': True, 'validation': data, 'validationHash': digest,
                        'environment': client.environment, 'checked': time.time()}
                    self.state['candidate']['summary'] = {**candidate.get('summary', {}),
                        'candidateSections': len(document.parse(trial)), 'acceptedFieldRemovals': job['removed'] + 1}
                    self.state['candidate']['warnings'] = document.validate(trial)['warnings']
                    job['candidateHash'] = digest
                    job['removed'] += 1
            job['queue'].pop(0)
            job['checked'] += 1
            job['remaining'] = len(job['queue'])
            job['last'] = {'path': path, 'removed': accepted, 'probed': trial is not None}
            job['phase'] = 'pending' if job['queue'] else 'complete'
            self._persist()
            return self.status()

    def reset(self):
        with self.lock:
            self._archive(self.state['active'])
            self.state['active'] = None
            self._persist()
            return self.status()


def route(handler, method, path, body):
    if not path.startswith('/api/base-world'):
        return False
    server = handler.server
    base = server.base_world
    if path == '/api/base-world' and method == 'GET':
        handler.respond(200, base.status())
        return True
    actions = {'/api/base-world/edit': lambda: base.edit(body.get('text')),
               '/api/base-world/activate': lambda: base.activate(body.get('sha256')),
               '/api/base-world/minimize/start': lambda: base.minimize_start(body.get('sha256')),
               '/api/base-world/reset': base.reset}
    if method == 'POST' and path in actions:
        handler.respond(200, actions[path]())
        return True
    if method == 'POST' and path == '/api/base-world/derive':
        sid = body.get('shortId')
        if sid:
            if not isinstance(sid, str) or not sid.strip():
                raise ValueError('Enter an owned world short ID.')
            with server.remote_lock:
                remote = server.voyage.download(sid.strip())
            result = base.prepare(remote['text'], sid.strip() + '.json', 'Voyage ' + remote['environment'])
        else:
            result = base.prepare(body.get('text'), body.get('filename', 'uploaded-world.json'))
        handler.respond(200, result)
        return True
    if method == 'POST' and path == '/api/base-world/check':
        with server.remote_lock:
            result = base.check(server.voyage)
        handler.respond(200, result)
        return True
    if method == 'POST' and path == '/api/base-world/minimize/step':
        with server.remote_lock:
            result = base.minimize_step(body.get('id'), server.voyage)
        handler.respond(200, result)
        return True
    return False
