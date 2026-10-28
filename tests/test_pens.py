"""Physical pen choices survive export, reload and the parked prompt."""
import unittest

from pens import PenCollection
from plotting import parse_job
from test_colour_plotting import COLOURS, ColourTests


class PenTests(unittest.TestCase):
    def test_inventory_and_duplicate_reference_are_preserved(self):
        pens = PenCollection()
        self.assertEqual(len(pens.items), 53)
        self.assertEqual(pens.label('black-003'),
                         'Pigma Micron Black 003 — 85511 30724')
        self.assertEqual(pens.get('purple-05-30644')['reference'], '85511 30644')
        self.assertEqual(pens.get('black-05')['reference'], '85511 30644')

    def test_explicit_pen_survives_gcode_reload(self):
        job = parse_job(COLOURS.replace('#ff0000', '#ff0000 black-003'))
        self.assertEqual(job['pen_changes'][0]['pen_id'], 'black-003')
        self.assertIn('Black 003', job['pen_changes'][0]['pen_label'])

    def test_unknown_pen_is_rejected(self):
        with self.assertRaisesRegex(ValueError, 'Unknown pen'):
            parse_job(COLOURS.replace('#ff0000', '#ff0000 missing-pen'))

    def test_other_brands_survive_export_and_reload(self):
        for pen_id in ('stabilo-point88-yellow', 'uniball-eye-black'):
            job = parse_job(COLOURS.replace('#ff0000', '#ff0000 ' + pen_id))
            self.assertEqual(job['pen_changes'][0]['pen_id'], pen_id)
            self.assertNotIn('Pigma', job['pen_changes'][0]['pen_label'])

    def test_legacy_files_still_load(self):
        self.assertEqual(parse_job(COLOURS)['pen_changes'][0]['colour'], '#ff0000')


class PenPromptTests(ColourTests):
    def test_parked_prompt_names_physical_pen(self):
        job = self.plot.load(COLOURS.replace('#ff0000', '#ff0000 black-003'))
        for action, payload in [('connect', {'port': '/dev/fake'}), ('home', {})]:
            self.plot.action(action, payload)
            self.plot.thread.join(3)
        self.plot.action('start', {'job_id': job['id'], 'ready': True})
        self.until(lambda: self.plot.snapshot()['phase'] == 'pen_change')
        self.assertIn('Black 003', self.plot.snapshot()['message'])
        self.assertIn('30724', self.plot.snapshot()['message'])
