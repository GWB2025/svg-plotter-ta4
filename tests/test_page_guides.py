"""Validate stock-guide movements through the actual sender parser."""

import json
import subprocess
import unittest

from plotting import parse_job


class PageGuideTests(unittest.TestCase):
    def test_guide_gcode_has_exact_stock_bounds_and_one_pen_pass(self):
        script = """
            const guides = require('./assets/page-guides.js');
            const svg = require('./assets/svg-import.js');
            console.log(JSON.stringify([[210,297],[148,210],[105,148],
              [148,105],[114,162],[110,220],[162,229],[123.4,176.8]]
              .map(([width,height]) => {
                const guide = guides.create({width,height});
                return {width,height,text:svg.makeColourGcode(
                  guide.paths,guide.paths.colours)};
              })));
        """
        guides = json.loads(subprocess.check_output(
            ['node', '-e', script], text=True,
        ))
        for guide in guides:
            with self.subTest(width=guide['width'], height=guide['height']):
                job = parse_job(guide['text'], 'positioning-guide.gcode')
                self.assertEqual(job['bounds'],
                                 [0, 0, guide['width'], guide['height']])
                self.assertEqual(len(job['paths']), 10)
                self.assertEqual(len(job['pen_changes']), 1)
                self.assertLess(job['draw_mm'], 100)


if __name__ == '__main__':
    unittest.main()
