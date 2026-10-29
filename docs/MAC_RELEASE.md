# Mac application releases

## Status

Current application: **1.7.0 pre-release**. The standard `.pkg` installer was
added on 29 October 2026 for the existing app bundle; its creation does not
change the application version. It targets Applications and includes Python
and the app's dependencies. See [installer validation](VALIDATION_INSTALLER_1.7.0.md).

No GitHub Releases are published as of 29 October 2026. The existing app ZIP
and Installer ZIP were supplied separately. Source commits, Actions build
artifacts and published release downloads are separate steps; pushing to
`main` runs regression checks and deploys the launch page, but does not build
or publish a Mac release.

## Application changes by version

Version 1.7.0 adds persistent machine profiles, a profile editor, configurable
GRBL Z-lift controls and prepared SVG export for other controller types.
The T-A4 remains the default. See `VALIDATION_1.7.0.md`.

Version 1.6.0 adds fixed-width text and ASCII-art importing, an editable preview,
row/column/tab spacing, SVG/text export and preparation through the existing
plotting controls. There are no new runtime dependencies or sender commands.
See `VALIDATION_1.6.0.md`.

Version 1.5.0 adds bottled ink stock, measured colour fields, descriptive
properties, refillable-pen links, ink names in pen-change prompts and catalogue
backup migration. Schema 2 imports schema 1; older apps do not read schema 2.
No plotting command changes or new dependencies. See `VALIDATION_1.5.0.md`.

Version 1.4.1 adds the offline Materials guide, based on the supplied comparison
of Dan Catt’s Pens & Paper lesson. It preserves all 16 entries, source labels
and timestamps, adds search/category filtering and credits Dan in the guide and
About. No catalogue schema, plotting command or runtime dependency changes.
See `VALIDATION_1.4.1.md`.

Version 1.4.0 adds labelled pen swatch sheets for single pens and collections,
paginated A4 layout, variable patch size/line spacing, optional cross-hatching,
and RGB entry linked to the existing HEX ink field. Swatches retain individual
physical pen passes even when digital colours match. There are no new runtime
dependencies or catalogue schema changes. See `VALIDATION_1.4.0.md`.

Version 1.3.2 adds quarter-turn SVG rotation before fitting or actual-size
placement, shared by outline paths and layered fill rendering. The preview and
export use the resulting checked G-code. See `VALIDATION_1.3.2.md`.

Version 1.3.1 consolidates the previously local features with the upstream
port-8769 and recovery fixes. It exposes the app version through the identity
endpoint and refuses to reuse a different running version from the source
launcher. The release includes handwriting-capture source and postcard trial
files. See `VALIDATION_1.3.1.md` and `PHYSICAL_TRIAL.md`.


Version 1.3.0 adds private TrueType import to both postcard text blocks. OpenType.js 2.0.0 is vendored in `assets/opentype.min.js`; its MIT notice is in `docs/OPENTYPE_LICENSE.txt`. `assets/ttf-fonts.js` converts closed outlines to normalized polylines (under 0.008 mm curve tolerance at the maximum 40 pt size). `font_library.py` validates geometry and atomically stores original bytes and processed contours outside the bundle. `/api/fonts` uses the existing session token and origin checks. Font data is never bundled or published. Imports do not change loaded drawings, USB state or the open draft. No new Python runtime dependency.

Tests include font-file validation, duplicate imports, failed-write recovery, draft references after restart, point limits, postcard scaling and the authenticated API. Native checks should import a font, select it independently for message/address, save/reopen the draft, and inspect an exported SVG before plotting.


Version 1.2.0 adds the **Postcard text** editor: separate message/address blocks,
four bundled Hershey stroke fonts, point sizes, baseline spacing, X/Y placement,
box widths, alignment, word wrapping, preview guides and an optional divider.
Drafts are saved to `postcard.json` outside the app. Prepared layouts and exported
SVGs use actual-size paths; editing a draft never changes an active drawing.
Bundled font notices are in `FONT_LICENCES.txt`. No new runtime dependencies.

Version 1.1.1 adds exact-size stock-positioning SVG guides for all page presets
and custom sizes. Guides share the artwork's top-left home origin, with corner,
edge-centre and centre marks. Loading fixes scale and outline treatment; changing
page dimensions regenerates the marks. Saved guide SVGs are recognised on import.

Version 1.1.0 adds personal pen-stock and colour-theme editors, availability,
catalogue import/export, keyboard-accessible tooltips and an About window.
Personal data is written to `catalogue.json` in the existing Application Support
folder. Each newly loaded drawing snapshots its pen details for recovery;
editing the catalogue never changes those saved pen labels.

Version 1.0.4 adds a custom Mac application icon showing a pen plotter drawing
a geometric flower. The icon includes standard and Retina sizes for Finder,
the Dock and the application switcher. Its source artwork is
`packaging/svg_plotter.png`; the bundled Mac icon is `packaging/svg_plotter.icns`.

Version 1.0.3 added completed-stroke checkpoints, explicit recovery after a
controller reset, pen-up return and a required pen confirmation before drawing.
Existing saved jobs can use a labelled conservative position-sample fallback.

An Apple silicon test bundle has been built locally using Python 3.13 and
pywebview 6.2.1. This local Python build requires macOS 15 or later.
The packaged resource smoke check and ad-hoc signature check
passed. Disk-image creation is unavailable in the restricted build environment;
use the ZIP build there. No Apple-notarised public installer has been published.
Full native-window, physical USB and installer-upgrade checks of 1.7.0 remain
outstanding. The release is labelled pre-release meanwhile. Earlier validation
reports retain the results and limitations of their named versions.

## Build locally

On a Mac with Python 3.12 or newer, from the repository root:

```sh
python3 -m venv .venv-macos
.venv-macos/bin/python -m pip install -r requirements-macos.txt
.venv-macos/bin/python -m unittest discover -s tests -v
node --test tests/*.cjs
.venv-macos/bin/python packaging/build_macos.py
"dist/SVG Plotter.app/Contents/MacOS/SVG Plotter" --smoke-test
```

Outputs are `dist/SVG Plotter.app`, a ZIP and
`dist/SVG-Plotter-macOS-<architecture>.dmg`. The ZIP is created first and can be
used independently of the DMG. If macOS disk-image services are unavailable, use
`.venv-macos/bin/python packaging/build_macos.py --zip-only`. The build checks
the packaged resources and ad-hoc or Developer ID signature before archiving.
Build Apple silicon and Intel separately on matching machines. Dependencies are
bundled by PyInstaller; recipients do not install Python. Assets and documentation
are bundled read-only. Recovery and desktop logs live in
`~/Library/Application Support/SVG Plotter/`. Native application dependencies
include pywebview, PyObjC/WebKit and their respective upstream licences; preserve
bundled licence notices when distributing.

The **Build Mac application** GitHub Actions workflow runs manually or on a `v*`
tag and uploads ZIPs and DMGs as build artifacts. It does not publish a GitHub Release.
The workflow uses separate Apple silicon and Intel runners and executes the
bundled resource smoke check. Download artifacts from the workflow run to test.
The workflow currently builds the application ZIP and DMG only. Build the PKG
separately using the command below. Both output directories (`build/` and
`dist/`) are ignored by Git; commit the source, tests and documentation, and
attach verified binaries to a release when publishing them.

## Build the PKG installer

The standard macOS installer uses the existing app bundle unchanged, in the
same way as the ASCII-City Capture installer. After building the app:

```sh
.venv-macos/bin/python -m unittest discover -s tests -p test_macos_installer.py -v
.venv-macos/bin/python packaging/build_installer.py \
  --app 'dist/SVG Plotter.app' \
  --output dist/SVG-Plotter-1.7.0-macOS-arm64-Installer.pkg
```

The builder creates a `.pkg` and a matching Installer ZIP containing the package,
instructions, validation results and reproducible installer source. It derives
the version from the bundle and the architecture and minimum macOS version from
its native binaries, including the bundled Python runtime. The current local
1.7.0 build requires Apple silicon and macOS 15.0 or later.
Use the matching architecture and app version in the output filename when
building a different bundle. The installer source uses only the Python standard
library; `pkgbuild`, `productbuild`, `pkgutil`, `codesign`, `lipo` and `otool`
must be available on the development Mac. No Python installation is required
on the recipient's Mac.

Installation targets `/Applications/SVG Plotter.app` in the system domain, uses
strict bundle identity and version checks, and replaces the old bundle rather
than leaving obsolete files behind. It contains no installation scripts and
does not write to user settings. Finish or cancel any drawing and quit the app
before installing. The installer does not terminate running applications.

Verification expands the complete package, compares every file and symbolic
link with the source app, verifies its code signature, runs its resource smoke
test and checks the package destination, upgrade policy and requirements.
This does not install the application or test physical hardware. The generated
package is unsigned and unnotarised; app signing and installer signing are
separate. See `VALIDATION_INSTALLER_1.7.0.md` for this build's results.

## Check before publishing

- On a clean Mac without Python installed, run the PKG and confirm its welcome,
  authorisation and completion screens. Launch the app from Applications.
  Test the separate application ZIP/DMG copy instructions as well.
- Upgrade an older idle app, check that obsolete bundle files are replaced,
  and confirm that stock, themes, profiles, fonts and drafts remain available.
  Check that a newer installed bundle is not downgraded. The installer does
  not close a running app; its instructions require quitting first.
- Verify the page, theme controls and file picker.
- Load a local SVG; check A5/A6, envelopes, custom dimensions, layered fills,
  pen selection and saving G-code via the native download prompt.
- Verify startup errors are visible and a second sender cannot bind port 8769.
- Connect real USB hardware; check Home, the small-star drawing, pen changes,
  pause/continue and cancellation. Verify closing is blocked during active,
  paused and homing operations.
- Quit while idle, reopen and verify the port was released. Check recovery
  survives replacement of the app without automatically connecting or moving.
- Test on both supported architectures and record tested macOS versions.
- Select a custom profile while disconnected; check bed limits, page presets
  and settings persistence. An SVG-export profile must reject USB connection
  and export prepared paths for the target application's own workflow.

No automatic updater is included. Show the version in the native window title;
update by quitting the idle app and replacing it in Applications. Never replace
it during plotting. Do not run the source launcher concurrently.

## Signing and notarisation

Public distribution should use an Apple Developer ID Application certificate
and Apple's notarisation service. These credentials are not stored in the repo.
For a local signed build, set `MACOS_SIGNING_IDENTITY` to your installed Developer
ID identity before running the build script. PyInstaller signs the bundle with
hardened runtime when a signing identity is supplied. Test signing requirements
on the final bundle; do not assume an ad-hoc build is notarised.

After a successful signed build, submit and staple the resulting DMG, using an
existing Keychain notarisation profile (example name `SVGPlotterNotary`):

```sh
xcrun notarytool submit dist/SVG-Plotter-macOS-arm64.dmg --keychain-profile SVGPlotterNotary --wait
xcrun stapler staple dist/SVG-Plotter-macOS-arm64.dmg
xcrun stapler validate dist/SVG-Plotter-macOS-arm64.dmg
codesign --verify --deep --strict --verbose=2 "dist/SVG Plotter.app"
spctl --assess --type execute --verbose=2 "dist/SVG Plotter.app"
```

The PKG needs a separate **Developer ID Installer** certificate; app signing
does not sign the package. Sign the final package with `productsign`, submit it
to Apple's notarisation service, staple the accepted ticket and verify the
result before distribution. Recreate any download ZIP and its checksums after
signing or stapling changes the package. The installer builder itself does not
perform these signing/notarisation steps.

Use the Intel filename for that build. Inspect any rejected notarisation log,
correct the cause and rebuild. Publish only verified architecture-specific
artifacts in a GitHub Release, with SHA-256 checksums, version, minimum macOS,
signing status and tested hardware notes. Check the uploaded downloads before
adding direct download links to the README and launch page. Preserve earlier
releases and label uncompleted physical validation as pre-release.

For trusted unsigned test builds blocked by macOS, use System Settings → Privacy
& Security → Open Anyway if offered. Do not advise disabling Gatekeeper.
