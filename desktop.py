"""Native Mac entry point; resources are read-only, user state is persistent."""

import logging
from pathlib import Path
import threading

from app_info import VERSION


def data_folder(home=None):
    """Keep recovery records outside the installed application bundle."""
    return (home or Path.home()) / 'Library/Application Support/SVG Plotter'


class DesktopApp:
    """Own exactly one sender and stop it only when movement has finished."""

    def __init__(self, folder=None):
        self.folder = folder or data_folder()
        self.plotter = None
        self.server = None
        self.window = None
        self.lock_file = None
        self.quit_notice_pending = False

    def prepare_data(self):
        self.folder.mkdir(parents=True, exist_ok=True)

    def can_close(self):
        if self.plotter and self.plotter.snapshot()['busy']:
            if self.window and not self.quit_notice_pending:
                self.quit_notice_pending = True
                # Cocoa invokes closing on its main thread. pywebview's dialog
                # waits for that thread, so dispatch it after refusing the close.
                threading.Thread(
                    target=self.show_quit_notice, daemon=True,
                ).start()
            return False
        return True

    def show_quit_notice(self):
        try:
            self.window.create_confirmation_dialog(
                'Drawing still active',
                'Finish or cancel the drawing in Drawing controls before '
                'quitting. A paused drawing is still active.',
            )
        finally:
            self.quit_notice_pending = False

    def stop(self):
        if self.server:
            self.server.shutdown()
            self.server.server_close()
        if self.plotter:
            self.plotter.close()

    def run(self):
        import fcntl
        import webview
        from werkzeug.serving import make_server
        from plotter_app import create_plotter_app
        from plotting import Plotter

        self.prepare_data()
        logging.basicConfig(
            filename=self.folder / 'desktop.log', level=logging.INFO,
        )
        self.lock_file = (self.folder / 'desktop.lock').open('a')
        try:
            fcntl.flock(self.lock_file, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError:
            raise RuntimeError(
                'SVG Plotter is already open. Select its window in the Dock.'
            ) from None
        self.plotter = Plotter(self.folder)
        # Share the standard port so a Terminal sender blocks a second owner.
        try:
            self.server = make_server(
                '127.0.0.1', 8769,
                create_plotter_app(self.plotter, port=8769), threaded=True,
            )
        except SystemExit as exc:
            self.plotter.close()
            raise RuntimeError(
                'Another app is using port 8769. Finish any drawing, '
                'disconnect and stop the old sender before opening this app.'
            ) from exc
        thread = threading.Thread(target=self.server.serve_forever, daemon=True)
        thread.start()
        webview.settings['ALLOW_DOWNLOADS'] = True
        try:
            self.window = webview.create_window(
                f'SVG Plotter {VERSION}', 'http://127.0.0.1:8769/',
                width=1280, height=900, min_size=(800, 600),
            )
            self.window.events.closing += self.can_close
            webview.start(private_mode=True)
        finally:
            self.stop()


def smoke_test():
    """Exercise bundled resources and native imports without opening USB."""
    import re
    import tempfile
    import webview  # noqa: F401
    import AppKit  # noqa: F401
    from plotter_app import create_plotter_app
    from plotting import Plotter

    with tempfile.TemporaryDirectory() as folder:
        app = create_plotter_app(Plotter(Path(folder)), port=8769)
        client = app.test_client()
        response = client.get('/', base_url='http://127.0.0.1:8769')
        if response.status_code != 200:
            raise RuntimeError('Bundled page is unavailable.')
        for asset in re.findall(r'(?:src|href)="(assets/[^"?]+)',
                                response.get_data(as_text=True)):
            reply = client.get('/' + asset, base_url='http://127.0.0.1:8769')
            if reply.status_code != 200:
                raise RuntimeError(f'Bundled asset missing: {asset}')


def main():
    """Present startup failures as Mac alerts rather than hidden tracebacks."""
    try:
        DesktopApp().run()
    except Exception as exc:
        logging.exception('Desktop startup failed')
        from AppKit import NSAlert, NSApplication
        NSApplication.sharedApplication()
        alert = NSAlert.alloc().init()
        alert.setMessageText_('SVG Plotter could not open')
        alert.setInformativeText_(
            f'{exc}\n\nClose any other SVG Plotter window and try again. '
            'Logs are in ~/Library/Application Support/SVG Plotter/desktop.log.'
        )
        alert.runModal()


if __name__ == '__main__':
    import sys
    if '--smoke-test' in sys.argv:
        smoke_test()
    else:
        main()
