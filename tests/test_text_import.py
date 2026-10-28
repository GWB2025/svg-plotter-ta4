"""Text paths use the checked T-A4 sender without opening a USB connection."""

import json
from pathlib import Path
import subprocess
import tempfile
import unittest

from plotter_app import create_plotter_app
from plotting import Plotter, parse_job


class TextImportTests(unittest.TestCase):
    def test_ascii_paths_round_trip_through_sender(self):
        script = r"""
          const text = require('./assets/text-import.js');
          const svg = require('./assets/svg-import.js');
          const fonts = require('./assets/postcard-fonts.json');
          const result = text.layout('   /\\\n  /__\\\n  |  |\n  |__|', {}, fonts[0]);
          const source = Object.assign(result.paths, {
            width:result.width,height:result.height,
          });
          const paths = svg.placePaths(source, {width:210,height:297,margin:20});
          process.stdout.write(JSON.stringify({
            paths, gcode:svg.makeColourGcode(paths,result.colours),
          }));
        """
        result = json.loads(subprocess.check_output(
            ['node', '-e', script], text=True,
            cwd=Path(__file__).resolve().parents[1],
        ))
        job = parse_job(result['gcode'], 'house.gcode')
        self.assertEqual(len(job['paths']), len(result['paths']))
        self.assertEqual(len(job['pen_changes']), 1)
        self.assertEqual(job['endpoints'][-1], (0, 0, .5))
        for actual, expected in zip(job['paths'], result['paths']):
            self.assertEqual(len(actual), len(expected))
            for point, target in zip(actual, expected):
                for coordinate, value in zip(point, target):
                    self.assertAlmostEqual(coordinate, value, places=4)

    def test_text_panel_and_assets_are_available_without_usb(self):
        with tempfile.TemporaryDirectory() as directory:
            plotter = Plotter(Path(directory), ports=lambda: [])
            self.addCleanup(plotter.close)
            app = create_plotter_app(plotter)
            client = app.test_client()
            base = 'http://127.0.0.1:8769'
            page = client.get('/', base_url=base).get_data(as_text=True)
            self.assertIn('id="text-panel"', page)
            self.assertIn('wrap="off"', page)
            for name in ('text-import.js', 'text-editor.js'):
                with client.get('/assets/' + name, base_url=base) as reply:
                    self.assertEqual(reply.status_code, 200)
            self.assertFalse(plotter.snapshot()['connected'])
            self.assertIsNone(plotter.job)


if __name__ == '__main__':
    unittest.main()
