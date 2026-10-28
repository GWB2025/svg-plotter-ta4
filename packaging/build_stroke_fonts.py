"""Convert the supplied SVG stroke fonts into portable plotting polylines."""

import argparse
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
                points = [p for stroke in paths for p in stroke]
                bounds = ([min(p[0] for p in points), min(p[1] for p in points),
                           max(p[0] for p in points), max(p[1] for p in points)]
                          if points else None)
                glyphs[character] = dict(
                    advance=float(glyph.get('horiz-adv-x', font.get('horiz-adv-x'))),
                    paths=paths, bounds=bounds,
                )
            fonts.append(dict(id=identifier, name=name,
                              units=float(face.get('units-per-em')),
                              cap_height=glyphs['H']['bounds'][3], glyphs=glyphs))
            credits.append(filename + '.svg\n' +
                           tree.find('svg:metadata', self.NS).text.strip())
        (root / 'assets/postcard-fonts.json').write_text(
            json.dumps(fonts, ensure_ascii=False, separators=(',', ':')) + '\n',
            encoding='utf-8',
        )
        (root / 'docs/FONT_LICENCES.txt').write_text(
            'Bundled stroke-font data\n\n'
            'Converted to polylines from the SVG fonts supplied with Inkscape.\n'
            'No Inkscape executable code is included. Original notices follow.\n\n'
            + '\n\n'.join(credits) + '\n', encoding='utf-8',
        )


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('source', type=Path)
    StrokeFontBuilder().build(parser.parse_args().source,
                              Path(__file__).resolve().parents[1])
