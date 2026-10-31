"""Loopback-only plotting companion. Merely opening this app does not open USB."""
import argparse
import secrets
import math
from xml.etree import ElementTree as ET
from pathlib import Path
from flask import Response, Flask, jsonify, request, send_from_directory
from plotting import MAX_BYTES, Plotter, job_info
from app_info import VERSION
from postcard import PostcardDraft
from font_library import FontLibrary
from materials import MaterialsGuide

ROOT = Path(__file__).resolve().parent


def create_plotter_app(manager=None, port=8769):
    app = Flask(__name__, static_folder=None)
    app.config['MAX_CONTENT_LENGTH'] = MAX_BYTES * 2 + 64 * 1024  # JSON escapes newlines and quotes.
    plotter = manager or Plotter(ROOT/'logs')
    token = secrets.token_urlsafe(32)
    app.config['PLOTTER_TOKEN'] = token
    app.extensions['plotter'] = plotter
    fonts = FontLibrary(plotter.folder)
    postcard = PostcardDraft(plotter.folder, fonts)
    app.extensions['fonts'] = fonts
    app.extensions['postcard'] = postcard
    materials = MaterialsGuide(ROOT / 'assets/materials-guide.json')
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
        panels, separator, dialogs = (ROOT/'docs/catalogue-panels.html').read_text().partition('<dialog')
        html = html.replace('<!-- PERSONAL_PANELS -->', panels)
        html = html.replace('<!-- POSTCARD_PANEL -->',
                            (ROOT / 'docs/postcard-panel.html').read_text())
        html = html.replace('<!-- TEXT_PANEL -->',
                            (ROOT / 'docs/text-panel.html').read_text())
        html = html.replace('<!-- APP_DIALOGS -->', separator + dialogs)
        html = html.replace('<!-- MATERIALS_PANEL -->', materials.render())
        html = html.replace('{{APP_VERSION}}', VERSION)
        return html.replace('</head>', f'<meta name="plotter-token" content="{token}"></head>')

    @app.get('/assets/<name>')
    def assets(name):
        if name not in {
            'style.css', 'plotting.css', 'plotting.js', 'svg-import.js',
            'pens.js', 'pens.json', 'themes.js', 'themes.json', 'recolour.js',
            'tooltips.js', 'page-guides.js', 'catalogue.js', 'preview.js',
            'postcard-layout.js', 'postcard-editor.js', 'postcard-fonts.json',
            'opentype.min.js', 'ttf-fonts.js', 'font-library-client.js',
            'pen-swatches.js', 'swatch-editor.js',
            'materials-guide.js', 'ink-stock.js',
            'text-import.js', 'text-editor.js', 'plotter-profiles.js',
        }:
            return '', 404
        return send_from_directory(ROOT/'assets', name)

    @app.get('/api/identity')
    def identity():
        return jsonify(service='handwriting-studio-plotter', version=9, app_version=VERSION, reset_recovery=True, layered_svg=True, parked_pause=True, durable_recovery=True, colour_changes=True, pen_inventory=True, colour_themes=True, theme_changes=True)

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
            return jsonify(job=job_info(plotter.job) if plotter.job else None,
                           text=plotter.job_text)

    @app.route('/api/profiles', methods=['GET', 'POST'])
    def profiles():
        if request.method == 'GET':
            return jsonify(plotter.profiles.snapshot())
        if request.content_length and request.content_length > 16384:
            return jsonify(error='The plotter profile is too large.'), 413
        data = request.get_json()
        if not isinstance(data, dict):
            return jsonify(error='Choose a plotter profile action.'), 400
        try:
            return jsonify(plotter.change_profile(data.get('action'),
                                                   data.get('item'),
                                                   data.get('revision')))
        except (ValueError, OSError) as error:
            return jsonify(error=str(error)), 409

    @app.get('/api/job/svg')
    def export_svg():
        with plotter.mutex:
            try:
                if not plotter.job:
                    raise ValueError('Prepare a drawing before saving its SVG.')
                width = float(request.args.get('width', plotter.profile.data['width']))
                height = float(request.args.get('height', plotter.profile.data['height']))
                if (not all(math.isfinite(v) and v >= 1 for v in (width, height))
                        or width > plotter.profile.data['width']
                        or height > plotter.profile.data['height']):
                    raise ValueError('Page dimensions must fit the selected plotter.')
                bounds = plotter.job['bounds']
                if bounds and (bounds[2] > width or bounds[3] > height):
                    raise ValueError('The prepared drawing extends beyond this page.')
                svg = ET.Element('svg', xmlns='http://www.w3.org/2000/svg',
                                 width=f'{width:g}mm', height=f'{height:g}mm',
                                 viewBox=f'0 0 {width:g} {height:g}')
                ET.SubElement(svg, 'title').text = plotter.job['name']
                ET.SubElement(svg, 'desc').text = ('Prepared pen paths for ' + plotter.profile.data['name'] +
                    '. Plot at original size; colours indicate pen passes. Use the target software for pen changes.')
                # Preserve path order, including separate physical pens with matching colours.
                for path, colour in zip(plotter.job['paths'], plotter.job['path_colours']):
                    ET.SubElement(svg, 'polyline', points=' '.join(f'{x:.12g},{y:.12g}' for x, y in path),
                                  fill='none', stroke=colour, **{'stroke-width': '0.3'})
                response = Response(ET.tostring(svg, encoding='unicode'), mimetype='image/svg+xml')
                response.headers['Content-Disposition'] = 'attachment; filename="prepared-drawing.svg"'
                return response
            except (ValueError, TypeError) as error:
                return jsonify(error=str(error)), 400

    @app.route('/api/catalogue', methods=['GET', 'POST'])
    def catalogue():
        if request.method == 'GET':
            return jsonify(plotter.catalogue.snapshot())
        if request.content_length and request.content_length > plotter.catalogue.MAX_BYTES:
            return jsonify(error='Choose a catalogue backup smaller than 2 MB.'), 413
        data = request.get_json()
        if not isinstance(data, dict):
            return jsonify(error='Choose a pen, ink or theme action.'), 400
        try:
            return jsonify(plotter.catalogue.change(data.get('action'), data.get('item'),
                                                    data.get('revision')))
        except (ValueError, OSError) as error:
            return jsonify(error=str(error)), 409

    @app.get('/api/catalogue/export')
    def export_catalogue():
        try:
            response = jsonify(plotter.catalogue.export())
            response.headers['Content-Disposition'] = 'attachment; filename="SVG-Plotter-Pens-and-Themes.json"'
            return response
        except ValueError as error:
            return jsonify(error=str(error)), 409

    @app.post('/api/load')
    def load():
        data = request.get_json()
        if not isinstance(data, dict): return jsonify(error='Choose a G-code file.'), 400
        try: return jsonify(job=plotter.load(data.get('text'), data.get('name', 'drawing.gcode')))
        except ValueError as exc: return jsonify(error=str(exc)), 400

    @app.route('/api/postcard', methods=['GET', 'POST'])
    def postcard_draft():
        if request.method == 'GET':
            return jsonify(postcard.snapshot())
        if request.content_length and request.content_length > postcard.MAX_BYTES:
            return jsonify(error='The postcard draft is too large.'), 413
        data = request.get_json()
        if not isinstance(data, dict):
            return jsonify(error='Choose a valid postcard draft.'), 400
        try:
            return jsonify(postcard.save(data.get('document'), data.get('revision')))
        except (ValueError, OSError) as exc:
            return jsonify(error=str(exc)), 409

    @app.route('/api/fonts', methods=['GET', 'POST'])
    def imported_fonts():
        if request.content_length and request.content_length > fonts.MAX_BYTES:
            return jsonify(error='Choose fewer or smaller fonts (32 MB per import maximum).'), 413
        try:
            if request.method == 'GET':
                return jsonify(fonts.snapshot())
            data = request.get_json()
            return jsonify(fonts.add(data.get('fonts') if isinstance(data, dict) else None))
        except (ValueError, OSError) as exc:
            return jsonify(error=str(exc)), 409

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
