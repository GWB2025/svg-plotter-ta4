# SVG Plotter 1.4.0 — pen swatches, 27 October 2026

Adds physical pen swatches and manual ColorReader RGB/HEX entry to Pen stock.
The default 24 Sharpies fit on one A4 sheet, with numbered labels outside each
20 mm patch. Larger settings paginate. A continuous alternating fill keeps
pen lifts out of the sample area. An optional perpendicular pass adds coverage.
Physical IDs, rather than colour alone, define each pen pass.

## Verification scope

All 62 JavaScript and 98 Python tests passed (160 total). JavaScript syntax and
Git whitespace checks also passed for the changed application code.
The separate Apple silicon application build passed its packaged smoke test and
strict code-signature verification. A rendering of the actual generated paths
was visually checked for the default 24-pen sheet: patches and labels fit on A4
without overlap.

Automated checks cover single/set selection, 24-pen layout, pagination, patch
separation and bounds, dense fills, cross-hatching, unavailable/duplicate pens,
same-colour physical identities, labelled path positions, long names, RGB/HEX
synchronisation, catalogue persistence payloads and invalid readings. UI tests
exercise preparation and saved-recovery locks without issuing movement actions.
The generated jobs also pass through the real Python sender parser, checking
all 24 pen-change stops and the raised-pen origin before each pass.

The existing 1.3.2 app was observed actively plotting an ASCII City drawing.
That session was left untouched. The new build is staged separately, pending
installation after the drawing finishes. No live hardware or ColorReader
measurement test is claimed. Coverage and dry-ink readings still require a
physical trial on the intended paper; the line-width/spacing guidance is a
starting point, not a measured calibration of each pen.

Datacolor's May 2025 manual specifies a 4 mm aperture and supports measured
RGB/HEX in the mobile app. Its support guidance recommends a uniform sample
at least 6.35 × 6.35 mm. The app offers manual reading entry, not a Bluetooth
integration. Source links are retained in the user guide.
