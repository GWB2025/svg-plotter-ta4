# SVG Plotter 1.7.1 — Latin macrons

Validated on 31 October 2026. This is a pre-release.

## Change

All four bundled Hershey fonts now include Ā Ē Ī Ō Ū Ȳ ā ē ī ō ū ȳ.
Each added glyph retains its base letter's advance and pen strokes, with one
separate horizontal macron. Lowercase ī uses the font's existing dotless ı.
The original 824 glyphs are unchanged; 48 glyphs are added. The font builder
recreates the additions. No runtime dependency, saved-data schema or sender
command changes are involved.

## Completed checks

- 135 Python tests passed, including font regeneration, preserved base glyphs,
  dotless ī, postcard persistence/API and generated paths parsed into G-code.
- 90 JavaScript tests passed, including the exact phrase Rōmānī īte domum in
  every bundled font, both message and address blocks, identical NFC/NFD paths,
  path-only SVG export, clipping and line-overlap checks.
- The new font and postcard tests failed before the font additions and passed
  afterwards.
- Rendered SVG paths inspected for the phrase and uppercase/lowercase macrons
  in all four fonts using the local SVG renderer.
- Existing UI and text-import regression checks passed. Fixed-width text can
  use the new precomposed glyphs; combining-input support described here is
  specific to the postcard editor's existing NFC normalisation.

## Limits

No physical plotter was connected or moved for these checks. The installed app
has not been replaced. End-to-end installation, native-window interaction and
physical pen registration remain unverified. Imported TrueType fonts retain
their own character coverage; this addition applies to the bundled fonts.
