"""Store an editable postcard independently of loaded and interrupted jobs."""

import copy
import hashlib
import json
import math
import os
from pathlib import Path
import tempfile
import threading
from font_library import FontLibrary


class PostcardDraft:
    """Validate draft settings and atomically save without losing newer edits."""

    MAX_BYTES = 64 * 1024
    RANGES = {'size': (6, 40), 'spacing': (2, 25), 'x': (0, 148),
              'y': (0, 105), 'width': (1, 148)}

    def __init__(self, folder, library=None):
        self.path = Path(folder) / 'postcard.json'
        self.lock = threading.RLock()
        self.library = library or FontLibrary(folder)
        assets = Path(__file__).parent / 'assets'
        self.defaults = json.loads((assets / 'postcard-defaults.json').read_text())
        self.fonts = {font['id'] for font in
                      json.loads((assets / 'postcard-fonts.json').read_text())}

    def validate(self, document):
        if (not isinstance(document, dict)
                or document.get('format') != 'svg-plotter-postcard'
                or type(document.get('schema')) is not int
                or document['schema'] != 1
                or type(document.get('divider')) is not bool):
            raise ValueError('Choose a valid postcard draft (format version 1).')
        result = {key: document[key] for key in ('format', 'schema', 'divider')}
        # Reading a broken optional library must not hide drafts using bundled fonts.
        available = self.fonts
        if any(isinstance(document.get(key), dict) and str(document[key].get('font', '')).startswith('ttf-') for key in ('message', 'address')):
            available = available | self.library.ids()
        for key, limit in (('message', 2000), ('address', 600)):
            item = document.get(key)
            if not isinstance(item, dict):
                raise ValueError(f'Enter valid {key} settings.')
            text = item.get('text')
            if (not isinstance(text, str) or len(text) > limit
                    or any(ord(char) < 32 and char not in '\n\r\t' for char in text)):
                raise ValueError(f'Enter {key} text of up to {limit} characters.')
            font, align = item.get('font'), item.get('align')
            if (not isinstance(font, str) or font not in available
                    or not isinstance(align, str) or align not in {'left', 'centre', 'right'}
                    or type(item.get('enabled')) is not bool):
                raise ValueError(f'Choose a valid {key} font and alignment.')
            block = dict(text=text.replace('\r\n', '\n').replace('\r', '\n'),
                         font=font, align=align, enabled=item['enabled'])
            for field, (low, high) in self.RANGES.items():
                value = item.get(field)
                if (type(value) not in (int, float) or not math.isfinite(value)
                        or not low <= value <= high):
                    raise ValueError(f'{key.capitalize()} {field} must be between '
                                     f'{low} and {high}.')
                block[field] = value
            result[key] = block
        return result

    def snapshot(self):
        with self.lock:
            document = copy.deepcopy(self.defaults)
            revision, error = 'new', None
            if self.path.exists():
                try:
                    if self.path.stat().st_size > self.MAX_BYTES:
                        raise ValueError('Draft file is too large.')
                    raw = self.path.read_bytes()
                    revision = hashlib.sha256(raw).hexdigest()
                    document = self.validate(json.loads(raw))
                except (OSError, ValueError, UnicodeError) as exc:
                    error = ('The saved postcard draft could not be read. '
                             'It has been left unchanged. ' + str(exc))
            return dict(document=document, revision=revision, error=error,
                        defaults=copy.deepcopy(self.defaults))

    def save(self, document, revision):
        with self.lock:
            current = self.snapshot()
            if current['error']:
                raise ValueError(current['error'])
            if revision != current['revision']:
                raise ValueError('The saved postcard draft changed in another window. '
                                 'Export this layout as SVG before reopening the editor.')
            document = self.validate(document)
            self.path.parent.mkdir(parents=True, exist_ok=True)
            temporary = None
            try:
                with tempfile.NamedTemporaryFile(
                    mode='w', encoding='utf-8', dir=self.path.parent,
                    prefix='.postcard-', suffix='.tmp', delete=False,
                ) as stream:
                    temporary = stream.name
                    json.dump(document, stream, ensure_ascii=False, indent=2)
                    stream.write('\n')
                    stream.flush()
                    os.fsync(stream.fileno())
                os.replace(temporary, self.path)
            finally:
                if temporary and Path(temporary).exists():
                    Path(temporary).unlink()
            return self.snapshot()
