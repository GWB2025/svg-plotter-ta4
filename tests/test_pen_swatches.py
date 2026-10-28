"""Swatch jobs retain physical pen identities through the real sender parser."""

import subprocess
import unittest

from plotting import parse_job


class PenSwatchTests(unittest.TestCase):
    def make_job(self, same_ink=False):
        script = """
            const swatches = require('./assets/pen-swatches.js');
            const fonts = require('./assets/postcard-fonts.json');
            let pens = require('./assets/pens.json').filter(
                pen => pen.set === 'Sharpie Glam Pop · 24');
        """
        if same_ink:
            script += "pens = pens.slice(0, 2).map(p => ({...p, ink:'#112233'}));"
        script += "console.log(swatches.gcode(swatches.create(pens, {}, fonts[0]).sheets[0]));"
        text = subprocess.check_output(['node', '-e', script], text=True)
        return parse_job(text, 'pen-swatches.gcode')

    def test_full_set_has_one_named_pass_per_pen_and_stays_on_a4(self):
        job = self.make_job()
        self.assertEqual(len(job['pen_changes']), 24)
        self.assertEqual(len(job['pen_snapshot']), 24)
        self.assertEqual(job['endpoints'][-1], (0.0, 0.0, 0.5))
        self.assertGreaterEqual(job['bounds'][0], 12)
        self.assertLessEqual(job['bounds'][2], 198)
        self.assertLessEqual(job['bounds'][3], 285)
        for change in job['pen_changes']:
            self.assertIn('Sharpie Glam Pop', change['pen_label'])
            self.assertEqual(job['endpoints'][change['command'] - 1],
                             (0.0, 0.0, 0.5))

    def test_identical_ink_colours_do_not_merge_two_physical_pens(self):
        job = self.make_job(same_ink=True)
        first, second = job['pen_changes']
        self.assertEqual(first['colour'], second['colour'])
        self.assertNotEqual(first['pen_id'], second['pen_id'])
        self.assertGreater(second['command'], first['command'])
