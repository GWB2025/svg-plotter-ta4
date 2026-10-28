# SVG Plotter 1.7.0 validation

Date: 28 October 2026. Tested on the development Mac using simulated controllers.

- 123 Python tests pass, including 15 profile-specific tests. Coverage includes
  default T-A4 behaviour, custom dimensions, axis directions, pen heights,
  speed and serial settings; authenticated profile actions, revision conflicts,
  failed writes, read-only defaults, saved profile restoration, incompatible
  G-code rejection, pause/continue/cancel and reconnection after a lost ACK.
- 88 JavaScript tests pass. Coverage includes the profile editor, failed saves,
  selection locks, bed fitting, coloured passes, guide dimensions, prepared
  drawings, text, rotation, swatches, pen stock and existing recovery controls.
- Browser-generated custom G-code is parsed by the real Python validator,
  including reversed X, positive Y, decimal speeds and Windows line endings.
- Export-only profiles reject direct connection before serial opening. Prepared
  SVG export uses the validated paths, colours and chosen physical page size.
- The Apple silicon bundle passes its packaged resource smoke check and
  `codesign --verify --deep --strict`. It is ad-hoc signed, not notarised.

The environment does not permit opening a local HTTP server, and its browser
policy blocks local file URLs. Interactive visual inspection therefore remains
unverified; the UI has automated DOM-fixture coverage. No physical plotter was
connected or moved. Custom hardware requires a pen-clear calibration trial;
no universal compatibility with GRBL variants or other protocols is claimed.
The existing installation has not been replaced. The ZIP is the installable
1.7.0 update; quit the old app while idle before replacing it.

Profiles use `plotter-profiles.json` outside the application bundle. Existing
catalogue and recovery files retain their storage locations. Saved recovery
contains its exact machine profile; old recovery defaults to the original T-A4.
