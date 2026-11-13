"""Read SVG 1.1 polyline fonts without executing or displaying their XML."""
import math
import re
import xml.etree.ElementTree as ET

TOKEN = re.compile(r'[MLZmlz]|[-+]?(?:\d*\.\d+|\d+\.?\d*)(?:[eE][-+]?\d+)?')


def convert(raw):
    try:
        raw = raw.decode('utf-8-sig')
    except UnicodeDecodeError:
        raise ValueError('Save SVG fonts as UTF-8.') from None
    if '<!DOCTYPE' in raw.upper() or '<!ENTITY' in raw.upper():
        raise ValueError('SVG fonts must not contain document types or entities.')
    try:
        root = ET.fromstring(raw)
    except ET.ParseError:
        raise ValueError('This SVG font could not be read.') from None
    ns = '{http://www.w3.org/2000/svg}'
    fonts = list(root.iter(ns + 'font'))
    if root.tag != ns + 'svg' or len(fonts) != 1:
        raise ValueError('Choose an SVG font containing one font, not an SVG drawing.')
    font = fonts[0]
    face = font.find(ns + 'font-face')
    if face is None:
        raise ValueError('SVG font has no font-face metrics.')

    def number(value):
        try:
            result = float(value)
        except (ValueError, TypeError):
            raise ValueError('Invalid SVG font metric.') from None
        if not math.isfinite(result) or abs(result) > 1000000:
            raise ValueError('Invalid SVG font metric.')
        return result

    units = number(face.get('units-per-em', '1000'))
    if units <= 0:
        raise ValueError('Invalid SVG font units.')
    scale = 1000 / units
    glyphs, total = {}, 0
    for glyph in font.findall(ns + 'glyph'):
        char = glyph.get('unicode', '')
        if len(char) != 1 or ord(char) < 32 or char in glyphs:
            raise ValueError('SVG fonts must contain unique single-character glyphs.')
        data = glyph.get('d', '')
        if re.sub(TOKEN, '', data).strip(' ,\r\n\t'):
            raise ValueError('This importer supports SVG fonts with M, L and Z pen paths. Export a single-line polyline font.')
        tokens = TOKEN.findall(data)
        paths, stroke, index, command = [], [], 0, None
        current = [0, 0]
        while index < len(tokens):
            if tokens[index] in ('M', 'L', 'Z', 'm', 'l', 'z'):
                command = tokens[index]
                index += 1
            if command in ('Z', 'z'):
                if not stroke:
                    raise ValueError('Invalid SVG font path.')
                current = stroke[0][:]
                stroke.append(current[:])
                command = None
                continue
            if command not in ('M', 'L', 'm', 'l') or index + 2 > len(tokens):
                raise ValueError('Incomplete SVG font path.')
            point = [number(v) * scale for v in tokens[index:index+2]]
            index += 2
            if command.islower():
                point = [point[i] + current[i] for i in range(2)]
            if command.upper() == 'M':
                if stroke:
                    paths.append(stroke)
                stroke = []
            elif not stroke:
                raise ValueError('SVG font paths must start with a move.')
            stroke.append(point)
            current = point
            command = 'l' if command.islower() else 'L'
            total += 1
            if total > 200000:
                raise ValueError('This SVG font is too complex.')
        if stroke:
            paths.append(stroke)
        glyphs[char] = dict(advance=number(glyph.get('horiz-adv-x', font.get('horiz-adv-x'))) * scale,
                            paths=paths)
    cap = face.get('cap-height')
    if cap is not None:
        cap = number(cap) * scale
    else:
        cap = max((p[1] for path in glyphs.get('H', {}).get('paths', []) for p in path), default=700)
    return dict(name=face.get('font-family', 'Imported SVG font'), credit='', units=1000,
                cap_height=cap, glyphs=glyphs)
