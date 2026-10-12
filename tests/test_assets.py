import base64
import tempfile
import unittest
from pathlib import Path
from workbench.assets import Assets
from workbench.server import Store

PNG=base64.b64decode('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=')

class AssetTests(unittest.TestCase):
    def setUp(self):
        self.tmp=tempfile.TemporaryDirectory();self.store=Store(Path(self.tmp.name)/'db');self.assets=Assets(self.store)
        self.p=self.store.create('World','{"heroesVersion":36}')['id']
        self.item={'id':'img-1','result':base64.b64encode(PNG).decode(),'revisedPrompt':'Island map'}
    def tearDown(self):self.tmp.cleanup()
    def test_capture_restart_and_immutable_versions(self):
        a=self.assets.capture(self.p,'run1',self.item)
        self.assertEqual(self.assets.capture(self.p,'run1',self.item),a)
        b=self.assets.capture(self.p,'run2',self.item);self.assertNotEqual(a['id'],b['id'])
        self.assertEqual(Assets(self.store).read(self.p,a['id'])[0],PNG)
        self.assertEqual(len(self.assets.list(self.p)),2)
        with self.assertRaises(ValueError):self.assets.capture(self.p,'run1',{**self.item,'result':base64.b64encode(PNG+b'changed').decode()})
    def test_reject_paths_remote_urls_and_other_projects(self):
        for data in ['/etc/passwd','https://example.com/a.png','<svg></svg>']:
            with self.assertRaises(ValueError):self.assets.capture(self.p,'run',dict(self.item,result=data))
        a=self.assets.capture(self.p,'run',self.item)
        other=self.store.create('Other','{}')['id']
        with self.assertRaises(KeyError):self.assets.read(other,a['id'])
        with self.assertRaises(KeyError):self.assets.read(self.p,'../db')
    def test_symlinks_and_corruption_rejected(self):
        a=self.assets.capture(self.p,'run',self.item)
        path=self.assets.root/(a['id']+'.png');path.write_bytes(b'changed')
        with self.assertRaises(ValueError):self.assets.read(self.p,a['id'])

if __name__=='__main__':unittest.main()
