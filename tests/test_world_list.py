import json
import unittest
from workbench.voyage import Client, VoyageError


class WorldListTests(unittest.TestCase):
    def test_zero_based_page_and_metadata_are_preserved(self):
        client = Client()
        calls = []
        response = {'data': {'worlds': [{'shortId': 'next-world'}], 'totalCount': 32}}
        client.request = lambda method, path: (calls.append((method, path)) or (json.dumps(response), None))
        self.assertEqual(client.list_worlds(2), response)
        self.assertEqual(calls, [('GET', '/worlds?page=2')])
        client.list_worlds()
        self.assertEqual(calls[-1], ('GET', '/worlds?page=0'))

    def test_invalid_pages_never_make_a_remote_request(self):
        client = Client()
        client.request = lambda *args: self.fail('Unexpected remote request')
        for page in (-1, 1.5, '2', True, None, []):
            with self.subTest(page=page), self.assertRaises(VoyageError):
                client.list_worlds(page)


if __name__ == '__main__':
    unittest.main()
