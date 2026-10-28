# SVG Plotter 1.3.1 — validation, 27 October 2026

## Source reconciliation

Started from GitHub commit `d66cae8`, including the 26 October recovery and
port-8769 corrections. Reconciled the local 1.3.0 feature set using its earlier
committed baseline. Resolved the UI and asset-list overlaps, keeping the newer
postcard, catalogue, guide, font and recovery capabilities. Work took place in
an isolated checkout; the original development directory was preserved.

The launcher now identifies its app version and explicitly reports an older
running sender. Opening pages, assets and editors does not acquire USB.

## Automated checks

- SVG Plotter: 96 Python tests and 42 JavaScript tests passed.
- Handwriting Capture: 11 Python tests, two geometry/navigation tests and the
  Pointer Events/control regression script passed (three Node test entries).
- Handwriting tests cover all 81 supported characters, legacy samples,
  case-sensitive missing characters, descenders, punctuation, scaled baseline
  offsets, group changes and auto-next. The original samples remain untouched.
- Apple silicon app build, packaged-resource smoke test and ad-hoc code-signature
  verification passed. The local Python build requires macOS 15 or newer.
- CI runs the complete plotter and handwriting suites. The Mac workflow builds
  Apple silicon and Intel packages; a configured workflow is not evidence that
  either hosted build has run or passed.

## Observed native session

The installed 1.3.0 application was open and connected to the T-A4, with a
241,357-command ASCII City drawing loaded and no drawing started. That session
was preserved. Its connection is not proof of the new build's hardware behaviour.
The execution sandbox does not permit binding a new local server, so full
interactive checks of the new build and iPad/Pencil capture remain pending.

## ASCII City companion

The existing companion opened successfully in Chrome at port 8774. Capture
produced a plotter preview and a three-part ZIP download. ZIP integrity and XML
parsing passed for all three SVGs: 4,525,443; 4,894,765; and 1,523,401 bytes.
Each uses the same 210 × 297 mm page and contains paths, with no text, image or
clip-path elements. Seven Python and twelve geometry tests also passed.
This verifies the live capture/export route, not every transport journey or
a fresh double-click launch of a stopped service.

## Remaining physical checks

The build is a pre-release. USB unplug/reconnect, reset recovery, pause/continue,
pen changes and measured postcard registration must still be tested on the
T-A4 using `PHYSICAL_TRIAL.md`. The ZIP includes a postcard trial folder with
carrier marks, a three-colour calibration drawing and fictitious address text.
The app is not Apple-notarised; no Intel or clean-Mac physical trial is claimed.
