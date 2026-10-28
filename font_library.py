"""Private TrueType originals and validated outline data, outside the app bundle."""
import base64
import binascii
import hashlib
import json
import math
import os
from pathlib import Path
import tempfile
import threading


class FontLibrary:
    MAX_BYTES = 32 * 1024 * 1024
    MAX_FONT_BYTES = 2 * 1024 * 1024

    def __init__(self, folder):
        self.path = Path(folder) / 'fonts.json'
        self.lock = threading.RLock()

    def validate(self, record):
        if not isinstance(record, dict):
            raise ValueError('Choose a valid TrueType font.')
        encoded, font = record.get('original_base64'), record.get('font')
        if not isinstance(encoded, str) or len(encoded) > self.MAX_FONT_BYTES * 4 // 3 + 4:
            raise ValueError('Choose a TrueType font no larger than 2 MB.')
        try:
            raw = base64.b64decode(encoded, validate=True)
        except (ValueError, binascii.Error):
            raise ValueError('The original font could not be read.') from None
        if not 12 <= len(raw) <= self.MAX_FONT_BYTES or raw[:4] not in (b'\x00\x01\x00\x00', b'true'):
            raise ValueError('Choose a .ttf TrueType font.')
        if not isinstance(font, dict) or font.get('units') != 1000:
            raise ValueError('Invalid font dimensions.')

        def number(value, low, high):
            if type(value) not in (int, float) or not math.isfinite(value) or not low <= value <= high:
                raise ValueError('Invalid font coordinates or spacing.')
            return value

        name, credit = font.get('name'), font.get('credit', '')
        if not isinstance(name, str) or not name.strip() or len(name) > 120 or not isinstance(credit, str) or len(credit) > 500:
            raise ValueError('Invalid font name or copyright.')
        cap = number(font.get('cap_height'), 1, 4000)
        glyphs = font.get('glyphs')
        if not isinstance(glyphs, dict) or not 1 <= len(glyphs) <= 4096 or any(c not in glyphs for c in (' ', '?', 'H')):
            raise ValueError('This font needs a space, question mark and capital H.')
        checked, count = {}, 0
        for character, glyph in glyphs.items():
            if not isinstance(character, str) or len(character) != 1 or ord(character) < 32 or not isinstance(glyph, dict):
                raise ValueError('Invalid font character.')
            advance = number(glyph.get('advance'), 0, 10000)
            paths = glyph.get('paths')
            if not isinstance(paths, list) or len(paths) > 1000:
                raise ValueError('Invalid font contours.')
            left = top = float('inf')
            right = bottom = -float('inf')
            for path in paths:
                if not isinstance(path, list) or not 2 <= len(path) <= 10000 or path[0] != path[-1]:
                    raise ValueError('Font outlines must be closed contours.')
                count += len(path)
                if count > 200000:
                    raise ValueError('This font is too complex (200,000 points maximum).')
                for point in path:
                    if not isinstance(point, list) or len(point) != 2:
                        raise ValueError('Invalid font point.')
                    x, y = (number(n, -10000, 10000) for n in point)
                    left, top = min(left, x), min(top, y)
                    right, bottom = max(right, x), max(bottom, y)
            checked[character] = dict(advance=advance, paths=paths,
                                      bounds=None if left == float('inf') else [left, top, right, bottom])
        identifier = 'ttf-' + hashlib.sha256(raw).hexdigest()
        return dict(id=identifier, original_base64=encoded,
                    font=dict(id=identifier, name=name.strip(), credit=credit,
                              kind='outline', units=1000, cap_height=cap, glyphs=checked))

    def read(self):
        if not self.path.exists():
            return []
        try:
            if self.path.is_symlink() or self.path.stat().st_size > self.MAX_BYTES:
                raise ValueError('Invalid font library file.')
            data = json.loads(self.path.read_text())
            if data.get('schema') != 1 or not isinstance(data.get('fonts'), list) or len(data['fonts']) > 20:
                raise ValueError('Invalid font library format.')
            records = [self.validate(record) for record in data['fonts']]
            if len({r['id'] for r in records}) != len(records):
                raise ValueError('Duplicate font records.')
            return records
        except (OSError, ValueError, TypeError, AttributeError) as error:
            raise ValueError('The saved font library could not be read. It has been left unchanged. ' + str(error)) from error

    def snapshot(self):
        with self.lock:
            return dict(fonts=[r['font'] for r in self.read()])

    def ids(self):
        with self.lock:
            return {r['id'] for r in self.read()}

    def add(self, records):
        if not isinstance(records, list) or not 1 <= len(records) <= 20:
            raise ValueError('Choose between 1 and 20 font files.')
        incoming = [self.validate(record) for record in records]
        with self.lock:
            existing = {r['id']: r for r in self.read()}
            added = 0
            for record in incoming:
                if record['id'] not in existing:
                    existing[record['id']] = record
                    added += 1
            if len(existing) > 20:
                raise ValueError('The font library is full (20 fonts maximum).')
            payload = json.dumps(dict(schema=1, fonts=list(existing.values())), ensure_ascii=True, separators=(',', ':')).encode()
            if len(payload) > self.MAX_BYTES:
                raise ValueError('The font library is full (32 MB maximum).')
            if added:
                self.path.parent.mkdir(parents=True, exist_ok=True)
                temporary = None
                try:
                    with tempfile.NamedTemporaryFile(dir=self.path.parent, prefix='.fonts-', delete=False) as stream:
                        temporary = stream.name
                        stream.write(payload)
                        stream.flush()
                        os.fsync(stream.fileno())
                    os.replace(temporary, self.path)
                finally:
                    if temporary and Path(temporary).exists():
                        Path(temporary).unlink()
            return dict(fonts=[r['font'] for r in existing.values()], added=added)
