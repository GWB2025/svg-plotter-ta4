"""Desktop lifecycle checks without opening USB or a native window."""
import tempfile
import unittest
from pathlib import Path
from unittest.mock import Mock, patch

from desktop import DesktopApp, data_folder


class DesktopTests(unittest.TestCase):
    def test_user_data_lives_outside_bundle(self):
        self.assertEqual(data_folder(Path('/Users/test')),
                         Path('/Users/test/Library/Application Support/SVG Plotter'))

    def test_busy_sender_cannot_be_closed(self):
        app = DesktopApp()
        app.plotter = Mock()
        app.plotter.snapshot.return_value = {'busy': True}
        self.assertFalse(app.can_close())
        app.plotter.close.assert_not_called()

    def test_idle_shutdown_disconnects_and_stops_owned_server(self):
        app = DesktopApp()
        app.plotter = Mock()
        app.plotter.snapshot.return_value = {'busy': False}
        app.server = Mock()
        self.assertTrue(app.can_close())
        app.stop()
        app.plotter.close.assert_called_once()
        app.server.shutdown.assert_called_once()

    def test_data_directory_is_created(self):
        with tempfile.TemporaryDirectory() as folder:
            app = DesktopApp(Path(folder) / 'data')
            app.prepare_data()
            self.assertTrue(app.folder.is_dir())

    def test_busy_dialog_never_grants_permission_to_quit(self):
        app = DesktopApp()
        app.plotter = Mock()
        app.plotter.snapshot.return_value = {'busy': True}
        app.window = Mock()
        app.window.create_confirmation_dialog.return_value = True
        self.assertFalse(app.can_close())

    def test_port_conflict_reports_a_friendly_error(self):
        with tempfile.TemporaryDirectory() as folder:
            app = DesktopApp(Path(folder))
            with patch.dict('sys.modules', {'webview': Mock()}), \
                    patch('werkzeug.serving.make_server', side_effect=SystemExit), \
                    patch('plotting.Plotter') as plotter:
                with self.assertRaisesRegex(RuntimeError, 'port 8769'):
                    app.run()
                plotter.return_value.close.assert_called_once()
            app.lock_file.close()

    def test_quit_warning_does_not_block_native_close_callback(self):
        app = DesktopApp()
        app.plotter = Mock()
        app.plotter.snapshot.return_value = {'busy': True}
        app.window = Mock()
        with patch('desktop.threading.Thread') as worker:
            self.assertFalse(app.can_close())
            app.window.create_confirmation_dialog.assert_not_called()
            worker.return_value.start.assert_called_once()
            # Repeated close clicks must not queue multiple modal warnings.
            self.assertFalse(app.can_close())
            self.assertEqual(worker.call_count, 1)
