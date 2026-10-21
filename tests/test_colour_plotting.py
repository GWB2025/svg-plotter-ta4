"""Pen changes must wait at the verified park position for confirmation."""

import tempfile
import time
import unittest
from pathlib import Path

from plotting import Plotter, parse_job
from test_plotting import Machine


COLOURS = (
    'G21\nG90 G1 Z0.5 F1200\n; PEN_CHANGE #ff0000\n'
    'G90 G1 X20 Y-20 F2400\nG90 G1 Z5 F3000\n'
    'G90 G1 X30 Y-30 F900\nG90 G1 Z0.5 F3000\n'
    'G90 G1 X0 Y0 F2400\n; PEN_CHANGE #0000ff\n'
    'G90 G1 X40 Y-40 F2400\nG90 G1 Z5 F3000\n'
    'G90 G1 X50 Y-50 F900\nG90 G1 Z0.5 F3000\n'
    'G90 G1 X0 Y0 F2400\n'
)


class ColourTests(unittest.TestCase):
    def setUp(self):
        self.folder = tempfile.TemporaryDirectory()
        self.machine = Machine()
        self.plot = Plotter(
            self.folder.name, ports=self.machine.ports,
            opener=self.machine.open, settle=0, retry_delay=0,
            lock_path=Path(self.folder.name) / 'lock',
        )

    def tearDown(self):
        self.plot.cancel.set()
        if self.plot.thread:
            self.plot.thread.join(4)
        self.plot.close()
        self.folder.cleanup()

    def until(self, predicate):
        end = time.monotonic() + 3
        while time.monotonic() < end:
            if predicate():
                return
            time.sleep(.005)
        self.fail(str(self.plot.snapshot()))

    def prepare(self):
        job = self.plot.load(COLOURS)
        for action, payload in [('connect', {'port': '/dev/fake'}), ('home', {})]:
            self.plot.action(action, payload)
            self.plot.thread.join(3)
        self.plot.action('start', {'job_id': job['id'], 'ready': True})
        return job

    def test_parser_rejects_pen_change_away_from_park(self):
        with self.assertRaisesRegex(ValueError, 'pen raised|home'):
            parse_job(COLOURS.replace(
                'G90 G1 X0 Y0 F2400\n; PEN_CHANGE #0000ff',
                '; PEN_CHANGE #0000ff',
            ))

    def test_each_colour_waits_at_home_and_requires_current_confirmation(self):
        job = self.prepare()
        for index, colour in enumerate(['#ff0000', '#0000ff']):
            self.until(lambda: self.plot.snapshot()['phase'] == 'pen_change')
            state = self.plot.snapshot()
            self.assertEqual(state['controller']['position'], (0., 0., .5))
            self.assertEqual(state['pending_pen']['colour'], colour)
            with self.assertRaises(ValueError):
                self.plot.action('continue', {'ready': False})
            with self.assertRaises(ValueError):
                self.plot.action('continue', {
                    'ready': True, 'job_id': job['id'], 'pen_index': index - 1,
                })
            if index == 0:
                self.assertNotIn('G90 G1 X20 Y-20 F2400', self.machine.commands)
            else:
                self.assertNotIn('G90 G1 X40 Y-40 F2400', self.machine.commands)
            self.plot.action('continue', {
                'ready': True, 'job_id': job['id'], 'pen_index': index,
            })
            self.until(lambda: self.plot.snapshot().get('pending_pen', None) is None
                       or self.plot.snapshot()['pending_pen']['index'] != index)
        self.plot.thread.join(3)
        self.assertEqual(self.plot.snapshot()['phase'], 'completed')
        self.assertEqual(self.machine.commands.count('$H'), 1)

    def test_cancel_at_pen_change_never_sends_the_next_stroke(self):
        self.prepare()
        self.until(lambda: self.plot.snapshot()['phase'] == 'pen_change')
        self.plot.action('cancel', {})
        self.plot.thread.join(3)
        self.assertEqual(self.plot.snapshot()['phase'], 'cancelled')
        self.assertNotIn('G90 G1 X20 Y-20 F2400', self.machine.commands)
