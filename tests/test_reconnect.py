"""Recovery re-registers the drawing without guessing executed commands."""

import json
import unittest

from plotting import Plotter, parse_job
from recovery import RecoveryPlanner
from test_colour_plotting import COLOURS
import test_plotting
from test_plotting import FILE


class PlannerTests(unittest.TestCase):
    def setUp(self):
        self.job = parse_job(COLOURS)
        self.planner = RecoveryPlanner(self.job)

    def test_report_inside_stroke_returns_to_its_start_with_correct_pen(self):
        point = self.planner.from_report(
            {'position': [45., -45., 5.], 'offset': [0., 0., 0.]},
            accepted=10, pending=11, confirmed_pens={2, 7},
        )
        self.assertEqual(point['next_index'], 8)
        self.assertEqual(point['position'], [40., -40., .5])
        self.assertEqual(point['confirmed_pens'], [2, 7])
        self.assertEqual(point['source'], 'reported')
        self.assertEqual(self.planner.describe(point)['pen_label'], '#0000ff')

    def test_report_does_not_search_a_previous_pen_or_ignore_work_offsets(self):
        for report in (
            {'position': [25., -25., 5.], 'offset': [0., 0., 0.]},
            {'position': [45., -45., 5.], 'offset': [1., 0., 0.]},
            {'position': [float('nan'), -45., 5.], 'offset': [0., 0., 0.]},
        ):
            with self.subTest(report=report):
                self.assertIsNone(self.planner.from_report(
                    report, 10, 11, {2, 7},
                ))

    def test_verified_checkpoint_rejects_wrong_coordinates_and_pen_sequence(self):
        point = self.planner.checkpoint(11, {2, 7})
        for invalid in (
            dict(point, position=[0., 0., .5]),
            dict(point, confirmed_pens=[2]),
            dict(point, next_index=999),
        ):
            with self.subTest(invalid=invalid):
                with self.assertRaises(ValueError):
                    self.planner.validate(invalid)

    def test_overlapping_report_locations_choose_earliest_possible_stroke(self):
        text = FILE.replace('G90 G1 X0 Y0 F2400',
                            'G90 G1 X20 Y-20 F2400\nG90 G1 Z5 F3000\n'
                            'G90 G1 X30 Y-30 F900\nG90 G1 Z0.5 F3000\n'
                            'G90 G1 X0 Y0 F2400')
        planner = RecoveryPlanner(parse_job(text))
        point = planner.from_report(
            {'position': [25., -25., 5.], 'offset': [0., 0., 0.]},
            10, 11, set(),
        )
        self.assertEqual(point['next_index'], 3)


class ReconnectionTests(unittest.TestCase):
    setUp = test_plotting.PlotTests.setUp
    tearDown = test_plotting.PlotTests.tearDown
    prepare = test_plotting.PlotTests.prepare
    operation = test_plotting.PlotTests.operation
    until = test_plotting.PlotTests.until

    def interrupt(self):
        job = self.prepare(COLOURS)
        self.plot.recovery_active = True
        self.plot.accepted = 10
        self.plot.pending = 11
        self.plot.confirmed_pens = {2, 7}
        self.plot.controller = {
            'state': 'Run', 'position': [45., -45., 5.],
            'offset': [0., 0., 0.],
        }
        self.plot.reset_seen = True
        self.plot.update('error', 'Controller reset', accepted=11)
        self.plot.close()
        self.plot = Plotter(
            self.plot.folder, self.machine.ports, self.machine.open,
            settle=0, retry_delay=0, lock_path=self.plot.lock_path,
        )
        return job

    def begin_rehome(self, job):
        self.plot.action('rehome', {
            'job_id': job['id'], 'rehome_ready': True,
        })
        self.until(lambda: self.plot.snapshot()['phase'] == 'recovery_pen')

    def test_legacy_reset_record_restores_report_and_offers_explicit_recovery(self):
        self.interrupt()
        state = self.plot.snapshot()
        self.assertFalse(state['recovery_available'])
        self.assertTrue(state['rehome_available'])
        self.assertEqual(state['controller']['position'], [45., -45., 5.])
        self.assertEqual(state['rehome_plan']['pen_label'], '#0000ff')
        self.assertEqual(self.machine.opens, 1)

    def test_rehome_requires_separate_paper_and_lift_confirmation(self):
        job = self.interrupt()
        for payload in ({'ready': True, 'job_id': job['id']},
                        {'rehome_ready': True, 'job_id': 'old'}):
            with self.assertRaises(ValueError):
                self.plot.action('rehome', payload)
        self.assertEqual(self.machine.opens, 1)

    def test_rehome_returns_pen_up_then_waits_before_replaying_current_stroke(self):
        job = self.interrupt()
        self.machine.reset_on_reopen = True
        self.begin_rehome(job)
        state = self.plot.snapshot()
        self.assertEqual(self.machine.xyz, [40., -40., .5])
        self.assertEqual(state['pending_pen']['pen_label'], '#0000ff')
        self.assertNotIn('G90 G1 X50 Y-50 F900', self.machine.commands)
        self.assertLess(self.machine.commands.index('\x18'),
                        len(self.machine.commands) - 1)
        self.assertEqual(self.machine.commands.count('$H'), 2)
        self.plot.action('continue', {
            'job_id': job['id'], 'ready': True, 'pen_index': 1,
        })
        self.plot.thread.join(4)
        state = self.plot.snapshot()
        self.assertEqual(state['phase'], 'completed', state)
        self.assertNotIn('G90 G1 X30 Y-30 F900', self.machine.commands)
        self.assertEqual(self.machine.commands.count('G90 G1 X50 Y-50 F900'), 1)

    def test_cancel_while_fitting_recovery_pen_does_not_draw(self):
        job = self.interrupt()
        self.begin_rehome(job)
        self.plot.action('cancel', {})
        self.plot.thread.join(4)
        self.assertEqual(self.plot.snapshot()['phase'], 'cancelled')
        self.assertNotIn('G90 G1 X50 Y-50 F900', self.machine.commands)

    def test_verified_stroke_checkpoint_is_durable_and_restored_after_reset(self):
        job = self.prepare()
        self.machine.disconnect_on = 'G90 G1 X0 Y0 F2400'
        self.machine.reset_on_reopen = True
        state = self.operation('start', {'job_id': job['id'], 'ready': True})
        self.assertEqual(state['phase'], 'error')
        saved = json.loads((self.plot.folder / 'plotter-state.json').read_text())
        point = saved['recovery']['execution_checkpoint']
        self.assertEqual(point['next_index'], 7)
        self.assertEqual(point['position'], [30., -30., .5])
        self.assertEqual(state['rehome_plan']['source'], 'verified')

    def test_acknowledged_but_unfinished_stroke_cannot_advance_checkpoint(self):
        self.prepare()
        self.plot.recovery_active = True
        self.plot.record_execution(0, self.plot.controller)
        self.plot.accepted = 6
        for state in (
            dict(state='Run', position=[30., -30., .5], offset=[0., 0., 0.]),
            dict(state='Idle', position=[25., -25., 5.], offset=[0., 0., 0.]),
        ):
            with self.assertRaises(ValueError):
                self.plot.record_execution(7, state)
        self.assertEqual(self.plot.execution_checkpoint['next_index'], 0)

    def test_recovery_failure_retains_original_point_across_app_restart(self):
        job = self.interrupt()
        self.machine.disconnect_on = 'G90 G1 X40.0000 Y-40.0000 F2400'
        state = self.operation('rehome', {
            'job_id': job['id'], 'rehome_ready': True,
        })
        self.assertEqual(state['phase'], 'error')
        restored = Plotter(
            self.plot.folder, self.machine.ports, self.machine.open,
            settle=0, retry_delay=0, lock_path=self.plot.lock_path,
        )
        state = restored.snapshot()
        self.assertFalse(state['recovery_available'])
        self.assertTrue(state['rehome_available'])
        self.assertEqual(state['rehome_plan']['position'], [40., -40., .5])

    def test_disconnected_device_never_falls_back_to_another_plotter(self):
        job = self.interrupt()
        self.plot.ports = lambda: [dict(
            port='/dev/other', identity=[6790, 32832, 'different-plotter'],
        )]
        state = self.operation('rehome', {
            'job_id': job['id'], 'rehome_ready': True,
        })
        self.assertEqual(state['phase'], 'error')
        self.assertEqual(self.machine.opens, 1)
        self.assertTrue(state['rehome_available'])

    def test_wrong_pen_confirmation_cannot_start_recovery_drawing(self):
        job = self.interrupt()
        self.begin_rehome(job)
        with self.assertRaises(ValueError):
            self.plot.action('continue', {
                'job_id': job['id'], 'ready': True, 'pen_index': 0,
            })
        self.assertEqual(self.plot.snapshot()['phase'], 'recovery_pen')
        self.assertNotIn('G90 G1 X50 Y-50 F900', self.machine.commands)


if __name__ == '__main__':
    unittest.main()
