# SVG Plotter 1.6.0 — text and ASCII art, 28 October 2026

Adds a Text & ASCII art tab and plain-text detection in the normal file picker.
Hershey Sans paths occupy fixed cells; leading/trailing spaces, blank lines and
tabs retain their positions without wrapping. The user can edit text, change
column/row/tab spacing, save text, export SVG and prepare a drawing through the
existing fitting, rotation, physical-pen and sender controls. Prepared text
uses stroke paths, so layered-fill controls are unavailable. No new dependency,
catalogue schema or robot commands are introduced.

## Verification

81 JavaScript and 108 Python tests passed (189 total). New conversion and
workflow checks were run failing before implementation. They cover fixed
columns, whitespace, tab stops, printable ASCII punctuation, UTF-8/UTF-16,
unsupported characters and control codes, resource limits, SVG export,
backwards-compatible G-code .txt detection, fitting and rotation, readiness
reset, active-job/recovery guards and round trips through the checked sender.
After the stroke-only control adjustment, all eight plotting-control tests
passed again. Existing postcard, swatch, ink, catalogue and recovery checks
remain passing.

The supplied House.txt was tested directly from its 2,061 bytes: 66 columns,
38 rows, 1,332 strokes and 7,498 validated commands. Default A4 fitting with a
20 mm margin gives drawing bounds X20–190 mm and Y66.9394–230.0606 mm, about
170 × 163.1 mm, with an estimated minimum movement time of 10.6 minutes.
The signature and website footer are preserved. No third-party example artwork
has been added to the distributed source or bundle.

An isolated Chrome preview was inspected visually with the complete house
text, and Prepare to plot produced the same command count and dimensions.
Chrome extension file uploads were unavailable under its existing permissions;
no permissions were changed. File decoding/routing was covered by automated
checks. The installed native 1.6.0 window was subsequently observed displaying
House.gcode with the new text tab and enabled rotation controls.

The Apple silicon build passed the packaged-resource smoke test and strict
code-signature verification. The installed 1.5.0 app was checked idle,
disconnected and without recovery before replacement. Its unstarted swatch
drawing was retained and restored with the same command hash. The native app
launched as 1.6.0. No USB connection or physical plotting was initiated during
this work; physical pen-on-paper verification remains outstanding.

## Limits

Plain text is a single-page drawing, not a paginated document. Edits are kept
using Save text, not automatically persisted. The dedicated picker accepts
2 MB; layouts accept 50,000 characters, 2,000 columns, 1,000 rows and 240,000
path points. Missing glyphs block preparation rather than being substituted.
The pen-stroke lettering differs from the screen's monospaced source font.
