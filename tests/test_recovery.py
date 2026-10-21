"""Durable recovery uses the same job and never guesses physical progress."""
import json
import unittest
from plotting import Plotter
import test_plotting
from test_plotting import FILE
from test_colour_plotting import COLOURS


class RecoveryTests(unittest.TestCase):
    setUp = test_plotting.PlotTests.setUp
    tearDown = test_plotting.PlotTests.tearDown
    operation = test_plotting.PlotTests.operation
    prepare = test_plotting.PlotTests.prepare
    start = test_plotting.PlotTests.start
    until = test_plotting.PlotTests.until
    def checkpoint(self):
        job = self.prepare()
        self.plot.recovery_active = True
        self.plot.started = 1
        self.plot.accepted = 3
        self.plot.pending = 4
        self.plot.confirmed_pens = set()
        self.machine.xyz = [30., -30., 5.]
        self.plot.update('error', 'USB unavailable', accepted=4)
        self.plot.close()
        return job

    def restored(self):
        return Plotter(self.plot.folder, self.machine.ports, self.machine.open,
                       settle=0, retry_delay=0, lock_path=self.plot.lock_path)

    def test_restores_exact_job_without_opening_usb(self):
        job = self.checkpoint()
        opens = self.machine.opens
        self.plot = self.restored()
        self.assertEqual(self.machine.opens, opens)
        self.assertEqual(self.plot.job['id'], job['id'])
        self.assertEqual(self.plot.job['commands'], FILE.splitlines())
        self.assertEqual(self.plot.snapshot()['phase'], 'interrupted')
        self.assertTrue(self.plot.snapshot()['recovery_available'])

    def test_resume_requires_current_job_and_explicit_unchanged_setup(self):
        job = self.checkpoint()
        self.plot = self.restored()
        for payload in ({}, {'job_id': job['id'], 'ready': False},
                        {'job_id': 'old', 'ready': True}):
            with self.assertRaises(ValueError):
                self.plot.action('resume', payload)
        self.assertEqual(self.machine.opens, 1)

    def test_lost_ack_on_restored_job_does_not_repeat_drawn_move_or_home(self):
        job = self.checkpoint()
        self.plot = self.restored()
        self.machine.mode = 'Hold:0'
        state = self.operation('resume', {'job_id': job['id'], 'ready': True})
        self.assertEqual(state['phase'], 'completed', state)
        self.assertNotIn('G90 G1 X30 Y-30 F900', self.machine.commands)
        self.assertEqual(self.machine.commands.count('$H'), 1)
        self.assertEqual(self.machine.xyz, [0., 0., .5])
        self.assertFalse(state['recovery_available'])

    def test_moved_position_and_reset_block_resume(self):
        job = self.checkpoint()
        self.plot = self.restored()
        self.machine.xyz = [25., -25., 5.]
        state = self.operation('resume', {'job_id': job['id'], 'ready': True})
        self.assertEqual(state['phase'], 'error')
        self.assertNotIn('G90 G1 X30 Y-30 F900', self.machine.commands)

    def test_possible_partial_write_is_never_offered_for_resume(self):
        self.checkpoint()
        self.plot.uncertain_write = True
        self.plot.save_journal()
        self.plot = self.restored()
        self.assertFalse(self.plot.snapshot()['recovery_available'])
        with self.assertRaises(ValueError):
            self.plot.action('resume', {'job_id': self.plot.job['id'], 'ready': True})

    def test_saved_job_tampering_is_rejected(self):
        self.checkpoint()
        path = self.plot.folder / 'plotter-job.json'
        saved = json.loads(path.read_text())
        saved['text'] = saved['text'].replace('X30', 'X31')
        path.write_text(json.dumps(saved))
        self.plot = self.restored()
        self.assertFalse(self.plot.snapshot()['recovery_available'])

    def test_reset_during_resume_is_not_retriable(self):
        job = self.checkpoint()
        self.plot = self.restored()
        self.machine.reset_on_reopen = True
        state = self.operation('resume', {'job_id': job['id'], 'ready': True})
        self.assertEqual(state['phase'], 'error')
        self.assertFalse(state['recovery_available'])

    def test_pending_is_saved_before_usb_write(self):
        job = self.prepare()
        write = self.plot.write
        records = []
        def inspect(packet):
            if packet == b'G90 G1 X30 Y-30 F900\r':
                records.append(json.loads((self.plot.folder / 'plotter-state.json').read_text()))
            write(packet)
        self.plot.write = inspect
        self.assertEqual(self.start(job)['phase'], 'completed')
        self.assertEqual(records[0]['recovery']['pending'], 4)
        self.assertTrue(records[0]['recovery']['uncertain_write'])

    def test_restored_second_colour_does_not_repeat_first_pass(self):
        self.prepare(COLOURS)
        self.plot.recovery_active = True
        self.plot.accepted = 8
        self.plot.pending = 9
        self.plot.confirmed_pens = {2, 7}
        self.machine.xyz = [50., -50., 5.]
        self.plot.update('error', 'USB disconnected', accepted=9)
        self.plot.close()
        self.plot = self.restored()
        state = self.operation('resume', {'job_id': self.plot.job['id'], 'ready': True})
        self.assertEqual(state['phase'], 'completed', state)
        self.assertNotIn('G90 G1 X20 Y-20 F2400', self.machine.commands)
        self.assertNotIn('G90 G1 X50 Y-50 F900', self.machine.commands)
        self.assertEqual(self.machine.commands.count('$H'), 1)

    def test_loading_or_homing_cannot_silently_destroy_saved_progress(self):
        self.checkpoint()
        self.plot = self.restored()
        with self.assertRaises(ValueError):
            self.plot.load(FILE)
        with self.assertRaises(ValueError):
            self.plot.action('home', {})
        with self.assertRaises(ValueError):
            self.plot.action('connect', {'port': '/dev/fake'})
        self.plot.action('discard', {})
        self.assertFalse(self.plot.snapshot()['saved_plot'])
        self.plot.load(FILE)

    def test_checkpoint_does_not_claim_acknowledgement_means_execution(self):
        self.checkpoint()
        self.plot = self.restored()
        self.machine.xyz = [25., -25., 5.]
        state = self.operation('resume', {'job_id': self.plot.job['id'], 'ready': True})
        self.assertEqual(state['phase'], 'error')
        self.assertIn('exact command', state['message'])

    def test_resume_at_colour_boundary_still_requires_next_pen_confirmation(self):
        job = self.prepare(COLOURS)
        self.plot.recovery_active = True
        self.plot.accepted = self.plot.pending = 6
        self.plot.confirmed_pens = {2}
        self.machine.xyz = [0., 0., .5]
        self.plot.update('error', 'USB disconnected', accepted=7)
        self.plot.close()
        self.plot = self.restored()
        self.plot.action('resume', {'job_id': job['id'], 'ready': True})
        self.until(lambda: self.plot.snapshot()['phase'] == 'pen_change')
        self.assertEqual(self.plot.snapshot()['pending_pen']['colour'], '#0000ff')
        self.assertNotIn('G90 G1 X40 Y-40 F2400', self.machine.commands)
        self.plot.action('continue', {'job_id': job['id'], 'ready': True, 'pen_index': 1})
        self.plot.thread.join(3)
        self.assertEqual(self.plot.snapshot()['phase'], 'completed')


if __name__ == '__main__':
    unittest.main()
