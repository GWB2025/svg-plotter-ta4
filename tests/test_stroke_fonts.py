"""Macrons retain the original letter shapes and independent pen lifts."""

import copy
import json
from pathlib import Path
import sys
import unittest

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / 'packaging'))
from build_stroke_fonts import StrokeFontBuilder


class MacronTests(unittest.TestCase):
    PAIRS = tuple(zip('AEIOUYaeiouy', 'ĀĒĪŌŪȲāēīōūȳ'))

    def setUp(self):
        self.fonts = json.loads(
            (ROOT / 'assets/postcard-fonts.json').read_text())

    def test_every_bundled_font_has_separate_macrons_and_dotless_i(self):
        for font in self.fonts:
            for plain, accented in self.PAIRS:
                with self.subTest(font=font['id'], character=accented):
                    glyphs = font['glyphs']
                    self.assertTrue(accented in glyphs, accented)
                    base = glyphs['ı' if plain == 'i' else plain]
                    glyph = glyphs[accented]
                    self.assertEqual(glyph['advance'], glyphs[plain]['advance'])
                    self.assertEqual(glyph['paths'][:-1], base['paths'])
                    bar = glyph['paths'][-1]
                    self.assertEqual(len(bar), 2)
                    self.assertLess(bar[0][0], bar[1][0])
                    self.assertEqual(bar[0][1], bar[1][1])
                    self.assertGreater(bar[0][1], base['bounds'][3])
                    self.assertEqual(glyph['bounds'][3], bar[0][1])

    def test_regeneration_preserves_originals_and_matches_bundled_data(self):
        for font in self.fonts:
            with self.subTest(font=font['id']):
                original = copy.deepcopy(font)
                for _, accented in self.PAIRS:
                    original['glyphs'].pop(accented, None)
                rebuilt = copy.deepcopy(original)
                StrokeFontBuilder.add_macrons(rebuilt)
                for character, glyph in original['glyphs'].items():
                    self.assertEqual(rebuilt['glyphs'][character], glyph)
                self.assertEqual(rebuilt, font)
                StrokeFontBuilder.add_macrons(rebuilt)
                self.assertEqual(rebuilt, font)


if __name__ == '__main__':
    unittest.main()
