"""Validated personal pens, bottled inks and themes, stored outside app bundles."""
import copy
import json
import os
import re
import tempfile
import threading
import uuid
from pathlib import Path

from pens import PenCollection


class Catalogue:
    """Merge portable catalogues without replacing existing pen identities."""

    FORMAT = 'svg-plotter-catalogue'
    MAX_BYTES = 2 * 1024 * 1024
    MAX_ITEMS = 1000
    INK_KINDS = ('Unspecified', 'Fountain pen ink', 'Technical drawing ink',
                 'Dip pen ink', 'Other')
    INKS = {'Red': '#c93f55', 'Green': '#219d80', 'Blue': '#2685bd',
            'Purple': '#7b1fa2', 'Light Brown': '#a97850', 'Orange': '#df7b28',
            'Pink': '#d86294', 'Dark Brown': '#493126', 'Black': '#000000'}

    def __init__(self, folder):
        self.path = Path(folder) / 'catalogue.json'
        self.lock = threading.RLock()
        assets = Path(__file__).parent / 'assets'
        pens = json.loads((assets / 'pens.json').read_text())
        themes = json.loads((assets / 'themes.json').read_text())
        for pen in pens:
            pen.setdefault('ink', self.INKS.get(pen['colour'],
                           next(iter(pen.get('matches', [])), '#203832')))
        self.defaults = self.validate(dict(format=self.FORMAT, schema=1,
                                           pens=pens, themes=themes))

    @staticmethod
    def text(value, field, maximum=120, required=True):
        if (not isinstance(value, str) or len(value) > maximum
                or any(ord(char) < 32 for char in value)
                or (required and not value.strip())):
            raise ValueError(f'Enter a valid {field} (up to {maximum} characters).')
        return value.strip()

    @staticmethod
    def identifier(value):
        if not isinstance(value, str) or not re.fullmatch(r'[a-z0-9-]{1,60}', value):
            raise ValueError('Invalid pen, ink or theme identifier.')
        return value

    @staticmethod
    def colour(value):
        if not isinstance(value, str) or not re.fullmatch(r'#[0-9a-fA-F]{6}', value):
            raise ValueError('Choose a colour or enter six hexadecimal digits, such as #128080.')
        return value.lower()

    @staticmethod
    def new_id():
        return 'user-' + uuid.uuid4().hex

    def pen(self, item):
        if not isinstance(item, dict):
            raise ValueError('Invalid pen details.')
        pen = {'id': self.identifier(item.get('id') or self.new_id())}
        for field in ('brand', 'colour', 'size'):
            pen[field] = self.text(item.get(field), field)
        pen['reference'] = self.text(item.get('reference', ''), 'reference', required=False)
        pen['set'] = self.text(item.get('set') or 'My pens', 'collection')
        pen['ink'] = self.colour(item.get('ink'))
        pen['available'] = item.get('available', True)
        if not isinstance(pen['available'], bool):
            raise ValueError('Pen availability must be true or false.')
        matches = item.get('matches', [])
        if not isinstance(matches, list) or len(matches) > 100:
            raise ValueError('Invalid pen colour matches.')
        pen['matches'] = [self.colour(c) for c in matches]
        if item.get('ink_id') is not None:
            pen['ink_id'] = self.identifier(item['ink_id'])
        return pen

    def ink(self, item):
        """Validate a bottle record without inferring colour or performance."""
        if not isinstance(item, dict):
            raise ValueError('Invalid ink details.')
        ink = {'id': self.identifier(item.get('id') or self.new_id())}
        for field in ('brand', 'colour'):
            ink[field] = self.text(item.get(field), field)
        for field in ('reference', 'paper'):
            ink[field] = self.text(item.get(field, ''), field, required=False)
        for field in ('lightfastness', 'waterproof'):
            value = item.get(field, 'Unknown')
            ink[field] = self.text('Unknown' if value == '' else value, field)
        ink['notes'] = self.text(item.get('notes', ''), 'ink notes', 600, False)
        ink['kind'] = item.get('kind', 'Unspecified')
        if ink['kind'] not in self.INK_KINDS:
            raise ValueError('Choose a valid ink type.')
        ink['ink'] = self.colour(item.get('ink'))
        ink['available'] = item.get('available', True)
        if not isinstance(ink['available'], bool):
            raise ValueError('Ink availability must be true or false.')
        return ink

    def theme(self, item, pen_ids):
        if not isinstance(item, dict):
            raise ValueError('Invalid theme details.')
        theme = dict(id=self.identifier(item.get('id') or self.new_id()),
                     name=self.text(item.get('name'), 'theme name'),
                     note=self.text(item.get('note', ''), 'theme notes', 600, False),
                     match=self.text(item.get('match', 'Personal theme'),
                                     'theme description', 120, False))
        if 'slots' in item:
            slots = item['slots']
            if not isinstance(slots, list) or not 1 <= len(slots) <= 32:
                raise ValueError('A theme needs between 1 and 32 palette rows.')
            theme['slots'] = []
            for slot in slots:
                if not isinstance(slot, dict):
                    raise ValueError('Invalid palette row.')
                pen_id = slot.get('pen_id')
                if pen_id is not None and (not isinstance(pen_id, str) or pen_id not in pen_ids):
                    raise ValueError('A theme refers to an unknown pen.')
                theme['slots'].append(dict(colour=self.colour(slot.get('colour')),
                                           pen_id=pen_id))
            outline = item.get('outline')
            if outline is not None and (type(outline) is not int or not 0 <= outline < len(slots)):
                raise ValueError('Choose a valid outline row.')
            theme['outline'] = outline
            theme['pens'] = list(dict.fromkeys(s['pen_id'] for s in slots if s['pen_id']))
            theme['swatches'] = [s['colour'] for s in theme['slots']]
            if 'pens' in item and item['pens'] != theme['pens']:
                raise ValueError('Theme pen assignments do not match its palette rows.')
        else:
            theme['pens'] = item.get('pens')
            swatches = item.get('swatches')
            if not isinstance(swatches, list) or not 1 <= len(swatches) <= 32:
                raise ValueError('Invalid theme swatches.')
            theme['swatches'] = [self.colour(c) for c in swatches]
        if (not isinstance(theme['pens'], list) or not 1 <= len(theme['pens']) <= 32
                or any(not isinstance(p, str) or p not in pen_ids for p in theme['pens'])):
            raise ValueError('A theme needs at least one known pen.')
        return theme

    def validate(self, document):
        if (not isinstance(document, dict) or document.get('format') != self.FORMAT
                or type(document.get('schema')) is not int
                or document['schema'] not in (1, 2)):
            raise ValueError('Choose an SVG Plotter catalogue backup (format version 1 or 2).')
        result = dict(format=self.FORMAT, schema=2)
        for field in ('inks', 'pens', 'themes'):
            default = [] if field == 'inks' and document['schema'] == 1 else None
            items = document.get(field, default)
            if not isinstance(items, list) or len(items) > self.MAX_ITEMS:
                raise ValueError(f'A catalogue can contain at most {self.MAX_ITEMS} {field}.')
            validator = {
                'inks': self.ink, 'pens': self.pen,
                'themes': lambda item: self.theme(
                    item, {p['id'] for p in result['pens']}),
            }[field]
            result[field] = [validator(item) for item in items]
            if field == 'pens':
                inks = {ink['id']: ink for ink in result['inks']}
                for pen in result['pens']:
                    if 'ink_id' in pen:
                        if pen['ink_id'] not in inks:
                            raise ValueError('A pen refers to an unknown ink.')
                        ink = inks[pen['ink_id']]
                        pen['ink_name'] = ink['brand'] + ' ' + ink['colour']
            ids = [item['id'] for item in result[field]]
            if len(ids) != len(set(ids)):
                raise ValueError(f'Duplicate identifiers in {field}.')
        return result

    def snapshot(self):
        with self.lock:
            result = copy.deepcopy(self.defaults)
            result.update(revision=0, error='')
            if not self.path.exists():
                return result
            try:
                if self.path.stat().st_size > self.MAX_BYTES:
                    raise ValueError('File exceeds 2 MB.')
                saved = json.loads(self.path.read_text())
                if not isinstance(saved, dict):
                    raise ValueError('Invalid saved catalogue document.')
                revision = saved.get('revision')
                if type(revision) is not int or revision < 1:
                    raise ValueError('Invalid catalogue revision.')
                data = self.validate(saved)
                for field in ('inks', 'pens', 'themes'):
                    merged = {item['id']: item for item in result[field]}
                    merged.update({item['id']: item for item in data[field]})
                    result[field] = list(merged.values())
                result['revision'] = revision
            except (OSError, ValueError, TypeError) as error:
                result['error'] = ('Your personal catalogue could not be read. Its file has '
                                   'been preserved; editing is disabled. ' + str(error))
            return result

    def collection(self):
        return PenCollection(self.snapshot()['pens'])

    def export(self):
        data = self.snapshot()
        if data['error']:
            raise ValueError(data['error'])
        return {key: data[key] for key in ('format', 'schema', 'inks', 'pens', 'themes')}

    @staticmethod
    def content(item):
        return {key: value for key, value in item.items() if key != 'id'}

    def merge(self, current, imported):
        imported = self.validate(imported)
        remap = {}
        ink_remap = {}
        for field in ('inks', 'pens', 'themes'):
            for item in imported[field]:
                if field == 'pens' and 'ink_id' in item:
                    item['ink_id'] = ink_remap[item['ink_id']]
                if field == 'themes':
                    item['pens'] = [remap[p] for p in item['pens']]
                    for slot in item.get('slots', []):
                        if slot['pen_id']:
                            slot['pen_id'] = remap[slot['pen_id']]
                existing = next((p for p in current[field]
                                 if self.content(p) == self.content(item)), None)
                original_id = item['id']
                if existing:
                    item = existing
                else:
                    if any(p['id'] == item['id'] for p in current[field]):
                        item['id'] = self.new_id()
                    current[field].append(item)
                if field == 'pens':
                    remap[original_id] = item['id']
                elif field == 'inks':
                    ink_remap[original_id] = item['id']
        return current

    def change(self, action, item, revision):
        with self.lock:
            current = self.snapshot()
            if current['error']:
                raise ValueError(current['error'])
            if type(revision) is not int or revision != current['revision']:
                raise ValueError('The catalogue changed in another window. Refresh it and try again.')
            if action == 'import':
                current = self.merge(current, item)
            elif action in ('save_pen', 'save_ink', 'save_theme'):
                field = {'save_pen': 'pens', 'save_ink': 'inks',
                         'save_theme': 'themes'}[action]
                validator = {
                    'pens': self.pen, 'inks': self.ink,
                    'themes': lambda item: self.theme(
                        item, {p['id'] for p in current['pens']}),
                }[field]
                value = validator(item)
                existing = next((i for i, p in enumerate(current[field]) if p['id'] == value['id']), None)
                if existing is None:
                    current[field].append(value)
                else:
                    current[field][existing] = value
            else:
                raise ValueError('Choose a pen, ink or theme action.')
            result = self.validate(current)
            result['revision'] = revision + 1
            encoded = json.dumps(result, ensure_ascii=False, indent=2) + '\n'
            if len(encoded.encode()) > self.MAX_BYTES:
                raise ValueError('Catalogue exceeds 2 MB. Remove excessive notes before importing.')
            self.path.parent.mkdir(parents=True, exist_ok=True)
            temporary = None
            try:
                with tempfile.NamedTemporaryFile('w', dir=self.path.parent, delete=False,
                                                 encoding='utf-8') as stream:
                    temporary = Path(stream.name)
                    stream.write(encoded)
                    stream.flush()
                    os.fsync(stream.fileno())
                os.replace(temporary, self.path)
            finally:
                if temporary and temporary.exists():
                    temporary.unlink()
            return self.snapshot()
