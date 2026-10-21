"""Start the local SVG plotter; opening it never connects to USB."""

import json
from pathlib import Path
import subprocess
import sys
import time
import urllib.error
import urllib.request
import webbrowser


class Launcher:
    """Reuse an existing sender window or start one on loopback."""

    def __init__(self):
        self.root = Path(__file__).resolve().parent
        self.port = 8769
        self.url = f'http://127.0.0.1:{self.port}/'
        self.opener = urllib.request.build_opener(
            urllib.request.ProxyHandler({})
        )

    def running(self):
        try:
            with self.opener.open(self.url + 'api/identity', timeout=2) as reply:
                data = json.load(reply)
        except urllib.error.URLError as exc:
            if isinstance(exc.reason, ConnectionRefusedError):
                return False
            raise RuntimeError(f'Could not check the local window: {exc}') from exc
        if data.get('service') != 'handwriting-studio-plotter':
            raise RuntimeError('Port 8769 is used by another app.')
        if not data.get('parked_pause'):
            raise RuntimeError(
                'An older SVG Plotter sender is still running. Stop it in its '
                'Terminal window with Control-C, then open this launcher again. '
                'Wait for any active drawing to finish before stopping it.'
            )
        return True

    def python(self):
        candidates = [
            self.root / '.venv/bin/python',
            Path('/Volumes/EXTRA Apps/Documents/Writing Robot T-A4/'
                 'handwriting-studio-v2/.venv/bin/python'),
            Path(sys.executable),
        ]
        for candidate in candidates:
            if candidate.exists():
                check = subprocess.run(
                    [str(candidate), '-c', 'import flask'],
                    capture_output=True, check=False,
                )
                if check.returncode == 0:
                    return str(candidate)
        raise RuntimeError(
            'Flask is missing. See README.md for first-time installation.'
        )

    def launch(self):
        if not self.running():
            folder = self.root / 'logs'
            folder.mkdir(exist_ok=True)
            with (folder / 'server.log').open('a') as log:
                process = subprocess.Popen(
                    [self.python(), str(self.root / 'plotter_app.py'),
                     '--port', str(self.port)],
                    cwd=self.root, stdin=subprocess.DEVNULL,
                    stdout=log, stderr=log, start_new_session=True,
                )
            try:
                for _ in range(60):
                    if process.poll() is not None:
                        raise RuntimeError('Server could not start. See logs/server.log.')
                    if self.running():
                        break
                    time.sleep(0.25)
                else:
                    raise RuntimeError('The plotting window did not become ready.')
            except Exception:
                process.terminate()
                raise
        print('SVG Plotter: ' + self.url)
        webbrowser.open(self.url, new=2)


if __name__ == '__main__':
    try:
        Launcher().launch()
    except (OSError, RuntimeError, ValueError) as error:
        print('Could not open SVG Plotter: ' + str(error))
        sys.exit(1)
