"""Validated machine profiles; no hardware is accessed by this module."""

import copy
import fcntl
import hashlib
import json
import math
import os
import re
import threading
import uuid
from pathlib import Path


class PlotterProfile:
    """Describe a top-left, zero-offset machine or an SVG export target."""

    DEFAULT = dict(
        id='ta4', name='Writing Robot T-A4', make='UUNA TEK',
        model='Writing Robot T-A4 / DrawCore', driver='grbl-z',
        width=210, height=297, x_direction=1, y_direction=-1,
        pen_up=0.5, pen_down=5, draw_feed=900, travel_feed=2400,
        lift_feed=1200, stroke_feed=3000, baudrate=115200,
        usb_vid=6790, usb_pid=32832, banner='DrawCore',
    )
    BAUDRATES = (9600, 19200, 38400, 57600, 115200, 230400, 250000)

    def __init__(self, data):
        if not isinstance(data, dict) or set(data) - set(self.DEFAULT) - {'fingerprint'}:
            raise ValueError('Invalid plotter profile fields.')
        self.data = {key: data.get(key, value) for key, value in self.DEFAULT.items()}
        for key in ('id', 'name', 'make', 'model', 'banner'):
            value = self.data[key]
            if (not isinstance(value, str) or not value.strip()
                    or len(value) > 120 or any(ord(c) < 32 for c in value)):
                raise ValueError(f'Enter a valid {key}.')
            self.data[key] = value.strip()
        if not re.fullmatch(r'[a-z0-9-]{1,60}', self.data['id']):
            raise ValueError('Invalid plotter profile identifier.')
        if self.data['driver'] not in ('grbl-z', 'svg'):
            raise ValueError('Choose GRBL with Z pen lift or SVG export.')
        for key, low, high in (
            ('width', 1, 2000), ('height', 1, 2000),
            ('pen_up', -100, 100), ('pen_down', -100, 100),
            ('draw_feed', 1, 30000), ('travel_feed', 1, 30000),
            ('lift_feed', 1, 30000), ('stroke_feed', 1, 30000),
        ):
            value = self.data[key]
            if (type(value) not in (int, float) or not math.isfinite(value)
                    or not low <= value <= high or round(value, 4) != value):
                raise ValueError(f'{key} must be between {low} and {high}, with at most four decimal places.')
        if abs(self.data['pen_up'] - self.data['pen_down']) < .1:
            raise ValueError('Pen up and down must differ by at least 0.1 mm.')
        for key in ('x_direction', 'y_direction'):
            if type(self.data[key]) is not int or self.data[key] not in (-1, 1):
                raise ValueError('Axis directions must be +1 or −1.')
        if type(self.data['baudrate']) is not int or self.data['baudrate'] not in self.BAUDRATES:
            raise ValueError('Choose a supported serial baud rate.')
        for key in ('usb_vid', 'usb_pid'):
            value = self.data[key]
            if value is not None and (type(value) is not int or not 0 <= value <= 65535):
                raise ValueError('USB IDs must be decimal integers from 0 to 65535, or blank.')
        if (self.data['usb_vid'] is None) != (self.data['usb_pid'] is None):
            raise ValueError('Specify both USB IDs, or leave both blank.')

    @classmethod
    def default(cls):
        return cls(cls.DEFAULT)

    @property
    def fingerprint(self):
        content = json.dumps(self.data, sort_keys=True, separators=(',', ':'))
        return hashlib.sha256(content.encode()).hexdigest()

    def snapshot(self):
        return copy.deepcopy(self.data) | {'fingerprint': self.fingerprint}

    def page_point(self, x, y):
        return [x * self.data['x_direction'], y * self.data['y_direction']]

    def contains(self, x, y):
        px, py = self.page_point(x, y)
        return (math.isfinite(px + py) and 0 <= px <= self.data['width']
                and 0 <= py <= self.data['height'])

    def lift(self):
        return f"G90 G1 Z{self.data['pen_up']:.12g} F{self.data['lift_feed']:.12g}"

    def move(self, x, y):
        return f"G90 G1 X{x:.4f} Y{y:.4f} F{self.data['travel_feed']:.12g}"

    def require_connection(self):
        if self.data['driver'] != 'grbl-z':
            raise ValueError('This plotter uses SVG export. Save the prepared SVG and use its own plotting software.')


class ProfileStore:
    """Atomic, revision-checked profiles stored alongside personal settings."""

    def __init__(self, folder):
        self.path = Path(folder) / 'plotter-profiles.json'
        self.mutex = threading.RLock()
        self._read()

    def _read(self):
        self.state = dict(schema=1, revision=0, selected='ta4', profiles=[])
        if self.path.exists():
            try:
                state = json.loads(self.path.read_text())
                profiles = [PlotterProfile(p).data for p in state['profiles']]
                ids = [p['id'] for p in profiles]
                if (state['schema'] != 1 or type(state['revision']) is not int
                        or state['revision'] < 0 or len(ids) > 100
                        or len(set(ids)) != len(ids) or 'ta4' in ids
                        or state['selected'] not in ['ta4', *ids]):
                    raise ValueError('Invalid profile collection.')
                self.state = dict(schema=1, revision=state['revision'],
                                  selected=state['selected'], profiles=profiles)
            except (KeyError, TypeError, ValueError) as error:
                raise ValueError('Saved plotter profiles could not be read; keep plotter-profiles.json for inspection.') from error

    @property
    def active(self):
        return next(PlotterProfile(p) for p in self.snapshot()['profiles']
                    if p['id'] == self.state['selected'])

    def snapshot(self):
        with self.mutex:
            return copy.deepcopy(self.state) | {'profiles': [
                PlotterProfile.default().snapshot(),
                *(PlotterProfile(p).snapshot() for p in self.state['profiles']),
            ]}

    def change(self, action, item, revision):
        with self.mutex:
            self.path.parent.mkdir(parents=True, exist_ok=True)
            with self.path.with_suffix('.lock').open('a') as lock:
                fcntl.flock(lock, fcntl.LOCK_EX)
                self._read()
                if type(revision) is not int or revision != self.state['revision']:
                    raise ValueError('Plotter profiles changed. Reload before saving.')
                if not isinstance(item, dict):
                    raise ValueError('Choose a plotter profile.')
                candidate = copy.deepcopy(self.state)
                identifier = item.get('id')
                existing = next((p for p in candidate['profiles'] if p['id'] == identifier), None)
                if action == 'save':
                    if identifier == 'ta4':
                        raise ValueError('The supplied T-A4 profile is read-only. Duplicate it to make changes.')
                    profile = PlotterProfile(item | {'id': identifier or 'plotter-' + uuid.uuid4().hex}).data
                    if existing:
                        candidate['profiles'][candidate['profiles'].index(existing)] = profile
                    else:
                        if len(candidate['profiles']) >= 100:
                            raise ValueError('At most 100 custom plotters can be saved.')
                        candidate['profiles'].append(profile)
                elif action == 'select':
                    if identifier != 'ta4' and not existing:
                        raise ValueError('Unknown plotter profile.')
                    candidate['selected'] = identifier
                elif action == 'delete':
                    if identifier == 'ta4' or not existing:
                        raise ValueError('Only custom plotters can be removed.')
                    if identifier == candidate['selected']:
                        raise ValueError('Choose another plotter before deleting the selected one.')
                    candidate['profiles'].remove(existing)
                else:
                    raise ValueError('Unknown plotter profile action.')
                candidate['revision'] += 1
                temporary = self.path.with_suffix('.tmp')
                with temporary.open('w') as stream:
                    json.dump(candidate, stream, indent=2, allow_nan=False)
                    stream.flush()
                    os.fsync(stream.fileno())
                temporary.replace(self.path)
                self.state = candidate
                return self.snapshot()
