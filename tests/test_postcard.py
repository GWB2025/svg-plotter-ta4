"""Postcard drafts persist safely and produce sender-validated pen paths."""

import copy
import json
from pathlib import Path
import subprocess
import tempfile
import unittest

from postcard import PostcardDraft
from plotter_app import create_plotter_app
from plotting import Plotter, parse_job


class PostcardTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.folder = Path(self.temp.name)
        self.draft = PostcardDraft(self.folder)

    def test_initial_draft_is_blank_and_save_survives_reopening(self):
        initial = self.draft.snapshot()
        self.assertFalse(self.draft.path.exists())
        self.assertEqual(initial['document']['message']['text'], '')
        doc = initial['document']
        doc['message']['text'] = 'Hello, Gordon!\nA second line.'
        self.draft.save(doc, initial['revision'])
        self.assertEqual(PostcardDraft(self.folder).snapshot()['document'], doc)

    def test_invalid_values_cannot_overwrite_saved_work(self):
        initial = self.draft.snapshot()
        saved = self.draft.save(initial['document'], initial['revision'])
        original = self.draft.path.read_bytes()
        for field, value in [('size', float('nan')), ('size', True), ('font', 'absent'),
                             ('width', 149), ('x', -1), ('spacing', 0),
                             ('text', 'a' * 2001), ('text', '\x00'), ('enabled', 1)]:
            doc = copy.deepcopy(saved['document'])
            doc['message'][field] = value
            with self.subTest(field=field, value=str(value)[:20]):
                with self.assertRaises(ValueError):
                    self.draft.save(doc, saved['revision'])
                self.assertEqual(self.draft.path.read_bytes(), original)

    def test_overflowing_layout_can_be_saved_for_later_editing(self):
        initial = self.draft.snapshot()
        initial['document']['message'].update(text='Too low', y=104)
        result = self.draft.save(initial['document'], initial['revision'])
        self.assertEqual(result['document']['message']['y'], 104)

    def test_stale_editor_and_corrupt_file_do_not_lose_work(self):
        initial = self.draft.snapshot()
        self.draft.save(initial['document'], initial['revision'])
        with self.assertRaisesRegex(ValueError, 'changed'):
            self.draft.save(initial['document'], initial['revision'])
        self.draft.path.write_text('{broken')
        self.assertTrue(self.draft.snapshot()['error'])
        with self.assertRaises(ValueError):
            self.draft.save(initial['document'], initial['revision'])
        self.assertEqual(self.draft.path.read_text(), '{broken')

    def test_api_requires_session_token_and_never_loads_or_moves_plotter(self):
        plotter = Plotter(self.folder)
        self.addCleanup(plotter.close)
        app = create_plotter_app(plotter, port=8769)
        client = app.test_client()
        base = 'http://127.0.0.1:8769'
        self.assertEqual(client.get('/api/postcard', base_url=base).status_code, 403)
        headers = {'X-Plotter-Token': app.config['PLOTTER_TOKEN'], 'Origin': base}
        initial = client.get('/api/postcard', base_url=base, headers=headers).get_json()
        result = client.post('/api/postcard', base_url=base, headers=headers,
                             json={'document': initial['document'],
                                   'revision': initial['revision']})
        self.assertEqual(result.status_code, 200)
        self.assertIsNone(plotter.job)
        self.assertFalse(plotter.snapshot()['connected'])
        with client.get('/assets/postcard-fonts.json', base_url=base) as reply:
            self.assertEqual(reply.status_code, 200)

    def test_all_fonts_produce_safe_gcode_with_separate_pen_strokes(self):
        script = """
          const layout = require('./assets/postcard-layout.js');
          const fonts = require('./assets/postcard-fonts.json');
          const defaults = require('./assets/postcard-defaults.json');
          const svg = require('./assets/svg-import.js');
          console.log(JSON.stringify(fonts.map(font => {
            const doc = structuredClone(defaults);
            doc.message.font = font.id;
            doc.message.text = 'Hello! Café £5';
            doc.address.text = 'A. Sample\\n10 Example Road\\nTEST TOWN';
            const result = layout.layout(doc,fonts);
            if(result.errors.length)throw Error(result.errors.join('; '));
            return {font:font.id,paths:result.paths.length,
              gcode:svg.makeColourGcode(result.paths,result.colours)};
          })));
        """
        results = json.loads(subprocess.check_output(['node', '-e', script], text=True))
        for result in results:
            with self.subTest(font=result['font']):
                job = parse_job(result['gcode'], 'postcard-text.gcode')
                self.assertEqual(len(job['paths']), result['paths'])
                self.assertEqual(len(job['pen_changes']), 1)
                self.assertGreaterEqual(job['bounds'][0], 0)
                self.assertLessEqual(job['bounds'][2], 148)
                self.assertLessEqual(job['bounds'][3], 105)


if __name__ == '__main__':
    unittest.main()
