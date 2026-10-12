"""Small local credential store, separate from project JSON and exports."""

import base64
import ctypes
import json
import os
import tempfile
from pathlib import Path


def _dpapi(data, decrypt=False):
    """Protect Windows credentials for the current logon account."""
    from ctypes import wintypes

    class Blob(ctypes.Structure):
        _fields_ = [('size', wintypes.DWORD), ('data', ctypes.POINTER(ctypes.c_byte))]

    crypt = ctypes.windll.crypt32
    crypt.CryptProtectData.argtypes = [ctypes.POINTER(Blob), wintypes.LPCWSTR,
                                       ctypes.POINTER(Blob), ctypes.c_void_p,
                                       ctypes.c_void_p, wintypes.DWORD, ctypes.POINTER(Blob)]
    crypt.CryptUnprotectData.argtypes = [ctypes.POINTER(Blob), ctypes.POINTER(wintypes.LPWSTR),
                                         ctypes.POINTER(Blob), ctypes.c_void_p,
                                         ctypes.c_void_p, wintypes.DWORD, ctypes.POINTER(Blob)]
    crypt.CryptProtectData.restype = crypt.CryptUnprotectData.restype = wintypes.BOOL
    kernel = ctypes.windll.kernel32
    kernel.LocalFree.argtypes = [ctypes.c_void_p]
    kernel.LocalFree.restype = ctypes.c_void_p
    raw = ctypes.create_string_buffer(data)
    source = Blob(len(data), ctypes.cast(raw, ctypes.POINTER(ctypes.c_byte)))
    result = Blob()
    operation = crypt.CryptUnprotectData if decrypt else crypt.CryptProtectData
    args = (ctypes.byref(source), None, None, None, None, 0x1, ctypes.byref(result))
    if not operation(*args):
        raise OSError('Windows could not unlock the saved Creator API key.')
    try:
        return ctypes.string_at(result.data, result.size)
    finally:
        kernel.LocalFree(ctypes.cast(result.data, ctypes.c_void_p))


class CredentialStore:
    def __init__(self, path):
        self.path = Path(path)

    def load(self):
        if not self.path.exists():
            return {'version': 1, 'environment': 'production', 'keys': {}}
        raw = self.path.read_bytes()
        if os.name == 'nt':
            wrapper = json.loads(raw)
            raw = _dpapi(base64.b64decode(wrapper['dpapi'], validate=True), decrypt=True)
        else:
            # The file may have been moved from a permissive filesystem.
            if self.path.stat().st_mode & 0o077:
                raise ValueError('Saved Creator API key file is readable by other users. Restrict it to owner-only access.')
        record = json.loads(raw)
        if record.get('version') != 1 or record.get('environment') not in ('production', 'alpha'):
            raise ValueError('Saved Creator API key file has an unsupported format.')
        keys = record.get('keys')
        if not isinstance(keys, dict) or any(env not in ('production', 'alpha') or not isinstance(key, str) for env, key in keys.items()):
            raise ValueError('Saved Creator API key file is invalid.')
        return record

    def save(self, environment, key=None):
        if environment not in ('production', 'alpha'):
            raise ValueError('Unknown API environment.')
        try:
            record = self.load()
        except (OSError, ValueError, KeyError, TypeError):
            if key is None:
                raise
            record = {'version': 1, 'environment': environment, 'keys': {}}
        record['environment'] = environment
        if key is not None:
            if not isinstance(key, str) or not key.strip():
                raise ValueError('Enter a Creator API key.')
            record['keys'][environment] = key.strip()
        self._write(record)
        return record

    def forget(self, environment):
        if environment not in ('production', 'alpha'):
            raise ValueError('Unknown API environment.')
        record = self.load()
        record['keys'].pop(environment, None)
        if record['environment'] == environment:
            record['environment'] = next(iter(record['keys']), 'production')
        self._write(record)
        return record

    def _write(self, record):
        self.path.parent.mkdir(parents=True, exist_ok=True)
        raw = json.dumps(record, separators=(',', ':')).encode('utf-8')
        if os.name == 'nt':
            raw = json.dumps({'dpapi': base64.b64encode(_dpapi(raw)).decode('ascii')}).encode('utf-8')
        fd, name = tempfile.mkstemp(prefix='.creator-key-', dir=self.path.parent)
        try:
            if os.name != 'nt':
                os.fchmod(fd, 0o600)
            with os.fdopen(fd, 'wb') as stream:
                stream.write(raw)
                stream.flush()
                os.fsync(stream.fileno())
            os.replace(name, self.path)
            if os.name != 'nt':
                self.path.chmod(0o600)
        finally:
            if os.path.exists(name):
                os.unlink(name)
