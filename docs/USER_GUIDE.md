# SVG Plotter user guide

For **version 1.8.0**, including the Mac installer. Load SVG artwork or plain
text, inspect the pen-path preview, then plot using a compatible GRBL Z-lift
profile or export prepared SVG for the machine's own software. The supplied
Writing Robot T-A4 profile is the default.

## Install and open the Mac app

The supplied Apple silicon build requires macOS 15 or later. Python and its
dependencies are included; no Terminal setup is needed.

1. Finish or cancel any active drawing, save unsaved edits and quit SVG Plotter.
   A paused drawing is still active. Stop any source-based sender as well.
2. Extract the **Installer ZIP**, open the included `.pkg`, then choose
   **Continue → Install**. Enter your administrator password if requested.
3. Open **Finder → Applications → SVG Plotter**. The title and About panel
   should show **1.8.0**.

The installer upgrades `/Applications/SVG Plotter.app` without writing to your
saved settings. For an application ZIP or DMG, copy the app to Applications
after quitting the old version. The installer is unsigned and the app is ad-hoc
signed; neither is Apple-notarised. If macOS blocks your trusted download,
try opening it, then use **System Settings → Privacy & Security → Open Anyway**.
See [Apple's guidance](https://support.apple.com/en-gb/102445).

GitHub's **Code → Download ZIP** contains source, not an installed app. See the
[README](../README.md#install-the-mac-application-recommended) for download
status and the [Mac build guide](MAC_RELEASE.md) to build a package yourself.
Source users follow [the setup below](#launching-from-source).

## First drawing

Opening the app or loading a drawing does not connect to USB or move the pen.

1. Choose an SVG, or select a built-in **Test drawing** and press **Load test SVG**. Its paths appear on the A4 preview. Test drawings load at original size; choosing one does not connect or start the robot.
2. Choose **Fit drawing to page**, with adjustable margins, or **Keep original
   size and position**. Placement changes update the preview and clear readiness.
3. Select **Your plotter** before connecting. For the T-A4, keep its supplied
   profile, attach USB, refresh connections and choose **Connect**. Other
   profiles have [specific requirements](#plotter-profiles-version-170).
4. Clear the bed for homing, choose **Home**, then secure paper and prepare the pen.
5. Check the readiness box and choose **Start drawing**.
6. Use Pause / Continue / Cancel as required. Keep the Mac awake.

**Save G-code** is optional; printing does not require a manual export step.
The preview is reconstructed from the exact validated G-code loaded by the sender.
The progress bar reports acknowledged commands; completion waits for controller Idle.

## Plotter profiles (version 1.7.0)

In **Plot drawing → Your plotter**, choose **Add plotter**, enter a name,
make/model and usable bed dimensions, then **Save and select plotter**. Select
an existing machine from the menu, or use **Duplicate**, **Edit** and **Remove**.
The supplied T-A4 profile is protected; duplicate it to adjust its settings.
Names alone do not establish compatibility with the direct sender.

- **USB · GRBL with Z-axis pen lift** supports configurable bed size (up to
  2,000 mm per side), X/Y direction, pen-up/down Z, drawing/travel/lift speeds,
  baud rate, USB vendor/product filters and controller greeting. Use measured
  or manufacturer-documented values. It requires millimetre MPos/WCO reports,
  homing enabled, top-left home X0 Y0 and zero work offsets. Saving a profile
  does not change firmware settings. It does not support spindle/servo pen
  commands or non-GRBL protocols. Verify a new machine with the pen clear first.
- **SVG export · use the plotter’s own software** works as an export target for
  other makes and controller types, including EBB, HP-GL and servo-controlled
  devices. It does not enable direct USB control for those protocols. Prepare
  the artwork normally, then choose **Save prepared SVG** and open the file in
  the manufacturer’s application. Plot at original size. The SVG preserves
  path order and colour; configure pen changes in the target software.

Changing the active profile clears the prepared job and readiness confirmation.
Load the drawing again or choose **Apply placement** for the retained SVG source.
Page presets that exceed the selected bed are unavailable; Custom dimensions,
preview, positioning guides and generated commands use that bed. A3 portrait
and landscape presets are included. Swatch sheets still need a full A4 bed;
postcards keep their exact physical size. Layered fills are limited to a page
area of 250,000 mm²; larger beds can use outline paths.

Profile editing and selection are locked while connected, during operations,
and while saved recovery exists. Every new job stores its exact profile and
G-code carries a profile fingerprint. A different or edited profile rejects
that G-code: reselect the original settings or prepare the source SVG again.
Older unlabelled Studio G-code is accepted only with the original T-A4 profile.
Recovery restores the saved machine settings without connecting on startup.

Profiles are stored in `plotter-profiles.json` beside the personal catalogue,
outside the Mac application bundle. They survive app replacement. Catalogue
exports cover pens, inks and themes; back up the profiles file separately.
If USB vendor/product IDs are blank, the app lists USB serial devices. Select
the correct port. A device without a serial number must retain its original
port for recovery; moving it to another port prevents automatic matching.

The GRBL protocol reference is the project's
[official interface documentation](https://github.com/gnea/grbl/blob/master/doc/markdown/interface.md).
Custom machines have simulated-controller test coverage, not physical validation.

## Text and ASCII art (version 1.6.0)

1. Choose your `.txt` file in **Plot drawing**, or open **Text & ASCII art**
   and choose a file or paste the text.
2. Inspect the pen-path preview. Every character occupies a fixed-width cell;
   spaces and blank lines are retained and long lines never wrap. Tabs advance
   to the next tab stop (8 columns by default). Choose the lettering in **Font / style**.
3. Edit the text and adjust **Column spacing**, **Row spacing** and **Tab width**
   if needed. The complete file is included, including signatures and website
   footers; delete only the lines you do not want to plot.
4. Choose **Prepare to plot**. The app switches to **Plot drawing**, fits the
   strokes to its selected page and margin, and clears the readiness checkbox.
   Adjust rotation or placement, choose a physical pen and use the normal
   connect/home/readiness/start sequence. Preparing never moves the plotter.

Spacing is measured in millimetres before page fitting. **Keep original size
and position** retains those dimensions from the page's top-left; fitting scales
both axes equally, including the chosen font size. The source text area stays
monospaced for editing; the pen-path preview shows the selected font. Outline
fonts trace letter boundaries, while bundled stroke fonts follow pen strokes.
A detailed ASCII picture can take some time to plot.

**Save text** downloads the edited `.txt`; save it before closing the app if
you want to keep your edits. **Export SVG** saves the complete path drawing at
its original size without fonts. **Save G-code** in Plot drawing saves the fitted,
checked commands and assigned pen. Editing text after preparation does not
change the loaded drawing until you prepare it again.

Plain text supports UTF-8 and BOM-marked UTF-16, Windows/Mac/Unix line endings,
and the characters available in the selected font. Combining Latin accents
are normalised so, for example, ō and o followed by a combining macron use one
column and produce the same paths. Missing characters
are reported; no replacement glyphs or omitted characters are silently plotted.
Limits are 50,000 input characters, 2,000 columns, 1,000 rows and 240,000 path
points. Large drawings must fit onto one selected page; there is no pagination.
The dedicated text picker accepts up to 2 MB. Existing Studio G-code `.txt`
files still load through Plot drawing, with the original command validation.

### Font, style and size (version 1.8.0)

- **Font / style** offers Hershey Sans, Serif, Serif Italic and Script, plus all
  previously imported fonts, including those imported in Postcard text.
- **Import fonts…** accepts `.ttf` files up to 2 MB each. Imports immediately
  appear in both text editors and persist across restarts. Import the actual
  bold, italic or other variant file to choose that style; the app does not
  synthesise missing font styles. Variable fonts use their default face.
- **Letter sizing → Fit to spacing** retains the original ASCII behaviour:
  letters scale to the row/column dimensions and may change proportions.
- **Letter sizing → Font size (points)** enables **Font size (pt)**, from 6 to
  72 pt. One point is 25.4/72 mm of the em square, not the capital-letter height.
  Letter proportions are preserved. **Automatic spacing** calculates fixed
  cells from the font's full ink bounds, leaving room for accents and descenders.
- Untick **Automatic spacing** to adjust row/column gaps manually. If the cells
  are too small, the app explains the minimum spacing and blocks export and
  preparation until corrected. Fonts with unusually wide/tall glyphs may need
  a smaller size to stay within the 40 mm column / 60 mm row limits.

Every character still occupies exactly one grid column, even in a proportional
font such as Cinzel. There is no word wrapping or proportional typesetting in
this editor. **Fit drawing to page** later scales font size along with the
whole drawing; select **Keep original size and position** to retain the size
chosen here, provided it fits the selected page. **Save text** stores only the
characters. **Export SVG** retains the letter paths, size and spacing; the font
and layout controls themselves reset when the app is reopened.

For Roman lettering, choose an imported **Cinzel Regular · outline**, select
**Font size (points)**, leave automatic spacing on and paste **RŌMĀNĪ ĪTE DOMUM**.

## Rotating landscape artwork (version 1.3.2)

1. Load the SVG and select the physical sheet size, normally **A4 · 210 × 297 mm**.
2. Choose **Rotate 90° clockwise**. The artwork turns sideways on the portrait
   bed, and the preview and G-code update together.
3. Use **Keep original size and position** for 1:1 plotting. A landscape SVG
   page of 297 × 210 mm becomes 210 × 297 mm with its margins rotated intact.
   Alternatively, use **Fit drawing to page** to scale the rotated drawing
   within the selected margins.
4. Review the preview and pen assignments before confirming readiness.

Each click adds another 90°. Four clicks return to the original orientation;
the **SVG rotation** menu also selects 0°, 90°, 180° or 270° directly. Rotation
always starts from the original SVG, so repeated changes do not accumulate
resizing errors. A newly loaded file starts at 0°. If actual-size artwork does
not fit, rotation remains available so it can be turned to fit.

Layered colour fills are rotated before hatching; spacing stays in physical
millimetres and overlaid white areas still hide underlying colours. Prepared
postcard text also rotates at exact size, swapping the stock dimensions between
148 × 105 and 105 × 148 mm. Positioning guides remain unrotated: generate them
for the physical stock dimensions shown in the controls.

Rotation needs the original SVG. A G-code file or a recovered plot has already
fixed its coordinates; load the SVG again to create a newly rotated drawing.
Rotation is locked while drawing or when saved recovery is present. Changing
rotation clears readiness and does not move the plotter.

## Pen colour swatches (version 1.4.0)

1. Open **Pen stock → Pen colour swatches**. Select **Sharpie Glam Pop · 24**
   (or another pen set) and **All available pens in this set**, or choose one pen.
   Each stock row also has a **Swatch** button for that pen.
2. Start with **20 mm** square patches and **0.3 mm** line spacing for Sharpies.
   The 24-pen set fits on one A4 portrait sheet. Larger patches or collections
   create additional sheets; select the sheet to prepare.
3. Choose **Prepare swatch sheet** to open the exact-size paths in Plot drawing.
   Review the pen list and estimate, then connect, home and start as usual.
   The plotter waits at home for each named physical pen. Fit it, confirm readiness
   and choose Continue. Each sheet is a separate job and needs fresh paper.
4. Let the patches dry fully. Scan each patch with ColorReader EZ using the
   Datacolor mobile app. Choose the measured reading's **Info** to see RGB/HEX.
5. Return to the matching numbered patch in Pen stock and choose **Enter RGB**.
   Enter the three 0–255 values, or paste its six-digit HEX code, and **Save pen**.
   Those fields stay synchronised and update the pen's existing ink value.

The filled square is kept clear of text. The number, colour, pen size and product
reference appear below it in the same pen. Pale labels may be difficult to read;
the on-screen numbered key gives the full pen identity. The paper colour, ink,
fill spacing and number of passes all influence the measurement. Use the same
paper as your eventual drawing. These are plotter-made samples of the actual
pens, not colour patches reproduced by an inkjet or laser printer.

Choose line spacing no greater than the actual drawn line width, inspecting the
first patch for gaps or streaks. Spacing ranges from 0.02 to 1 mm; narrow pens
need much closer spacing and take longer. **Add perpendicular cross-hatching**
applies a second fill pass, which may make the sample darker. Do not scan wet ink.
The screen preview uses the stored catalogue colours until you enter readings.

The 2025 Datacolor guide lists a **4 mm aperture**. Datacolor recommends a flat,
smooth, uniform area at least **6.35 × 6.35 mm**, with the reader held flush to
the surface. The 20 mm default leaves room to centre it away from labels/edges.
Calibrate in the Datacolor app before the session. Scan the patches individually;
SVG Plotter does not connect to the reader by Bluetooth or import its readings
automatically.

Unavailable pens are omitted from set sheets. To sample one, first mark it
available. Separate pens with identical stored colours still have separate
patches and pen-change stops. Swatch jobs lock scaling, rotation, themes and
pen reassignment so labels stay associated with the intended pen. To change a
sheet, change its settings in Pen stock and prepare it again. **Save swatch
G-code** retains the pen identities for later use in this app.

Changing settings only updates the swatch preview. Preparing a sheet is blocked
while plotting or while saved recovery is present. Saving measured ink changes
future catalogue assignments; loaded drawings retain their original snapshots.

Sources: [Datacolor ColorReader EZ user guide, Rev B, May 2025](https://www.datacolor.com/colorreader/docs/ColorReaderEZ-UserGuide-EN.pdf)
and [Datacolor surface/area guidance](https://colorreader-support.datacolor.com/hc/en-us/articles/4405708551954-What-things-can-I-measure-with-ColorReader-ColorReader-EZ-ColorReader-PRO).

## SVG scope

Supports paths (including curves and separate subpaths), groups with affine
transforms, lines, rectangles, circles, ellipses, polylines and polygons.
Coordinates use SVG page dimensions and viewBox scaling. Unitless SVG dimensions
are interpreted as CSS pixels at 96 pixels per inch.

In **Outline paths** mode, visible geometry is plotted as outlines, including
filled-only shapes. Choose **Layered colour fills** for hatched solid artwork;
see [layered artwork](#layered-svg-artwork). Convert SVG text and clones to paths
before import. The Text & ASCII art and Postcard text editors create paths.
Images, CSS stylesheets, nested SVG viewports, clipping, masks, markers and effects
are rejected rather than approximated. Hidden shapes are omitted.
Curves are sampled into line segments. SVG limit: 8 MB and 250,000 sampled points.

The supplied T-A4 profile uses A4 portrait, home top-left, +X right, negative Y down,
pen up Z0.5, down Z5, 115200 baud, DTR/RTS false. Drawing speed is 900 mm/min;
travel is 2400 mm/min. Keep these settings for the original machine. Other
machines use saved profiles; their bed, directions, pen heights, speeds and
USB filtering are configurable. Only one sender owns the connection at a time.
Do not run another plotting application against the same robot. Physical
validation of the current release remains outstanding.

### Layered SVG artwork

Choose **Layered colour fills** under SVG treatment for opaque, solid-colour
artwork. Shapes are composited in SVG paint order before hatching, so hidden
areas are not drawn. White and very pale regions (all RGB channels at least 235
by default) remain bare paper while still covering lower shapes. Untick the
bare-paper option when using a pale pen.

Hatch spacing is measured after page placement and ranges from 0.2 to 3 mm,
with 0.5 mm as the default. The artwork is sampled on a 0.1 mm grid, so fine
detail may disappear. Fills and visible strokes are hatched; use **Outline
paths** for single-line or already-hatched drawings. The separate pen-swatch
tool supports its own finer spacing range.

Supported artwork includes solid opaque fills/strokes, transformed groups and
compound paths with holes. Transparency, blending, gradients, masks, clipping,
linked content and SVG text require conversion in an SVG editor. Layered pages
are limited to 250,000 mm²; large beds can still use outline paths. Review the
generated preview and pen assignments before starting.

## Launching from source

Use Python 3.10 or newer. In Terminal, from the repository root:

```sh
python3 -m venv .venv
.venv/bin/python -m pip install -r requirements.txt
.venv/bin/python launch.py
```

The browser opens at http://127.0.0.1:8769/. On later runs, use the last command
or **Start-SVG-Plotter.command**. The launcher checks `SVG_PLOTTER_PYTHON` if set,
then the repository's `.venv/bin/python`, then its current Python interpreter.
Use an environment with the dependencies above installed. The native app does
not need this environment. Stop the existing sender before changing versions;
a browser refresh alone does not update the Python process.

## Validation

```sh
node --test tests/*.cjs
.venv/bin/python -m unittest discover -s tests -v
```

The automated sender tests use simulated controllers, never real USB. They
cover profiles, placement, generated commands, recovery, text, catalogues and
other features. `tests/browser.html` contains native SVG geometry checks for
manual browser testing. See [1.7.0 validation](VALIDATION_1.7.0.md),
[installer validation](VALIDATION_INSTALLER_1.7.0.md) and the outstanding
[physical trial](PHYSICAL_TRIAL.md). The release remains a pre-release while
interactive and physical checks are outstanding.

Sender code is reused under the included MIT licence from Gordon Brindle's
Handwriting Studio. The original installation and Dan's course repository remain
unchanged.

## Built-in test drawings

Small star, geometry check, curves and separate strokes, a square grid,
coloured shapes (red, blue, green and purple), and a layered-fill check.
Use **Save test SVG** to download the selected original. Copies are also in
`examples/`. Refresh the browser window after updating the app.

## Colour plotting

The preview preserves the colours of SVG outlines. Paths are grouped by pen
colour in order of first appearance. Placement is calculated once for the entire
SVG, so colours stay aligned. Outline mode traces filled shapes as outlines;
Layered colour fills hatches their visible coloured regions.

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

The native app and source launcher use http://127.0.0.1:8769/. Finish any drawing
and quit the old app or stop its sender before opening a different version.
Refreshing an older window alone does not upgrade its Python code.

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

Open **Colour themes** to browse the 15 supplied adaptations: nine based on
Studio Yorktown palettes and six Sharpie Glam Pop combinations. Each shows its
swatches, assigned pens and adaptation notes. Personal themes appear here too.
Use **Apply to drawing** to recolour the loaded paths and update their physical
pen assignments. The last original colour group uses the darkest theme pen,
with earlier groups assigned accent pens. No geometry or hatching is changed.
**Restore original colours** returns to the loaded colours, even after
trying several themes. Applying a theme clears readiness and is disabled
during a plot. Save G-code to retain the chosen theme.
Use **Plot drawing** to return to the preview and per-pass pen selectors.
Large previews are drawn in short batches so you can keep scrolling while a
theme is applied. An updating message remains visible until validation and the
preview are complete. Pen-up travel is prepared only when you enable it. This
display optimisation does not simplify or alter the G-code sent to the plotter.


## Recovering an interrupted plot

The native app saves `plotter-state.json` and the exact validated drawing in
`plotter-job.json` under `~/Library/Application Support/SVG Plotter/`. Source
runs use the repository's `logs/` folder. Keep both files together. These local
files are not uploaded to GitHub. The saved state includes command acknowledgements,
the command being transmitted, USB device identity and confirmed pen changes.
Acknowledgement means the controller accepted a command, not that it finished moving.
The sender records transmission uncertainty before writing to USB and checks the
controller position before deciding where to resume.

After a cable drop, the sender tries three times to reconnect to the same USB
plotter. Leave the paper fixed and keep the saved drawing. There are two recovery
controls:

- **Reconnect and resume** checks the retained controller coordinates and keeps
  the current pen. Use it when the plotter has stayed powered and has not been
  reset, homed or moved. It may first finish movement already queued. It does
  not home or restart completed strokes.
- **Recover after reset** can recover when the controller has lost its origin.
  Review the displayed return coordinate and required pen. Remove the pen, or
  lift its tip clear of the paper, and confirm that the paper and homing path
  are unchanged. **Reconnect, home and restore position** clears the old queue,
  homes the machine and returns to the saved point with the holder raised.
  The app then waits: fit the displayed pen at its original tip height, tick
  the pen confirmation and press **Continue with …** to resume.

Version 1.0.3 records a verified execution checkpoint at each completed stroke,
including its pen and colour-pass confirmations. It waits for the controller to
report Idle at the expected pen-up coordinate before saving that checkpoint.
This prevents acknowledged but unexecuted commands being mistaken for finished
strokes. These stroke boundaries can add a small movement-planning delay.
Reset recovery starts after the last verified stroke; an unfinished stroke may
be traced again. Earlier colour passes are preserved and later pen changes
still require confirmation. Recovery never starts merely by opening the app.

For an older saved job, the app can use a retained position sample if it matches
movement in the current pen pass. It returns to the start of the earliest
matching stroke, explicitly labelled in the recovery panel. This can retrace
nearby strokes. A reset destroys exact physical progress, so this fallback is
not an exact continuation from the point where the pen stopped. If there is no
usable sample or verified checkpoint, reset recovery remains unavailable.
Paper that has shifted, a changed pen-tip height, lost steps or inconsistent
homing can spoil registration; the saved coordinates cannot correct those.

**Discard saved recovery** abandons the saved job without moving or stopping the
machine. Do not discard when installing this update to recover an existing job.
Drawing, placement, pen and theme edits stay locked while recovery is retained.
Cancel remains available while reconnecting, homing, returning and fitting the
recovery pen. It ends the job and clears queued movement.

Install the update while the sender is stopped. Quit the old Mac app, replace
it in Applications and reopen it. Its saved files remain under
`~/Library/Application Support/SVG Plotter/`; source runs use `logs/`. Keep both
`plotter-state.json` and `plotter-job.json`. A browser refresh alone does not
update the sender. Recovery has automated simulated-controller coverage;
physical USB disconnection and repeated-homing tests are still required.


## Park when paused

**Pause** finishes the movement already in the controller's queue, records the
actual stopping position, lifts to the selected profile's pen-up height
(Z0.5 for the supplied T-A4) and parks at X0 Y0. The display says
**Pausing** until the park is verified. This is a controlled return to the top-left;
it does not run another homing cycle or change the drawing registration.

**Continue** checks that the park is unchanged, returns to the saved XY position
with the pen raised, restores its previous up/down height and continues the next
unsent drawing command. Keep the same pen fitted and leave the paper fixed.
Cancel remains available during parking and return. If the connection or sender
fails during this auxiliary movement, the record is retained but automatic
recovery is blocked because the physical resume point is uncertain.

## Expanded pen inventory

The supplied catalogue contains 53 pens: 19 Pigma Microns, 24 Sharpie Glam Pop
Fine Point pens, seven Stabilo Point 88 fine 0.4 mm pens (red 88/40, blue 88/41,
green 88/43, yellow 88/44, orange 88/54, purple 88/55 and pink 88/56), and three
Uni-ball Eye UB-157E 0.7 mm fine pens (black, blue and red). User-added pens and
availability edits change your personal list. Pen labels and saved jobs retain
the brand, size and reference. Changing pens does not adjust hatch spacing,
pen height or machine settings automatically.

## Page sizes

Choose **Page size** for A3, A4, A5, A6, **Postcard (148 × 105 mm, landscape)**,
C5/C6 or DL envelopes. Only presets fitting the active profile's bed are
available. **Custom** enables width and height in millimetres within that bed
(210 × 297 mm for the supplied T-A4). Position the sheet at the top-left home
position. The preview and SVG fitting use the selected sheet; margins must be
less than half its shorter side. Envelope presets use the narrow edge across
the bed. A3 requires a suitably sized custom profile.

### Positioning paper, envelopes and postcards

1. Fix a sacrificial carrier sheet over the plotting area, with its top-left at
   the home position. The carrier must cover the guide marks, including those at
   the stock edges, to protect the base plate from ink.
2. Choose the required **Page size**, or enter a **Custom** width and height.
   Under **Stock positioning guide**, choose **Load positioning guide**.
3. Review the preview and choose a suitable pen. Connect and home as usual,
   confirm that the carrier and pen are ready, then choose **Start drawing**.
   Merely loading or saving a guide does not start movement.
4. The guide plots four L-shaped corner marks, four inward edge-centre ticks
   and a centre cross. It uses one pen pass. All marks remain inside the selected
   stock dimensions and the selected profile's bed; there is no complete border.
5. Leave the carrier fixed. Place the actual stock with its corners aligned to
   the corner marks, then secure it. These marks define the stock edges, not the
   artwork margins. The centre cross will normally be covered by the stock.
6. Keep the same **Page size** and load your artwork. Normal placement and
   treatment controls are restored; choose your artwork margins as usual.

Guides always use exact dimensions, with the top-left at X0 Y0. Fitting, margins,
colour themes and hatching are disabled while a guide is loaded. Changing page
dimensions regenerates the guide. C5, C6 and DL envelopes use their narrow edge
across the bed; the postcard preset is landscape, 148 × 105 mm.

**Save guide SVG** saves the selected size without replacing your drawing.
The seven preset SVGs also live in `examples/guides/`. Opening a saved guide SVG
in the app selects its dimensions and restores exact-size guide mode. In another
application or a print dialogue, use **100% / actual size**, with no fit-to-page
scaling. This establishes stock placement; it does not measure or calibrate the
plotter's physical origin or travel.

## Postcard text (version 1.3.0)

Open **Postcard text** to compose the back of a 148 × 105 mm landscape postcard.
The pale printed-card reference shows a stamp box, divider and four address lines
based on the supplied card image. It is approximate and never exported or plotted;
turn it off for blank cards. The starting address uses X 80 mm, Y 46 mm, a 12 pt
Sans font and 12 mm baseline spacing to sit close to those printed lines. Refine
the placement after a trial on scrap paper. Leave **Draw centre divider line** off
when the card already has a printed divider.
The message occupies the left half and the postal address occupies the right.
Each block has its own controls:

- **Include message/address**: choose both blocks or plot only one.
- **Font**: choose a bundled Hershey stroke font or an imported TrueType outline font. Message and address can use different fonts. The preview shows the actual paths sent to the plotter.
- **Text size (pt)**: font size in points, with 1 pt = 25.4/72 mm of the em square.
  This is not the exact height of a capital letter; letter height varies by font.
- **Line spacing (mm)**: distance between baselines, independent of font size.
- **X / Y**: millimetres from the card's left/top edges. X positions the text box;
  Y positions the top of an ordinary capital letter. Accents can extend above Y.
- **Text box width**: word-wrap width. Keep the message box inside 0–74 mm and
  the address box inside 74–148 mm. Alignment works within that box.
- **Alignment**: left, centre or right. Explicit line breaks and blank lines are
  retained; words wrap automatically, with ordinary spaces between words.

Changes update the preview without loading or moving the plotter. Use **Undo**
and **Redo** to compare recent edits. **Reset positions** restores the starting
X, Y and widths while retaining text, fonts, sizes, spacing and alignment.
**Show layout guides** displays non-plotting box boundaries and a centre guide.
**Draw centre divider line** explicitly adds a single plotted line at X74 mm.

Text overflow, insufficient line spacing and missing glyphs are reported. Text
is never silently truncated or shrunk. Common accented Latin characters, pound
signs and punctuation are supported. Smart apostrophes use the apostrophe glyph;
an ellipsis uses three dots. Unsupported characters must be replaced or rendered
using another font before export or plotting. Long unbroken words are flagged
if they cannot fit; insert a line break or adjust the box/font.

Since version 1.7.1, all four bundled fonts support **Ā Ē Ī Ō Ū Ȳ ā ē ī ō ū ȳ**.
Paste **Rōmānī īte domum** into either text block. The bars (macrons) are plotted
as separate strokes; ī uses a dotless stem. Both precomposed letters and letters
followed by a combining macron produce the same postcard paths. Imported fonts
still depend on their own character coverage. Accents count towards the existing
page-edge and line-overlap checks, so leave room above capitals with macrons.

Choose **Save draft** to retain the editable text and layout in
`~/Library/Application Support/SVG Plotter/postcard.json`. It survives app updates
and restores on reopening. This version retains one saved draft; unsaved changes
last only for the current session. A draft with layout overflow can still be
saved for later editing. Export completed SVGs separately to retain variations.

**Export SVG** produces a path-only SVG at 148 × 105 mm. It needs no font installed
on the receiving computer. **Prepare to plot** loads the current layout into
**Plot drawing** at exact size and switches to that tab. Select the physical pen,
position the postcard at the top-left home origin (using its positioning guide
if desired), connect/home and confirm readiness before starting. The message and
address share one pen pass. No movement starts when preparing a layout.

Prepared text keeps its page size, positions and scale locked. To revise it,
return to **Postcard text**, edit and choose **Prepare to plot** again. Changes
to the draft do not alter the loaded or running drawing. Preparing a replacement
is disabled while a drawing is active or recovery is retained. Opening an
exported postcard SVG also preserves its actual size; loading ordinary artwork
restores the normal placement controls. In another application, use actual-size
placement rather than fit-to-page.

The original Hershey font acknowledgements and redistribution terms are included
in `docs/FONT_LICENCES.txt` and bundled with the app.

## Personal pen stock (version 1.1.0)

Open **Pen stock** and choose **Add pen**. Enter the brand and range, colour,
maker’s tip designation or line width, optional product reference, collection,
and approximate ink swatch. Save to make it available in the drawing’s pen
selectors and the theme editor. These are descriptive details: tip width does
not automatically alter hatch spacing or machine settings.

Use **Edit** to correct a pen or **Duplicate** to create a separate variant.
The availability checkbox records missing or exhausted pens without removing
them. Unavailable pens remain in existing drawings but are excluded from new
suggestions; a theme containing one cannot be applied until a replacement is
assigned or the pen is made available again. Search by brand, colour, reference,
tip size or collection, and filter by availability.

Pen details are captured when a drawing is loaded. Catalogue edits do not
rewrite the current drawing, its pen prompts, or its saved recovery checkpoint.
To use changed details, explicitly reassign a pen or reload the drawing when
idle and no recovery is retained. Older recovery records remain supported.

## Creating and editing colour themes

In **Colour themes**, choose **Create theme**, or use **Edit** or **Duplicate**
on an existing card. Name the theme and assign a pen or **Leave as bare paper**
to each palette row. The digital swatch describes the intended palette colour;
the drawing preview uses the assigned pen’s approximate ink colour.

Original drawing colour groups take the rows in order. Extra groups cycle
through the accent rows. If an **Outline colour** row is selected, the final
original colour group uses that row and earlier groups use the remaining rows.
Use the up/down buttons to reorder rows. Bare-paper groups are omitted from
plotting. A theme needs at least one pen; a palette that would leave the entire
loaded drawing blank cannot be applied. Different pens with an identical ink
swatch cannot be combined in one applied theme because G-code groups paths by
ink colour. Choose one of those pens for that theme.

Supplied themes retain their original accent/darkest-pen behaviour until edited.
Editing one presents its physical drawing pens as editable rows and initially
selects its darkest pen for outlines. Saving a theme does not change the current
drawing. Choose **Apply to drawing**, review the preview and pen order, then
confirm readiness. **Restore original colours** returns to the original paths
and pen assignments, including any groups omitted by a bare-paper row.

## Catalogue backups and sharing

**Export catalogue** saves one JSON backup of all pens, inks, availability and
theme assignments. **Import a backup** previews the item counts before you
choose **Merge into my catalogue**. Existing entries are retained, identical
entries are reused, and conflicting identifiers are copied with fresh identities;
Ink links follow their imported bottles, and theme links follow their imported pens. Invalid imports leave the catalogue
unchanged. Export a backup before moving to another Mac. When sharing G-code
that uses custom pens, share the catalogue backup as well and import it first.

The native Mac app stores the catalogue at:
`~/Library/Application Support/SVG Plotter/catalogue.json`.
Replacing the application preserves this file. The source launcher stores it
in its existing `logs` data directory. If the saved catalogue is damaged, the
app preserves it and disables edits rather than replacing it with defaults.

### Back up the rest of your settings

Catalogue export includes pens, inks and themes only. Before moving to another
Mac, save your draft and finish or cancel active work, then quit the app and
copy `~/Library/Application Support/SVG Plotter/` to a backup. Source users
back up `logs/` instead. Relevant files include:

| File | Contents |
| --- | --- |
| `catalogue.json` | Pens, inks, themes and availability |
| `plotter-profiles.json` | Custom machines and selected profile |
| `postcard.json` | The saved postcard message, address and layout |
| `fonts.json` | Imported fonts and plotting contours |
| `plotter-state.json` and `plotter-job.json` | Recovery state and its drawing; keep together |

Only files for features you have saved may exist. Installing an app update
preserves this folder. Source and native-app data are not migrated
automatically. Recovery files describe the original physical setup: copying
them to another Mac does not establish that its USB port, machine position,
paper or pen height matches. Handle any outstanding recovery in the original
sender before switching installations.

## Tooltips and About

Hover over a control or reach it with the Tab key to see help. Escape dismisses
help or closes an editor. The main tabs support Left/Right, Home and End.
**About** in the header shows the version, supported hardware, features, local
data behaviour, project link, credits and licence information.

### Import your own postcard fonts

The saved font collection is also available in **Text & ASCII art** from version 1.8.0. Imports made in either editor appear in both without replacing the current text or font choices.

On **Postcard text**, click **Import fonts…** and choose one or more `.ttf` files. After the confirmation, select the font in the message or address **Font** menu. Names end in **outline** for imported fonts, and the selected font’s copyright appears below the menu. Importing keeps your current text, font selections and undo history. Duplicate files are skipped. Invalid imports leave the existing library unchanged.

Standard TrueType fonts describe letter outlines: the plotter traces both sides of the ink, rather than a single writing stroke. Original stroke order cannot be recovered from these files. Sizes still use typographic points; capitals and lowercase retain the font’s proportions. Unsupported characters, overflowing text and overlapping lines must be corrected before export or preparing a drawing. Imports support ordinary static TrueType outlines; this is not an OpenType shaping engine for complex scripts or variable-font controls.

Fonts persist on this Mac, separately from drafts and pen-stock backups, in `~/Library/Application Support/SVG Plotter/fonts.json`. Source launches use `logs/fonts.json`. Each record keeps the original TrueType bytes separately from validated plotting contours. They survive replacing the app; keep your original font files as a backup. Imports do not install system fonts or publish them online. There is a limit of 20 fonts, 2 MB per input file, 4,096 characters and 200,000 outline points per font, and 32 MB for the saved library. Missing or damaged font libraries are reported without overwriting saved drafts.

Importing and previewing never connects to or moves the plotter. **Save draft** retains imported-font selections. **Export SVG** freezes the outlines; **Prepare to plot** still uses the existing preview and readiness checks.


## Materials guide (version 1.4.1)

Open **Materials guide** to browse the supplied *Pen Plotter Pens, Inks, and
Papers Comparison*. All 16 entries retain their original material/nib notes,
paper pairings, lightfastness statements, practical considerations and video
timestamps. Search matches every word you enter, across each card; combine it
with Category to show only pens, papers, pencils or engraving tools. Use
**Clear filters** to restore the complete list.

With thanks to **Dan Catt** for [1.3.0 - Pens & Paper | Drawing Machines
101](https://www.youtube.com/watch?v=8bsWp6pKeYk). His [course and supporting
resources](https://penplotter.com/) are linked in the guide. Each card's video
link opens at the timestamp recorded in the supplied document. These notes are
not independent product verification or T-A4 compatibility tests; unreported
properties remain marked **Not in source**. The comparison's wording is retained,
including its terminology for nib and ink types.

The guide is bundled with the app and readable offline. Video links need an
internet connection. Browsing and filtering do not add items to your personal
stock, alter ink readings, change a drawing or issue plotter commands. The
comparison was supplied by Gordon Brindle on 27 October 2026; its underlying
lesson is credited to Dan Catt in the guide and About. This attribution does not
claim Dan's endorsement of the app or relicense his material under the app's MIT
licence. The linked source document was left unchanged.


## Ink stock (version 1.5.0)

Open **Ink stock → Add ink**. Record the brand/range, colour name, type,
reference or bottle size, and availability. Add lightfastness and water-resistance
information from the product or your own tests; leave unknown properties as
**Unknown**. Paper and notes can record the conditions used for a colour reading,
compatible pens, drying, cleaning or the source of the information.

RGB (0–255), HEX and the colour picker stay synchronised. Enter a ColorReader
reading from a dry swatch or an approximate colour. The paper and fill density
affect the result. The app does not connect to the ColorReader directly.

Your ink stock starts empty; adding a bottle never claims you own other inks.
Any brand can be recorded, including products you discover in Dan Catt’s linked
Pens & Paper lesson. The supplied comparison does not name separate bottled
products, so no product list is attributed to that video without verification.
Dan remains credited in the Ink stock panel, Materials guide and About.

In **Pen stock**, edit a refillable pen and select its **Bottled ink**. This
records the current fill and adds the ink’s name to future pen assignments and
pen-change prompts. Choose **Copy ink RGB to pen** to copy the bottle colour,
or keep your pen-specific reading. Save the pen, then use its **Swatch** button
to prepare a measurement patch with the existing swatch workflow. Enter the
reading in that pen’s editor; you can separately update the bottle reading.
Selecting **No bottled ink / built-in pen ink** removes the link while retaining
the pen colour. Follow the manufacturer’s compatibility guidance before filling.

Editing an ink updates its name for future assignments but does not overwrite
linked pens’ RGB readings. Marking a bottle unavailable does not disable pens
already filled with it. Existing loaded and interrupted jobs retain the ink
name and pen details saved when those jobs were prepared. Reassign or reload
when idle to use changed catalogue details. Inks are not assigned directly to
plots: the physical pen remains the item selected for each pass.

Use **Edit**, **Duplicate**, search and availability filters to maintain your
stock. **Export catalogue** in either stock tab includes pens, inks and themes.
Imports retain existing records, reuse identical records, and copy conflicts
with their links intact. Older version-1 pen/theme backups still import. Saving
with 1.5.0 upgrades the catalogue to format version 2; older app versions cannot
read that format. Retain an old-format backup if you plan to downgrade. Reading
an existing catalogue alone does not rewrite it.
