"""No real serial ports: exercise the sender against a deterministic controller."""
from collections import deque
from pathlib import Path
import tempfile
import threading
import time
import unittest
from plotting import Plotter, parse_job, resume_at
from plotter_app import create_plotter_app

FILE = 'G21\nG90 G1 Z0.5 F1200\nG90 G1 X20 Y-20 F2400\nG90 G1 Z5 F3000\nG90 G1 X30 Y-30 F900\nG4 P0.1\nG90 G1 Z0.5 F3000\nG90 G1 X0 Y0 F2400\n'
DEVICE = dict(port='/dev/fake', name='Simulated DrawCore', identity=[6790, 32832, 'test-only'])


class Machine:
    def __init__(self):
        self.xyz = [0., 0., 0.]
        self.mode = 'Idle'
        self.commands = []
        self.opens = 0
        self.disconnect_on = None
        self.fail_read = False
        self.reset_on_reopen = False
        self.partial = False
        self.bad_modes_after_drop = False
        self.delay = 0
        self.settings = '$13=0\n$22=1\nok\n'
        self.modal = '[GC:G1 G54 G17 G21 G90 G94 M5 M9 T0 F900 S0]\nok\n'
        self.finish_runs = 0
        self.ending = False

    def ports(self): return [DEVICE.copy()]
    def open(self, port):
        self.opens += 1
        if self.reset_on_reopen and self.opens > 1: self.xyz = [0., 0., 0.]
        return Wire(self)


class Wire:
    def __init__(self, machine):
        self.m = machine
        self.q = deque()
        self.is_open = True
        self.banner = b"Grbl 1.1h DrawCore V2.09\r\n" if machine.opens == 1 or machine.reset_on_reopen else b''

    def read(self, count):
        result, self.banner = self.banner, b''
        self.q.clear()
        return result

    def write(self, packet):
        m = self.m
        command = packet.decode('ascii').strip()
        m.commands.append(command)
        if command == '?':
            state = m.mode
            if m.ending and m.finish_runs and m.xyz == [0., 0., .5]:
                m.finish_runs -= 1
                state = 'Run'
            self.q.append(f'<{state}|MPos:{m.xyz[0]:.3f},{m.xyz[1]:.3f},{m.xyz[2]:.3f}|WCO:0.000,0.000,0.000>\n'.encode())
        elif command == '!': m.mode = 'Hold:0'
        elif command == '~': m.mode = 'Idle'
        elif command == '\x18':
            m.mode = 'Idle'
            m.xyz = [0., 0., 0.]
            self.q.clear()
            self.banner = b'Grbl 1.1h DrawCore V2.09\n'
        else:
            if command == m.disconnect_on:
                m.disconnect_on = None
                if m.bad_modes_after_drop: m.modal = '[GC:G1 G54 G17 G20 G90 G94]\nok\n'
                if m.partial: raise OSError('Partial write')
                m.fail_read = True
            if command == '$$': self.q.extend(line.encode()+b'\n' for line in m.settings.splitlines())
            elif command == '$G': self.q.extend(line.encode()+b'\n' for line in m.modal.splitlines())
            else:
                if command == '$H': m.xyz = [0., 0., 0.]
                else:
                    import re
                    for axis, value in re.findall(r'([XYZ])(-?\d+(?:\.\d+)?)', command): m.xyz['XYZ'.index(axis)] = float(value)
                    if command == 'G90 G1 X0 Y0 F2400': m.ending = True
                self.q.append(b'ok\n')
        return len(packet)

    def readline(self):
        if self.m.fail_read:
            self.m.fail_read = False
            raise OSError('USB removed')
        if self.m.delay: time.sleep(self.m.delay)
        return self.q.popleft() if self.q else b''

    def close(self): self.is_open = False


class PlotTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.machine = Machine()
        root = Path(self.temp.name)
        self.plot = Plotter(root/'logs', self.machine.ports, self.machine.open, settle=0, retry_delay=0, lock_path=root/'port.lock')

    def tearDown(self):
        self.plot.cancel.set()
        if self.plot.thread: self.plot.thread.join(5)
        self.plot.close()
        self.temp.cleanup()

    def operation(self, action, payload=None):
        self.plot.action(action, payload or {})
        self.plot.thread.join(5)
        self.assertFalse(self.plot.thread.is_alive())
        return self.plot.snapshot()

    def prepare(self, text=FILE):
        job = self.plot.load(text, 'test.gcode')
        self.assertEqual(self.operation('connect', {'port':'/dev/fake'})['phase'], 'ready')
        self.assertEqual(self.operation('home')['phase'], 'ready')
        self.assertTrue(self.plot.snapshot()['homed'])
        return job

    def start(self, job): return self.operation('start', {'job_id':job['id'], 'ready':True})

    def until(self, predicate):
        end = time.monotonic()+4
        while time.monotonic() < end:
            if predicate(): return
            time.sleep(.005)
        self.fail('Timed out waiting for state: '+str(self.plot.snapshot()))

    def test_preview_bounds_dots_time_and_no_connection_on_load(self):
        result = self.plot.load(FILE, '../../drawing.gcode')
        self.assertEqual(self.machine.opens, 0)
        self.assertEqual(result['bounds'], [20,20,30,30])
        self.assertEqual(result['name'], 'drawing.gcode')
        self.assertAlmostEqual(result['draw_mm'], 200**.5)
        self.assertGreater(result['seconds'], .1)
        pen = parse_job('G21\nG90 G1 Z0.5 F1200\nG90 G1 Z5 F3000\nG4 P1\nG90 G1 Z0.5 F3000')
        self.assertEqual(pen['paths'], [[[0,0]]])
        self.assertGreaterEqual(pen['seconds'], 1)

    def test_reject_unsupported_outside_page_nonfinite_and_unfinished_files(self):
        for text in ['', FILE.replace('X30','X230'), FILE.replace('Y-30','Y30'), FILE.replace('F900','F2400'), FILE+'G91\n', FILE+'$H\n', FILE.replace('X30','Xnan'), FILE.replace('G90 G1 X0 Y0 F2400','')]:
            with self.subTest(text=text):
                with self.assertRaises(ValueError): parse_job(text)

    def test_start_requires_home_current_file_and_readiness(self):
        job = self.plot.load(FILE)
        self.operation('connect', {'port':'/dev/fake'})
        for args in ({'job_id':job['id'],'ready':True},{'job_id':'wrong','ready':True}):
            with self.assertRaises(ValueError): self.plot.action('start', args)
        self.operation('home')
        with self.assertRaises(ValueError): self.plot.action('start', {'job_id':job['id'],'ready':False})
        with self.assertRaises(ValueError): self.plot.action('start', {'job_id':'old','ready':True})

    def test_homing_raises_pen_before_xy_and_completion_waits_for_idle(self):
        job = self.prepare()
        self.assertLess(self.machine.commands.index('G90 G1 Z0.5 F1200'), self.machine.commands.index('$H'))
        self.machine.finish_runs = 3
        state = self.start(job)
        self.assertEqual(state['phase'], 'completed')
        self.assertEqual(state['accepted'], len(parse_job(FILE)['commands']))
        self.assertEqual(state['controller']['position'], (0.,0.,.5))
        self.assertEqual(self.machine.finish_runs, 0)

    def test_lost_ack_resumes_without_repeating_an_executed_segment(self):
        job = self.prepare()
        move = 'G90 G1 X30 Y-30 F900'
        self.machine.disconnect_on = move
        state = self.start(job)
        self.assertEqual(state['phase'], 'completed', state)
        self.assertEqual(self.machine.commands.count(move), 1)
        self.assertEqual(self.machine.opens, 2)
        self.assertIn('Position verified.', ' '.join(state['events']))

    def test_reset_stops_after_three_reconnects_without_homing_or_replay(self):
        job = self.prepare()
        self.machine.disconnect_on = 'G90 G1 X30 Y-30 F900'
        self.machine.reset_on_reopen = True
        state = self.start(job)
        self.assertEqual(state['phase'], 'error')
        self.assertEqual(state['attempt'], 3)
        self.assertEqual(self.machine.opens, 4)
        self.assertEqual(self.machine.commands.count('$H'), 1)
        self.assertEqual(self.machine.commands.count('G90 G1 X30 Y-30 F900'), 1)
        self.assertIn('reset', state['message'])
        self.assertFalse(state['homed'])

    def test_partial_write_or_changed_modes_never_resume(self):
        for reason in ('partial','modes'):
            with self.subTest(reason=reason):
                self.plot.close()
                self.plot.action('discard', {})
                self.machine.opens = 0
                self.machine.mode = 'Idle'
                self.machine.partial = reason == 'partial'
                self.machine.bad_modes_after_drop = reason == 'modes'
                job = self.prepare()
                self.machine.disconnect_on = 'G90 G1 X30 Y-30 F900'
                state = self.start(job)
                self.assertEqual(state['phase'], 'error')
                self.assertEqual(state['attempt'], 3)
                self.assertEqual(self.machine.commands[-1], '!')

    def test_ambiguous_recovery_endpoint_is_rejected(self):
        with self.assertRaises(ValueError): resume_at([(0,0,.5),(1,-1,5),(1.001,-1,5)],1,2,(1,-1,5))
        with self.assertRaises(ValueError): resume_at([(0,0,.5),(1,-1,5),(2,-1,5)],1,2,(0,0,0))

    def test_pause_preserves_job_and_continue_finishes(self):
        text = FILE.replace('G90 G1 X30 Y-30 F900', '\n'.join(f'G90 G1 X{30+i/10} Y-30 F900' for i in range(100)))
        job = self.prepare(text)
        self.machine.delay = .005
        self.plot.action('start', {'job_id':job['id'],'ready':True})
        self.until(lambda:self.plot.snapshot()['accepted']>=5)
        self.plot.action('pause', {})
        self.until(lambda:self.plot.snapshot()['phase']=='paused')
        count = len([c for c in self.machine.commands if c.startswith('G90')])
        time.sleep(.15)
        self.assertEqual(len([c for c in self.machine.commands if c.startswith('G90')]), count)
        self.plot.action('continue', {})
        self.plot.thread.join(5)
        self.assertEqual(self.plot.snapshot()['phase'],'completed')
        self.assertIn('G90 G1 X0 Y0 F2400',self.machine.commands)

    def test_cancel_clears_queue_and_never_sends_further_xy(self):
        text = FILE.replace('G90 G1 X30 Y-30 F900', '\n'.join(f'G90 G1 X{30+i/10} Y-30 F900' for i in range(100)))
        job = self.prepare(text)
        self.machine.delay = .005
        self.plot.action('start', {'job_id':job['id'],'ready':True})
        self.until(lambda:self.plot.snapshot()['accepted']>=5)
        self.plot.action('cancel', {})
        self.plot.thread.join(5)
        self.assertEqual(self.plot.snapshot()['phase'],'cancelled')
        cancelled = self.machine.commands.index('\x18')
        self.assertFalse(any(' X' in c for c in self.machine.commands[cancelled:]))
        self.assertEqual(self.machine.xyz[2],.5)
        self.assertFalse(self.plot.snapshot()['homed'])
        with self.assertRaises(ValueError): self.plot.action('start', {'job_id':job['id'],'ready':True})

    def test_lock_prevents_two_serial_owners(self):
        self.operation('connect', {'port':'/dev/fake'})
        before = (self.plot.folder/'plotter-state.json').read_bytes()
        other = Plotter(self.plot.folder, self.machine.ports,self.machine.open,settle=0,lock_path=self.plot.lock_path)
        other.load(FILE, 'second.gcode')
        self.assertEqual((self.plot.folder/'plotter-state.json').read_bytes(), before)
        with self.assertRaises(ValueError): other.connect('/dev/fake')
        self.assertEqual(self.machine.opens,1)

    def test_service_auth_upload_and_public_page_never_open_usb(self):
        app = create_plotter_app(self.plot)
        client = app.test_client()
        base = 'http://127.0.0.1:8767'
        token = app.config['PLOTTER_TOKEN']
        headers = {'X-Plotter-Token':token,'Origin':base}
        self.assertEqual(client.get('/',base_url=base).status_code,200)
        self.assertEqual(client.get('/api/status',base_url=base).status_code,403)
        self.assertEqual(client.get('/api/status',base_url='http://evil.test:8767',headers=headers).status_code,403)
        self.assertEqual(client.get('/api/status',base_url=base,headers=headers,environ_overrides={'REMOTE_ADDR':'10.0.0.2'}).status_code,403)
        self.assertEqual(client.post('/api/load',base_url=base,headers={**headers,'Origin':'https://evil.test'},json={'text':FILE}).status_code,403)
        result = client.post('/api/load',base_url=base,headers=headers,json={'text':FILE,'name':'hello.gcode'})
        self.assertEqual(result.status_code,200)
        self.assertEqual(result.json['job']['name'],'hello.gcode')
        self.assertEqual(client.get('/api/job',base_url=base,headers=headers).json['job']['id'],result.json['job']['id'])
        self.assertEqual(client.post('/api/action',base_url=base,headers=headers,json={'action':'start','job_id':result.json['job']['id'],'ready':True}).status_code,409)
        self.assertEqual(self.machine.opens,0)
        self.assertIn("frame-ancestors 'none'", result.headers['Content-Security-Policy'])

    def test_interrupted_server_session_only_reports_prior_work(self):
        root=Path(self.temp.name)/'previous';root.mkdir()
        (root/'plotter-state.json').write_text('{"phase":"plotting"}')
        other=Plotter(root,self.machine.ports,self.machine.open,settle=0)
        self.assertEqual(other.snapshot()['phase'],'offline')
        self.assertIn('will not resume',other.snapshot()['message'])
        self.assertEqual(self.machine.opens,0)


if __name__ == '__main__': unittest.main()
