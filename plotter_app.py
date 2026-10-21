"""Loopback-only plotting companion. Merely opening this app does not open USB."""
import argparse
import secrets
from pathlib import Path
from flask import Flask, jsonify, request, send_from_directory
from plotting import MAX_BYTES, Plotter, job_info

ROOT = Path(__file__).resolve().parent


def create_plotter_app(manager=None, port=8767):
    app = Flask(__name__, static_folder=None)
    app.config['MAX_CONTENT_LENGTH'] = MAX_BYTES * 2 + 4096  # JSON escapes newlines and quotes.
    plotter = manager or Plotter(ROOT/'logs')
    token = secrets.token_urlsafe(32)
    app.config['PLOTTER_TOKEN'] = token
    app.extensions['plotter'] = plotter
    hosts = {f'127.0.0.1:{port}', f'localhost:{port}'}

    @app.before_request
    def local_requests():
        if request.remote_addr not in ('127.0.0.1', '::1') or request.host not in hosts:
            return jsonify(error='Open the plotting window on the connected Mac.'), 403
        if request.path.startswith('/api/') and request.path != '/api/identity':
            if not secrets.compare_digest(request.headers.get('X-Plotter-Token', ''), token):
                return jsonify(error='Reload the local plotting window to reconnect to this session.'), 403
        if request.method == 'POST':
            if request.headers.get('Origin') != 'http://'+request.host or not request.is_json:
                return jsonify(error='Use the controls in the local plotting window.'), 403

    @app.after_request
    def headers(response):
        response.headers['Cache-Control'] = 'no-store'
        response.headers['X-Content-Type-Options'] = 'nosniff'
        response.headers['Content-Security-Policy'] = "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' blob:; object-src 'none'; base-uri 'none'; frame-ancestors 'none'"
        return response

    @app.errorhandler(400)
    @app.errorhandler(413)
    @app.errorhandler(415)
    def bad_request(error):
        return jsonify(error='Choose a Studio G-code file no larger than 32 MB and try again.'), error.code

    @app.get('/')
    def index():
        html = (ROOT/'docs/plotting.html').read_text()
        return html.replace('</head>', f'<meta name="plotter-token" content="{token}"></head>')

    @app.get('/assets/<name>')
    def assets(name):
        if name not in {'style.css', 'plotting.css', 'plotting.js', 'studio-layout.js', 'tooltips.js', 'tooltips-content.js', 'svg-import.js', 'pens.js', 'pens.json', 'themes.js', 'recolour.js'}:
            return '', 404
        return send_from_directory(ROOT/'assets', name)

    @app.get('/api/identity')
    def identity():
        return jsonify(service='handwriting-studio-plotter', version=5, colour_changes=True, pen_inventory=True, colour_themes=True, theme_changes=True)

    @app.get('/api/status')
    def status():
        return jsonify(plotter.snapshot())

    @app.get('/api/devices')
    def ports():
        try: return jsonify(devices=plotter.ports())
        except ValueError as exc: return jsonify(error=str(exc)), 400

    @app.get('/api/job')
    def current_job():
        with plotter.mutex:
            return jsonify(job=job_info(plotter.job) if plotter.job else None)

    @app.post('/api/load')
    def load():
        data = request.get_json()
        if not isinstance(data, dict): return jsonify(error='Choose a G-code file.'), 400
        try: return jsonify(job=plotter.load(data.get('text'), data.get('name', 'drawing.gcode')))
        except ValueError as exc: return jsonify(error=str(exc)), 400

    @app.post('/api/action')
    def action():
        data = request.get_json()
        if not isinstance(data, dict): return jsonify(error='Choose a plotting action.'), 400
        try:
            plotter.action(data.get('action'), data)
            return jsonify(plotter.snapshot()), 202
        except ValueError as exc: return jsonify(error=str(exc)), 409

    return app


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--port', type=int, default=8769)
    args = parser.parse_args()
    if not 1 <= args.port <= 65535: parser.error('Choose a valid port.')
    create_plotter_app(port=args.port).run(host='127.0.0.1', port=args.port, debug=False, threaded=True)
