"""Built-in drawings are valid SVG files with A4 millimetre coordinates."""

import json
from pathlib import Path
import subprocess
import unittest
import xml.etree.ElementTree as ET


class ExampleTests(unittest.TestCase):
    def test_catalogue_matches_bundled_files(self):
        catalogue = json.loads(subprocess.check_output([
            'node', '-e',
            "console.log(JSON.stringify(require('./assets/svg-import.js').examples))",
        ], text=True))
        self.assertEqual(len(catalogue), 6)
        for example in catalogue:
            with self.subTest(name=example['name']):
                text = (Path('examples') / example['name']).read_text()
                self.assertEqual(text, example['svg'])
                root = ET.fromstring(text)
                self.assertEqual(root.attrib['viewBox'], '0 0 210 297')
                self.assertEqual(root.attrib['width'], '210mm')
                self.assertGreaterEqual(len(list(root.iter())), 3)
                self.assertNotIn('<text', text)

    def test_colour_example_has_distinct_coloured_outlines(self):
        root = ET.parse('examples/colour-shapes.svg').getroot()
        colours = {node.get('stroke') for node in root.iter()
                   if node.get('stroke')}
        self.assertGreaterEqual(len(colours), 4)
        self.assertNotIn('none', colours)
        self.assertTrue(all(node.get('fill', 'none') == 'none'
                            for node in root.iter()))


if __name__ == '__main__':
    unittest.main()
