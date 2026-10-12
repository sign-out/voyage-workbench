"""Explicit, credential-free access to the community's supplementary validator."""
import hashlib
import json
from urllib.error import HTTPError, URLError
from urllib.request import HTTPRedirectHandler, Request, build_opener
from . import document

URL = 'https://api.unofficial.voyage/validate'
MAX_RESPONSE = 8 * 1024 * 1024


class NoRedirect(HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None


def validate(text, consent=False):
    if consent is not True:
        raise ValueError('Explicit consent is required to send world content to api.unofficial.voyage.')
    if not isinstance(text, str):
        raise ValueError('World content must be JSON text.')
    document.parse(text)
    info = document.inspect(text)
    path = info.get('gameStatePath')
    if path is None:
        raise ValueError('No recognizable GameState found for community validation.')
    state = document.section(text, path)
    request = Request(URL, data=state.encode('utf-8'), headers={
        'Content-Type': 'application/json', 'Accept': 'application/json',
        'User-Agent': 'Voyage-Workbench/1'}, method='POST')
    try:
        with build_opener(NoRedirect()).open(request, timeout=30) as response:
            raw = response.read(MAX_RESPONSE + 1)
    except HTTPError as error:
        error.close()
        raise ValueError(f'Community validation unavailable (HTTP {error.code}). No validation result was established.') from None
    except (URLError, TimeoutError, OSError):
        raise ValueError('Community validation could not be reached. No validation result was established.') from None
    if len(raw) > MAX_RESPONSE:
        raise ValueError('Community validator response exceeded the size limit.')
    try:
        result = json.loads(raw)
    except (ValueError, UnicodeError):
        raise ValueError('Community validator returned invalid JSON.') from None
    if not isinstance(result, dict) or any(not isinstance(result.get(k), list) for k in ('errors', 'warnings', 'recommendations')):
        raise ValueError('Community validator returned an unexpected response; no pass was established.')
    if any(not isinstance(issue, (dict, str)) for key in ('errors','warnings','recommendations') for issue in result[key]):
        raise ValueError('Community validator returned malformed issues.')
    return {**{key: result[key] for key in ('errors','warnings','recommendations')},
            'validatorVersion': result.get('validatorVersion') if isinstance(result.get('validatorVersion'), str) else None,
            'source': URL, 'engine': 'Unofficial Voyage community validator', 'stage': 'community',
            'documentHash': hashlib.sha256(text.encode('utf-8')).hexdigest(),
            'submittedHash': hashlib.sha256(state.encode('utf-8')).hexdigest()}
