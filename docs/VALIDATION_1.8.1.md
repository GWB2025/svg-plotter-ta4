# SVG Plotter 1.8.1 — Clear text controls

Validated on 31 October 2026. This is a pre-release.

## Change

Clear text buttons appear directly below the Text & ASCII art editor, postcard
message and postal address. Each clears its own text and updates the preview
immediately, retaining font and layout settings. Empty fields disable their
button. Keyboard focus returns to the cleared field.

Postcard clearing participates in the existing Undo/Redo history and remains an
unsaved draft change until Save draft is chosen. ASCII Undo clear restores the
cleared text and its filename until new text is entered or another file opened.
Pending ASCII file reads are invalidated so they cannot refill a cleared field.
The controls are disabled during preparation; editing a draft during an active
drawing retains the existing preparation lock and does not change that drawing.
No saved-data schemas, dependencies or sender commands change.

## Completed checks

- 136 Python tests and 109 JavaScript tests passed.
- Four new UI behaviour tests failed before implementation, then passed.
- Simulated DOM checks cover independent clearing, preserved settings and the
  other postcard field, immediate preview updates, disabled empty actions,
  focus, postcard Undo/Redo, ASCII Undo clear, retained saved-draft state,
  cancellation of pending file reads and preparation guards.
- Existing font, text, postcard, SVG, sender, recovery and installer policy
  regression checks passed.

## Limits

Native-window interaction, installation/upgrade and physical plotting remain
unverified. Package payload, signature and bundled-resource checks are recorded
in the installer's VALIDATION.json. Clearing does not erase original text files
or automatically save a cleared postcard. ASCII undo and postcard history are
session-only. Source documentation may be updated after a package is built;
the package validation describes the bundled version.
