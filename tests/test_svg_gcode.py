"""Validate browser-generated commands using the actual sender parser."""

import subprocess
import unittest

from plotting import parse_job


class SvgGcodeTests(unittest.TestCase):
    def test_generated_commands_match_sender_and_page_preview(self):
        script = (
            "const s=require('./assets/svg-import.js');"
            "console.log(s.makeGcode(s.placePaths("
            "[[[0,0],[100,50]]],{mode:'fit',margin:20})));"
        )
        text = subprocess.check_output(['node', '-e', script], text=True)
        job = parse_job(text, 'drawing.gcode')
        self.assertEqual(job['bounds'], [20.0, 106.0, 190.0, 191.0])
        self.assertEqual(len(job['paths']), 1)
        self.assertEqual(job['endpoints'][-1], (0.0, 0.0, 0.5))


if __name__ == '__main__':
    unittest.main()
