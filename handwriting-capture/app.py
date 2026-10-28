"""Local handwriting capture; run with python app.py."""
import argparse
import copy
import json
import math
import random
import os
import tempfile
import uuid
from datetime import datetime, timezone
from pathlib import Path
from flask import Flask, jsonify, request, Response
from characters import CharacterSet

ROOT = Path(__file__).resolve().parent
CHARACTERS = CharacterSet()

def number(value, low, high):
    return type(value) in (int, float) and math.isfinite(value) and low <= value <= high

def validate(data):
    if not isinstance(data, dict) or not CHARACTERS.contains(data.get('character')):
        raise ValueError('Choose one character from the capture groups.')
    strokes = data.get('strokes')
    if not isinstance(strokes, list) or not 1 <= len(strokes) <= 100:
        raise ValueError('Draw between 1 and 100 strokes before saving.')
    total = 0
    previous = -1
    for stroke in strokes:
        if not isinstance(stroke, dict) or stroke.get('pointerType') not in ('pen', 'mouse', 'touch'):
            raise ValueError('Invalid stroke input type.')
        points = stroke.get('points')
        if not isinstance(points, list) or not points:
            raise ValueError('Each stroke needs points.')
        total += len(points)
        if total > 50000:
            raise ValueError('Sample exceeds 50,000 points.')
        for p in points:
            if not isinstance(p, dict) or not number(p.get('x'), 0, 400) or not number(p.get('y'), 0, 300):
                raise ValueError('Point coordinates must be inside the capture area.')
            if not number(p.get('timestamp'), 0, 86400000) or p['timestamp'] < previous:
                raise ValueError('Timestamps must be ordered milliseconds from sample start.')
            previous = p['timestamp']
            for key, lo, hi in [('pressure',0,1),('tiltX',-90,90),('tiltY',-90,90),('twist',0,359),('altitudeAngle',0,math.pi/2),('azimuthAngle',0,2*math.pi)]:
                if p.get(key) is not None and not number(p[key], lo, hi):
                    raise ValueError(f'Invalid {key}.')
    return strokes

def atomic_json(path, data):
    fd, tmp = tempfile.mkstemp(dir=path.parent, suffix='.tmp')
    try:
        with os.fdopen(fd, 'w') as f:
            json.dump(data, f, allow_nan=False)
            f.flush()
            os.fsync(f.fileno())
        os.replace(tmp, path)
    finally:
        if os.path.exists(tmp):
            os.unlink(tmp)

def create_app(data_dir=None):
    app = Flask(__name__, static_folder='static')
    app.config['MAX_CONTENT_LENGTH'] = 8 * 1024 * 1024
    folder = Path(data_dir or os.environ.get('HANDWRITING_DATA_DIR', ROOT / 'data'))
    for name in ('raw', 'processed'):
        (folder / name).mkdir(parents=True, exist_ok=True)

    @app.errorhandler(400)
    @app.errorhandler(413)
    @app.errorhandler(415)
    def bad_request(error):
        return jsonify(error=error.description), error.code

    input_events = []

    @app.route('/api/input-diagnostics', methods=['GET', 'POST'])
    def input_diagnostics():
        if request.method == 'GET':
            return jsonify(input_events)
        data = request.get_json()
        if not isinstance(data, dict):
            return jsonify(error='Invalid diagnostic.'), 400
        # Input event metadata only: no handwriting coordinates or text.
        item = {k: str(data.get(k, ''))[:100] for k in
                ('event', 'pointerType', 'touchTypes', 'active', 'busy', 'locked', 'version')}
        item['received_at'] = datetime.now(timezone.utc).isoformat()
        input_events.append(item)
        del input_events[:-100]
        return jsonify(ok=True)

    @app.get('/')
    def index():
        return app.send_static_file('index.html')

    @app.get('/api/samples')
    def samples():
        result = {c: [] for c in CHARACTERS.characters}
        for path in sorted((folder / 'raw').glob('*.json')):
            record = json.loads(path.read_text())
            result[record['character']].append(record)
        for records in result.values():
            records.sort(key=lambda r: r['created_at'])
        return jsonify(result)

    @app.get('/api/characters')
    def character_set():
        return jsonify(CHARACTERS.definition)

    @app.post('/api/samples')
    def save():
        data = request.get_json()
        try:
            strokes = validate(data)
        except ValueError as e:
            return jsonify(error=str(e)), 400
        record = {'schema_version': 1, 'id': str(uuid.uuid4()), 'character': data['character'],
                  'created_at': datetime.now(timezone.utc).isoformat(),
                  'coordinates': {'width':400, 'height':300, 'baseline':220, 'x_height_line':120,
                                  'units':'capture units, y down', 'timestamp_units':'milliseconds from sample start'},
                  'strokes': strokes}
        # Raw files are append-only. Processing may be replaced later without touching them.
        atomic_json(folder / 'raw' / (record['id'] + '.json'), record)
        processed = copy.deepcopy(record)
        processed['processing'] = 'identity-v1'
        atomic_json(folder / 'processed' / (record['id'] + '.json'), processed)
        return jsonify(record), 201

    @app.route('/api/review', methods=['GET', 'POST'])
    def review():
        settings_path = folder / 'review.json'
        if request.method == 'GET':
            return jsonify(json.loads(settings_path.read_text()) if settings_path.exists() else {})
        data = request.get_json()
        if not isinstance(data, dict):
            return jsonify(error='Invalid review settings.'), 400
        clean = {}
        for sid, config in data.items():
            try:
                if str(uuid.UUID(sid)) != sid or not (folder / 'raw' / (sid + '.json')).exists():
                    raise ValueError()
            except (ValueError, TypeError):
                return jsonify(error='Unknown sample.'), 400
            if (not isinstance(config, dict) or type(config.get('enabled')) is not bool
                    or not number(config.get('scale'), .5, 1.5)
                    or not number(config.get('shift'), -30, 30)):
                return jsonify(error='Size must be 50–150%; baseline shift must be -3 to +3 mm.'), 400
            clean[sid] = {k: config[k] for k in ('enabled', 'scale', 'shift')}
        atomic_json(settings_path, clean)
        return jsonify(clean)

    @app.post('/api/compose')
    def compose():
        data = request.get_json()
        phrase = data.get('text') if isinstance(data, dict) else None
        if not isinstance(phrase, str) or not phrase.strip() or len(phrase) > 120:
            return jsonify(error='Enter 1–120 characters.'), 400
        unsupported = sorted(set(phrase) - set(CHARACTERS.characters + ' \n'))
        if unsupported:
            return jsonify(error='Unsupported characters: ' + ', '.join(unsupported)), 400
        selection = data.get('selection', 'latest')
        if selection not in ('latest', 'variants'):
            return jsonify(error='Invalid sample selection.'), 400
        settings_path = folder / 'review.json'
        settings = json.loads(settings_path.read_text()) if settings_path.exists() else {}
        all_glyphs = {}
        for path in (folder / 'processed').glob('*.json'):
            r = json.loads(path.read_text())
            all_glyphs.setdefault(r['character'], []).append(r)
        glyphs = {}
        for c, records in all_glyphs.items():
            records.sort(key=lambda r: r['created_at'])
            latest_id = records[-1]['id']
            for r in records:
                config = settings.get(r['id'], {'enabled': r['id'] == latest_id, 'scale': 1, 'shift': 0})
                if not config['enabled']:
                    continue
                r = CHARACTERS.adjusted(r, config['scale'], config['shift'])
                glyphs.setdefault(c, []).append(r)
        previous = {}
        min_y, max_y = 0, 50
        missing = sorted(set(phrase) - set(' \n') - glyphs.keys())
        if missing:
            return jsonify(error='Capture these characters first: ' + ', '.join(missing)), 400
        x, y, width = 10, 10, 20
        paths = []
        for c in phrase:
            if c == '\n':
                width = max(width, x + 10)
                x, y = 10, y + 35
                continue
            if c == ' ':
                x += 8
                continue
            options = glyphs[c]
            if selection == 'variants':
                choices = [r for r in options if r['id'] != previous.get(c)] or options
                record = random.choice(choices)
            else:
                record = options[-1]
            previous[c] = record['id']
            pts = [p for s in record['strokes'] for p in s['points']]
            min_y = min(min_y, y + min(p['y'] for p in pts)*.1 - 3)
            max_y = max(max_y, y + max(p['y'] for p in pts)*.1 + 3)
            left, right = min(p['x'] for p in pts), max(p['x'] for p in pts)
            for stroke in record['strokes']:
                points = stroke['points']
                d = ' '.join(f'{"M" if i == 0 else "L"} {x+(p["x"]-left)*.1:.4f} {y+p["y"]*.1:.4f}' for i,p in enumerate(points))
                if len(points) == 1:
                    d += f' L {x+(points[0]["x"]-left)*.1:.4f} {y+points[0]["y"]*.1:.4f}'
                paths.append(f'<path data-sample="{record["id"]}" d="{d}"/>')
            x += max((right-left)*.1, 1) + 3
        width = max(width, x + 10)
        height = max(y + 40, max_y) - min_y
        svg = f'<svg xmlns="http://www.w3.org/2000/svg" width="{width:.4f}mm" height="{height:.4f}mm" viewBox="0 {min_y:.4f} {width:.4f} {height:.4f}"><g fill="none" stroke="#182d39" stroke-width="0.35" stroke-linecap="round" stroke-linejoin="round">' + ''.join(paths) + '</g></svg>'
        return Response(svg, mimetype='image/svg+xml')
    return app

if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--host', default='127.0.0.1')
    parser.add_argument('--port', type=int, default=8765)
    args = parser.parse_args()
    create_app().run(host=args.host, port=args.port, debug=False)
