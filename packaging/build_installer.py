"""Build and verify a macOS installer for an existing SVG Plotter bundle."""

import argparse
from dataclasses import dataclass
import hashlib
from html import escape
import json
import os
from pathlib import Path
import plistlib
import re
import shutil
import subprocess
import tempfile
import xml.etree.ElementTree as ET
import zipfile

ROOT = Path(__file__).resolve().parents[1]
APP_NAME = 'SVG Plotter.app'
BUNDLE_ID = 'uk.gordonbrindle.svgplotter'
EXECUTABLE = 'Contents/MacOS/SVG Plotter'
MACH_MAGIC = {bytes.fromhex(value) for value in (
    'feedface', 'cefaedfe', 'feedfacf', 'cffaedfe',
    'cafebabe', 'bebafeca', 'cafebabf', 'bfbafeca',
)}


def run(arguments, **kwargs):
    """Run an Apple packaging tool without using shell interpolation."""
    return subprocess.run([str(value) for value in arguments], check=True,
                          **kwargs)


@dataclass(frozen=True)
class NativeRequirements:
    """Requirements of the actual launcher and its bundled dependencies."""

    architectures: tuple[str, ...]
    minimum: str

    @staticmethod
    def minimum_os(load_commands):
        values = re.findall(
            r'cmd LC_BUILD_VERSION\s+cmdsize \d+\s+'
            r'platform \S+\s+minos ([\d.]+)'
            r'|cmd LC_BUILD_VERSION\s+platform \S+\s+minos ([\d.]+)'
            r'|cmd LC_VERSION_MIN_MACOSX\s+cmdsize \d+\s+version ([\d.]+)',
            load_commands,
        )
        if not values:
            raise ValueError('A native binary has no macOS deployment target.')
        return NativeRequirements.highest(
            value for group in values for value in group if value)

    @staticmethod
    def highest(versions):
        return max(versions, key=lambda value: tuple(
            int(part) for part in value.split('.')))

    @classmethod
    def inspect(cls, app):
        architectures = tuple(run(
            ['/usr/bin/lipo', '-archs', app / EXECUTABLE],
            capture_output=True, text=True).stdout.split())
        if not architectures or not set(architectures) <= {'arm64', 'x86_64'}:
            raise ValueError(
                'Only Apple silicon and Intel Mac builds are supported.')
        versions = []
        for binary in sorted(app.rglob('*')):
            if binary.is_symlink() or not binary.is_file():
                continue
            with binary.open('rb') as stream:
                if stream.read(4) not in MACH_MAGIC:
                    continue
            arches = run(['/usr/bin/lipo', '-archs', binary],
                         capture_output=True, text=True).stdout.split()
            if not set(architectures) <= set(arches):
                raise ValueError(
                    f'Incompatible bundled architecture: {binary}')
            commands = run(['/usr/bin/otool', '-l', binary],
                           capture_output=True, text=True).stdout
            versions.append(cls.minimum_os(commands))
        if not versions:
            raise ValueError('The app contains no native Mac binaries.')
        return cls(architectures, cls.highest(versions))


@dataclass(frozen=True)
class InstallerSpec:
    app: Path
    version: str
    minimum_os: str
    architectures: tuple[str, ...]
    install_location: str = '/Applications'
    package_id: str = BUNDLE_ID + '.installer'

    @classmethod
    def from_app(cls, app):
        app = Path(app).resolve()
        info = plistlib.loads((app / 'Contents/Info.plist').read_bytes())
        version = info.get('CFBundleVersion', '')
        minimum = info.get('LSMinimumSystemVersion')
        if (app.name != APP_NAME
                or info.get('CFBundleIdentifier') != BUNDLE_ID
                or info.get('CFBundleExecutable') != Path(EXECUTABLE).name
                or not (app / EXECUTABLE).is_file()
                or not re.fullmatch(r'\d+\.\d+\.\d+', version)
                or info.get('CFBundleShortVersionString') != version
                or (minimum is not None and not re.fullmatch(
                    r'\d+\.\d+(?:\.\d+)?', minimum))):
            raise ValueError(
                'Choose a complete SVG Plotter app with consistent versions.')
        native = NativeRequirements.inspect(app)
        minimum = NativeRequirements.highest(
            [native.minimum] + ([minimum] if minimum else []))
        return cls(app, version, minimum, native.architectures)

    def components(self):
        return [{
            'RootRelativeBundlePath': APP_NAME,
            'BundleIsRelocatable': False,
            'BundleIsVersionChecked': True,
            'BundleHasStrictIdentifier': True,
            'BundleOverwriteAction': 'upgrade',
        }]

    def requirements(self):
        return {'arch': list(self.architectures), 'os': [self.minimum_os]}

    def decorate_distribution(self, source):
        root = ET.fromstring(source)
        for name in ('title', 'welcome', 'conclusion', 'domains'):
            for element in root.findall(name):
                root.remove(element)
        ET.SubElement(root, 'title').text = 'SVG Plotter ' + self.version
        ET.SubElement(root, 'welcome', {'file': 'Welcome.html'})
        ET.SubElement(root, 'conclusion', {'file': 'Conclusion.html'})
        ET.SubElement(root, 'domains', {
            'enable_anywhere': 'false',
            'enable_currentUserHome': 'false',
            'enable_localSystem': 'true',
        })
        options = root.find('options')
        if options is None:
            options = ET.SubElement(root, 'options')
        options.set('customize', 'never')
        options.set('hostArchitectures', ','.join(self.architectures))
        options.set('require-scripts', 'false')
        return ET.tostring(root, encoding='unicode', xml_declaration=True)


class InstallerBuilder:
    """Package an unchanged app; never install it or access saved user data."""

    def __init__(self, spec):
        self.spec = spec

    @property
    def machine_label(self):
        return ' / '.join({'arm64': 'Apple silicon', 'x86_64': 'Intel'}[arch]
                          for arch in self.spec.architectures)

    @staticmethod
    def page(title, body):
        return ('<!doctype html><html lang="en-GB"><meta charset="utf-8">'
                '<style>body{font:14px -apple-system,Helvetica,sans-serif;'
                'line-height:1.5;padding:14px;color:#222}'
                'h1{font-size:24px;font-weight:500}li{margin:10px 0}'
                '</style><title>' + escape(title) + '</title><h1>'
                + escape(title) + '</h1>' + body + '</html>')

    def resources(self, destination):
        destination.mkdir()
        welcome = self.page('SVG Plotter ' + self.spec.version,
                            '<p>This installer places <strong>SVG Plotter'
                            '</strong> in <strong>Applications</strong>.</p>'
                            '<p><strong>Before continuing:</strong> finish or '
                            'cancel any drawing, then quit SVG Plotter. A '
                            'paused drawing is still active. Stop a Terminal '
                            'sender too, if you use one.</p>'
                            '<p>Your saved pen and ink stock, colour themes, '
                            'plotter profiles, fonts, postcard drafts and '
                            'recovery records stay in their existing '
                            'folder.</p>'
                            '<p>Choose <strong>Continue</strong>, then '
                            '<strong>Install</strong>. macOS may ask for an '
                            'administrator password.</p><p>Requires '
                            + escape(self.machine_label) + ', macOS '
                            + escape(self.spec.minimum_os) + ' or later. '
                            'Python and dependencies are included.</p>')
        conclusion = self.page('SVG Plotter is ready',
                               '<ol><li>Open <strong>Finder → Applications → '
                               'SVG Plotter</strong>.</li><li>The window '
                               'title '
                               'should show <strong>SVG Plotter '
                               + escape(self.spec.version) + '</strong>.</li>'
                               '<li>Select your plotter profile and connect '
                               'when you are ready.</li></ol><p>Opening the '
                               'app does not connect or move the plotter '
                               'automatically. No Mac restart is '
                               'required.</p>')
        (destination / 'Welcome.html').write_text(welcome, encoding='utf-8')
        (destination / 'Conclusion.html').write_text(
            conclusion, encoding='utf-8')

    def build(self, output):
        output = Path(output).resolve()
        if output.suffix != '.pkg' or output.is_relative_to(self.spec.app):
            raise ValueError('Choose a .pkg output path outside the app.')
        run(['/usr/bin/codesign', '--verify', '--deep', '--strict',
             self.spec.app])
        output.parent.mkdir(parents=True, exist_ok=True)
        with tempfile.TemporaryDirectory(prefix='plotter-installer-') as temp:
            stage = Path(temp)
            payload = stage / 'payload'
            payload.mkdir()
            shutil.copytree(self.spec.app, payload / APP_NAME, symlinks=True)
            components = stage / 'components.plist'
            components.write_bytes(plistlib.dumps(self.spec.components()))
            product = stage / 'requirements.plist'
            product.write_bytes(plistlib.dumps(self.spec.requirements()))
            component = stage / 'plotter.pkg'
            run(['/usr/bin/pkgbuild', '--root', payload,
                 '--component-plist', components, '--identifier',
                 self.spec.package_id, '--version', self.spec.version,
                 '--install-location', self.spec.install_location,
                 '--ownership', 'recommended', component])
            distribution = stage / 'Distribution.xml'
            run(['/usr/bin/productbuild', '--synthesize', '--product', product,
                 '--package', component, distribution])
            distribution.write_text(self.spec.decorate_distribution(
                distribution.read_text()), encoding='utf-8')
            resources = stage / 'Resources'
            self.resources(resources)
            run(['/usr/bin/productbuild', '--distribution', distribution,
                 '--resources', resources, '--package-path', stage, output])
        return output

    @staticmethod
    def contents(root):
        result = {}
        for path in sorted(root.rglob('*')):
            if path.is_symlink():
                value = 'link:' + os.readlink(path)
            elif path.is_file():
                value = hashlib.sha256(path.read_bytes()).hexdigest()
            else:
                continue
            result[str(path.relative_to(root))] = value
        return result

    @staticmethod
    def require(condition, message):
        if not condition:
            raise ValueError(message)

    def verify(self, package):
        """Expand and smoke-test the payload without installation or USB."""
        with tempfile.TemporaryDirectory(prefix='plotter-pkg-check-') as temp:
            expanded = Path(temp) / 'expanded'
            run(['/usr/sbin/pkgutil', '--expand-full', package, expanded])
            info = ET.parse(expanded / 'plotter.pkg/PackageInfo').getroot()
            for name, value in {
                'install-location': self.spec.install_location,
                'identifier': self.spec.package_id,
                'version': self.spec.version,
                'relocatable': 'false', 'auth': 'root',
            }.items():
                self.require(info.get(name) == value, f'Unexpected {name}.')
            self.require(info.find('scripts') is None,
                         'Unexpected install scripts.')
            self.require(info.find('bundle-version/bundle') is not None,
                         'Missing bundle version check.')
            for name in ('upgrade-bundle', 'strict-identifier'):
                bundle = info.find(name + '/bundle')
                self.require(bundle is not None
                             and bundle.get('id') == BUNDLE_ID,
                             'Unexpected bundle upgrade policy.')
            app = expanded / 'plotter.pkg/Payload' / APP_NAME
            manifest = self.contents(app)
            self.require(manifest == self.contents(self.spec.app),
                         'Packaged app differs from its source.')
            payload_names = {path.name for path in app.parent.iterdir()}
            self.require(payload_names == {APP_NAME},
                         'Unexpected files outside the app.')
            self.require(os.access(app / EXECUTABLE, os.X_OK),
                         'The packaged launcher is not executable.')
            distribution = ET.parse(expanded / 'Distribution').getroot()
            self.require(distribution.find('domains').attrib == {
                'enable_anywhere': 'false', 'enable_currentUserHome': 'false',
                'enable_localSystem': 'true',
            }, 'Unexpected installation domains.')
            self.require(distribution.find('options').get('hostArchitectures')
                         == ','.join(self.spec.architectures),
                         'Unexpected architecture requirement.')
            minimum = distribution.find('.//os-version').get('min')
            self.require(minimum == self.spec.minimum_os,
                         'Unexpected macOS requirement.')
            run(['/usr/bin/codesign', '--verify', '--deep', '--strict', app])
            run([app / EXECUTABLE, '--smoke-test'])
            return {
                'version': self.spec.version,
                'destination': self.spec.install_location + '/' + APP_NAME,
                'architectures': list(self.spec.architectures),
                'minimum_macos': self.spec.minimum_os,
                'payload_files': len(manifest),
                'payload_matches_app': True,
                'signature_check': 'passed (ad-hoc or Developer ID)',
                'packaged_smoke_test': 'passed',
                'installation_performed': False,
                'physical_plotter_tested': False,
                'sha256': hashlib.sha256(
                    Path(package).read_bytes()).hexdigest(),
            }

    def readme(self):
        return f'''SVG PLOTTER {self.spec.version} — MAC INSTALLER

1. Finish or cancel any drawing, then quit SVG Plotter. A paused drawing is
   still active. Stop a Terminal-based sender too, if you use one.
2. Double-click the included .pkg installer.
3. Choose Continue, then Install. Enter your administrator password if asked.
4. Open Finder > Applications > SVG Plotter.

The window title should say SVG Plotter {self.spec.version}.
The installer places the complete application at:
  /Applications/SVG Plotter.app
It replaces an older app at that location, with bundle version checking to
prevent downgrades. No restart is required. Opening the app does not connect
or move the plotter automatically.

YOUR SAVED DATA
Your pen and ink stock, themes, profiles, fonts, postcard draft and recovery
records remain in:
  ~/Library/Application Support/SVG Plotter/
The installer contains only the app. It does not write to your saved data.

REQUIREMENTS
{self.machine_label} Mac, macOS {self.spec.minimum_os} or later.
No separate Python or dependency downloads are needed.

OPENING THIS DOWNLOAD
This privately built installer is unsigned and has not been notarised by Apple.
If macOS blocks this trusted download, try opening it once, then use:
  System Settings > Privacy & Security > Open Anyway
Confirm only for the SVG Plotter installer you intended to open.
Apple guidance: https://support.apple.com/en-gb/102445

SOURCE AND VALIDATION
Source contains the installer builder and tests; these are optional.
The app is unchanged. See VALIDATION.json for payload and smoke checks.
These checks do not install the app or test physical plotting.
App source and attribution: https://github.com/GWB2025/svg-plotter-ta4
Inspired by Dan Catt's pen-plotting design; attribution remains inside the app.

Rebuild on a development Mac with Apple's command-line tools:
  python3 Source/packaging/build_installer.py \\
    --app '/path/to/SVG Plotter.app' \\
    --output '/path/to/SVG-Plotter-Installer.pkg'
Run installer tests:
  python3 -m unittest discover -s Source/tests -p test_macos_installer.py -v
'''

    def archive(self, package, validation):
        package = Path(package)
        archive = package.with_suffix('.zip')
        prefix = 'SVG-Plotter-Installer/'
        with zipfile.ZipFile(archive, 'w', zipfile.ZIP_DEFLATED) as output:
            output.write(package, prefix + package.name)
            output.writestr(prefix + 'READ-ME-FIRST.txt', self.readme())
            output.writestr(prefix + 'VALIDATION.json',
                            json.dumps(validation, indent=2) + '\n')
            for name in ('packaging/build_installer.py',
                         'tests/test_macos_installer.py'):
                output.write(ROOT / name, prefix + 'Source/' + name)
        with zipfile.ZipFile(archive) as checked:
            self.require(checked.testzip() is None,
                         'ZIP integrity check failed.')
            packaged_bytes = checked.read(prefix + package.name)
            self.require(packaged_bytes == package.read_bytes(),
                         'ZIP installer differs from verified package.')
        return archive


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--app', type=Path, required=True)
    parser.add_argument('--output', type=Path, required=True)
    arguments = parser.parse_args()
    builder = InstallerBuilder(InstallerSpec.from_app(arguments.app))
    package = builder.build(arguments.output)
    result = builder.verify(package)
    result['download'] = str(builder.archive(package, result))
    print(json.dumps(result, indent=2))


if __name__ == '__main__':
    main()
