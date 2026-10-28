# PyInstaller executes this file with Analysis, PYZ, EXE, COLLECT and BUNDLE.
import os
from pathlib import Path
import sys

from PyInstaller.utils.hooks import collect_all, copy_metadata

root = Path(SPECPATH).parent
sys.path.insert(0, str(root))
from desktop import VERSION

datas, binaries, hiddenimports = collect_all('webview')
datas += [(str(root / 'assets'), 'assets'),
          (str(root / 'docs'), 'docs'),
          (str(root / 'LICENSE'), '.')]
for dependency in ('Flask', 'pyserial', 'pywebview'):
    datas += copy_metadata(dependency, recursive=True)

a = Analysis([str(root / 'desktop.py')], pathex=[str(root)],
             binaries=binaries, datas=datas, hiddenimports=hiddenimports,
             hookspath=[], hooksconfig={}, runtime_hooks=[], excludes=[],
             noarchive=False, optimize=0)
pyz = PYZ(a.pure)
exe = EXE(pyz, a.scripts, [], exclude_binaries=True, name='SVG Plotter',
          debug=False, bootloader_ignore_signals=False, strip=False, upx=True,
          console=False, disable_windowed_traceback=False, argv_emulation=False,
          target_arch=None,
          codesign_identity=os.environ.get('MACOS_SIGNING_IDENTITY'),
          entitlements_file=None)
coll = COLLECT(exe, a.binaries, a.datas, strip=False, upx=True,
               upx_exclude=[], name='SVG Plotter')
app = BUNDLE(coll, name='SVG Plotter.app',
             icon=str(root / 'packaging/svg_plotter.icns'),
             bundle_identifier='uk.gordonbrindle.svgplotter', version=VERSION,
             info_plist={'CFBundleVersion': VERSION})
