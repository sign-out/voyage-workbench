import unittest
from unittest.mock import Mock, patch
from workbench import setup

class SetupTests(unittest.TestCase):
    def test_connected_tailnet_does_not_repeat_login(self):
        state={'BackendState':'Running','Self':{'DNSName':'builder.example.ts.net.'}}
        with patch('workbench.setup.tailnet.binary',return_value='/usr/bin/tailscale'), \
             patch('workbench.setup.tailnet.status',return_value=state), \
             patch('workbench.setup.tailnet.command',return_value='{}') as command, \
             patch('workbench.setup.subprocess.run') as run:
            self.assertEqual(setup.ensure_tailnet(),state)
            run.assert_not_called()
            command.assert_called_once_with('serve','status','--json')

    def test_first_install_starts_service_and_prompts_for_login(self):
        offline={'BackendState':'NeedsLogin'}
        online={'BackendState':'Running','Self':{'DNSName':'builder.example.ts.net.'}}
        with patch('workbench.setup.tailnet.binary',return_value='/usr/bin/tailscale'), \
             patch('workbench.setup.tailnet.status',side_effect=[offline,online]), \
             patch('workbench.setup.sys.stdin') as stdin, \
             patch('workbench.setup.subprocess.run',return_value=Mock(returncode=0)) as run, \
             patch.dict('workbench.setup.os.environ',{'USER':'builder'}):
            stdin.isatty.return_value=True
            self.assertEqual(setup.ensure_tailnet(),online)
            self.assertEqual([c.args[0] for c in run.call_args_list], [
                ['sudo','systemctl','enable','--now','tailscaled'],
                ['sudo','/usr/bin/tailscale','up'],
                ['sudo','/usr/bin/tailscale','set','--operator=builder']])

    def test_headless_setup_explains_interactive_login(self):
        with patch('workbench.setup.tailnet.binary',return_value='/usr/bin/tailscale'), \
             patch('workbench.setup.tailnet.status',return_value={'BackendState':'NeedsLogin'}), \
             patch('workbench.setup.sys.stdin') as stdin:
            stdin.isatty.return_value=False
            with self.assertRaisesRegex(ValueError,'interactive sign-in'):
                setup.ensure_tailnet()

if __name__=='__main__':unittest.main()
