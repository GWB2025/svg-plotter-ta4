import base64
import copy
import json
from pathlib import Path
import tempfile
import unittest
from font_library import FontLibrary
from postcard import PostcardDraft
from plotter_app import create_plotter_app
from plotting import Plotter


def record(suffix=b''):
    raw = b'\x00\x01\x00\x00' + b'\x00' * 12 + suffix
    shape = dict(advance=600, paths=[[[0, 0], [400, 0], [400, 700], [0, 0]]])
    return dict(original_base64=base64.b64encode(raw).decode(),
                font=dict(name='Test outline', credit='Synthetic test fixture', units=1000, cap_height=700,
                          glyphs={' ': dict(advance=300, paths=[]), '?': shape, 'H': shape}))


class FontTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.folder = Path(self.temp.name)
        self.library = FontLibrary(self.folder)

    def test_import_persists_original_and_contours_and_is_idempotent(self):
        result = self.library.add([record(), record()])
        self.assertEqual(result['added'], 1)
        font = result['fonts'][0]
        self.assertEqual(font['kind'], 'outline')
        self.assertEqual(font['glyphs']['H']['bounds'], [0, 0, 400, 700])
        original = self.library.path.read_bytes()
        self.assertEqual(FontLibrary(self.folder).snapshot()['fonts'], result['fonts'])
        self.assertEqual(self.library.add([record()])['added'], 0)
        self.assertEqual(self.library.path.read_bytes(), original)
        self.assertEqual(json.loads(original)['fonts'][0]['original_base64'], record()['original_base64'])
        self.assertNotIn('original_base64', str(result))

    def test_invalid_batch_and_failed_write_preserve_existing_fonts(self):
        from unittest.mock import patch
        self.library.add([record()])
        original = self.library.path.read_bytes()
        bad = record(b'bad')
        bad['font']['glyphs']['H']['paths'][0][1][0] = float('nan')
        with self.assertRaises(ValueError):
            self.library.add([record(b'good'), bad])
        self.assertEqual(self.library.path.read_bytes(), original)
        with patch('font_library.os.replace', side_effect=OSError('disk full')):
            with self.assertRaises(OSError):
                self.library.add([record(b'new')])
        self.assertEqual(self.library.path.read_bytes(), original)
        self.assertEqual(list(self.folder.glob('.fonts-*')), [])

    def test_bad_binary_open_paths_and_capacity_are_rejected(self):
        for change in ['binary', 'unclosed', 'coordinates']:
            item = record()
            if change == 'binary': item['original_base64'] = base64.b64encode(b'not a font at all').decode()
            if change == 'unclosed': item['font']['glyphs']['H']['paths'][0].pop()
            if change == 'coordinates': item['font']['glyphs']['H']['paths'][0][1][0] = 1e9
            with self.assertRaises(ValueError): self.library.add([item])
        self.library.add([record(bytes([i])) for i in range(20)])
        with self.assertRaisesRegex(ValueError, 'full'): self.library.add([record(b'extra')])
        self.assertEqual(len(self.library.snapshot()['fonts']), 20)

    def test_corrupt_library_does_not_replace_files_or_hide_bundled_drafts(self):
        self.library.path.write_text('{broken')
        draft = PostcardDraft(self.folder)
        self.assertIsNone(draft.snapshot()['error'])
        with self.assertRaisesRegex(ValueError, 'unchanged'): self.library.add([record()])
        self.assertEqual(self.library.path.read_text(), '{broken')

    def test_imported_font_ids_survive_saved_draft_and_restart(self):
        draft = PostcardDraft(self.folder)
        initial = draft.snapshot()
        font = self.library.add([record()])['fonts'][0]
        doc = initial['document']
        doc['message'].update(font=font['id'], text='HH?')
        doc['address']['font'] = font['id']
        draft.save(doc, initial['revision'])
        self.assertEqual(PostcardDraft(self.folder).snapshot()['document'], doc)
        self.library.path.rename(self.folder / 'fonts-backup.json')
        self.assertTrue(draft.snapshot()['error'])
        self.assertEqual(json.loads(draft.path.read_text()), doc)

    def test_font_api_is_private_atomic_and_does_not_change_plotter(self):
        plotter = Plotter(self.folder)
        self.addCleanup(plotter.close)
        app = create_plotter_app(plotter, port=8769)
        client = app.test_client(); base = 'http://127.0.0.1:8769'
        headers = {'X-Plotter-Token': app.config['PLOTTER_TOKEN'], 'Origin': base}
        self.assertEqual(client.get('/api/fonts', base_url=base).status_code, 403)
        self.assertEqual(client.post('/api/fonts', base_url=base, json={'fonts':[record()]}).status_code, 403)
        bad_headers = dict(headers, Origin='https://example.com')
        self.assertEqual(client.post('/api/fonts', base_url=base, headers=bad_headers, json={'fonts':[record()]}).status_code, 403)
        result = client.post('/api/fonts', base_url=base, headers=headers, json={'fonts':[record()]})
        self.assertEqual(result.status_code, 200)
        self.assertEqual(result.json['added'], 1)
        self.assertNotIn('original_base64', result.get_data(as_text=True))
        self.assertEqual(client.get('/api/fonts', base_url=base, headers=headers).json['fonts'], result.json['fonts'])
        self.assertFalse(plotter.snapshot()['connected'])
        self.assertIsNone(plotter.job)
        for name in ['opentype.min.js', 'ttf-fonts.js']:
            with client.get('/assets/'+name, base_url=base) as response: self.assertEqual(response.status_code, 200)
