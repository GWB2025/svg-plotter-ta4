#!/usr/bin/env python3
"""One-shot safe patch for svg-plotter-ta4. Run: python3 fixes.py --dry-run, then python3 fixes.py"""
import sys
from pathlib import Path

ROOT = Path('/Volumes/EXTRA Apps/git/svg-plotter-ta4')
DRY = '--dry-run' in sys.argv
problems = 0

def patch(path, edits):
    global problems
    p = ROOT / path
    text = p.read_text()
    changed = False
    for old, new in edits:
        if old not in text:
            print(f'  SKIP  {path}: anchor not found: {old[:70]!r}')
            problems += 1
            continue
        text = text.replace(old, new, 1)
        changed = True
    if DRY:
        print(f'  WOULD change {path}' if changed else f'  no-op {path}')
    else:
        if changed:
            p.write_text(text)
            print(f'  wrote {path}')
        else:
            print(f'  unchanged {path}')

print('Patching plotter_app.py')
patch('plotter_app.py', [
    ("def create_plotter_app(manager=None, port=8767):",
     "def create_plotter_app(manager=None, port=8769):"),
    ("app.config['MAX_CONTENT_LENGTH'] = MAX_BYTES * 2 + 4096  # JSON escapes newlines and quotes.",
     "app.config['MAX_CONTENT_LENGTH'] = MAX_BYTES * 2 + 64 * 1024  # JSON escapes newlines and quotes."),
    ("{'style.css', 'plotting.css', 'plotting.js', 'studio-layout.js', 'tooltips.js', 'tooltips-content.js', 'svg-import.js', 'pens.js', 'pens.json', 'themes.js', 'recolour.js'}",
     "{'style.css', 'plotting.css', 'plotting.js', 'svg-import.js', 'pens.js', 'pens.json', 'themes.js', 'recolour.js'}"),
])

print('Patching plotting.py')
patch('plotting.py', [
    ("        self.job = None\n        self.identity = None",
     "        self.job = None\n        self.job_text = ''\n        self.identity = None"),
    ("            self.job = job\n            self.started = None",
     "            self.job = job\n            self.job_text = text\n            self.started = None"),
    ("raise ValueError('Travel move with pen down.')",
     "raise ValueError('Drawing move must use F900.')"),
])

print('Patching launch.py')
patch('launch.py', [
    ("import json\nfrom pathlib import Path",
     "import json\nimport os\nfrom pathlib import Path"),
    ("        candidates = [\n            self.root / '.venv/bin/python',",
     "        candidates = [\n            Path(os.environ['SVG_PLOTTER_PYTHON']) if os.environ.get('SVG_PLOTTER_PYTHON') else None,\n            self.root / '.venv/bin/python',"),
    ("            Path('/Volumes/EXTRA Apps/Documents/Writing Robot T-A4/'\n                 'handwriting-studio-v2/.venv/bin/python'),\n",
     ""),
    ("        for candidate in candidates:\n            if candidate.exists():",
     "        for candidate in candidates:\n            if candidate and candidate.exists():"),
])

print('Patching docs/plotting.html')
patch('docs/plotting.html', [
    ('href="http://127.0.0.1:8767/"', 'href="http://127.0.0.1:8769/"'),
    ('<strong>Start Plotter.command</strong>', '<strong>Start-SVG-Plotter.command</strong>'),
])

print(f'\n{"FAILED" if problems else "OK"} — {problems} anchor(s) not found.' if problems else '\nOK — all anchors matched.')