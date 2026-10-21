"""Local T-A4 plotting: validated files, a single serial owner and checked recovery."""
import copy
import fcntl
import hashlib
import json
import math
import re
import sys
import threading
import time
import uuid
from pathlib import Path

from pens import PenCollection

PENS = PenCollection()

MAX_BYTES = 32 * 1024 * 1024
ACTIVE = {'connecting', 'homing', 'plotting', 'pausing', 'paused', 'reconnecting', 'finishing', 'cancelling', 'pen_change'}
MOVE = re.compile(r'G90 G1 (Z(0\.5|5)|X(-?\d+(?:\.\d+)?) Y(-?\d+(?:\.\d+)?)) F(900|1200|2400|3000)')


def parse_job(text, name='drawing.gcode'):
    if not isinstance(text, str) or len(text.encode('utf-8')) > MAX_BYTES:
        raise ValueError('Choose a G-code file smaller than 32 MB.')
    commands, points, times, paths, travel, stroke = [], [], [], [], [], []
    xyz = [0., 0., .5]
    pen_changes, path_colours = [], []
    current_colour = '#203832'
    seconds = drawn = moved = 0.
    for number, raw in enumerate(text.splitlines(), 1):
        if raw.strip().startswith('; PEN_CHANGE'):
            marker = re.fullmatch(r'; PEN_CHANGE (#[0-9a-fA-F]{6})(?: ([a-z0-9-]{1,60}))?', raw.strip())
            if not marker or len(commands) < 2:
                raise ValueError('Invalid pen-change marker.')
            if xyz != [0., 0., .5]:
                raise ValueError('Pen changes require home with the pen raised.')
            if pen_changes and pen_changes[-1]['command'] == len(commands):
                raise ValueError('Duplicate pen-change marker.')
            current_colour = marker[1].lower()
            pen_id = marker[2]
            pen_label = PENS.label(pen_id) if pen_id else current_colour
            pen_changes.append(dict(command=len(commands), colour=current_colour,
                                    index=len(pen_changes), pen_id=pen_id,
                                    pen_label=pen_label))
            continue
        line = raw.split(';', 1)[0].strip()
        if not line:
            continue
        before = xyz[:]
        if line == 'G21':
            pass
        elif line in ('G4 P0.1', 'G4 P1') and commands:
            seconds += float(line[4:])
        else:
            match = MOVE.fullmatch(line)
            if not match or not commands:
                raise ValueError(f'Unsupported command on line {number}. Use a Studio G-code download.')
            if match[2]:
                z = float(match[2])
                if z == 5 and xyz[2] != 5:
                    stroke = [[xyz[0], -xyz[1]]]
                if z == .5 and xyz[2] == 5:
                    paths.append(stroke)
                    path_colours.append(current_colour)
                    stroke = []
                xyz[2] = z
            else:
                x, y = float(match[3]), float(match[4])
                if not math.isfinite(x+y) or not (0 <= x <= 210 and -297 <= y <= 0):
                    raise ValueError(f'Outside A4 on line {number}.')
                if xyz[2] == 5 and match[5] != '900':
                    raise ValueError('Travel move with pen down.')
                length = math.hypot(x-xyz[0], y-xyz[1])
                if xyz[2] == 5:
                    drawn += length
                    stroke.append([x, -y])
                else:
                    moved += length
                    travel.append([[xyz[0], -xyz[1]], [x, -y]])
                xyz[:2] = [x, y]
            seconds += math.dist(before, xyz) / float(match[5]) * 60
        commands.append(line)
        points.append(tuple(xyz))
        times.append(seconds)
        if len(commands) > 600000:
            raise ValueError('File too large: at most 600,000 commands.')
    if commands[:2] != ['G21', 'G90 G1 Z0.5 F1200']:
        raise ValueError('Expected millimetres and initial pen lift.')
    if xyz[2] != .5 or xyz[:2] != [0., 0.]:
        raise ValueError('File must finish at home with the pen raised.')
    if len(commands) < 3:
        raise ValueError('The file contains no drawing or pen check.')
    ink = [p for path in paths for p in path]
    bounds = [min(p[0] for p in ink), min(p[1] for p in ink), max(p[0] for p in ink), max(p[1] for p in ink)] if ink else None
    return dict(id=str(uuid.uuid4()), name=Path(str(name)).name[:120], commands=commands,
                endpoints=points, times=times, paths=paths, travel=travel, bounds=bounds,
                seconds=seconds, draw_mm=drawn, travel_mm=moved,
                pen_changes=pen_changes, path_colours=path_colours,
                sha256=hashlib.sha256(text.encode()).hexdigest())


def job_info(job):
    return {k: job[k] for k in ('id', 'name', 'paths', 'travel', 'bounds', 'seconds', 'draw_mm', 'travel_mm', 'sha256', 'pen_changes', 'path_colours')} | {'commands': len(job['commands'])}


def resume_at(points, accepted, pending, position):
    # GRBL steps round XY to 0.01 mm and this pen's Z to ~0.0117 mm.
    # Close/identical endpoints are ambiguous, so never guess between them.
    if accepted < 1:
        raise ValueError('Too little confirmed progress to resume.')
    matches = [i for i in set((accepted, pending)) if 0 <= i < len(points) and
               all(abs(a-b) <= .012 for a, b in zip(points[i], position))]
    if len(matches) != 1:
        raise ValueError('The stopped position does not identify one exact command.')
    return matches[0] + 1


class LinkError(Exception):
    pass


class Cancelled(Exception):
    pass


def serial_module():
    try:
        import serial
    except ImportError:
        sys.path.insert(0, str(Path.home() / 'Library/Application Support/org.inkscape.Inkscape/config/inkscape/extensions/idraw_deps'))
        try:
            import serial
        except ImportError as exc:
            raise ValueError('Install requirements-plotter.txt in the Mac app’s Python environment.') from exc
    return serial


def devices():
    serial_module()
    from serial.tools import list_ports
    return [dict(port=p.device, name=p.product or 'T-A4 plotter', identity=[p.vid, p.pid, p.serial_number])
            for p in list_ports.comports() if (p.vid, p.pid) == (6790, 32832) and p.serial_number]


def open_serial(port):
    s = serial_module().Serial()
    s.port, s.baudrate, s.timeout, s.write_timeout = port, 115200, .1, 2
    s.dtr = s.rts = False
    s.exclusive = True
    s.open()
    return s


class Plotter:
    def __init__(self, folder, ports=devices, opener=open_serial, settle=2.5, retry_delay=3, lock_path=None):
        self.folder = Path(folder)
        self.ports, self.opener = ports, opener
        self.settle, self.retry_delay = settle, retry_delay
        self.lock_path = Path(lock_path or Path.home()/'.handwriting-studio-plotter.lock')
        self.mutex = threading.RLock()
        self.pause = threading.Event()
        self.cancel = threading.Event()
        self.pen_ready = threading.Event()
        self.thread = self.s = self.port_lock = None
        self.job = None
        self.identity = None
        self.rx = b''
        self.acks = 0
        self.reset_seen = self.uncertain_write = False
        self.wco = None
        self.controller = None
        self.accepted = self.pending = -1
        self.started = None
        self.last_save = 0
        self.data = dict(phase='offline', message='Choose a file, then connect the idle plotter.', connected=False,
                         homed=False, accepted=0, total=0, elapsed=0, remaining=None, attempt=0, events=[])
        journal = self.folder/'plotter-state.json'
        if journal.exists():
            try:
                old = json.loads(journal.read_text())
                if old.get('phase') in ACTIVE:
                    self.data['message'] = 'A previous session ended during a job. Check the plotter locally; this window will not resume or restart it automatically.'
            except (OSError, ValueError):
                pass

    def snapshot(self):
        with self.mutex:
            result = copy.deepcopy(self.data)
            result['controller'] = copy.deepcopy(self.controller)
            result['busy'] = bool(self.thread and self.thread.is_alive())
            if self.started:
                result['elapsed'] = round(time.monotonic()-self.started)
            return result

    def update(self, phase=None, message=None, **values):
        with self.mutex:
            if phase: self.data['phase'] = phase
            if message:
                self.data['message'] = message
                self.data['events'] = (self.data['events'] + [message])[-30:]
            self.data.update(values)
        self.save_journal()

    def save_journal(self):
        # A second window/CLI may inspect a file, but must not overwrite the
        # active serial owner's progress before its connection attempt fails.
        guard = None
        if not self.port_lock:
            guard = self.lock_path.open('a')
            try: fcntl.flock(guard, fcntl.LOCK_EX | fcntl.LOCK_NB)
            except BlockingIOError:
                guard.close()
                return
        try:
            self.write_journal()
        finally:
            if guard: guard.close()

    def write_journal(self):
        self.folder.mkdir(parents=True, exist_ok=True)
        state = self.snapshot()
        if self.job: state.update(file=self.job['name'], sha256=self.job['sha256'])
        temp = self.folder/'plotter-state.tmp'
        temp.write_text(json.dumps(state, indent=2)+'\n')
        temp.replace(self.folder/'plotter-state.json')
        self.last_save = time.monotonic()

    def load(self, text, name='drawing.gcode'):
        job = parse_job(text, name)
        with self.mutex:
            if self.thread and self.thread.is_alive(): raise ValueError('Finish or cancel the current operation first.')
            self.job = job
            self.started = None
            self.data.update(total=len(job['commands']), accepted=0, remaining=None, elapsed=0, pending_pen=None)
            self.update('ready' if self.s else 'offline', 'File checked. Review the preview before starting.')
        return job_info(job)

    def launch(self, phase, function, *args):
        with self.mutex:
            if self.thread and self.thread.is_alive(): raise ValueError('The plotter is busy.')
            self.cancel.clear()
            self.pause.clear()
            self.update(phase)
            self.thread = threading.Thread(target=self.worker, args=(function, args), daemon=True)
            self.thread.start()

    def worker(self, function, args):
        try:
            function(*args)
        except Cancelled:
            try:
                self.cancel_machine()
            except Exception as exc:
                self.close()
                self.update('error', 'Cancel could not be confirmed. Stop the plotter locally if moving. '+str(exc), homed=False)
        except Exception as exc:
            if self.s:
                try: self.write(b'!')
                except LinkError: pass
            self.close()
            if self.started: self.data['elapsed'] = round(time.monotonic()-self.started)
            self.started = None
            self.update('error', str(exc)+' Check the plotter locally before another run.', homed=False)
        finally:
            self.save_journal()

    def close(self):
        if self.s:
            try: self.s.close()
            except OSError: pass
        self.s = None
        if self.port_lock:
            self.port_lock.close()
            self.port_lock = None
        with self.mutex: self.data.update(connected=False, homed=False)

    def acquire(self):
        self.port_lock = self.lock_path.open('a')
        try: fcntl.flock(self.port_lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError:
            self.port_lock.close()
            self.port_lock = None
            raise ValueError('Another Studio sender is connected. Close it first.')

    def write(self, packet):
        try:
            if self.s.write(packet) != len(packet): raise OSError('Incomplete USB write')
        except OSError as exc: raise LinkError('USB connection lost: '+str(exc)) from exc

    def read_line(self):
        try: chunk = self.s.readline()
        except OSError as exc: raise LinkError('USB connection lost: '+str(exc)) from exc
        self.rx += chunk
        if len(self.rx) > 16384: raise ValueError('Unexpected oversized controller response.')
        if b'\n' not in self.rx: return ''
        raw, self.rx = self.rx.split(b'\n', 1)
        line = raw.decode('ascii', errors='replace').strip()
        if line == 'ok': self.acks += 1
        if line.startswith(('error:', 'ALARM:')): raise ValueError('Controller reported '+line)
        if 'Grbl' in line:
            self.reset_seen = True
            raise LinkError('Controller restarted; its earlier position is no longer trusted.')
        if line.startswith('<') and line.endswith('>'):
            pos = re.search(r'\|MPos:([-\d.]+),([-\d.]+),([-\d.]+)', line)
            offset = re.search(r'\|WCO:([-\d.]+),([-\d.]+),([-\d.]+)', line)
            if offset: self.wco = tuple(map(float, offset.groups()))
            if pos:
                values = tuple(map(float, pos.groups()))
                if not all(map(math.isfinite, values)): raise ValueError('Invalid controller position.')
                self.controller = dict(state=line[1:].split('|')[0], position=values, offset=self.wco)
        return line

    def status(self):
        self.write(b'?')
        end = time.monotonic()+3
        while time.monotonic() < end:
            line = self.read_line()
            if line.startswith('<') and line.endswith('>') and '|MPos:' in line:
                return self.controller
        raise LinkError('The plotter is not reporting its position.')

    def normal(self, command, timeout=30, controls=True, job_command=False):
        if controls: self.controls()
        target = self.acks+1
        if job_command: self.uncertain_write = True
        self.write((command+'\r').encode('ascii'))
        if job_command: self.uncertain_write = False
        end = time.monotonic()+timeout
        lines = []
        while self.acks < target:
            before = time.monotonic()
            if controls: self.controls()
            end += time.monotonic()-before  # A deliberate pause does not expire an acknowledgement.
            line = self.read_line()
            if line: lines.append(line)
            if time.monotonic() > end: raise LinkError('The plotter did not acknowledge a command.')
        return '\n'.join(lines)

    def wait_idle(self, timeout=120, controls=True, abort=False):
        end = time.monotonic()+timeout
        while time.monotonic() < end:
            if abort and self.cancel.is_set(): raise Cancelled()
            before = time.monotonic()
            if controls: self.controls()
            end += time.monotonic()-before
            state = self.status()
            if state['state'] == 'Idle' and self.wco is not None: return state
            if state['state'] == 'Alarm': raise ValueError('Clear the machine alarm locally before continuing.')
            time.sleep(.1)
        raise LinkError('The plotter did not finish its queued movement.')

    def open_device(self, recovery=False):
        choices = [p for p in self.ports() if p['identity'] == self.identity]
        if len(choices) != 1: raise LinkError('The selected USB plotter is not available.')
        try: self.s = self.opener(choices[0]['port'])
        except OSError as exc: raise LinkError(str(exc)) from exc
        time.sleep(self.settle)
        try: initial = self.s.read(8192).decode('ascii', errors='replace')
        except OSError as exc: raise LinkError(str(exc)) from exc
        self.rx, self.acks, self.wco = b'', 0, None
        if recovery and 'Grbl' in initial: self.reset_seen = True
        if not recovery:
            # The connected unit must identify the same controller family as the verified T-A4.
            if 'DrawCore' not in initial:
                raise ValueError('The connected device did not identify itself as the calibrated DrawCore plotter.')
        self.data['connected'] = True

    def connect(self, port):
        if self.s: raise ValueError('Already connected.')
        choices = [p for p in self.ports() if p['port'] == port]
        if len(choices) != 1: raise ValueError('Choose an available T-A4 USB port.')
        self.identity = choices[0]['identity']
        self.acquire()
        self.open_device()
        status = self.status()
        if status['state'] != 'Idle': raise ValueError('Connect only while the plotter is idle.')
        settings = self.normal('$$')
        if '$13=0' not in settings.splitlines() or '$22=1' not in settings.splitlines():
            raise ValueError('This profile needs millimetre status reports and homing enabled. Machine settings were not changed.')
        self.reset_seen = False
        self.update('ready', 'Connected. Use Home before starting a drawing.', homed=False)

    def controls(self):
        if self.cancel.is_set(): raise Cancelled()
        if not self.pause.is_set(): return
        self.write(b'!')
        self.update('pausing', 'Pausing movement…')
        while self.pause.is_set():
            if self.cancel.is_set(): raise Cancelled()
            state = self.status()['state']
            if state in ('Hold:0', 'Idle') and self.data['phase'] != 'paused':
                self.update('paused', 'Paused. Continue resumes this job; Cancel ends it.')
            elif state == 'Alarm': raise ValueError('Controller alarm while pausing.')
            time.sleep(.1)
        if self.cancel.is_set(): raise Cancelled()
        if self.controller['state'].startswith('Hold'): self.write(b'~')
        self.update('plotting', 'Continuing the current drawing.')

    def home(self):
        if not self.s: raise ValueError('Connect the plotter first.')
        if self.status()['state'] != 'Idle': raise ValueError('The plotter must be idle before homing. Clear any alarm locally.')
        self.wco = None
        status = self.wait_idle(controls=False)
        if any(abs(v) > .01 for v in status['offset']): raise ValueError('This profile requires zero work offset. Machine settings were not changed.')
        self.check_modes()
        self.normal('G21', controls=False)
        self.normal('G90 G1 Z0.5 F1200', controls=False)
        self.wait_idle(controls=False)
        self.normal('$H', timeout=90, controls=False)
        self.wait_idle(controls=False)
        self.normal('G90 G1 Z0.5 F1200', controls=False)
        status = self.wait_idle(controls=False)
        self.check_home(status)
        self.reset_seen = False
        self.update('ready', 'Homed at the top-left with the pen raised.', homed=True)

    @staticmethod
    def check_home(state):
        if state['state'] != 'Idle' or state['offset'] is None or any(abs(v) > .01 for v in state['position'][:2]+tuple(state['offset'])) or abs(state['position'][2]-.5) > .02:
            raise ValueError('Expected home X0 Y0, pen raised and zero work offset.')

    def check_modes(self):
        modal = self.normal('$G')
        modes = set(re.findall(r'\bG\d+(?:\.\d+)?\b', modal))
        if not {'G21', 'G90', 'G94', 'G54'} <= modes:
            raise ValueError('Expected millimetres, absolute coordinates, G54 and feed per minute. Controller modes changed.')

    def change_pen(self, checkpoint):
        """Drain motion and verify the park position before asking for a pen."""
        state = self.wait_idle()
        self.check_home(state)
        self.pen_ready.clear()
        self.update('pen_change',
                    'Fit ' + checkpoint['pen_label'] +
                    ', confirm it is ready, then continue.',
                    pending_pen=checkpoint.copy())
        while not self.pen_ready.wait(.1):
            if self.cancel.is_set():
                raise Cancelled()
        if self.cancel.is_set():
            raise Cancelled()
        self.check_home(self.status())
        self.update('plotting', 'Drawing with ' + checkpoint['pen_label'] + '.',
                    pending_pen=None)

    def start(self, job_id, ready, external_home=False):
        if not self.job or self.job['id'] != job_id: raise ValueError('Preview the current file before starting.')
        if ready is not True: raise ValueError('Confirm the paper and plotter are ready.')
        if not self.s or (not self.data['homed'] and not external_home): raise ValueError('Connect and Home the plotter first.')
        self.wco = None
        state = self.wait_idle()
        self.check_modes()
        if any(abs(v) > .01 for v in state['offset']): raise ValueError('The work offset changed.')
        if external_home:
            self.normal('G21')
            self.normal('G90 G1 Z0.5 F1200')
            state = self.wait_idle()
        self.check_home(state)
        self.reset_seen = self.uncertain_write = False
        self.accepted = self.pending = -1
        self.started = time.monotonic()
        self.update('plotting', 'Drawing started.', accepted=0, total=len(self.job['commands']), attempt=0)
        index = 0
        last_poll = time.monotonic()
        checkpoints = {p['command']: p for p in self.job['pen_changes']}
        confirmed = set()
        while index < len(self.job['commands']):
            if index in checkpoints and index not in confirmed:
                self.change_pen(checkpoints[index])
                confirmed.add(index)
            try:
                self.controls()
                self.pending = index
                self.normal(self.job['commands'][index], job_command=True)
                self.accepted = index
                index += 1
                with self.mutex:
                    self.data['accepted'] = index
                    self.data['remaining'] = max(0, round(self.job['seconds']-self.job['times'][index-1]))
                if time.monotonic()-last_poll >= 1:
                    self.status()
                    last_poll = time.monotonic()
                if time.monotonic()-self.last_save >= 1: self.save_journal()
            except LinkError as exc:
                index = self.recover(exc)
        self.update('finishing', 'All commands sent. Waiting for movement to finish…', remaining=0)
        try: final = self.wait_idle()
        except LinkError as exc:
            if self.recover(exc) != len(self.job['commands']): raise ValueError('Completion is uncertain.')
            final = self.controller
        self.check_home(final)
        self.update('completed', 'Completed: home reached and pen raised.', homed=True, elapsed=round(time.monotonic()-self.started))
        self.started = None

    def recover(self, error):
        self.update('reconnecting', 'Connection lost. Checking progress before continuing.', homed=False)
        last = str(error)
        for attempt in range(1, 4):
            if self.cancel.is_set(): raise Cancelled()
            if self.s:
                try: self.s.close()
                except OSError: pass
            self.s = None
            self.update(attempt=attempt, connected=False, message=f'Reconnection attempt {attempt} of 3.')
            if self.cancel.wait(self.retry_delay): raise Cancelled()
            try:
                self.open_device(recovery=True)
                if self.reset_seen: raise ValueError('The controller reset and lost its drawing position.')
                if self.uncertain_write: raise ValueError('A command may have been partially transmitted.')
                if self.pause.is_set(): raise ValueError('Connection was lost while paused; progress cannot be verified.')
                status = self.wait_idle(timeout=90, controls=False, abort=True)
                if any(abs(v) > .01 for v in status['offset']): raise ValueError('The work offset changed.')
                self.check_modes()
                index = resume_at(self.job['endpoints'], self.accepted, self.pending, status['position'])
                self.accepted = index-1
                self.update('plotting', 'Position verified. Continuing without repeating completed commands.', accepted=index)
                return index
            except (LinkError, ValueError) as exc:
                last = str(exc)
                self.update(message='Cannot continue yet: '+last)
        raise ValueError('Stopped after three reconnection attempts. '+last+' The drawing has not been restarted.')

    def cancel_machine(self):
        self.update('cancelling', 'Stopping the drawing and clearing queued moves…', homed=False)
        if not self.s: raise ValueError('USB is unavailable.')
        self.write(b'!')
        end = time.monotonic()+10
        while time.monotonic() < end:
            if self.status()['state'] in ('Hold:0', 'Idle'): break
            time.sleep(.1)
        else: raise ValueError('Movement did not confirm a stop.')
        self.write(b'\x18')  # Explicit Cancel clears queued moves; it never resumes the job.
        time.sleep(self.settle)
        try: self.s.read(8192)
        except OSError as exc: raise LinkError(str(exc)) from exc
        self.rx, self.acks, self.wco = b'', 0, None
        if self.status()['state'] == 'Idle':
            self.normal('G21', controls=False)
            self.normal('G90 G1 Z0.5 F1200', controls=False)
            self.wait_idle(controls=False)
        if self.started: self.data['elapsed'] = round(time.monotonic()-self.started)
        self.started = None
        self.update('cancelled', 'Drawing cancelled. Check the pen and use Home before a new run.', homed=False, pending_pen=None)

    def action(self, name, payload):
        with self.mutex:
            phase = self.data['phase']
            if phase == 'pen_change' and name == 'continue':
                pending = self.data.get('pending_pen')
                if (payload.get('ready') is not True or not pending
                        or payload.get('job_id') != self.job['id']
                        or payload.get('pen_index') != pending['index']):
                    raise ValueError('Confirm the current pen is fitted before continuing.')
                self.pen_ready.set()
                return
            if phase == 'pen_change' and name == 'pause':
                raise ValueError('The plotter is already waiting for a pen.')
            if name in ('pause', 'continue', 'cancel'):
                if phase not in {'plotting', 'pausing', 'paused', 'reconnecting', 'finishing', 'pen_change'}:
                    raise ValueError('There is no active drawing to control.')
                if name == 'pause': self.pause.set()
                elif name == 'continue':
                    if phase != 'paused': raise ValueError('Wait for the plotter to pause fully.')
                    self.pause.clear()
                else: self.cancel.set()
                return
            if name == 'connect':
                if self.s: raise ValueError('Already connected.')
                self.launch('connecting', self.connect, payload.get('port'))
            elif name == 'home': self.launch('homing', self.home)
            elif name == 'start':
                if not self.s or not self.data['homed']: raise ValueError('Connect and Home the plotter first.')
                if payload.get('ready') is not True: raise ValueError('Confirm the paper and plotter are ready.')
                if not self.job or payload.get('job_id') != self.job['id']: raise ValueError('Preview the current file before starting.')
                self.launch('plotting', self.start, payload['job_id'], True)
            elif name == 'disconnect':
                if self.thread and self.thread.is_alive(): raise ValueError('Finish or cancel the drawing before disconnecting.')
                self.close()
                self.update('offline', 'Disconnected. No drawing was started.')
            else: raise ValueError('Unknown plotting action.')
