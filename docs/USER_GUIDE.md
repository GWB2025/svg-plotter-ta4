# SVG Plotter for Writing Robot T-A4

Local Mac interface: load an SVG, inspect its pen-path preview, then send it
over USB using the previously verified Handwriting Studio sender.

Double-click **Start-SVG-Plotter.command**. The window opens at
http://127.0.0.1:8769/. The launcher can reuse the Python environment on the
EXTRA Apps drive. Opening the app or loading a drawing does not connect to USB.

1. Choose an SVG, or select a built-in **Test drawing** and press **Load test SVG**. Its paths appear on the A4 preview. Test drawings load at original size; choosing one does not connect or start the robot.
2. Choose **Fit drawing to A4**, with adjustable margins, or **Keep original
   size and position**. Placement changes update the preview and clear readiness.
3. Connect the T-A4 by USB, refresh connections and choose **Connect**.
4. Clear the bed for homing, choose **Home**, then secure paper and prepare the pen.
5. Check the readiness box and choose **Start drawing**.
6. Use Pause / Continue / Cancel as required. Keep the Mac awake.

**Save G-code** is optional; printing does not require a manual export step.
The preview is reconstructed from the exact validated G-code loaded by the sender.
The progress bar reports acknowledged commands; completion waits for controller Idle.

## SVG scope

Supports paths (including curves and separate subpaths), groups with affine
transforms, lines, rectangles, circles, ellipses, polylines and polygons.
Coordinates use SVG page dimensions and viewBox scaling. Unitless SVG dimensions
are interpreted as CSS pixels at 96 pixels per inch.

All visible geometry is plotted as outlines, including filled-only shapes.
Solid fills are not shaded. Convert text and clones to paths before import.
Images, CSS stylesheets, nested SVG viewports, clipping, masks, markers and effects
are rejected rather than approximated. Hidden shapes are omitted.
Curves are sampled into line segments. SVG limit: 8 MB and 250,000 sampled points.

Verified machine profile: A4 portrait, home top-left, +X right, negative Y down,
pen up Z0.5, down Z5, 115200 baud, DTR/RTS false. Drawing speed is 900 mm/min;
travel is 2400 mm/min. These are intentionally fixed to the tested sender profile.
Only matching USB devices are offered; one sender owns the connection at a time.
Do not run another plotting application against the same robot.

## First-time setup if the existing environment is unavailable

In Terminal, from this directory:

```sh
python3 -m venv .venv
.venv/bin/python -m pip install -r requirements.txt
```

Then use the launcher. On this Mac, the sender also recognises the existing
Inkscape extension's pyserial installation.

## Validation

```sh
node --test tests/conversion.cjs
.venv/bin/python -m unittest discover -s tests -v
```

The 13 inherited sender tests use a simulated controller, never real USB.
Additional tests cover placement, generated G-code and its server validation.
`tests/browser.html` contains native SVG geometry checks for manual browser testing.
Browser checks and a physical trial were not completed in the creation session:
its sandbox blocked local server access. Treat this as a first version pending
those checks; begin with a small simple drawing and inspect the preview.

Sender code is reused under the included MIT licence from Gordon Brindle's
Handwriting Studio. The original installation and Dan's course repository remain
unchanged.

## Built-in test drawings

Small star, geometry check, curves and separate strokes, a square grid, and coloured shapes (red, blue, green and purple).
Use **Save test SVG** to download the selected original. Copies are also in
`examples/`. Refresh the browser window after updating the app.

## Colour plotting

The preview preserves the colours of SVG outlines. Paths are grouped by pen
colour in order of first appearance. Placement is calculated once for the entire
SVG, so colours stay aligned. Solid fills still produce outlines only.

Choose Start drawing. For an SVG drawing, the robot remains
at the top-left position with the pen raised and asks for the first colour.
Fit that pen, tick its readiness box and choose Continue. After drawing each
colour, it lifts the pen, returns to X0 Y0 and waits for confirmed controller
Idle before requesting the next pen. It never runs the homing cycle between
colours, so the paper registration is preserved. Keep the paper fixed and fit
replacement pens at the same tip height.

The coloured example uses red, blue, green and purple, in that order.
Pause/Continue still control movement within a colour. Cancel also works while
waiting for a pen. No next-colour motion is queued until confirmation.

Colour-change G-code downloads contain `; PEN_CHANGE #rrggbb` markers. These
pauses are enforced by this app; a generic G-code sender may ignore the comments
and draw everything without stopping. Reload colour jobs into this app.

The colour edition opens at http://127.0.0.1:8769/. Disconnect the robot from
the older window before connecting here. Run `python3 launch.py` again to open
this edition; refreshing an older sender alone does not upgrade its Python code.

## Your Pigma Micron pens

The inventory includes your nine coloured Micron 05 pens and ten black sizes.
After loading a drawing, choose a physical pen for each pass under **Pens for
this drawing**. Known colours, including the Kyoto postcard, select matching
Micron 05 pens automatically. Other colours remain unspecified until assigned.
Use the selectors to choose any black size, from 003 to 12. These are pen size
labels, not millimetres. Preview colours approximate ink; assigning another
pen does not change the drawing geometry or hatch spacing.

At each parked pen change, the message and confirmation identify the colour,
size and complete reference, for example **Pigma Micron Orange 05 — 85511 35781**.
Saved G-code retains the pen choice when reloaded in this updated app.
Selections cannot be changed during a job. Restart the sender after updating,
when no drawing is running, then reload the drawing.

References are recorded as supplied: 85511 30644 appears for both Purple 05
and Black 05; they remain separate entries.

## Colour themes

Open the **Colour themes** tab to browse nine Studio Yorktown palettes, their
original swatches, matching owned Micron pens and adaptation notes. Use **Apply to drawing** to recolour the loaded paths and update their physical
pen assignments. The last original colour group uses the darkest theme pen,
with earlier groups assigned accent pens. No geometry or hatching is changed.
**Restore original colours** returns to the loaded colours, even after
trying several themes. Applying a theme clears readiness and is disabled
during a plot. Save G-code to retain the chosen theme.
Use **Plot drawing** to return to the preview and per-pass pen selectors.


## Recovering an interrupted plot

Progress is saved in `logs/plotter-state.json`, with the exact validated drawing in
`logs/plotter-job.json`. Keep both files together. These local files are ignored by Git
and are not uploaded to GitHub. The saved state includes command acknowledgements,
the command being transmitted, USB device identity and confirmed pen changes.
Acknowledgement means the controller accepted a command, not that it finished moving.
The sender records transmission uncertainty before writing to USB and checks the
controller position before deciding where to resume.

After a cable drop, automatic recovery still tries three times. If those attempts
fail, leave the plotter powered and the paper and pen untouched. Reconnect the cable,
then tick the unchanged-setup confirmation and choose **Resume saved plot**. The same
control is available after restarting the updated sender: it restores the drawing
without connecting or moving automatically. Keep the pen that was fitted when the
plot stopped; subsequent colour changes still require confirmation.

Resume never homes or starts the drawing again. A held controller may first finish
movement already in its queue after you confirm Resume. The app proceeds only when
the reported position identifies one command boundary amongst the last acknowledged
and pending commands. A reset, partial transmission, ambiguous endpoint or mismatched
position can block recovery. It cannot guarantee recovery from every interruption,
including power loss, lost steps or manually moved hardware. Do not claim unchanged
setup if the plotter has been reset, homed or moved.

**Discard saved recovery** abandons the resume record without moving or stopping the
machine. Check the plotter locally before doing so; use Home before a new drawing.
Changing the drawing, placement, pens or theme is blocked while saved recovery is
retained. A saved record from an older version contains too little information to
retroactively recover an interrupted drawing.

Install this update only when the current sender is idle. Keep existing `logs/`
files; stop the old server with Control-C and launch the updated copy. A browser
refresh alone cannot update the Python sender. Hardware recovery has been tested
with a simulated controller; a physical cable-disconnection trial is still needed.
