import base64
import json
from pathlib import Path
import shutil
import subprocess
import struct
import tempfile
import threading
import time
import unittest
import zlib

from workbench.artwork import Artwork, slice_image
from workbench.assets import Assets
from workbench.server import Store


def png(width=7, height=5, seed=0):
    def chunk(kind, data):
        return struct.pack('>I', len(data)) + kind + data + struct.pack('>I', zlib.crc32(kind + data) & 0xffffffff)
    pixels = b''.join(b'\0' + bytes(channel for x in range(width) for channel in ((x * 20 + seed) % 256, y * 30 % 256, 100)) for y in range(height))
    return b'\x89PNG\r\n\x1a\n' + chunk(b'IHDR', struct.pack('>IIBBBBB', width, height, 8, 2, 0, 0, 0)) + chunk(b'IDAT', zlib.compress(pixels)) + chunk(b'IEND', b'')


def has_image_processor():
    try:
        import PIL
        return True
    except ImportError:
        return bool(shutil.which('magick'))


class ImageSession:
    calls = []
    def __init__(self, **kwargs):
        self.kw = kwargs
        self.calls.append(kwargs)
    def run(self, prompt, cancel):
        self.kw['prompt'] = prompt
        self.kw['on_event']('image/completed', {'item': {'id': 'image', 'result': base64.b64encode(png(seed=len(self.calls))).decode(), 'revisedPrompt': prompt}})
        return {'status': 'completed', 'text': 'Created artwork'}


class ArtworkTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.store = Store(Path(self.temp.name) / 'db')
        self.assets = Assets(self.store)
        self.project = self.store.create('World', '{"heroesVersion":36,"exact":9007199254740993}')
        self.pid = self.project['id']
        ImageSession.calls = []
        self.service = Artwork(self.store, self.assets, ImageSession)
    def tearDown(self):
        self.service.close()
        self.temp.cleanup()
    def create(self, **kwargs):
        return self.service.create(self.pid, {'prompt': 'Coastal islands with joining rivers', 'columns': 3, 'rows': 2, **kwargs})
    def wait(self, jid):
        deadline = time.monotonic() + 5
        while time.monotonic() < deadline:
            job = self.service.get(self.pid, jid)
            if job['status'] not in ('running', 'cancelling'):
                return job
            time.sleep(.01)
        self.fail('Artwork job did not finish')

    def test_create_is_local_and_detail_grid_presets_are_linked(self):
        job = self.service.create(self.pid, {'prompt': 'Islands', 'detail': 'high', 'shape': 'wide'})
        self.assertEqual((job['rows'], job['columns'], job['tileCount'], job['tilePixels']), (4, 4, 16, 1536))
        self.assertEqual(ImageSession.calls, [])
        self.assertEqual(job['status'], 'draft')
        self.assertEqual(Artwork(self.store, self.assets, ImageSession).get(self.pid, job['id']), job)
        for body in ({'columns': True}, {'rows': 9}, {'shape': 'bad'}, {'detail': 'maximum'}, {'mode': 'unknown'}, {'prompt': ''}):
            with self.subTest(body=body), self.assertRaises(ValueError):
                self.create(**body)

    @unittest.skipUnless(has_image_processor(), 'Pillow or ImageMagick required')
    def test_master_split_and_real_reference_attachment_preserve_versions(self):
        job = self.create(mode='master')
        self.service.generate(self.pid, job['id'])
        master = self.wait(job['id'])
        self.assertEqual(master['status'], 'ready')
        self.assertEqual(ImageSession.calls[0]['reference_images'], [])
        sliced = self.service.split(self.pid, job['id'])
        self.assertEqual(len(ImageSession.calls), 1)
        self.assertEqual((sliced['width'], sliced['height']), (7, 5))
        self.assertEqual(sum((t['bounds'][2]-t['bounds'][0])*(t['bounds'][3]-t['bounds'][1]) for t in sliced['tiles']), 35)
        original_crop = sliced['tiles'][4]['cropAssetId']
        self.service.generate(self.pid, job['id'], {'prompt': 'Add ruins while keeping the river'}, tile_index=4)
        refined = self.wait(job['id'])
        call = ImageSession.calls[-1]
        self.assertEqual(call['reference_images'], [self.assets.reference_path(self.pid, original_crop), self.assets.reference_path(self.pid, master['masterAssetId'])])
        self.assertIn('Add ruins', call['prompt'])
        self.assertEqual(refined['tiles'][4]['cropAssetId'], original_crop)
        self.assertNotEqual(refined['tiles'][4]['assetId'], original_crop)
        self.assertEqual(len(refined['tiles'][4]['versions']), 2)
        self.assertEqual(refined['requests'][-1]['referenceAssetIds'], [original_crop, master['masterAssetId']])
        with self.store.connect() as db:
            self.assertEqual(self.store.project(db, self.pid)['text'], self.project['text'])
        self.assertEqual(len(self.store.revisions.history(self.pid)), 1)
        # Re-splitting the same image remains immutable and deterministic.
        self.assertEqual(self.service.split(self.pid, job['id'])['tiles'][4]['cropAssetId'], original_crop)

    @unittest.skipUnless(has_image_processor(), 'Pillow or ImageMagick required')
    def test_new_master_requires_fresh_crops_but_keeps_old_versions(self):
        asset = self.assets.capture_bytes(self.pid, 'import', 'master', png())
        job = self.create(masterAssetId=asset['id'])
        sliced = self.service.split(self.pid, job['id'])
        old_crop = sliced['tiles'][0]['cropAssetId']
        self.service.generate(self.pid, job['id'])
        changed = self.wait(job['id'])
        self.assertIsNone(changed['tiles'][0]['cropAssetId'])
        self.assertIn(old_crop, changed['tiles'][0]['versions'])
        self.assertEqual(len(changed['masterVersions']), 2)
        with self.assertRaisesRegex(ValueError, 'Split'):
            self.service.generate(self.pid, job['id'], tile_index=0)

    def test_individual_tiles_and_explicit_retry(self):
        job = self.create(mode='individual', columns=2, rows=1)
        self.service.generate(self.pid, job['id'])
        done = self.wait(job['id'])
        self.assertEqual(done['status'], 'complete')
        self.assertTrue(all(t['status'] == 'complete' for t in done['tiles']))
        self.assertEqual(len(ImageSession.calls), 2)
        self.service.generate(self.pid, job['id'])
        self.assertEqual(len(ImageSession.calls), 2)
        self.service.generate(self.pid, job['id'], {'prompt': 'More detail'}, tile_index=1)
        retried = self.wait(job['id'])
        self.assertEqual(len(retried['tiles'][1]['versions']), 2)
        self.assertEqual(list(self.service.workspace.rglob('*')), [self.service.workspace / self.pid])

    @unittest.skipUnless(has_image_processor(), 'Pillow or ImageMagick required')
    def test_refine_all_cropped_tiles_once_with_real_references(self):
        asset = self.assets.capture_bytes(self.pid, 'import', 'master', png())
        job = self.create(masterAssetId=asset['id'], columns=2, rows=1)
        with self.assertRaisesRegex(ValueError, 'Split'):
            self.service.generate(self.pid, job['id'], {'target': 'tiles'})
        self.service.split(self.pid, job['id'])
        self.service.generate(self.pid, job['id'], {'target': 'tiles'})
        done = self.wait(job['id'])
        self.assertEqual(len(ImageSession.calls), 2)
        self.assertTrue(all(t['status'] == 'complete' for t in done['tiles']))
        self.assertTrue(all(len(call['reference_images']) == 2 for call in ImageSession.calls))
        self.service.generate(self.pid, job['id'], {'target': 'tiles'})
        self.assertEqual(len(ImageSession.calls), 2)

    def test_failure_preserves_completed_tiles_and_retry_only_unfinished(self):
        class FailSecond(ImageSession):
            def run(inner, prompt, cancel):
                if len(ImageSession.calls) == 2:
                    raise RuntimeError('Provider unavailable')
                return super(FailSecond, inner).run(prompt, cancel)
        self.service.session_factory = FailSecond
        job = self.create(mode='individual', columns=3, rows=1)
        self.service.generate(self.pid, job['id'])
        failed = self.wait(job['id'])
        self.assertEqual(failed['status'], 'failed')
        self.assertEqual(failed['tiles'][0]['status'], 'complete')
        self.assertEqual(failed['tiles'][1]['status'], 'failed')
        self.service.session_factory = ImageSession
        self.service.generate(self.pid, job['id'])
        done = self.wait(job['id'])
        self.assertEqual(done['status'], 'complete')
        self.assertEqual(len(done['tiles'][0]['versions']), 1)
        self.assertEqual(len(ImageSession.calls), 4)

    def test_cancellation_blocks_late_images_and_keeps_completed_assets(self):
        ready = threading.Event()
        class Waiting(ImageSession):
            def run(inner, prompt, cancel):
                ready.set()
                cancel.wait(3)
                return super(Waiting, inner).run(prompt, cancel)
        self.service.session_factory = Waiting
        job = self.create(mode='master')
        self.service.generate(self.pid, job['id'])
        self.assertTrue(ready.wait(2))
        self.service.cancel(self.pid, job['id'])
        cancelled = self.wait(job['id'])
        self.assertEqual(cancelled['status'], 'cancelled')
        self.assertIsNone(cancelled['masterAssetId'])
        self.assertEqual(self.assets.list(self.pid), [])

    def test_project_scope_and_restart_recovery(self):
        job = self.create()
        other = self.store.create('Other', '{}')['id']
        for action in (lambda: self.service.get(other, job['id']), lambda: self.service.generate(other, job['id']), lambda: self.service.split(other, job['id'])):
            with self.assertRaises(KeyError):
                action()
        with self.store.connect() as db:
            raw = self.service._get(db, self.pid, job['id'])
            raw['status'] = 'running'
            self.service._save(db, raw)
        reopened = Artwork(self.store, self.assets, ImageSession)
        self.assertEqual(reopened.get(self.pid, job['id'])['status'], 'interrupted')
        self.assertEqual(ImageSession.calls, [])

    @unittest.skipUnless(has_image_processor(), 'Pillow or ImageMagick required')
    def test_slice_uneven_edges_without_generation_and_reject_tiny_images(self):
        width, height, boxes, crops = slice_image(png(), 3, 2)
        self.assertEqual((width, height), (7, 5))
        self.assertEqual(boxes[-1], (4, 2, 7, 5))
        self.assertEqual(len(crops), 6)
        for box, crop in zip(boxes, crops):
            self.assertEqual(struct.unpack('>II', crop[16:24]), (box[2]-box[0], box[3]-box[1]))
            try:
                from PIL import Image
                import io
                with Image.open(io.BytesIO(crop)) as decoded:
                    pixels = decoded.convert('RGB').tobytes()
            except ImportError:
                pixels = subprocess.run([shutil.which('magick'), 'png:-', '-depth', '8', 'rgb:-'], input=crop, capture_output=True, check=True).stdout
            expected = bytes(channel for y in range(box[1], box[3]) for x in range(box[0], box[2]) for channel in (x * 20, y * 30, 100))
            self.assertEqual(pixels, expected)
        with self.assertRaises(ValueError):
            slice_image(png(1, 1), 2, 2)


if __name__ == '__main__':
    unittest.main()
