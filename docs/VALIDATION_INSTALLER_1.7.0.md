# SVG Plotter 1.7.0 installer validation

Date: 29 October 2026. Built on the Apple silicon development Mac.

- The standard macOS product installer targets `/Applications/SVG Plotter.app`.
- Ten installer tests pass. They cover strict bundle identity, version-checked
  replacement, fixed system installation, native deployment targets, preserved
  requirements, invalid bundles and output-path validation.
- The builder inspected the launcher and bundled native libraries. This build
  requires arm64 and macOS 15.0 or later, including the bundled Python runtime.
- All 343 payload files and symbolic links match the existing 1.7.0 app.
- The extracted app passes `codesign --verify --deep --strict` and its bundled
  `--smoke-test`. Its signature is ad-hoc; the installer is unsigned and neither
  the installer nor app has Apple notarisation.
- Package metadata confirms the system destination, root authorisation,
  non-relocatable app, strict identifier, version check and bundle replacement.
  The payload contains only the app and there are no installation scripts.
- `installer -query RestartAction` reports `None`.
- The ZIP integrity check passes and its installer bytes match the verified
  package. The ZIP includes instructions and the installer builder/tests.
- Python source respects the 79-column limit; `git diff --check` passes.

No installation was performed, no running app was stopped and no physical
plotter was connected or moved. The read-only Installer volume/choice query
could not locate the `/` volume in the restricted environment, so interactive
installation and an end-to-end upgrade remain untested. The installer asks the
user to finish or cancel drawings and quit before continuing; it does not stop
running applications. Saved user data lies outside its payload.

Final package SHA-256:

```text
9252a0b8ae48cb32c2b1637b454977aa01d43928c73ea9226b79ca53c25982ea
```
