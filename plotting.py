"""Local T-A4 plotting: validated files, a single serial owner and checked recovery."""
import copy
import fcntl
import hashlib
import json
import math
import os
import re
import sys
import threading
import time
import uuid
from pathlib import Path

from pens import PenCollection

PENS = PenCollection()

MAX_BYTES = 32 * 1024 * 1024
ACTIVE = {'connecting', 'homing', 'plotting', 'pausing', 'paused', 'reconnecting', 'finishing', 'cancelling', 'pen_change', 'resuming'}
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
                    raise ValueError('Drawing move must use F900.')
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
        self.job_text = None
        self.recovery_active = False
        self.pause_return = None
        self.confirmed_pens = set()
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
                self.restore_checkpoint(old)
                if not self.job and old.get('phase') in ACTIVE:
                    self.data['message'] = 'A previous session ended during a job. Check the plotter locally; this window will not resume or restart it automatically.'
            except (OSError, ValueError):
                pass

    def snapshot(self):
        with self.mutex:
            result = copy.deepcopy(self.data)
            result['recovery_available'] = bool(
                self.recovery_active and not self.reset_seen
                and not self.uncertain_write and self.pause_return is None
                and self.accepted >= 1
            )
            result['pause_return'] = copy.deepcopy(self.pause_return)
            result['saved_plot'] = self.recovery_active
            passes = [p for p in (self.job or {}).get('pen_changes', [])
                      if p['command'] in self.confirmed_pens]
            result['recovery_pen'] = passes[-1]['pen_label'] if passes else None
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

    @staticmethod
    def atomic_json(path, value):
        """Replace a complete checkpoint only after its bytes reach disk."""
        temp = path.with_suffix('.tmp')
        with temp.open('w') as stream:
            json.dump(value, stream)
            stream.write('\n')
            stream.flush()
            os.fsync(stream.fileno())
        temp.replace(path)

    def write_journal(self):
        self.folder.mkdir(parents=True, exist_ok=True)
        state = self.snapshot()
        if self.job:
            state.update(file=self.job['name'], sha256=self.job['sha256'])
            job_path = self.folder / 'plotter-job.json'
            if getattr(self, '_saved_job_id', None) != self.job['id']:
                self.atomic_json(job_path, dict(
                    text=self.job_text, name=self.job['name'],
                    id=self.job['id'], sha256=self.job['sha256'],
                ))
                self._saved_job_id = self.job['id']
        state['recovery'] = dict(
            active=self.recovery_active, identity=self.identity,
            accepted=self.accepted, pending=self.pending,
            uncertain_write=self.uncertain_write, reset_seen=self.reset_seen,
            confirmed_pens=sorted(self.confirmed_pens),
            pause_return=self.pause_return,
            job_id=self.job['id'] if self.job else None,
        )
        self.atomic_json(self.folder / 'plotter-state.json', state)
        self.last_save = time.monotonic()

    def restore_checkpoint(self, old):
        """Restore bytes and bookkeeping; never connect or move on startup."""
        if not isinstance(old, dict):
            return
        saved = old.get('recovery', {})
        if not isinstance(saved, dict) or not saved.get('active'):
            return
        try:
            source = json.loads((self.folder / 'plotter-job.json').read_text())
            job = parse_job(source['text'], source['name'])
            if (job['sha256'] != source['sha256']
                    or job['sha256'] != old['sha256']
                    or source['id'] != saved['job_id']):
                raise ValueError('Saved drawing does not match its checkpoint.')
            accepted, pending = saved['accepted'], saved['pending']
            if not (-1 <= accepted <= pending < len(job['commands'])):
                raise ValueError('Saved command indices are invalid.')
            identity = saved['identity']
            if not isinstance(identity, list) or len(identity) != 3:
                raise ValueError('Saved USB identity is missing.')
            job['id'] = source['id']
            self.job, self.job_text = job, source['text']
            self.identity = identity
            self.accepted, self.pending = accepted, pending
            self.uncertain_write = saved['uncertain_write']
            self.reset_seen = saved['reset_seen']
            self.confirmed_pens = set(saved['confirmed_pens'])
            self.pause_return = saved.get('pause_return')
            self.recovery_active = True
            self._saved_job_id = job['id']
            self.data.update(
                phase='interrupted', accepted=accepted + 1,
                total=len(job['commands']), elapsed=old.get('elapsed', 0),
                pending_pen=old.get('pending_pen'),
                message='Saved interrupted plot restored. Do not Home or move '
                        'the paper. Review the recovery confirmation to resume.',
            )
            if self.uncertain_write or self.reset_seen or self.pause_return is not None:
                self.data['message'] = ('Saved plot retained, but automatic resume '
                                        'is blocked: a partial command or controller '
                                        'reset or interrupted parking move makes progress uncertain.')
        except (OSError, ValueError, KeyError, TypeError):
            self.data['message'] = ('Saved plot could not be verified. It will not '
                                    'be resumed. Keep the checkpoint files for inspection.')

    def load(self, text, name='drawing.gcode'):
        job = parse_job(text, name)
        with self.mutex:
            if self.thread and self.thread.is_alive(): raise ValueError('Finish or cancel the current operation first.')
            if self.recovery_active:
                raise ValueError('Resume or discard the saved plot before loading another drawing.')
            self.job = job
            self.job_text = text
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
        if job_command:
            self.pending = self.accepted + 1
            self.uncertain_write = True
            self.save_journal()
        self.write((command+'\r').encode('ascii'))
        if job_command:
            self.uncertain_write = False
            self.save_journal()
        end = time.monotonic()+timeout
        lines = []
        while self.acks < target:
            before = time.monotonic()
            if controls and self.cancel.is_set():
                raise Cancelled()
            # Finish this acknowledgement before issuing parking commands.
            # Otherwise a parking acknowledgement could be mistaken for this one.
            end += time.monotonic()-before
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

    def pause_move(self, command):
        """Complete one auxiliary move without recursively handling Pause."""
        if self.cancel.is_set():
            raise Cancelled()
        self.normal(command, controls=False)
        return self.wait_idle(controls=False, abort=True)

    def controls(self):
        if self.cancel.is_set():
            raise Cancelled()
        if not self.pause.is_set():
            return
        self.update('pausing', 'Finishing queued movement before parking…')
        state = self.wait_idle(controls=False, abort=True)
        if (state['offset'] is None or any(abs(v) > .01 for v in state['offset'])
                or not (0 <= state['position'][0] <= 210
                        and -297 <= state['position'][1] <= 0)
                or min(abs(state['position'][2] - z) for z in (.5, 5)) > .02):
            raise ValueError('Cannot verify the drawing position before parking.')
        self.check_modes(controls=False)
        self.pause_return = list(state['position'])
        # No job command remains unacknowledged or queued at this boundary.
        self.pending = self.accepted
        self.save_journal()
        self.pause_move('G90 G1 Z0.5 F1200')
        self.check_home(self.pause_move('G90 G1 X0 Y0 F2400'))
        self.update('paused', 'Paused at the top-left with the pen raised. '
                    'Keep the paper and pen unchanged; Continue returns to the drawing.')
        while self.pause.is_set():
            if self.cancel.is_set():
                raise Cancelled()
            self.check_home(self.status())
            time.sleep(.1)
        if self.cancel.is_set():
            raise Cancelled()
        self.check_home(self.status())
        self.check_modes(controls=False)
        self.update('resuming', 'Returning to the saved drawing position with the pen raised…')
        x, y, z = self.pause_return
        self.pause_move(f'G90 G1 X{x:.4f} Y{y:.4f} F2400')
        target_z = 5 if abs(z - 5) < .02 else .5
        state = self.pause_move(f'G90 G1 Z{target_z:g} F1200')
        if any(abs(a - b) > .02 for a, b in zip(state['position'], self.pause_return)):
            raise ValueError('Could not verify the saved drawing position.')
        self.pause_return = None
        self.update('plotting', 'Drawing position restored. Continuing the current drawing.')

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

    def check_modes(self, controls=True):
        modal = self.normal('$G', controls=controls)
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
        self.recovery_active = True
        self.confirmed_pens = set()
        self.update('plotting', 'Drawing started.', accepted=0, total=len(self.job['commands']), attempt=0)
        self.run_commands(0)

    def run_commands(self, index):
        last_poll = time.monotonic()
        checkpoints = {p['command']: p for p in self.job['pen_changes']}
        confirmed = self.confirmed_pens
        while index < len(self.job['commands']):
            try:
                if index in checkpoints and index not in confirmed:
                    self.change_pen(checkpoints[index])
                    confirmed.add(index)
                    self.save_journal()
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
                self.save_journal()
            except LinkError as exc:
                index = self.recover(exc)
        self.update('finishing', 'All commands sent. Waiting for movement to finish…', remaining=0)
        try: final = self.wait_idle()
        except LinkError as exc:
            if self.recover(exc) != len(self.job['commands']): raise ValueError('Completion is uncertain.')
            final = self.controller
        self.check_home(final)
        self.recovery_active = False
        self.update('completed', 'Completed: home reached and pen raised.', homed=True, elapsed=round(time.monotonic()-self.started))
        self.started = None

    def resume_saved(self):
        """Retry a saved job after an explicit unchanged-setup confirmation."""
        self.acquire()
        self.open_device(recovery=True)
        if self.reset_seen:
            raise ValueError('The controller reset. Saved progress cannot be resumed.')
        if self.uncertain_write:
            raise ValueError('A command may have been partially transmitted.')
        state = self.status()
        if state['offset'] is None or any(abs(v) > .01 for v in state['offset']):
            raise ValueError('The work offset changed or could not be verified.')
        self.check_modes()
        if self.cancel.is_set():
            raise Cancelled()
        if state['state'] == 'Hold:0':
            # Only release the controller's existing queue, after user confirmation.
            self.write(b'~')
        elif state['state'] not in ('Idle', 'Run'):
            raise ValueError('The controller must be idle or safely held to resume.')
        state = self.wait_idle(controls=False, abort=True)
        if any(abs(v) > .01 for v in state['offset']):
            raise ValueError('The work offset changed.')
        index = resume_at(self.job['endpoints'], self.accepted, self.pending,
                          state['position'])
        self.accepted = index - 1
        self.started = time.monotonic() - self.data.get('elapsed', 0)
        self.update('plotting', 'Saved position verified. Resuming the same plot.',
                    accepted=index, pending_pen=None)
        self.run_commands(index)

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
                if self.pause.is_set() or self.pause_return is not None:
                    raise ValueError('Connection was lost during parking or a paused plot; progress cannot be verified.')
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
        self.recovery_active = False
        self.pause_return = None
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
                if phase not in {'plotting', 'pausing', 'paused', 'reconnecting', 'finishing', 'pen_change', 'resuming'}:
                    raise ValueError('There is no active drawing to control.')
                if name == 'pause': self.pause.set()
                elif name == 'continue':
                    if phase != 'paused': raise ValueError('Wait for the plotter to pause fully.')
                    self.pause.clear()
                else: self.cancel.set()
                return
            if name == 'resume':
                if (not self.snapshot()['recovery_available'] or self.s
                        or payload.get('ready') is not True
                        or payload.get('job_id') != self.job['id']):
                    raise ValueError('Confirm the unchanged paper, pen and powered '
                                     'plotter for this saved job before resuming.')
                self.launch('reconnecting', self.resume_saved)
            elif name == 'discard':
                if self.thread and self.thread.is_alive():
                    raise ValueError('Finish the current operation first.')
                self.recovery_active = False
                self.pause_return = None
                self.close()
                self.update('offline', 'Saved recovery discarded. Check the plotter '
                            'and Home before starting a new drawing.', pending_pen=None)
            elif name == 'connect':
                if self.recovery_active:
                    raise ValueError('Use Resume saved plot or discard it before connecting.')
                if self.s: raise ValueError('Already connected.')
                self.launch('connecting', self.connect, payload.get('port'))
            elif name == 'home':
                if self.recovery_active:
                    raise ValueError('Homing would invalidate the saved plot. Resume or discard it first.')
                self.launch('homing', self.home)
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
