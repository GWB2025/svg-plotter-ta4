"""A parked pause returns pen-up and never redraws completed strokes."""
import threading
import unittest
import test_plotting
from test_plotting import FILE


class ParkPauseTests(unittest.TestCase):
    setUp = test_plotting.PlotTests.setUp
    tearDown = test_plotting.PlotTests.tearDown
    prepare = test_plotting.PlotTests.prepare
    operation = test_plotting.PlotTests.operation
    until = test_plotting.PlotTests.until

    def parked(self):
        self.prepare()
        self.machine.xyz = [30., -30., 5.]
        self.plot.accepted = self.plot.pending = 4
        self.plot.recovery_active = True
        self.park_commands_start = len(self.machine.commands)
        self.plot.pause.set()
        worker = threading.Thread(target=self.plot.controls)
        worker.start()
        self.until(lambda: self.plot.snapshot()['phase'] == 'paused')
        return worker

    def test_pause_lifts_before_parking_and_continue_returns_before_lowering(self):
        worker = self.parked()
        try:
            self.assertEqual(self.machine.xyz, [0., 0., .5])
            self.assertEqual(self.machine.commands.count('$H'), 1)
            parking = self.machine.commands[self.park_commands_start:]
            self.assertLess(parking.index('G90 G1 Z0.5 F1200'),
                            parking.index('G90 G1 X0 Y0 F2400'))
            self.assertEqual(self.plot.snapshot()['pause_return'], [30., -30., 5.])
        finally:
            self.plot.pause.clear()
            worker.join(3)
        self.assertFalse(worker.is_alive())
        self.assertEqual(self.machine.xyz, [30., -30., 5.])
        tail = self.machine.commands[self.machine.commands.index('G90 G1 X0 Y0 F2400') + 1:]
        self.assertLess(tail.index('G90 G1 X30.0000 Y-30.0000 F2400'), tail.index('G90 G1 Z5 F1200'))
        self.assertIsNone(self.plot.snapshot()['pause_return'])

    def test_park_record_blocks_ordinary_recovery_until_position_is_restored(self):
        worker = self.parked()
        try:
            self.assertFalse(self.plot.snapshot()['recovery_available'])
        finally:
            self.plot.pause.clear()
            worker.join(3)
        self.assertTrue(self.plot.snapshot()['recovery_available'])

    def test_pause_during_job_continues_without_repeating_drawing_commands(self):
        text = FILE.replace('G90 G1 X30 Y-30 F900', '\n'.join(
            f'G90 G1 X{30+i/10} Y-30 F900' for i in range(40)))
        job = self.prepare(text)
        self.machine.delay = .003
        self.plot.action('start', {'job_id': job['id'], 'ready': True})
        self.until(lambda: self.plot.snapshot()['accepted'] >= 5)
        self.plot.action('pause', {})
        self.until(lambda: self.plot.snapshot()['phase'] == 'paused')
        self.assertEqual(self.machine.xyz, [0., 0., .5])
        self.plot.action('continue', {})
        self.plot.thread.join(5)
        self.assertEqual(self.plot.snapshot()['phase'], 'completed')
        for i in range(40):
            self.assertEqual(self.machine.commands.count(f'G90 G1 X{30+i/10} Y-30 F900'), 1)
