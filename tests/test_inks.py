"""Bottled inks survive upgrades, linked pens, backups and interrupted jobs."""
import copy
import json
import tempfile
import unittest
from pathlib import Path

from catalogue import Catalogue
from plotting import Plotter
from plotter_app import create_plotter_app
from test_colour_plotting import COLOURS


class InkTests(unittest.TestCase):
    def setUp(self):
        temporary = tempfile.TemporaryDirectory()
        self.addCleanup(temporary.cleanup)
        self.folder = Path(temporary.name)
        self.catalogue = Catalogue(self.folder)

    def save(self, action, item):
        return self.catalogue.change(action, item, self.catalogue.snapshot()['revision'])

    def ink(self):
        return self.save('save_ink', dict(
            brand='Example document ink', colour='Turquoise', ink='#128080',
            kind='Fountain pen ink', reference='Bottle 1', available=True,
            lightfastness='Unknown', waterproof='Reported waterproof',
            paper='Smooth Bristol', notes='Measured after drying.'))['inks'][0]

    def linked_pen(self, ink):
        pen = dict(self.catalogue.snapshot()['pens'][0], ink_id=ink['id'])
        return self.save('save_pen', pen)['pens'][0]

    def test_legacy_catalogue_upgrades_without_changing_existing_colours(self):
        legacy = self.catalogue.export()
        legacy.update(schema=1, revision=3)
        legacy.pop('inks', None)
        self.catalogue.path.write_text(json.dumps(legacy))
        before = self.catalogue.path.read_bytes()
        loaded = Catalogue(self.folder).snapshot()
        self.assertFalse(loaded['error'])
        self.assertEqual(loaded['inks'], [])
        self.assertEqual(loaded['pens'], legacy['pens'])
        self.assertEqual(self.catalogue.path.read_bytes(), before)
        ink = self.ink()
        restarted = Catalogue(self.folder).snapshot()
        self.assertEqual(restarted['schema'], 2)
        self.assertEqual(restarted['revision'], 4)
        self.assertEqual(restarted['inks'], [ink])
        self.assertEqual(restarted['pens'], legacy['pens'])

    def test_editing_ink_preserves_pen_reading_and_available_filled_pen(self):
        ink = self.ink()
        pen = self.linked_pen(ink)
        self.assertEqual(pen['ink_name'], 'Example document ink Turquoise')
        self.assertIn(pen['ink_name'], self.catalogue.collection().label(pen['id']))
        ink.update(ink='#001122', colour='Teal', available=False)
        result = self.save('save_ink', ink)
        updated = result['pens'][0]
        self.assertEqual(updated['ink'], pen['ink'])
        self.assertTrue(updated['available'])
        self.assertEqual(updated['ink_name'], 'Example document ink Teal')
        updated['ink_id'] = None
        unlinked = self.save('save_pen', updated)['pens'][0]
        self.assertNotIn('ink_name', unlinked)
        self.assertEqual(unlinked['ink'], pen['ink'])

    def test_invalid_ink_or_link_and_stale_editor_leave_file_untouched(self):
        ink = self.ink()
        before = self.catalogue.path.read_bytes()
        for changes in ({'brand': ''}, {'ink': 'red'}, {'available': 'yes'},
                        {'kind': 'invalid'}, {'notes': 'a' * 601},
                        {'colour': 'bad\nG1'}, {'paper': []}, {'lightfastness': []}):
            with self.subTest(changes=changes), self.assertRaises(ValueError):
                self.save('save_ink', dict(ink, **changes))
            self.assertEqual(self.catalogue.path.read_bytes(), before)
        for invalid in ('missing', [], {}):
            with self.subTest(link=invalid), self.assertRaises(ValueError):
                self.linked_pen(dict(ink, id=invalid))
            self.assertEqual(self.catalogue.path.read_bytes(), before)
        with self.assertRaisesRegex(ValueError, 'changed'):
            self.catalogue.change('save_ink', ink, 0)

    def test_import_remaps_ink_pen_theme_chain_and_reuses_identical_records(self):
        ink = self.ink()
        pen = self.linked_pen(ink)
        self.save('save_theme', dict(name='Ink theme', slots=[
            dict(colour=pen['ink'], pen_id=pen['id'])]))
        backup = self.catalogue.export()
        self.save('save_ink', dict(ink, colour='Locally changed'))
        result = self.save('import', backup)
        imported_ink = next(i for i in result['inks'] if i['colour'] == 'Turquoise')
        self.assertNotEqual(imported_ink['id'], ink['id'])
        imported_pen = next(p for p in result['pens'] if p.get('ink_id') == imported_ink['id'])
        self.assertNotEqual(imported_pen['id'], pen['id'])
        self.assertTrue(any(t.get('slots', [{}])[0].get('pen_id') == imported_pen['id']
                            for t in result['themes']))
        again = self.save('import', backup)
        for key in ('inks', 'pens', 'themes'):
            self.assertEqual(again[key], result[key])
        bad = copy.deepcopy(backup)
        bad['inks'] = []
        before = self.catalogue.path.read_bytes()
        with self.assertRaisesRegex(ValueError, 'unknown ink'):
            self.save('import', bad)
        self.assertEqual(self.catalogue.path.read_bytes(), before)

    def test_ink_api_preserves_loaded_and_recovered_job_and_never_opens_usb(self):
        ink = self.ink()
        pen = self.linked_pen(ink)
        opens = []
        plot = Plotter(self.folder, ports=lambda: [], opener=lambda p: opens.append(p),
                       lock_path=self.folder / 'lock')
        job = plot.load(COLOURS.replace('#ff0000', '#ff0000 ' + pen['id']), 'ink.gcode')
        original_label = job['pen_changes'][0]['pen_label']
        self.assertIn(ink['brand'], original_label)
        plot.recovery_active = True
        plot.identity = [6790, 32832, 'test']
        plot.accepted = plot.pending = 3
        plot.update('error', 'Test interruption', accepted=4)
        saved_job = (self.folder / 'plotter-job.json').read_bytes()
        app = create_plotter_app(plot)
        client = app.test_client()
        base = 'http://127.0.0.1:8769'
        payload = dict(action='save_ink', item=dict(ink, colour='Renamed'),
                       revision=self.catalogue.snapshot()['revision'])
        self.assertEqual(client.post('/api/catalogue', json=payload, base_url=base).status_code, 403)
        headers = {'X-Plotter-Token': app.config['PLOTTER_TOKEN'], 'Origin': base}
        response = client.post('/api/catalogue', json=payload, base_url=base, headers=headers)
        self.assertEqual(response.status_code, 200, response.json)
        self.assertEqual(opens, [])
        self.assertEqual(plot.job['pen_changes'][0]['pen_label'], original_label)
        restored = Plotter(self.folder, ports=lambda: [], lock_path=self.folder / 'lock')
        self.assertEqual(restored.job['pen_changes'][0]['pen_label'], original_label)
        self.assertEqual((self.folder / 'plotter-job.json').read_bytes(), saved_job)
