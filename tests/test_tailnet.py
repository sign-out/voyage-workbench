import json
import unittest
from unittest.mock import patch
from workbench.tailnet import register, origin

class TailnetTests(unittest.TestCase):
    def test_private_registration(self):
        with patch('workbench.tailnet.command',side_effect=[json.dumps({'BackendState':'Running','Self':{'DNSName':'builder.example.ts.net.'}}),'{}','',json.dumps({'TCP':{'8443':{'HTTPS':True}},'Web':{'builder.example.ts.net:8443':{'Handlers':{'/':{'Proxy':'http://127.0.0.1:8765'}}}}})]) as run:
            self.assertEqual(register(8765),'https://builder.example.ts.net:8443')
            self.assertEqual(run.call_args_list[2].args,('serve','--bg','--https=8443','http://127.0.0.1:8765'))
    def test_refuses_other_service_and_funnel(self):
        status=json.dumps({'BackendState':'Running','Self':{'DNSName':'builder.example.ts.net.'}})
        for config in [{'TCP':{'8443':{'TCPForward':'elsewhere:22'}}},{'AllowFunnel':{'builder.example.ts.net:8443':True}}]:
            with patch('workbench.tailnet.command',side_effect=[status,json.dumps(config)]) as run:
                with self.assertRaises(ValueError):register(8765)
                self.assertEqual(run.call_count,2)
    def test_exact_https_origin(self):
        self.assertEqual(origin('https://builder.example.ts.net:8443/'),'https://builder.example.ts.net:8443')
        for value in ['http://builder.example.ts.net','https://example.com','https://builder.example.ts.net.evil.com','https://user@builder.example.ts.net','https://builder.example.ts.net/path']:
            with self.assertRaises(ValueError):origin(value)
