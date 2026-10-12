"""Bounded stdio adapter for Codex app-server with explicit application tools.

Thread IDs refer to real Codex rollouts. Each run owns one fresh process and
resumes the stored rollout; the adapter never retries a model turn.
"""
import json
import os
import queue
import re
import subprocess
import threading
import time


DISABLED_FEATURES = (
    'shell_tool', 'unified_exec', 'plugins', 'remote_plugin', 'apps', 'hooks',
    'browser_use', 'browser_use_external', 'browser_use_full_cdp_access',
    'computer_use', 'in_app_browser', 'view_image', 'multi_agent', 'multi_agent_v2',
    'workspace_dependencies', 'skill_search', 'skill_mcp_dependency_install',
    'image_generation', 'code_mode', 'code_mode_only',
    'memories', 'goals', 'sleep_tool', 'tool_suggest', 'recommended_plugins',
    'in_app_local_automation', 'realtime_conversation',
)
CONFIG = {'features': {**{key: False for key in DISABLED_FEATURES}, 'code_mode_host': True},
          'mcp_servers': {}, 'web_search': 'disabled', 'project_doc_max_bytes': 0,
          'sandbox_mode': 'read-only', 'approval_policy': 'never'}


class CodexError(RuntimeError):
    """An explicit protocol, configuration, process, or turn failure."""


class _Cancelled(Exception):
    pass


class CodexSession:
    def __init__(self, cwd, tools, instructions, thread_id=None, on_event=None,
                 on_tool=None, on_thread=None, timeout=300, image_generation=False,
                 reference_images=None):
        self.cwd = os.path.abspath(cwd)
        self.tools = [dict(tool, type='function') for tool in tools]
        self.tool_names = {tool['name'] for tool in self.tools}
        self.instructions = instructions
        self.thread_id = thread_id
        self.on_event = on_event or (lambda method, params: None)
        self.on_tool = on_tool or (lambda name, args: {'error': 'No tool handler'})
        self.on_thread = on_thread or (lambda thread_id: None)
        self.timeout = timeout
        if type(image_generation) is not bool:
            raise ValueError('image_generation must be a boolean')
        self.image_generation = image_generation
        self.reference_images = []
        if reference_images is not None and not isinstance(reference_images, (list, tuple)):
            raise ValueError('Image references must be a list of local paths')
        for path in reference_images or []:
            if not isinstance(path, str) or not os.path.isabs(path) or not os.path.isfile(path):
                raise ValueError('Image reference must be an existing absolute local file')
            self.reference_images.append(path)
        if len(self.reference_images) > 5:
            raise ValueError('At most five image references are supported')
        self.config = {**CONFIG, 'features': {**CONFIG['features'], 'image_generation': image_generation}}
        self.process = None
        self._lock = threading.Lock()
        self._running = threading.Lock()
        self._request_id = 0
        self._connector_names = set()

    def _command(self):
        from .setup import codex_binary
        binary = codex_binary()
        if not binary:
            raise CodexError('Codex CLI is not installed or is not on PATH')
        command = [binary, 'app-server', '--stdio']
        for feature in DISABLED_FEATURES:
            enabled = feature == 'image_generation' and self.image_generation
            command.extend(['-c', 'features.' + feature + ('=true' if enabled else '=false')])
        for setting in ['mcp_servers={}', 'web_search="disabled"', 'project_doc_max_bytes=0',
                        'sandbox_mode="read-only"', 'approval_policy="never"', 'notify=[]',
                        'features.code_mode_host=true']:
            command.extend(['-c', setting])
        # Empty TOML tables merge with user config rather than replacing it.
        # Explicitly disable names discovered during the read-only handshake.
        for name in sorted(self._connector_names):
            if not re.fullmatch(r'[A-Za-z0-9_-]+', name):
                raise CodexError('Cannot safely override this MCP connector name')
            command.extend(['-c', 'mcp_servers.' + name + '.enabled=false'])
        return command

    @staticmethod
    def _environment():
        # Auth is loaded by Codex itself from its existing home. Never copy the
        # parent's arbitrary environment (in particular VOYAGE_API_KEY).
        allow = ('HOME', 'CODEX_HOME', 'PATH', 'LANG', 'LC_ALL', 'TMPDIR', 'TEMP',
                 'TMP', 'SYSTEMROOT', 'WINDIR', 'COMSPEC', 'USERPROFILE', 'APPDATA', 'LOCALAPPDATA')
        return {key: os.environ[key] for key in allow if key in os.environ}

    def _start(self):
        self._inbox = queue.Queue()
        self._responses = {}
        self._messages = {}
        self._message_order = []
        self._final_ids = set()
        self._turn = None
        self._completed = None
        self._tool_jobs = set()
        self._image_ids = set()
        self.process = subprocess.Popen(
            self._command(), cwd=self.cwd, env=self._environment(),
            stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.DEVNULL,
            text=True, encoding='utf-8', bufsize=1,
        )
        process = self.process
        inbox = self._inbox

        def read():
            try:
                for line in process.stdout:
                    try:
                        inbox.put(('message', json.loads(line)))
                    except ValueError:
                        inbox.put(('failure', 'App-server returned malformed JSON'))
                        return
            finally:
                inbox.put(('eof', None))
        self._reader = threading.Thread(target=read, daemon=True)
        self._reader.start()

    def _send(self, message):
        with self._lock:
            if self.process is None or self.process.poll() is not None:
                raise CodexError('Codex app-server exited')
            try:
                self.process.stdin.write(json.dumps(message, ensure_ascii=True) + '\n')
                self.process.stdin.flush()
            except (BrokenPipeError, OSError, ValueError) as exc:
                raise CodexError('Codex app-server connection closed') from exc

    def _request(self, method, params):
        self._request_id += 1
        request_id = self._request_id
        self._send({'id': request_id, 'method': method, 'params': params})
        while request_id not in self._responses:
            self._pump()
        response = self._responses.pop(request_id)
        if 'error' in response:
            error = response['error']
            raise CodexError(method + ': ' + str(error.get('message', error)))
        return response.get('result', {})

    def _tool(self, message):
        params = message.get('params', {})
        request_id = message['id']
        name = params.get('tool')
        if (name not in self.tool_names or params.get('namespace') or
                params.get('threadId') != self.thread_id or
                (self._turn and params.get('turnId') != self._turn)):
            self._send({'id': request_id, 'error': {'code': -32602, 'message': 'Tool call outside allowed scope'}})
            return
        self.on_event('tool/started', {'name': name, 'callId': params.get('callId')})
        inbox = self._inbox
        self._tool_jobs.add(request_id)

        def work():
            try:
                value = self.on_tool(name, params.get('arguments', {}))
                result = {'contentItems': [{'type': 'inputText', 'text': json.dumps(value, ensure_ascii=True)}],
                          'success': not (isinstance(value, dict) and bool(value.get('error')))}
            except Exception as exc:
                result = {'contentItems': [{'type': 'inputText', 'text': json.dumps({'error': str(exc)})}], 'success': False}
            inbox.put(('tool-result', (request_id, name, result)))
        threading.Thread(target=work, daemon=True).start()

    def _pump(self, allow_cancel=True):
        if allow_cancel and self._cancel.is_set():
            raise _Cancelled()
        if time.monotonic() >= self._deadline:
            raise TimeoutError('Codex turn exceeded its time limit; it was not retried')
        try:
            kind, value = self._inbox.get(timeout=min(0.1, max(0.001, self._deadline - time.monotonic())))
        except queue.Empty:
            return
        if kind == 'failure':
            raise CodexError(value)
        if kind == 'eof':
            raise CodexError('Codex app-server exited before the turn completed')
        if kind == 'tool-result':
            request_id, name, result = value
            self._tool_jobs.discard(request_id)
            self._send({'id': request_id, 'result': result})
            self.on_event('tool/completed', {'name': name, 'success': result['success']})
            return
        if not isinstance(value, dict):
            raise CodexError('Invalid JSON-RPC envelope')
        method, params = value.get('method'), value.get('params', {})
        if method and 'id' in value:
            if method == 'item/tool/call':
                self._tool(value)
            else:
                self._send({'id': value['id'], 'error': {'code': -32601, 'message': 'This client does not authorize ' + method}})
            return
        if not method:
            if 'id' in value:
                self._responses[value['id']] = value
            return
        # Correlate thread notifications and exclude other turns after the
        # active ID is known. Global startup notifications remain visible.
        if params.get('threadId') and params['threadId'] != self.thread_id:
            return
        if self._turn and params.get('turnId') and params['turnId'] != self._turn:
            return
        if method == 'turn/started':
            self._turn = params.get('turn', {}).get('id')
        if method == 'item/agentMessage/delta':
            item_id = params.get('itemId', 'assistant')
            if item_id not in self._messages:
                self._message_order.append(item_id)
                self._messages[item_id] = ''
            if item_id not in self._final_ids:
                self._messages[item_id] += params.get('delta', '')
        if method == 'item/completed' and params.get('item', {}).get('type') == 'agentMessage':
            item = params['item']
            item_id = item.get('id', 'assistant')
            if item_id not in self._messages:
                self._message_order.append(item_id)
            self._messages[item_id] = item.get('text', '')
            self._final_ids.add(item_id)
        if method == 'item/completed' and params.get('item', {}).get('type') == 'imageGeneration':
            item = params['item']
            image_id = item.get('id')
            if self.image_generation and image_id not in self._image_ids:
                self._image_ids.add(image_id)
                # Deliver the native artifact only to the application's event
                # callback. Do not concatenate base64 into assistant text or
                # automatically open arbitrary paths from the wire.
                self.on_event('image/completed', {'threadId': self.thread_id,
                    'turnId': params.get('turnId', self._turn),
                    'item': {key: item[key] for key in ('id', 'type', 'status', 'result', 'savedPath',
                              'revisedPrompt', 'transparentBackground', 'failure') if key in item}})
        if method == 'turn/completed':
            turn = params.get('turn', {})
            if not self._turn or turn.get('id') == self._turn:
                self._completed = turn
        self.on_event(method, params)

    def _verify_config(self, config):
        features = config.get('features', {})
        bad = [key for key in DISABLED_FEATURES
               if features.get(key) is not (self.image_generation if key == 'image_generation' else False)]
        if (bad or features.get('code_mode_host') is not True or config.get('web_search') != 'disabled'
                or config.get('project_doc_max_bytes') != 0 or config.get('sandbox_mode') != 'read-only'
                or config.get('approval_policy') != 'never'):
            raise CodexError('Codex did not apply the required isolated tool configuration')
        servers = config.get('mcp_servers') or {}
        if any(server.get('enabled', True) for server in servers.values()):
            raise CodexError('Unexpected configured MCP connectors; refusing to start a model turn')

    def _verify_connectors(self, connectors, effective):
        disabled = {name for name, server in (effective.get('mcp_servers') or {}).items() if server.get('enabled') is False}
        # This endpoint includes disabled configured servers as inert entries.
        unexpected = [server for server in connectors.get('data', [])
                      if server.get('name') not in disabled or server.get('runtimeStatus') is not None
                      or server.get('tools') or server.get('resources') or server.get('resourceTemplates')]
        if unexpected or connectors.get('nextCursor'):
            raise CodexError('Unexpected active MCP connectors; refusing to start a model turn')

    def _text(self):
        return '\n\n'.join(self._messages[key] for key in self._message_order if self._messages[key])

    def _initialize(self):
        self._start()
        self._request('initialize', {'clientInfo': {'name': 'voyage_workbench', 'title': 'Voyage Workbench', 'version': '0.1.0'},
                                     'capabilities': {'experimentalApi': True}})
        self._send({'method': 'initialized', 'params': {}})
        return self._request('config/read', {'cwd': self.cwd, 'includeLayers': False}).get('config', {})

    def run(self, message, cancel):
        if not isinstance(message, str) or not message.strip():
            raise ValueError('A nonempty user message is required')
        if not self._running.acquire(blocking=False):
            raise CodexError('This conversation already has an active turn')
        self._cancel = cancel
        self._deadline = time.monotonic() + self.timeout
        try:
            if cancel.is_set():
                return {'threadId': self.thread_id, 'text': '', 'status': 'interrupted'}
            effective = self._initialize()
            enabled = {name for name, server in (effective.get('mcp_servers') or {}).items() if server.get('enabled', True)}
            if enabled:
                self._connector_names.update(enabled)
                self.close()
                effective = self._initialize()
            self._verify_config(effective)
            common = {'cwd': self.cwd, 'approvalPolicy': 'never', 'sandbox': 'read-only',
                      'config': self.config, 'developerInstructions': self.instructions}
            if self.thread_id:
                # Dynamic tools are restored from the actual rollout. The
                # current protocol has no dynamicTools field on thread/resume.
                result = self._request('thread/resume', dict(common, threadId=self.thread_id))
            else:
                result = self._request('thread/start', dict(common, dynamicTools=self.tools, environments=[]))
            self.thread_id = result['thread']['id']
            selected_model = result.get('model')
            selected_effort = result.get('reasoningEffort')
            self.on_thread(self.thread_id)
            connectors = self._request('mcpServerStatus/list', {})
            self._verify_connectors(connectors, effective)
            turn_params = {'threadId': self.thread_id,
                'input': [{'type': 'text', 'text': message, 'text_elements': []}] +
                         [{'type': 'localImage', 'path': path} for path in self.reference_images],
                'approvalPolicy': 'never', 'environments': []}
            if selected_model:
                # Existing rollouts retain their original developer messages.
                # Refresh application policy at developer priority each turn
                # without discarding history or changing the selected model.
                turn_params['collaborationMode'] = {'mode': 'default', 'settings': {
                    'model': selected_model, 'reasoning_effort': selected_effort,
                    'developer_instructions': 'Current application instructions (supersede earlier versions of application instructions):\n' + self.instructions}}
            result = self._request('turn/start', turn_params)
            self._turn = result['turn']['id']
            while self._completed is None:
                self._pump()
            status = self._completed.get('status', 'failed')
            output = {'threadId': self.thread_id, 'text': self._text(), 'status': status}
            if self._completed.get('error'):
                output['error'] = self._completed['error']
            return output
        except _Cancelled:
            if self.process and self.thread_id and self._turn:
                self._request_id += 1
                self._send({'id': self._request_id, 'method': 'turn/interrupt',
                            'params': {'threadId': self.thread_id, 'turnId': self._turn}})
                self._deadline = time.monotonic() + 2
                try:
                    while self._completed is None:
                        self._pump(allow_cancel=False)
                except (TimeoutError, CodexError):
                    pass
            return {'threadId': self.thread_id, 'text': self._text(), 'status': 'interrupted'}
        finally:
            self.close()
            self._running.release()

    def close(self):
        process = self.process
        if process is None:
            return
        if process.poll() is None:
            process.terminate()
            try:
                process.wait(timeout=2)
            except subprocess.TimeoutExpired:
                process.kill()
                process.wait(timeout=2)
        self.process = None
        for stream in (process.stdin, process.stdout):
            if stream:
                stream.close()
