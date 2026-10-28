"""Build on the target Mac architecture: python packaging/build_macos.py."""

import argparse
import os
from pathlib import Path
import platform
import shutil
import subprocess
import sys

ROOT = Path(__file__).resolve().parents[1]


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--zip-only', action='store_true',
                        help='Build a ZIP without using macOS disk-image services.')
    args = parser.parse_args()
    if sys.platform != 'darwin':
        raise SystemExit('Build this application on macOS.')
    command = [sys.executable, '-m', 'PyInstaller', '--noconfirm', '--clean',
               '--distpath', str(ROOT / 'dist'),
               '--workpath', str(ROOT / 'build'),
               str(ROOT / 'packaging/svg_plotter.spec')]
    environment = dict(os.environ)
    environment.setdefault('PYINSTALLER_CONFIG_DIR',
                           str(ROOT / 'build/pyinstaller-cache'))
    subprocess.run(command, cwd=ROOT,
                   env=environment, check=True)
    application = ROOT / 'dist/SVG Plotter.app'
    subprocess.run([str(application / 'Contents/MacOS/SVG Plotter'),
                    '--smoke-test'], check=True)
    subprocess.run(['codesign', '--verify', '--deep', '--strict',
                    str(application)], check=True)
    stage = ROOT / 'build/dmg'
    if stage.exists():
        shutil.rmtree(stage)
    stage.mkdir(parents=True)
    shutil.copytree(application, stage / 'SVG Plotter.app', symlinks=True)
    shutil.copy(ROOT / 'packaging/INSTALL.txt', stage)
    shutil.copytree(ROOT / 'examples/postcard-trial', stage / 'Postcard-trial')
    shutil.copy(ROOT / 'docs/PHYSICAL_TRIAL.md', stage / 'Postcard-trial/READ-ME.md')
    archive = ROOT / f'dist/SVG-Plotter-macOS-{platform.machine()}.zip'
    subprocess.run(['ditto', '-c', '-k', '--sequesterRsrc',
                    str(stage), str(archive)], check=True)
    print(archive, flush=True)
    if args.zip_only:
        return
    (stage / 'Applications').symlink_to('/Applications')
    image = ROOT / f'dist/SVG-Plotter-macOS-{platform.machine()}.dmg'
    subprocess.run(['hdiutil', 'create', '-volname', 'SVG Plotter',
                    '-srcfolder', str(stage), '-ov', '-format', 'UDZO',
                    str(image)], check=True)
    print(image)


if __name__ == '__main__':
    main()
