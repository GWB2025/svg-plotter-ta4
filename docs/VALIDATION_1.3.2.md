# SVG Plotter 1.3.2 — SVG rotation, 27 October 2026

The SVG rotation control applies exact quarter-turn matrices before page fitting
or actual-size validation. Actual-size rotation uses the original SVG viewport,
preserving physical dimensions and margins. The same affine placement is used
for layered rasterisation, with hatching generated afterwards at physical spacing.
Preview and export both use the checked job sent to the plotter.

## Automated checks

- 51 JavaScript tests passed, including nine new rotation and UI workflow tests.
- 96 Python tests passed, covering the sender, recovery, APIs and packaged assets.
- New checks cover full-size landscape A4, every quarter turn, resetting rotation,
  colour/pen preservation, immutable source coordinates, rotation before fitting,
  layered/outline transform agreement, overflow and fractional bed-edge rounding.
- UI tests cover recovering from an oversized import by rotating it, clearing
  readiness, disabling stale export/start after invalid placement, resetting new
  imports, disabling rotation during plotting/pause/recovery and for guides,
  and rotating postcard text with its stock dimensions.
- The manual layered SVG browser fixture now includes rotated occlusion checks.
  Its file-URL launch was blocked by browser policy in this session, so that
  fixture has not been counted as an executed test.

No physical plotting or paper-registration test is claimed for this change.
The existing physical trial remains applicable.

## Mac build and observed interface

The Apple silicon application built successfully. Its packaged-resource smoke
test, ad-hoc signature verification and ZIP integrity check passed. Version
1.3.2 was installed in Applications and reopened successfully.

The native window showed the new rotation menu and button. A subsequent
read-only observation showed the user's ASCII City SVG loaded at 270° clockwise,
with 241,357 checked commands and fitted drawing bounds of 130.4 × 257.0 mm.
This verifies the installed interface and preview/job conversion route; it does
not establish physical plotting accuracy.
