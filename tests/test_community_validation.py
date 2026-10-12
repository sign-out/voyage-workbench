import json
import unittest
from unittest.mock import patch, MagicMock
from urllib.error import HTTPError, URLError
from workbench.community_validation import validate, NoRedirect, URL, MAX_RESPONSE


class CommunityValidationTests(unittest.TestCase):
    def response(self, result):
        opener = MagicMock()
        opener.open.return_value.__enter__.return_value.read.return_value = json.dumps(result).encode()
        return opener

    def test_explicit_consent_before_network(self):
        with patch('workbench.community_validation.build_opener') as network:
            for consent in [False, None, 'true', 1]:
                with self.assertRaises(ValueError):
                    validate('{}', consent)
            network.assert_not_called()

    def test_lossless_state_only_and_no_credentials(self):
        opener = self.response({'errors': [], 'warnings': [], 'recommendations': [{'message': 'Add lore'}], 'validatorVersion': '2026-09-30'})
        text = '{"title":"private metadata","initialGameState": {"npcs":{},"number":90071992547409939999}}'
        with patch('workbench.community_validation.build_opener', return_value=opener):
            result = validate(text, True)
        req = opener.open.call_args.args[0]
        self.assertEqual(req.full_url, URL)
        self.assertEqual(req.data, b'{"npcs":{},"number":90071992547409939999}')
        self.assertFalse(any(k.lower() in ('authorization','cookie') for k in req.headers))
        self.assertEqual(result['stage'], 'community')
        self.assertEqual(len(result['documentHash']), 64)
        self.assertEqual(result['validatorVersion'], '2026-09-30')
        self.assertEqual(len(result['recommendations']), 1)

    def test_local_structural_issue_does_not_veto_remote_check(self):
        opener = self.response({'errors': [{'message':'NPCs invalid'}], 'warnings': [], 'recommendations': []})
        with patch('workbench.community_validation.build_opener', return_value=opener):
            self.assertEqual(len(validate('{"heroesVersion":36,"npcs":[]}', True)['errors']),1)

    def test_bad_responses_cannot_pass(self):
        for value in [{}, {'errors': [], 'warnings': []}, [], {'errors': [3], 'warnings': [], 'recommendations': []}]:
            with patch('workbench.community_validation.build_opener', return_value=self.response(value)):
                with self.assertRaises(ValueError): validate('{"heroesVersion":36,"npcs":{}}', True)

    def test_outages_and_redirects(self):
        self.assertIsNone(NoRedirect().redirect_request(None,None,302,'redirect',{},'https://other.example'))
        for error in [HTTPError(URL,403,'forbidden',{},None),URLError('offline')]:
            opener=MagicMock();opener.open.side_effect=error
            with patch('workbench.community_validation.build_opener',return_value=opener):
                with self.assertRaisesRegex(ValueError,'No validation result'):
                    validate('{"heroesVersion":36,"npcs":{}}',True)

    def test_invalid_and_oversize_response(self):
        for raw in [b'not JSON', b'x'*(MAX_RESPONSE+1)]:
            opener=MagicMock();opener.open.return_value.__enter__.return_value.read.return_value=raw
            with patch('workbench.community_validation.build_opener',return_value=opener):
                with self.assertRaises(ValueError):validate('{"heroesVersion":36,"npcs":{}}',True)
