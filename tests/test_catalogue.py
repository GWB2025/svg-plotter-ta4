"""Personal stock persists independently of app bundles and drawing snapshots."""
import json
import tempfile
import unittest
from pathlib import Path

from catalogue import Catalogue
from plotting import Plotter
from plotter_app import create_plotter_app
from test_colour_plotting import COLOURS


class CatalogueTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.folder = Path(self.temp.name)
        self.catalogue = Catalogue(self.folder)
        self.addCleanup(self.temp.cleanup)

    def save(self, action, item):
        return self.catalogue.change(action, item, self.catalogue.snapshot()['revision'])

    def add_pen(self, **overrides):
        pen = dict(brand='Test brand', colour='Teal', size='0.4 mm',
                   reference='', set='My pens', ink='#128080', available=True)
        pen.update(overrides)
        before = {p['id'] for p in self.catalogue.snapshot()['pens']}
        result = self.save('save_pen', pen)
        return next(p for p in result['pens'] if p['id'] not in before)

    def theme(self, pen):
        return dict(name='Coast', note='A custom palette',
                    slots=[{'colour': '#128080', 'pen_id': pen['id']},
                           {'colour': '#fffaf0', 'pen_id': None}], outline=None)

    def test_defaults_require_no_writes_and_personal_edits_survive_restart(self):
        self.assertEqual(len(self.catalogue.snapshot()['pens']), 53)
        self.assertFalse((self.folder / 'catalogue.json').exists())
        pen = self.add_pen()
        self.assertEqual(Catalogue(self.folder).collection().get(pen['id']), pen)
        pen['available'] = False
        self.save('save_pen', pen)
        self.assertFalse(Catalogue(self.folder).collection().get(pen['id'])['available'])

    def test_default_pen_can_be_edited_without_changing_bundled_inventory(self):
        pen = self.catalogue.collection().get('black-003').copy()
        pen['set'] = 'My black pens'
        self.save('save_pen', pen)
        self.assertEqual(Catalogue(self.folder).collection().get('black-003')['set'],
                         'My black pens')
        from pens import PenCollection
        self.assertNotEqual(PenCollection().get('black-003')['set'], 'My black pens')

    def test_theme_can_assign_physical_pens_and_bare_paper(self):
        pen = self.add_pen()
        result = self.save('save_theme', self.theme(pen))
        theme = next(t for t in result['themes'] if t['name'] == 'Coast')
        self.assertEqual(theme['pens'], [pen['id']])
        self.assertIsNone(theme['slots'][1]['pen_id'])
        self.assertEqual(Catalogue(self.folder).snapshot()['themes'], result['themes'])

    def test_invalid_changes_leave_the_previous_file_untouched(self):
        pen = self.add_pen()
        original = (self.folder / 'catalogue.json').read_bytes()
        for changes in ({'ink': 'red'}, {'available': 'yes'}, {'id': '../../bad'},
                        {'colour': 'bad\nG1'}, {'size': 'x' * 1000}):
            with self.subTest(changes=changes), self.assertRaises(ValueError):
                self.save('save_pen', dict(pen, **changes))
            self.assertEqual((self.folder / 'catalogue.json').read_bytes(), original)
        theme = self.theme(pen)
        theme['slots'][0]['pen_id'] = 'missing-pen'
        with self.assertRaises(ValueError):
            self.save('save_theme', theme)
        self.assertEqual((self.folder / 'catalogue.json').read_bytes(), original)

    def test_stale_revision_does_not_overwrite_another_editor(self):
        revision = self.catalogue.snapshot()['revision']
        pen = self.add_pen()
        with self.assertRaisesRegex(ValueError, 'changed'):
            self.catalogue.change('save_pen', pen, revision)

    def test_export_import_preserves_links_and_merges_conflicting_ids(self):
        pen = self.add_pen()
        self.save('save_theme', self.theme(pen))
        backup = self.catalogue.export()
        pen['colour'] = 'Changed locally'
        self.save('save_pen', pen)
        result = self.save('import', backup)
        self.assertEqual(self.catalogue.collection().get(pen['id'])['colour'], 'Changed locally')
        imported = next(p for p in result['pens'] if p['colour'] == 'Teal')
        self.assertNotEqual(imported['id'], pen['id'])
        self.assertTrue(any(t.get('slots', [{}])[0].get('pen_id') == imported['id']
                            for t in result['themes']))
        count = len(result['pens']), len(result['themes'])
        again = self.save('import', backup)
        self.assertEqual((len(again['pens']), len(again['themes'])), count)

    def test_invalid_import_is_atomic_and_bad_saved_json_is_not_overwritten(self):
        self.add_pen()
        backup = self.catalogue.export()
        original = (self.folder / 'catalogue.json').read_bytes()
        backup['themes'][0]['pens'] = ['missing']
        with self.assertRaises(ValueError):
            self.save('import', backup)
        self.assertEqual((self.folder / 'catalogue.json').read_bytes(), original)
        (self.folder / 'catalogue.json').write_text('{broken')
        damaged = Catalogue(self.folder)
        self.assertTrue(damaged.snapshot()['error'])
        with self.assertRaises(ValueError):
            damaged.change('save_pen', {}, damaged.snapshot()['revision'])
        self.assertEqual((self.folder / 'catalogue.json').read_text(), '{broken')

    def test_malformed_saved_documents_and_slot_types_fail_cleanly(self):
        for value in ([], None, 'invalid'):
            with self.subTest(value=value):
                self.catalogue.path.write_text(json.dumps(value))
                self.assertTrue(self.catalogue.snapshot()['error'])
        self.catalogue.path.unlink()
        pen = self.add_pen()
        for bad in ([], {}, 123):
            theme = self.theme(pen)
            theme['slots'][0]['pen_id'] = bad
            with self.subTest(bad=bad), self.assertRaises(ValueError):
                self.save('save_theme', theme)

    def test_partial_import_preserves_existing_stock(self):
        backup = self.catalogue.export()
        backup['themes'] = []
        backup['pens'] = backup['pens'][:1]
        target = Catalogue(self.folder)
        target.change('import', backup, 0)
        self.assertEqual(len(target.snapshot()['pens']), 53)

    def test_loaded_and_recovered_job_keep_original_custom_pen_details(self):
        pen = self.add_pen()
        plot = Plotter(self.folder, ports=lambda: [], lock_path=self.folder / 'lock')
        text = COLOURS.replace('#ff0000', '#ff0000 ' + pen['id'])
        job = plot.load(text, 'custom.gcode')
        original_label = job['pen_changes'][0]['pen_label']
        plot.recovery_active = True
        plot.identity = [6790, 32832, 'test']
        plot.accepted = plot.pending = 3
        plot.confirmed_pens = {2}
        plot.update('error', 'Test interruption', accepted=4)
        saved_job = (self.folder / 'plotter-job.json').read_bytes()
        pen['colour'] = 'Edited later'
        pen['available'] = False
        self.save('save_pen', pen)
        self.assertEqual(plot.job['pen_changes'][0]['pen_label'], original_label)
        restored = Plotter(self.folder, ports=lambda: [], lock_path=self.folder / 'lock')
        self.assertTrue(restored.recovery_active)
        self.assertEqual(restored.job['pen_changes'][0]['pen_label'], original_label)
        self.assertEqual((self.folder / 'plotter-job.json').read_bytes(), saved_job)

    def test_api_requires_session_token_and_does_not_open_usb(self):
        opens = []
        plot = Plotter(self.folder, ports=lambda: [], opener=lambda p: opens.append(p),
                       lock_path=self.folder / 'lock')
        app = create_plotter_app(plot, port=8769)
        client = app.test_client()
        base = 'http://127.0.0.1:8769'
        self.assertEqual(client.get('/api/catalogue', base_url=base).status_code, 403)
        headers = {'X-Plotter-Token': app.config['PLOTTER_TOKEN'], 'Origin': base}
        response = client.get('/api/catalogue', base_url=base, headers=headers)
        self.assertEqual(response.status_code, 200)
        payload = dict(action='save_pen', revision=response.json['revision'],
                       item=dict(brand='Demo', colour='Blue', size='Fine', ink='#001188'))
        response = client.post('/api/catalogue', json=payload, base_url=base, headers=headers)
        self.assertEqual(response.status_code, 200, response.json)
        self.assertEqual(opens, [])
        self.assertFalse((self.folder / 'plotter-job.json').exists())
        response = client.get('/api/catalogue/export', base_url=base, headers=headers)
        self.assertEqual(response.json['format'], 'svg-plotter-catalogue')
        self.assertEqual(response.status_code, 200)
