import base64
import tempfile
import unittest
from font_library import FontLibrary


def record(path='M0 500 L200 0 M200 0 L150 -100'):
    raw = ('<svg xmlns="http://www.w3.org/2000/svg"><defs><font horiz-adv-x="600">'
           '<font-face font-family="Writer" units-per-em="1000"/>'
           '<glyph unicode=" " horiz-adv-x="350"/>'
           '<glyph unicode="H" d="M0 0 L0 700"/>'
           '<glyph unicode="?" d="M0 500 L100 400"/>'
           '<glyph unicode="z" d="' + path + '"/></font></defs></svg>').encode()
    return dict(format='svg', original_base64=base64.b64encode(raw).decode())


class SVGFontTests(unittest.TestCase):
    def test_open_strokes_descender_spacing_and_restart(self):
        with tempfile.TemporaryDirectory() as folder:
            lib = FontLibrary(folder)
            result = lib.add([record()])
            font = result['fonts'][0]
            self.assertEqual(font['kind'], 'stroke')
            self.assertEqual(font['glyphs']['z']['bounds'], [0, -100, 200, 500])
            self.assertEqual(len(font['glyphs']['z']['paths']), 2)
            self.assertEqual(font['glyphs'][' ']['advance'], 350)
            self.assertEqual(FontLibrary(folder).snapshot()['fonts'], [font])
            self.assertEqual(lib.add([record()])['added'], 0)

    def test_bad_fonts_leave_library_unchanged(self):
        with tempfile.TemporaryDirectory() as folder:
            lib = FontLibrary(folder)
            lib.add([record()]); before = lib.path.read_bytes()
            for path in ['L0 0 L1 1', 'M0', 'M0 0 L1e309 0', 'M0 0 Q1 2 3 4']:
                with self.assertRaises(ValueError): lib.add([record(path)])
            for raw in [b'<svg/>', b'<!DOCTYPE svg><svg/>', b'<svg><broken>']:
                with self.assertRaises(ValueError):
                    lib.add([dict(format='svg', original_base64=base64.b64encode(raw).decode())])
            self.assertEqual(lib.path.read_bytes(), before)
