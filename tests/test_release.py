"""Release entry points expose a complete UI without taking USB ownership."""

import re
import tempfile
import unittest
from pathlib import Path

from app_info import VERSION
from plotter_app import create_plotter_app
from plotting import Plotter


class ReleaseTests(unittest.TestCase):
    def test_default_port_reports_version_and_serves_every_ui_asset(self):
        with tempfile.TemporaryDirectory() as directory:
            plotter = Plotter(Path(directory))
            self.addCleanup(plotter.close)
            app = create_plotter_app(plotter)
            client = app.test_client()
            base = 'http://127.0.0.1:8769'
            identity = client.get('/api/identity', base_url=base)
            self.assertEqual(identity.status_code, 200)
            self.assertEqual(identity.json['app_version'], VERSION)
            page = client.get('/', base_url=base).get_data(as_text=True)
            self.assertIn(VERSION, page)
            for asset in re.findall(r'(?:src|href)="(assets/[^"?]+)', page):
                with self.subTest(asset=asset):
                    with client.get('/' + asset, base_url=base) as response:
                        self.assertEqual(response.status_code, 200)
            self.assertFalse(plotter.snapshot()['connected'])
            self.assertIsNone(plotter.job)
