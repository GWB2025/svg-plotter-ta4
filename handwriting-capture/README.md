# Handwriting Capture — Version 1.2

A small local app for capturing ordered handwriting strokes and exporting centre-line SVGs for the 2D Pen Plotter. Uses Python 3.10+ and Flask; the browser UI has no dependencies, build step, CDN or cloud connection.

## Run on this Mac

Open Terminal and run:

```bash
cd handwriting-capture
python3 -m venv .venv
.venv/bin/python -m pip install -r requirements.txt
.venv/bin/python app.py
```

Open **http://127.0.0.1:8765** in Safari. Stop with Control-C. Once setup is complete, only the last command is needed. Data survives server restarts.

## Use an iPad and Apple Pencil

1. Connect the Mac and iPad to the same trusted Wi-Fi network.
2. Start the server with `.venv/bin/python app.py --host 0.0.0.0`.
3. Find the Mac's Wi-Fi IP address in System Settings → Wi-Fi → Details → TCP/IP.
4. On the iPad, open `http://YOUR-MAC-IP:8765` in Safari. Use `http`, not `https`. Allow incoming Python connections if macOS asks; keep the Mac awake.

The default listens only on this Mac. The Wi-Fi option exposes this unauthenticated app to devices on that network: use it on your private LAN and do not forward the port to the internet. No automatic `plotter.local` hostname is configured. Guest Wi-Fi device isolation or the Mac firewall can block access.

## Capture and compose

- **Practise:** draw an `a` against the guides; these marks are never sent to the server.
- **Palm protection:** press **Lock page for writing** on either drawing page. This fits the pad and controls into the screen and blocks page scrolling, pinch zoom and bounce until you press **Unlock page** (or Escape). Leave finger drawing off for Pencil-only marks. Deliberate button taps still work; browser/OS edge gestures cannot be disabled by the app.
- **Capture:** choose Lowercase, Capitals, Numbers or Punctuation, select a character, draw, then press **Save**. Mouse works for desktop testing. Finger drawing is off by default to reduce palm marks; enable it explicitly if needed. Pencil/pen detection means the browser reported `pointerType: pen`, not verified Apple hardware.
- The baseline is the lower guide; x-height is the upper guide. Keep b/d ascenders above the upper guide.
- Undo removes the last unsaved stroke. Clear clears the current unsaved drawing. Switching letters retains drafts until reload; only Save persists them. Browser reload warnings are best-effort, particularly on iPad: save before leaving.
- Saving adds a new sample; it never replaces earlier raw samples. The counts show saved samples. Practice and capture are separate.
- **Compose:** enter captured characters, spaces and line breaks (up to 120 characters), then Generate preview. Try `abcde bad cab`. Missing or unsupported letters produce a clear error.
- Download SVG saves through the browser. Preview and export use the same SVG. The newest saved sample for each character is used deterministically.

## Files and data

```text
app.py              Flask server, validation, persistence and SVG compositor
static/             HTML, CSS, Pointer Events capture
requirements.txt    One direct dependency: Flask
tests/test_app.py   Backend validation and fidelity tests
data/raw/          Append-only original samples (one UUID JSON file per save)
data/processed/    Separate identity copies; future processing belongs here
```

`data/` is created at startup beside `app.py`, independently of the working directory. Set `HANDWRITING_DATA_DIR` to use another location. Back up the whole data directory. There is one shared local handwriting collection, without writer profiles or authentication.

Each JSON sample has a schema version, UUID, character, UTC save time, coordinate metadata, and ordered strokes. Each stroke contains its pointer type and ordered points with `x`, `y`, `timestamp`, `pressure`, `tiltX`, `tiltY`, `twist`, `altitudeAngle`, and `azimuthAngle` where available (otherwise null). Browser-reported defaults are retained; zero does not prove a sensor is present.

Coordinates are mapped from the displayed canvas into a fixed **400 × 300 capture space**, with y increasing downwards, baseline 220 and x-height guide 120. This mapping happens at acquisition; raw points receive no smoothing, resampling or reordering. Timestamps are milliseconds relative to the first point in the sample and retain gaps between strokes. Coalesced Pointer Events are used when available. Pointer cancellation discards the interrupted stroke; completed strokes remain. The fixed aspect ratio preserves geometry across display sizes and orientations.

Processed copies initially contain identical strokes and `processing: identity-v1`. Raw files are never overwritten by application operations. Writes use temporary files and atomic replacement. Raw and processed writes are separate: if disk failure interrupts the second write, the raw sample remains recoverable. There is no automatic recovery tool yet.

SVG layout trims horizontal blank margins, keeps the common baseline, adds 3 mm between glyphs and 8 mm for spaces, and advances 35 mm for explicit newlines. One capture unit maps to 0.1 mm, so guide x-height is 10 mm. Each stroke is one independent open path, in captured order and direction. Single-point strokes are represented by zero-length paths; some plotter importers may skip these dots. SVG dimensions grow with the phrase; check physical size and plotter bed limits before plotting. No automatic wrapping, smoothing, cursive joining, random variants, font generation or direct machine control is included.

## Verify

```bash
.venv/bin/python -m unittest discover -s tests -v
```

Tests use temporary data and cover save/reload, raw/processed separation, retained variants, malformed input, missing glyphs, ordering, SVG paths and scaling. To check actual Pencil hardware, practise, capture a–e, compose, download, restart the server and confirm saved counts return. Actual iPad/Pencil sensor behavior requires testing on that device.

## Version 1.1 — sample review

Use **Review samples** to inspect saved drawings, enable/exclude them, set size (50–150%), and shift the baseline (-3 to +3 mm; positive moves down). Uniform scaling preserves each sample's lowest ink point. Press **Save adjustments**, then regenerate the preview. Settings live separately in `data/review.json`; original raw and processed points stay intact.

The newest sample is enabled by default; earlier samples require explicit selection. **Vary enabled samples** chooses randomly without repeating the previous sample for that letter when alternatives exist. Preview and download use the same generated SVG. Version 1.1 captured a–e; version 1.2 adds the complete character groups. Interpolation/blending is not implemented yet.


## Automatic baseline alignment

Review and composition now place the lowest ink point of each a–e sample at the common baseline (capture y=220), regardless of where it was drawn. Size is preserved, with any saved size adjustment applied first. Manual baseline shift is applied after automatic alignment; set it to 0 for exact alignment. Existing offsets are retained. Raw and processed source files are unchanged. Re-generate previews and exports to use the new alignment. Version 1.2 retains this rule for lowercase letters without descenders and numbers. Capitals, f/g/j/p/q/y and punctuation instead retain their position relative to the drawn baseline, so tails stay below it and apostrophes stay above it.

## Version 1.2 — complete character groups

Capture all 26 lowercase letters, 26 capitals, ten digits and 19 punctuation
characters. Choose a group above the pad or review. Auto-next advances inside
that group, stopping at its end. Existing samples, review settings and raw
stroke order are preserved; there is no migration or deletion of handwriting.

The four guides mark cap height, x-height, baseline and descender depth. Write
capitals, descenders and punctuation in their intended vertical positions.
Uniform size adjustment scales around the baseline. Review and exported SVGs
use the same alignment rules. Use the baseline shift for misplaced samples.
No cursive joining or interpolation is included. Dot-only strokes remain
zero-length paths and may be skipped by some plotters.

The catalogue is in `static/characters.json`. Tests include every supported
character, case-sensitive missing characters, descenders, punctuation, scaling,
legacy a–e samples and Pointer Events recovery. Run `node --test tests/*.cjs`
as well as the Python checks.

Personal handwriting is stored in `data/`, excluded from Git and release files.
When updating an existing installation, replace the application code only;
retain `data/` and use the same `HANDWRITING_DATA_DIR` if configured.
