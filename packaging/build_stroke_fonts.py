"""Convert the supplied SVG stroke fonts into portable plotting polylines."""

import argparse
import copy
import json
import math
from pathlib import Path
import re
import xml.etree.ElementTree as ET


class StrokeFontBuilder:
    """Retain pen lifts and approximate cubic curves to half a font unit."""

    FONTS = (
        ('sans', 'Hershey Sans', 'HersheySans1'),
        ('serif', 'Hershey Serif', 'HersheySerifMed'),
        ('italic', 'Hershey Serif Italic', 'HersheySerifMedItalic'),
        ('script', 'Hershey Script', 'HersheyScript1'),
    )
    NS = {'svg': 'http://www.w3.org/2000/svg'}
    TOKEN = re.compile(r'[MLCZ]|[-+]?(?:\d*\.\d+|\d+\.?\d*)(?:[eE][-+]?\d+)?')

    @staticmethod
    def bounds(paths):
        """Return ink bounds, including accents, in font coordinates."""
        points = [point for stroke in paths for point in stroke]
        if not points:
            return None
        return [min(p[0] for p in points), min(p[1] for p in points),
                max(p[0] for p in points), max(p[1] for p in points)]

    @classmethod
    def add_macrons(cls, font):
        """Add Latin long vowels without changing the original glyphs.

        Each macron is one independent horizontal stroke. The dotless i
        supplies the stem of ī; its macron replaces, rather than covers, the
        dot. Retain advances so accents do not introduce extra text columns.
        """
        glyphs, units = font['glyphs'], font['units']
        for plain, accented in zip('AEIOUYaeiouy', 'ĀĒĪŌŪȲāēīōūȳ'):
            if accented in glyphs:
                continue
            base = glyphs['ı' if plain == 'i' else plain]
            left, _, right, top = base['bounds']
            centre = (left + right) / 2
            if plain == 'i':
                # Follow the font's own dot placement, including italic slant.
                dot = [p[0] for path in glyphs['i']['paths']
                       for p in path if p[1] > top]
                if dot:
                    centre = (min(dot) + max(dot)) / 2
            width = max(0.18 * units, min(0.36 * units, 0.65 * (right - left)))
            height = round(top + 0.16 * units, 4)
            bar = [[round(centre - width / 2, 4), height],
                   [round(centre + width / 2, 4), height]]
            paths = copy.deepcopy(base['paths']) + [bar]
            glyphs[accented] = dict(advance=glyphs[plain]['advance'],
                                    paths=paths, bounds=cls.bounds(paths))

    @staticmethod
    def cubic(points, depth=0):
        start, first, second, end = points
        dx, dy = end[0] - start[0], end[1] - start[1]
        length = math.hypot(dx, dy)
        if length:
            error = max(abs(dy * (p[0] - start[0]) - dx * (p[1] - start[1]))
                        / length for p in (first, second))
        else:
            error = max(math.dist(start, p) for p in (first, second))
        if error <= 0.5 or depth >= 16:
            return [end]
        midpoint = lambda a, b: [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2]
        a, b, c = [midpoint(points[i], points[i + 1]) for i in range(3)]
        d, e = midpoint(a, b), midpoint(b, c)
        centre = midpoint(d, e)
        return (StrokeFontBuilder.cubic([start, a, d, centre], depth + 1)
                + StrokeFontBuilder.cubic([centre, e, c, end], depth + 1))

    def paths(self, data):
        if re.sub(self.TOKEN, '', data).strip(' ,\n\r\t'):
            raise ValueError('Unsupported font path command.')
        tokens = self.TOKEN.findall(data)
        paths, stroke, index, command = [], [], 0, None
        while index < len(tokens):
            if tokens[index] in {'M', 'L', 'C', 'Z'}:
                command = tokens[index]
                index += 1
            if command == 'Z':
                stroke.append(stroke[0][:])
                command = None
                continue
            count = 6 if command == 'C' else 2
            values = list(map(float, tokens[index:index + count]))
            if len(values) != count or command not in {'M', 'L', 'C'}:
                raise ValueError('Incomplete font path.')
            index += count
            if command == 'M':
                if stroke:
                    paths.append(stroke)
                stroke = [values]
                command = 'L'
            elif command == 'L':
                stroke.append(values)
            else:
                stroke.extend(self.cubic([stroke[-1], values[:2],
                                          values[2:4], values[4:]]))
        if stroke:
            paths.append(stroke)
        return [[[round(v, 4) for v in point] for point in path]
                for path in paths if len(path) > 1]

    def build(self, source, root):
        fonts, credits = [], []
        for identifier, name, filename in self.FONTS:
            tree = ET.parse(source / (filename + '.svg')).getroot()
            font = tree.find('.//svg:font', self.NS)
            face = font.find('svg:font-face', self.NS)
            glyphs = {}
            for glyph in font.findall('svg:glyph', self.NS):
                character = glyph.get('unicode')
                if len(character or '') != 1:
                    continue
                paths = self.paths(glyph.get('d', ''))
                glyphs[character] = dict(
                    advance=float(glyph.get('horiz-adv-x', font.get('horiz-adv-x'))),
                    paths=paths, bounds=self.bounds(paths),
                )
            fonts.append(dict(id=identifier, name=name,
                              units=float(face.get('units-per-em')),
                              cap_height=glyphs['H']['bounds'][3], glyphs=glyphs))
            self.add_macrons(fonts[-1])
            credits.append(filename + '.svg\n' +
                           tree.find('svg:metadata', self.NS).text.strip())
        (root / 'assets/postcard-fonts.json').write_text(
            json.dumps(fonts, ensure_ascii=False, separators=(',', ':')) + '\n',
            encoding='utf-8',
        )
        (root / 'docs/FONT_LICENCES.txt').write_text(
            'Bundled stroke-font data\n\n'
            'Converted to polylines from the SVG fonts supplied with Inkscape.\n'
            'Latin macrons added by SVG Plotter from the original letter paths\n'
            'and separate horizontal strokes; lowercase ī uses dotless ı.\n'
            'No Inkscape executable code is included. Original notices follow.\n\n'
            + '\n\n'.join(credits) + '\n', encoding='utf-8',
        )


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('source', type=Path)
    StrokeFontBuilder().build(parser.parse_args().source,
                              Path(__file__).resolve().parents[1])
