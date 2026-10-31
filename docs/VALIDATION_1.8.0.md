# SVG Plotter 1.8.0 — fonts and sizes in Text & ASCII art

Validated on 31 October 2026. This is a pre-release.

## Change

Text & ASCII art can choose all four bundled font styles and saved imported
TrueType faces. Imports made in either text editor appear in both without
changing text, selected fonts or postcard history. Bold/italic variants are
selected by importing the actual font files; variable fonts use the default face.

The original fit-to-spacing mode remains the default. Point-size mode supports
6–72 pt, keeps letter proportions and calculates automatic fixed grid spacing.
Manual spacing is checked against the full font bounds, including accents and
descenders. Each character occupies a fixed column; NFC accents and supplementary
Unicode characters count correctly before tabs. Exported SVG contains pen paths.
No new dependencies, saved-data schemas or sender commands are introduced.

## Completed checks

- 136 Python tests and 105 JavaScript tests passed.
- New tests failed before implementation and passed afterwards.
- Point sizing, exact grid offsets, closed outlines, automatic spacing, manual
  clipping errors, accents, Unicode column counting and path-only export tested.
- Shared font loading, authenticated import, rejected batches, subsequent retries
  and damaged-library fallback tested.
- Both editors exercised with a simulated DOM: font selection, size controls,
  disabled actions, shared imports, retained text, font choices and postcard
  history; preparing remains an explicit action.
- Saved imported fonts round-trip through the existing font library and text
  paths round-trip through the G-code parser.
- The actual Cinzel Regular font was checked at 6, 12, 24 and 72 pt with upper-
  and lowercase macrons, page placement and G-code validation. Its rendered
  12 pt pen paths were visually inspected. The font is not bundled with the app.
- Existing sender, recovery, SVG, postcard/message, catalogue and other
  regression checks passed.
- The Apple silicon installer passed its package and ad-hoc signature checks;
  all 347 payload files matched the built app and its packaged smoke test passed.
  The bundle reports version 1.8.0 and requires macOS 15.0 or later.
  The seven changed JavaScript, CSS and HTML resources checked after packaging
  matched their source files.

## Limits and operation

No physical plotter was moved. Native-window interaction and end-to-end
installation/upgrade remain unverified. Bundle resource, signature and package
payload checks are recorded separately in the installer's VALIDATION.json.

Font size is measured before page fitting; Fit drawing to page changes it.
Keep original size and position retains the chosen size if it fits the bed.
Text files contain characters only. SVG export preserves paths and dimensions;
ASCII font/layout controls reset on reopening, while imported fonts persist.
Detailed fonts still have the existing 240,000-point drawing limit. One page
is supported; long text is not automatically paginated.
