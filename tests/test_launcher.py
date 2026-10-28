"""A source launcher must not silently reuse an older installed sender."""

import io
import json
import unittest
from unittest.mock import Mock

from app_info import VERSION
from launch import Launcher


class LauncherTests(unittest.TestCase):
    def launcher_with(self, **identity):
        launcher = Launcher()
        payload = dict(service='handwriting-studio-plotter', parked_pause=True,
                       app_version=VERSION)
        payload.update(identity)
        launcher.opener = Mock()
        launcher.opener.open.return_value = io.BytesIO(json.dumps(payload).encode())
        return launcher

    def test_current_sender_is_reused(self):
        self.assertTrue(self.launcher_with().running())

    def test_older_sender_is_reported_without_terminating_it(self):
        for version in (None, '1.3.0'):
            with self.subTest(version=version):
                with self.assertRaisesRegex(RuntimeError, 'different version'):
                    self.launcher_with(app_version=version).running()
