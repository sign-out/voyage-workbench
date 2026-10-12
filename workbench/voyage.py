"""Official Creator API adapter. Credentials never enter project JSON."""
import json
import urllib.request
import urllib.error
import urllib.parse
from . import document

HOSTS = {'production': 'https://api.aidungeon.com/creator/v1', 'alpha': 'https://api-alpha.aidungeon.com/creator/v1'}
EDITABLE_WORLD_FIELDS = ('shortId', 'title', 'description', 'advancedDescription', 'discordThreadUrl',
                         'image', 'isLocked', 'isMod', 'isUnremixable', 'tags', 'visibility', 'initialGameState')

class VoyageError(ValueError):
    def __init__(self, message, *, rejected=False, status_code=None, code=None, retry_after=None):
        super().__init__(message)
        self.rejected = rejected
        self.status_code = status_code
        self.code = code
        self.retry_after = retry_after

class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        raise VoyageError('Unexpected API redirect refused; credentials were not forwarded.')


def editable_world(text):
    """Build the documented PUT shape without reserializing GameState numbers."""
    world = document.parse(text)
    if not isinstance(world, dict):
        raise VoyageError('Linked world must be an object.', rejected=True)
    if any(key not in world for key in ('shortId', 'title', 'initialGameState')):
        raise VoyageError('Linked world lacks a required editable field.', rejected=True)
    fields = [json.dumps(key) + ':' + document.section(text, [key])
              for key in EDITABLE_WORLD_FIELDS if key in world]
    return '{' + ','.join(fields) + '}'


class Client:
    def __init__(self):
        self.key = ''
        self.environment = 'alpha'

    def configure(self, key, environment='alpha'):
        if environment == 'production':
            raise VoyageError('Production Creator API is disabled. Use Alpha.')
        if environment not in HOSTS:
            raise VoyageError('Unknown API environment')
        if not isinstance(key, str) or '\n' in key or '\r' in key:
            raise VoyageError('Invalid API key')
        self.key, self.environment = key.strip(), environment
        return self.status()

    def status(self):
        return {'connected': bool(self.key), 'environment': self.environment}

    def request(self, method, path, body=None, etag=None, idempotency_key=None):
        if not self.key:
            raise VoyageError('Enter a Creator API key in Connection first.')
        headers = {'Authorization': 'Bearer '+self.key, 'Accept': 'application/json', 'User-Agent': 'VoyageWorkbench/1.0'}
        if body is not None:
            headers['Content-Type'] = 'application/json'
        if etag:
            headers['If-Match'] = etag
        if idempotency_key:
            headers['Idempotency-Key'] = idempotency_key
        req = urllib.request.Request(HOSTS[self.environment]+path, data=body.encode('utf-8') if body is not None else None, headers=headers, method=method)
        try:
            with urllib.request.build_opener(NoRedirect()).open(req, timeout=30) as response:
                return response.read(64*1024*1024).decode('utf-8'), response.headers.get('ETag')
        except urllib.error.HTTPError as error:
            retry_after = error.headers.get('Retry-After') if error.headers else None
            code = None
            message = ''
            request_id = ''
            try:
                payload = json.loads(error.read(16 * 1024))
                detail = payload.get('error', {}) if isinstance(payload, dict) else {}
                if isinstance(detail, dict):
                    code = detail.get('code') if isinstance(detail.get('code'), str) else None
                    message = detail.get('message') if isinstance(detail.get('message'), str) else ''
                request_id = payload.get('requestId', '') if isinstance(payload, dict) else ''
            except (ValueError, UnicodeError, OSError):
                pass
            finally:
                error.close()
            code = code[:80] if code else None
            message = ''.join(c for c in message[:500] if c.isprintable())
            request_id = ''.join(c for c in str(request_id)[:80] if c.isalnum() or c in '-_')
            rejected = (400 <= error.code < 500 or code == 'studio_unavailable') and code not in ('request_status_unknown', 'request_in_progress')
            detail = f' ({code})' if code else ''
            if code == 'creator_api_access_required':
                message = ('Creator API access is not enabled for this key or account. '
                           'Enable Creator API access in Voyage, then use a key from Studio → Settings → API keys. '
                           'If access is already enabled, contact Voyage support with the request ID. '
                           'Local editing remains available.')
            elif error.code == 412:
                message = message or 'The remote draft changed. Refresh the linked world before saving again.'
            elif not message:
                message = 'Request rejected.' if rejected else 'The remote outcome could not be confirmed.'
            suffix = f' Request ID: {request_id}.' if request_id else ''
            raise VoyageError(f'Voyage HTTP {error.code}{detail}: {message}{suffix}', rejected=rejected,
                              status_code=error.code, code=code, retry_after=retry_after) from None
        except (OSError, UnicodeError):
            raise VoyageError('Voyage connection failed. If saving, its outcome may be unknown: download and compare before retrying.') from None

    def list_worlds(self, page=0):
        if type(page) is not int or page < 0:
            raise VoyageError('World-list page must be a nonnegative integer.')
        text, _ = self.request('GET', '/worlds?page='+str(page))
        return json.loads(text)

    def list_mods(self, short_ids=()):
        if not isinstance(short_ids, (list, tuple)) or len(short_ids) > 100 or any(not isinstance(s, str) or not s.strip() for s in short_ids):
            raise VoyageError('Expected up to 100 mod short IDs.')
        query = urllib.parse.urlencode([('pendingModShortId', sid) for sid in short_ids])
        text, _ = self.request('GET', '/mods' + ('?' + query if query else ''))
        return json.loads(text)

    def download(self, short_id):
        text, etag = self.request('GET', '/worlds/'+urllib.parse.quote(short_id, safe=''))
        # Extract by source spans, not a numeric round-trip.
        try:
            world = document.section(text, ['data','world'])
        except (ValueError, KeyError, TypeError):
            raise VoyageError('Unexpected download envelope; expected data.world. Original response was not imported.') from None
        try:
            identity=json.loads(document.section(world,['shortId']))
            state=document.section(world,['initialGameState'])
            if identity != short_id or not isinstance(document.parse(state),dict):
                raise ValueError()
        except (ValueError,KeyError,TypeError):
            raise VoyageError('Downloaded world identity or initialGameState is invalid.') from None
        if not etag:
            raise VoyageError('Download has no ETag; cannot establish a safe remote baseline.')
        return {'text': world, 'etag': etag, 'shortId': short_id, 'environment': self.environment}

    def validate(self, text, stage='draft'):
        if stage not in ('draft', 'publish'):
            raise VoyageError('Unknown validation stage.', rejected=True)
        info = document.inspect(text)
        if info.get('errors'):
            raise VoyageError('Fix local JSON errors before official validation.')
        state = document.section(text, info['gameStatePath'])
        result, _ = self.request('POST', '/validate', '{"stage":'+json.dumps(stage)+',"world":{"initialGameState":'+state+'}}')
        return json.loads(result)

    def publication_request(self, kind, short_id, body, idempotency_key):
        if kind not in ('publish', 'unpublish', 'moderation', 'create'):
            raise VoyageError('Unsupported publication action.', rejected=True)
        path = '/worlds' if kind == 'create' else '/worlds/'+urllib.parse.quote(short_id, safe='')+'/'+kind
        result, _ = self.request('POST', path, body, idempotency_key=idempotency_key)
        return json.loads(result)

    def moderation(self, short_id):
        result, _ = self.request('GET', '/worlds/'+urllib.parse.quote(short_id, safe='')+'/moderation')
        return json.loads(result)

    def save(self, text, short_id, etag):
        try:
            identity = json.loads(document.section(text, ['shortId']))
        except (ValueError, KeyError, TypeError):
            raise VoyageError('Linked world has no valid shortId.', rejected=True) from None
        if identity != short_id:
            raise VoyageError('Remote identity cannot change during a save.', rejected=True)
        try:
            validation = self.validate(text)
        except (VoyageError, ValueError, KeyError, TypeError) as error:
            # Validation is read-only; no world replacement has been sent.
            raise VoyageError(str(error), rejected=True, status_code=getattr(error, 'status_code', None),
                              code=getattr(error, 'code', None)) from None
        if validation.get('data',{}).get('valid') is not True:
            raise VoyageError('Official draft validation did not pass. Run official validation to see its issues.', rejected=True)
        try:
            world_body = editable_world(text)
        except ValueError as error:
            raise VoyageError(str(error), rejected=True) from None
        self.request('PUT', '/worlds/'+urllib.parse.quote(short_id,safe=''), '{"world":'+world_body+'}', etag)
        try:
            result = self.download(short_id)
        except (VoyageError, ValueError, KeyError, TypeError) as error:
            # The PUT returned successfully; a failed read-back cannot undo it.
            raise VoyageError(f'Voyage replacement was sent, but read-back failed: {error}. Refresh the linked world to reconcile.') from None
        try:
            result['changes'] = document.diff(text, result['text'])
        except ValueError:
            raise VoyageError('Voyage replacement was sent, but its read-back could not be compared. Refresh the linked world to reconcile.') from None
        return result
