"""Profile persistence, validation and hardware-independent coordinates."""

import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from plotter_profiles import PlotterProfile, ProfileStore


def custom_profile(**changes):
    return PlotterProfile({**PlotterProfile.default().data, 'id': 'custom-a3',
                           'name': 'Workshop A3', 'make': 'Workshop',
                           'model': 'A3', 'width': 420, 'height': 297,
                           'y_direction': 1, 'pen_up': 3, 'pen_down': 0,
                           'draw_feed': 600, 'travel_feed': 1800,
                           'lift_feed': 800, 'stroke_feed': 1000,
                           'banner': 'Grbl', 'usb_vid': None,
                           'usb_pid': None, **changes})


class ProfileTests(unittest.TestCase):
    def test_default_preserves_ta4_commands_and_coordinates(self):
        profile = PlotterProfile.default()
        self.assertEqual(profile.lift(), 'G90 G1 Z0.5 F1200')
        self.assertEqual(profile.move(10, -20), 'G90 G1 X10.0000 Y-20.0000 F2400')
        self.assertEqual(profile.page_point(10, -20), [10, 20])
        self.assertEqual(profile.data['usb_vid'], 6790)
        self.assertFalse(profile.contains(211, 0))

    def test_other_dimensions_axis_and_lift_settings(self):
        profile = custom_profile()
        self.assertTrue(profile.contains(420, 297))
        self.assertFalse(profile.contains(421, 0))
        self.assertFalse(profile.contains(0, -1))
        self.assertEqual(profile.page_point(350, 200), [350, 200])
        self.assertEqual(profile.lift(), 'G90 G1 Z3 F800')

    def test_rejects_invalid_and_unimplemented_configuration(self):
        for change in ({'width': 0}, {'height': float('nan')},
                       {'pen_down': 3}, {'baudrate': 123},
                       {'driver': 'axidraw'}, {'x_direction': 0},
                       {'draw_feed': -1}, {'usb_vid': -1},
                       {'banner': 'Grbl\n$H'}, {'width': True},
                       {'name': ''}, {'id': '../escape'}):
            with self.subTest(change=change), self.assertRaises(ValueError):
                custom_profile(**change)

    def test_save_select_edit_remove_survive_restart_and_stale_edit_fails(self):
        with tempfile.TemporaryDirectory() as directory:
            store = ProfileStore(Path(directory))
            saved = store.change('save', custom_profile().data, 0)
            identifier = saved['profiles'][-1]['id']
            selected = store.change('select', {'id': identifier}, 1)
            self.assertEqual(ProfileStore(Path(directory)).active.data['id'], identifier)
            with self.assertRaisesRegex(ValueError, 'changed'):
                store.change('delete', {'id': identifier}, 1)
            with self.assertRaisesRegex(ValueError, 'selected'):
                store.change('delete', {'id': identifier}, selected['revision'])
            store.change('select', {'id': 'ta4'}, 2)
            store.change('delete', {'id': identifier}, 3)
            self.assertEqual(len(ProfileStore(Path(directory)).snapshot()['profiles']), 1)

    def test_default_is_protected_and_failed_write_keeps_previous_profile(self):
        with tempfile.TemporaryDirectory() as directory:
            store = ProfileStore(Path(directory))
            for action in ('save', 'delete'):
                with self.assertRaises(ValueError):
                    store.change(action, PlotterProfile.default().data, 0)
            with patch.object(Path, 'replace', side_effect=OSError('disk full')):
                with self.assertRaises(OSError):
                    store.change('save', custom_profile().data, 0)
            self.assertEqual(store.snapshot()['revision'], 0)
            self.assertEqual(len(store.snapshot()['profiles']), 1)


if __name__ == '__main__':
    unittest.main()

class ProfileSenderTests(unittest.TestCase):
    def setUp(self):
        from plotting import Plotter
        from test_plotting import Machine
        self.temporary = tempfile.TemporaryDirectory()
        self.addCleanup(self.temporary.cleanup)
        self.machine = Machine()
        root = Path(self.temporary.name)
        self.plotter = Plotter(root, self.machine.ports, self.machine.open,
                               settle=0, retry_delay=0, lock_path=root/'usb.lock')
        self.addCleanup(self.plotter.close)
        self.profile = custom_profile()
        self.plotter.change_profile('save', self.profile.data, 0)
        self.plotter.change_profile('select', {'id': self.profile.data['id']}, 1)
        self.code = (f'; PLOTTER_PROFILE {self.profile.fingerprint}\n'
                     'G21\nG90 G1 Z3 F800\nG90 G1 X350 Y20 F1800\n'
                     'G90 G1 Z0 F1000\nG90 G1 X400 Y30 F600\n'
                     'G90 G1 Z3 F1000\nG90 G1 X0 Y0 F1800\n')

    def test_custom_job_bounds_preview_and_actual_sender_commands(self):
        job = self.plotter.load(self.code)
        self.assertEqual(job['bounds'], [350, 20, 400, 30])
        self.plotter.connect('/dev/fake')
        self.plotter.home()
        self.plotter.start(job['id'], True)
        self.assertEqual(self.plotter.snapshot()['phase'], 'completed')
        self.assertIn('G90 G1 Z3 F800', self.machine.commands)
        self.assertNotIn('G90 G1 Z0.5 F1200', self.machine.commands)
        self.assertEqual(self.machine.xyz, [0, 0, 3])

    def test_wrong_profile_legacy_and_outside_bed_are_rejected(self):
        from plotting import parse_job
        from test_plotting import FILE
        for text in (self.code.replace('X400', 'X421'), FILE,
                     self.code.replace(self.profile.fingerprint, 'a' * 64)):
            with self.subTest(text=text), self.assertRaises(ValueError):
                self.plotter.load(text)
        with self.assertRaises(ValueError):
            parse_job(self.code)

    def test_profile_change_locks_and_invalidates_idle_job(self):
        self.plotter.load(self.code)
        self.plotter.connect('/dev/fake')
        with self.assertRaisesRegex(ValueError, 'Disconnect'):
            self.plotter.change_profile('select', {'id': 'ta4'}, 2)
        self.plotter.close()
        self.plotter.recovery_active = True
        with self.assertRaisesRegex(ValueError, 'recovery'):
            self.plotter.change_profile('select', {'id': 'ta4'}, 2)
        self.plotter.recovery_active = False
        self.plotter.change_profile('select', {'id': 'ta4'}, 2)
        self.assertIsNone(self.plotter.job)
        self.assertFalse(self.plotter.snapshot()['homed'])

    def test_recovery_restores_exact_machine_settings(self):
        from plotting import Plotter
        self.plotter.load(self.code)
        self.plotter.identity = [6790, 32832, 'test-only']
        self.plotter.recovery_active = True
        self.plotter.accepted = self.plotter.pending = 1
        self.plotter.write_journal()
        restored = Plotter(Path(self.temporary.name), self.machine.ports,
                           self.machine.open, settle=0,
                           lock_path=self.plotter.lock_path)
        self.addCleanup(restored.close)
        self.assertTrue(restored.recovery_active)
        self.assertEqual(restored.profile.data, self.profile.data)
        self.assertEqual(self.machine.opens, 0)

    def test_svg_only_blocks_usb_and_exports_prepared_paths(self):
        from plotter_app import create_plotter_app
        profile = custom_profile(driver='svg')
        self.plotter.change_profile('save', profile.data, 2)
        self.plotter.load(self.code.replace(self.profile.fingerprint, profile.fingerprint))
        with self.assertRaisesRegex(ValueError, 'SVG export'):
            self.plotter.action('connect', {'port': '/dev/fake'})
        self.assertEqual(self.machine.opens, 0)
        app = create_plotter_app(self.plotter)
        client = app.test_client()
        headers = {'X-Plotter-Token': app.config['PLOTTER_TOKEN']}
        response = client.get('/api/job/svg?width=420&height=297',
                              base_url='http://127.0.0.1:8769', headers=headers)
        self.assertEqual(response.status_code, 200)
        self.assertIn('350,20 400,30', response.text)
        self.assertIn('width="420mm"', response.text)

    def test_custom_pause_return_and_cancel_use_profile_lift(self):
        import time
        text = self.code.replace('G90 G1 X400 Y30 F600', '\n'.join(
            f'G90 G1 X{350+i/10} Y30 F600' for i in range(100)))
        job = self.plotter.load(text)
        self.plotter.connect('/dev/fake')
        self.plotter.home()
        self.machine.delay = .005
        self.plotter.action('start', {'job_id': job['id'], 'ready': True})
        self.addCleanup(lambda: self.plotter.thread.join(5))
        self.addCleanup(self.plotter.cancel.set)

        def until(predicate):
            end = time.monotonic() + 5
            while time.monotonic() < end:
                if predicate():
                    return
                time.sleep(.005)
            self.fail(str(self.plotter.snapshot()))

        until(lambda: self.plotter.snapshot()['accepted'] > 4)
        self.plotter.action('pause', {})
        until(lambda: self.plotter.snapshot()['phase'] == 'paused')
        self.assertEqual(self.machine.xyz, [0, 0, 3])
        self.assertIsNotNone(self.plotter.pause_return)
        self.plotter.action('continue', {})
        until(lambda: self.plotter.snapshot()['phase'] == 'plotting')
        self.plotter.action('cancel', {})
        self.plotter.thread.join(5)
        self.assertEqual(self.plotter.snapshot()['phase'], 'cancelled')
        self.assertEqual(self.machine.xyz[2], 3)
        self.assertNotIn('G90 G1 Z0.5 F1200', self.machine.commands)

    def test_custom_lost_ack_recovers_without_repeating_drawing(self):
        job = self.plotter.load(self.code)
        self.plotter.connect('/dev/fake')
        self.plotter.home()
        self.machine.disconnect_on = 'G90 G1 X400 Y30 F600'
        self.plotter.start(job['id'], True)
        self.assertEqual(self.plotter.snapshot()['phase'], 'completed')
        self.assertEqual(self.machine.commands.count(self.machine.disconnect_on), 0)
        self.assertEqual(self.machine.commands.count('G90 G1 X400 Y30 F600'), 1)

    def test_browser_generated_custom_code_roundtrips_and_crlf_is_accepted(self):
        import json
        import subprocess
        from plotting import parse_job
        profile = custom_profile(x_direction=-1, lift_feed=1000.0001)
        script = ("const s=require('./assets/svg-import.js');"
                  "console.log(s.makeColourGcode([[[350,20],[400,30]]],"
                  "['#000000'],{}, {profile:" + json.dumps(profile.snapshot()) + "}));")
        code = subprocess.check_output(['node', '-e', script], text=True)
        result = parse_job(code.replace('\n', '\r\n'), profile=profile)
        self.assertEqual(result['bounds'], [350, 20, 400, 30])
        self.assertEqual(result['endpoints'][2], (-350, 20, 3))

    def test_profile_api_authentication_revision_and_idle_selection(self):
        from plotter_app import create_plotter_app
        app = create_plotter_app(self.plotter)
        client = app.test_client()
        base = 'http://127.0.0.1:8769'
        headers = {'X-Plotter-Token': app.config['PLOTTER_TOKEN'], 'Origin': base}
        self.assertEqual(client.get('/api/profiles', base_url=base).status_code, 403)
        response = client.post('/api/profiles', base_url=base, headers=headers,
                               json={'action':'select','item':{'id':'ta4'},'revision':1})
        self.assertEqual(response.status_code, 409)
        response = client.post('/api/profiles', base_url=base, headers=headers,
                               json={'action':'select','item':{'id':'ta4'},'revision':2})
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json['selected'], 'ta4')
        self.assertEqual(self.machine.opens, 0)

    def test_usb_filter_and_baud_rate_follow_profile(self):
        from types import SimpleNamespace
        from plotting import devices, open_serial
        ports = [SimpleNamespace(device='/dev/usb-a', product='Other',
                                 description='USB serial', vid=123, pid=456,
                                 serial_number=None),
                 SimpleNamespace(device='/dev/usb-b', product='T-A4',
                                 description='USB serial', vid=6790, pid=32832,
                                 serial_number='ta4')]
        with patch('serial.tools.list_ports.comports', return_value=ports):
            self.assertEqual(len(devices()), 1)
            self.assertEqual(len(devices(self.profile)), 2)
            self.assertEqual(devices(self.profile)[0]['identity'], [123,456,'/dev/usb-a'])
        with patch('serial.Serial') as serial:
            open_serial('/dev/fake', 57600)
            self.assertEqual(serial.return_value.baudrate, 57600)
            serial.return_value.open.assert_called_once()
