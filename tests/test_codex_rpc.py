import json
import os
import sys
import tempfile
import threading
import time
import unittest
from pathlib import Path
from unittest.mock import patch

from workbench.codex_rpc import CodexError, CodexSession, CONFIG


FAKE = r'''
import json,sys
config=json.loads(sys.argv[1]); mode=sys.argv[2]; log=sys.argv[3]
def emit(x): print(json.dumps(x),flush=True)
def notify(m,p): emit({'method':m,'params':p})
for line in sys.stdin:
 m=json.loads(line)
 with open(log,'a') as f:f.write(json.dumps(m)+'\n')
 method=m.get('method'); rid=m.get('id')
 if method=='initialize': result={}
 elif method=='config/read':result={'config':config}
 elif method in ('thread/start','thread/resume'):result={'thread':{'id':'persistent-thread'},'model':'fake-model','reasoningEffort':'medium'}
 elif method=='mcpServerStatus/list':result={'data':[]}
 elif method=='turn/start':
  emit({'id':rid,'result':{'turn':{'id':'turn-1'}}})
  if mode=='hang':
   notify('turn/started',{'threadId':'persistent-thread','turn':{'id':'turn-1'}});continue
  if mode=='unknown':
   emit({'id':900,'method':'item/commandExecution/requestApproval','params':{}});continue
  emit({'id':901,'method':'item/tool/call','params':{'threadId':'persistent-thread','turnId':'turn-1','callId':'c','tool':'lookup','arguments':{'id':'one'}}})
  continue
 elif method=='turn/interrupt':
  emit({'id':rid,'result':{}})
  notify('turn/completed',{'threadId':'persistent-thread','turn':{'id':'turn-1','status':'interrupted'}});continue
 elif rid in (900,901):
  if mode=='image':
   image={'threadId':'persistent-thread','turnId':'turn-1','item':{'type':'imageGeneration','id':'image-1','status':'completed','result':'aW1hZ2U=','savedPath':'/tmp/native-image.png','revisedPrompt':'Synthetic icon'}}
   notify('item/completed',image);notify('item/completed',image)
  notify('item/agentMessage/delta',{'threadId':'persistent-thread','turnId':'turn-1','itemId':'answer','delta':'Hello '})
  notify('item/agentMessage/delta',{'threadId':'persistent-thread','turnId':'turn-1','itemId':'answer','delta':'world'})
  notify('item/completed',{'threadId':'persistent-thread','turnId':'turn-1','item':{'id':'answer','type':'agentMessage','text':'Hello world'}})
  notify('turn/completed',{'threadId':'persistent-thread','turn':{'id':'turn-1','status':'completed'}});continue
 else:continue
 emit({'id':rid,'result':result})
'''


class CodexRpcTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.root = Path(self.tmp.name)
        self.script = self.root / 'fake.py'
        self.script.write_text(FAKE)
        self.log = self.root / 'wire.jsonl'

    def tearDown(self):
        self.tmp.cleanup()

    def session(self, mode='normal', **kwargs):
        session = CodexSession(self.root, [{'name': 'lookup', 'description': 'Read one record', 'inputSchema': {'type': 'object'}}],
                               'Only use the provided tools', **kwargs)
        session._command = lambda: [sys.executable, str(self.script), json.dumps(session.config), mode, str(self.log)]
        return session

    def wire(self):
        return [json.loads(line) for line in self.log.read_text().splitlines()]

    def test_dynamic_tool_stream_and_resume(self):
        calls = []
        events = []
        session = self.session(on_tool=lambda name, args: calls.append((name, args)) or {'value': 42},
                               on_event=lambda method, params: events.append(method))
        first = session.run('Look it up', threading.Event())
        second = session.run('Remember the result', threading.Event())
        self.assertEqual(first['text'], 'Hello world')
        self.assertEqual(second['threadId'], first['threadId'])
        self.assertEqual(len(calls), 2)
        self.assertIn('tool/started', events)
        wire = self.wire()
        start = next(item for item in wire if item.get('method') == 'thread/start')
        self.assertEqual(start['params']['dynamicTools'][0]['type'], 'function')
        resume = next(item for item in wire if item.get('method') == 'thread/resume')
        self.assertNotIn('dynamicTools', resume['params'])
        turn = next(item for item in wire if item.get('method') == 'turn/start')
        settings = turn['params']['collaborationMode']['settings']
        self.assertEqual(settings['model'], 'fake-model')
        self.assertEqual(settings['reasoning_effort'], 'medium')
        self.assertIn('Only use the provided tools', settings['developer_instructions'])
        results = [item['result'] for item in wire if item.get('id') == 901]
        self.assertEqual(results[0]['contentItems'][0]['type'], 'inputText')
        self.assertIsNone(session.process)

    def test_reference_images_are_native_turn_inputs(self):
        reference = self.root / 'reference.png'
        reference.write_bytes(b'image-fixture')
        session = self.session(reference_images=[str(reference)], image_generation=True)
        session.run('Refine this attached tile', threading.Event())
        turn = next(item for item in self.wire() if item.get('method') == 'turn/start')
        self.assertEqual(turn['params']['input'][1], {'type': 'localImage', 'path': str(reference)})
        with self.assertRaises(ValueError):
            self.session(reference_images=['https://example.com/image.png'])
        with self.assertRaises(ValueError):
            self.session(reference_images=[str(reference)] * 6)

    def test_unknown_request_is_denied_without_hanging(self):
        session = self.session('unknown')
        self.assertEqual(session.run('Hi', threading.Event())['status'], 'completed')
        denial = next(item for item in self.wire() if item.get('id') == 900)
        self.assertEqual(denial['error']['code'], -32601)

    def test_cancel_and_timeout_are_bounded(self):
        cancel = threading.Event()
        session = self.session('hang', timeout=3,
                               on_event=lambda method, params: cancel.set() if method == 'turn/started' else None)
        self.assertEqual(session.run('Hi', cancel)['status'], 'interrupted')
        self.assertIn('turn/interrupt', [item.get('method') for item in self.wire()])
        session = self.session('hang', timeout=0.25)
        with self.assertRaises(TimeoutError):
            session.run('Hi', threading.Event())
        self.assertIsNone(session.process)

    def test_tool_failure_is_structured(self):
        def broken(*args):
            raise ValueError('Bad record')
        session = self.session(on_tool=broken)
        session.run('Hi', threading.Event())
        result = next(item['result'] for item in self.wire() if item.get('id') == 901)
        self.assertFalse(result['success'])
        self.assertIn('Bad record', result['contentItems'][0]['text'])

    def test_isolation_config_and_environment(self):
        session = self.session()
        session._verify_config(CONFIG)
        bad = dict(CONFIG, mcp_servers={'unexpected': {'command': 'x'}})
        with self.assertRaises(CodexError):
            session._verify_config(bad)
        with patch.dict(os.environ, {'VOYAGE_API_KEY': 'do-not-forward', 'OTHER_SECRET': 'hidden'}):
            self.assertNotIn('VOYAGE_API_KEY', session._environment())
            self.assertNotIn('OTHER_SECRET', session._environment())

    def test_disabled_connector_metadata_is_inert_but_tools_are_rejected(self):
        session = self.session()
        effective = dict(CONFIG, mcp_servers={'node_repl': {'enabled': False}})
        row = {'name': 'node_repl', 'runtimeStatus': None, 'tools': {}, 'resources': [], 'resourceTemplates': []}
        session._verify_config(effective)
        session._verify_connectors({'data': [row]}, effective)
        for altered in [dict(row, tools={'run': {}}), dict(row, name='unexpected'), dict(row, runtimeStatus='ready')]:
            with self.assertRaises(CodexError):
                session._verify_connectors({'data': [altered]}, effective)

    def test_image_generation_is_opt_in_and_emits_artifact_once(self):
        events = []
        session = self.session('image', image_generation=True,
                               on_event=lambda method, params: events.append((method, params)))
        result = session.run('Generate an icon', threading.Event())
        images = [params for method, params in events if method == 'image/completed']
        self.assertEqual(len(images), 1)
        self.assertEqual(images[0]['item']['result'], 'aW1hZ2U=')
        self.assertEqual(images[0]['item']['savedPath'], '/tmp/native-image.png')
        self.assertEqual(result['text'], 'Hello world')
        self.assertTrue(session.config['features']['image_generation'])
        self.assertFalse(CONFIG['features']['image_generation'])
        for key, value in CONFIG['features'].items():
            if key != 'image_generation':
                self.assertEqual(session.config['features'][key], value)
        with self.assertRaises(CodexError):
            session._verify_config(CONFIG)
        events.clear()
        self.session('image', on_event=lambda method, params: events.append(method)).run('Hi', threading.Event())
        self.assertNotIn('image/completed', events)


if __name__ == '__main__':
    unittest.main()
