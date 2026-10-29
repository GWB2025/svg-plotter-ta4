"""Installer policy tests; never write to Applications or open a plotter."""

from pathlib import Path
import plistlib
import sys
import tempfile
import unittest
from unittest.mock import patch
import xml.etree.ElementTree as ET

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'packaging'))
from build_installer import InstallerBuilder, InstallerSpec, NativeRequirements


class NativeRequirementsTests(unittest.TestCase):
    def test_reads_both_macos_load_command_formats(self):
        modern = 'cmd LC_BUILD_VERSION\n platform 1\n minos 15.0\n sdk 15.1'
        legacy = ('cmd LC_VERSION_MIN_MACOSX\n cmdsize 16\n'
                  ' version 10.13\n sdk 14.0')
        self.assertEqual(NativeRequirements.minimum_os(modern), '15.0')
        self.assertEqual(NativeRequirements.minimum_os(legacy), '10.13')

    def test_ignores_sdk_and_dylib_versions(self):
        with self.assertRaises(ValueError):
            NativeRequirements.minimum_os('cmd LC_ID_DYLIB\n version 99.0')

    def test_uses_highest_dependency_requirement(self):
        self.assertEqual(NativeRequirements.highest(['11.0', '15.0', '14.9']),
                         '15.0')
        self.assertEqual(NativeRequirements.highest(['11.9', '11.10']),
                         '11.10')


class InstallerTests(unittest.TestCase):
    def setUp(self):
        temporary = tempfile.TemporaryDirectory()
        self.addCleanup(temporary.cleanup)
        self.root = Path(temporary.name)
        self.app = self.root / 'SVG Plotter.app'
        (self.app / 'Contents/MacOS').mkdir(parents=True)
        (self.app / 'Contents/MacOS/SVG Plotter').write_bytes(b'fake binary')
        self.info = {
            'CFBundleIdentifier': 'uk.gordonbrindle.svgplotter',
            'CFBundleExecutable': 'SVG Plotter',
            'CFBundleVersion': '1.7.0',
            'CFBundleShortVersionString': '1.7.0',
        }
        self.save_info()
        inspector = patch.object(NativeRequirements, 'inspect', return_value=
                                 NativeRequirements(('arm64',), '15.0'))
        inspector.start()
        self.addCleanup(inspector.stop)

    def save_info(self):
        (self.app / 'Contents/Info.plist').write_bytes(
            plistlib.dumps(self.info))

    def test_fixed_destination_version_checked_upgrade(self):
        spec = InstallerSpec.from_app(self.app)
        self.assertEqual(spec.install_location, '/Applications')
        self.assertEqual(spec.package_id,
                         'uk.gordonbrindle.svgplotter.installer')
        self.assertEqual(spec.version, '1.7.0')
        self.assertEqual(spec.components(), [{
            'RootRelativeBundlePath': 'SVG Plotter.app',
            'BundleIsRelocatable': False,
            'BundleIsVersionChecked': True,
            'BundleHasStrictIdentifier': True,
            'BundleOverwriteAction': 'upgrade',
        }])

    def test_detects_runtime_requirement_when_plist_omits_it(self):
        spec = InstallerSpec.from_app(self.app)
        self.assertEqual(spec.requirements(),
                         {'arch': ['arm64'], 'os': ['15.0']})

    def test_stricter_plist_requirement_is_preserved(self):
        self.info['LSMinimumSystemVersion'] = '16.0'
        self.save_info()
        self.assertEqual(InstallerSpec.from_app(self.app).minimum_os, '16.0')

    def test_wrong_or_inconsistent_bundle_is_rejected(self):
        original = dict(self.info)
        for changes in [
            {'CFBundleIdentifier': 'com.example.other'},
            {'CFBundleShortVersionString': '1.6.0'},
            {'CFBundleVersion': 'bad-version'},
            {'CFBundleExecutable': '../elsewhere'},
            {'LSMinimumSystemVersion': 'bad-os'},
        ]:
            with self.subTest(changes=changes):
                self.info = {**original, **changes}
                self.save_info()
                with self.assertRaises(ValueError):
                    InstallerSpec.from_app(self.app)

    def test_distribution_keeps_requirements_and_fixed_system_domain(self):
        spec = InstallerSpec.from_app(self.app)
        source = '''<installer-gui-script minSpecVersion="2">
          <options customize="allow"/>
          <volume-check><allowed-os-versions><os-version min="15.0"/>
          </allowed-os-versions></volume-check>
          <pkg-ref id="plotter" version="1.7.0">plotter.pkg</pkg-ref>
        </installer-gui-script>'''
        root = ET.fromstring(spec.decorate_distribution(source))
        self.assertEqual(root.find('domains').attrib, {
            'enable_anywhere': 'false', 'enable_currentUserHome': 'false',
            'enable_localSystem': 'true',
        })
        self.assertEqual(root.find('options').get('hostArchitectures'),
                         'arm64')
        self.assertEqual(root.find('options').get('require-scripts'), 'false')
        self.assertEqual(root.find('.//os-version').get('min'), '15.0')
        self.assertEqual(root.find('pkg-ref').text, 'plotter.pkg')
        self.assertEqual(root.find('title').text, 'SVG Plotter 1.7.0')

    def test_readme_explains_quitting_settings_and_bundled_python(self):
        builder = InstallerBuilder(InstallerSpec.from_app(self.app))
        text = builder.readme()
        self.assertIn('Finish or cancel', text)
        self.assertIn('quit SVG Plotter', text)
        self.assertIn('/Applications/SVG Plotter.app', text)
        self.assertIn('~/Library/Application Support/SVG Plotter/', text)
        self.assertIn('No separate Python', text)
        self.assertIn('macOS 15.0', text)

    def test_output_cannot_overwrite_bundle(self):
        builder = InstallerBuilder(InstallerSpec.from_app(self.app))
        for target in (self.app / 'bad.pkg', self.root / 'wrong.txt'):
            with self.subTest(target=target), self.assertRaises(ValueError):
                builder.build(target)


if __name__ == '__main__':
    unittest.main()
