"""The supplied reference is complete, attributed and read-only."""

import json
import tempfile
import unittest
from pathlib import Path

from materials import MaterialsGuide
from plotter_app import ROOT, create_plotter_app
from plotting import Plotter


class MaterialsGuideTests(unittest.TestCase):
    def setUp(self):
        self.guide = MaterialsGuide(ROOT / 'assets/materials-guide.json')

    def test_reference_retains_all_rows_fields_and_timestamps(self):
        entries = self.guide.entries
        self.assertEqual(len(entries), 16)
        self.assertEqual(entries[0]['name'], 'Sakura Pigma Micron')
        self.assertEqual(entries[-1]['name'], 'Fabriano Black Paper')
        self.assertEqual(sum(e['category'] == 'Pen' for e in entries), 11)
        self.assertEqual(sum(e['category'] == 'Paper' for e in entries), 3)
        self.assertEqual(entries[2]['compatibility'], 'Not in source')
        self.assertEqual(entries[7]['lightfastness'], 'Not in source')
        for entry in entries:
            self.assertEqual(set(entry), {
                'name', 'category', 'material', 'compatibility',
                'lightfastness', 'notes', 'timestamp', 'source',
            })
            self.assertRegex(entry['timestamp'], r'^\d{2}:[0-5]\d$')
            self.assertEqual(entry['source'], '1')
            self.assertTrue(all(entry.values()))

    def test_html_credits_dan_and_escapes_document_content(self):
        html = self.guide.render()
        self.assertIn('Dan Catt', html)
        self.assertIn('1.3.0 - Pens &amp; Paper | Drawing Machines 101', html)
        self.assertIn('t=120s', html)
        self.assertIn('t=1350s', html)
        self.assertIn('Not in source', html)
        self.assertIn('not T-A4 compatibility tests', html)
        with tempfile.TemporaryDirectory() as folder:
            data = json.loads((ROOT / 'assets/materials-guide.json').read_text())
            data['entries'][0]['name'] = '<script>alert(1)</script>'
            path = Path(folder) / 'guide.json'
            path.write_text(json.dumps(data))
            escaped = MaterialsGuide(path).render()
            self.assertNotIn('<script>alert(1)</script>', escaped)
            self.assertIn('&lt;script&gt;alert(1)&lt;/script&gt;', escaped)

    def test_guide_and_assets_are_served_without_changing_stock_or_job(self):
        with tempfile.TemporaryDirectory() as folder:
            plotter = Plotter(Path(folder))
            self.addCleanup(plotter.close)
            catalogue = plotter.catalogue.snapshot()
            client = create_plotter_app(plotter).test_client()
            response = client.get('/', base_url='http://127.0.0.1:8769')
            html = response.get_data(as_text=True)
            self.assertEqual(response.status_code, 200)
            self.assertIn('aria-controls="materials-panel"', html)
            self.assertIn('id="materials-panel"', html)
            self.assertEqual(html.count('class="material-card"'), 16)
            self.assertNotIn('<!-- MATERIALS_PANEL -->', html)
            with client.get('/assets/materials-guide.js',
                            base_url='http://127.0.0.1:8769') as script:
                self.assertEqual(script.status_code, 200)
            self.assertEqual(plotter.catalogue.snapshot(), catalogue)
            self.assertFalse(plotter.snapshot()['connected'])
            self.assertIsNone(plotter.job)


if __name__ == '__main__':
    unittest.main()
