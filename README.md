# SVG Plotter

An SVG plotting app maintained by Gordon Brindle, with saved profiles for different makes and models. The supplied Writing Robot T-A4 profile remains the default.

Version 1.7.0 adds **Your plotter**: add, duplicate, edit and select persistent
plotter profiles, with bed dimensions and configurable GRBL Z-lift controls.
Other controller types can use **SVG export** and **Save prepared SVG** with their
own plotting software. Profile settings are retained with interrupted jobs;
changes require disconnection and no pending recovery. See
[plotter profiles](docs/USER_GUIDE.md#plotter-profiles-version-170).

Version 1.6.0 adds **Text & ASCII art**. Open a `.txt` file or paste text,
preserve fixed columns, spaces, blank lines and tabs, then preview and plot it
with Hershey stroke lettering. Edit the text and row/column spacing, export
SVG, or prepare it with the existing page fitting, rotation and pen controls.
Studio G-code files ending in `.txt` still load as commands.
See [text and ASCII art](docs/USER_GUIDE.md#text-and-ascii-art-version-160).

Version 1.5.0 adds **Ink stock**: add, edit and duplicate bottled inks, record
RGB/HEX, paper, lightfastness and water-resistance notes, and link them to
refillable pens. Ink names appear in pen-change prompts; pen-specific RGB readings
stay independent. Catalogue backups include inks and preserve links when merged.
Existing catalogues and backups are supported. See [ink stock](docs/USER_GUIDE.md#ink-stock-version-150).

Version 1.4.1 adds a searchable **Materials guide** with all 16 entries from the
supplied *Pen Plotter Pens, Inks, and Papers Comparison*. It retains the paper
pairings, ink notes, missing-information labels and timestamps, with prominent
credit to **Dan Catt** and links to his [Pens & Paper lesson](https://www.youtube.com/watch?v=8bsWp6pKeYk)
and [course](https://penplotter.com/). The guide works offline and does not change
your stock or drawing. See [materials guide](docs/USER_GUIDE.md#materials-guide-version-141).

Version 1.4.0 adds **Pen colour swatches** in Pen stock: labelled A4 sheets for
one pen or an entire set, adjustable patch size and fill density, optional
cross-hatching, exact physical pen assignments and automatic multi-sheet layout.
The default 24-pen Sharpie sheet uses 20 × 20 mm patches. Enter ColorReader
measurements using the new synchronised RGB/HEX fields in the pen editor.
See [pen swatches](docs/USER_GUIDE.md#pen-colour-swatches-version-140).

Version 1.3.2 adds **Rotate 90° clockwise** and an **SVG rotation** selector.
Turn landscape artwork onto the portrait T-A4 bed, keeping its original size
or fitting it to the chosen page. Outlines, layered fills, the preview and saved
G-code share the same rotation. See [landscape artwork](docs/USER_GUIDE.md#rotating-landscape-artwork-version-132).

Version 1.3.1 consolidates the Mac application, recovery, pen catalogue, page guides and postcard features with the October connection fixes. The source launcher detects an older running sender instead of silently reusing it. The repository also includes [Handwriting Capture 1.2](handwriting-capture/README.md), supporting the full alphabet, digits and punctuation.

The 1.5.0 build is a **pre-release** while the [physical T-A4 and postcard trial](docs/PHYSICAL_TRIAL.md) is completed. Automated tests do not establish physical registration or colour measurement accuracy. See [swatch validation](docs/VALIDATION_1.4.0.md), [rotation validation](docs/VALIDATION_1.3.2.md) and [earlier validation](docs/VALIDATION_1.3.1.md).

Version 1.3.0 adds **Import fonts…** to Postcard text. Choose `.ttf` files, then use them in either Font menu. Imported outline fonts are saved privately on this Mac and survive app updates; bundled Hershey fonts remain single-line choices.

Version 1.2.0 adds **Postcard text**: write a message and postal address, choose
stroke fonts, adjust size/spacing/placement, save a draft and prepare exact-size
pen paths. See [writing postcards](docs/USER_GUIDE.md#postcard-text-version-120).

Version 1.1.1 adds **Stock positioning guides** for every page preset and custom
size: exact corner, edge-centre and centre marks, ready to plot or save as SVG.
See [positioning stock](docs/USER_GUIDE.md#positioning-paper-envelopes-and-postcards).

Version 1.1.0 includes **Pen stock** for adding, editing and duplicating pens,
availability tracking, editable colour themes with bare-paper assignments,
catalogue import/export, tooltips and **About**. Personal settings survive app
updates, and saved drawings retain their original pen details. See the
[user guide](docs/USER_GUIDE.md#personal-pen-stock-version-110) for the workflow.

[**Open the launch page**](https://GWB2025.github.io/svg-plotter-ta4/) · [**Open the running local app**](http://127.0.0.1:8769/) · [User guide](docs/USER_GUIDE.md)

## Install the Mac application (recommended)

The repository includes a native Mac application and a two-architecture build
workflow. See [Releases](https://github.com/GWB2025/svg-plotter-ta4/releases) for
versioned downloads. The Apple silicon 1.5.0 pre-release ZIP requires macOS 15
or newer and is not Apple-notarised. Intel builds require separate verification.

For a ZIP, extract it and drag **SVG Plotter** into **Applications** after
quitting the old app. Saved settings and recovery stay outside the app bundle.
For a DMG:

1. Download the DMG for **Apple silicon (arm64)** or **Intel (x86_64)**.
2. Open it and drag **SVG Plotter** into **Applications**.
3. Eject the DMG, then double-click **SVG Plotter** in Applications.

Python and dependencies are included; users do not need Terminal. The plotting
interface opens in its own window. Opening it never connects or moves the robot.
The app blocks quitting during active or paused jobs; finish or cancel first.
When idle, closing the window stops its server and disconnects USB.

Test builds are not Apple-notarised. See [Mac release instructions](docs/MAC_RELEASE.md)
for building, testing, signing and publishing. Only install trusted builds; do not
disable macOS security protections.

## Launch from source (developers)

GitHub Pages hosts the launch page. The plotting app runs on your Mac: its Python server converts and validates jobs and controls USB. The web link cannot start Python or operate the robot by itself. Start the local server first, then use **Open the running local app** above.

1. Download this repository using **Code → Download ZIP**, then extract it, or clone it:

   ```sh
   git clone https://github.com/GWB2025/svg-plotter-ta4.git
   cd svg-plotter-ta4
   ```

2. Install Python 3.10 or newer, then run these commands from the extracted repository directory:

   ```sh
   python3 -m venv .venv
   .venv/bin/python -m pip install -r requirements.txt
   .venv/bin/python launch.py
   ```

3. On subsequent launches, run `.venv/bin/python launch.py`, or double-click `Start-SVG-Plotter.command` on macOS. If necessary, run `chmod +x Start-SVG-Plotter.command` once.

Opening the app does not connect to USB or start movement. Select the device, connect, clear the bed and home it, then follow the readiness checks. Begin with the small-star example. For the original machine, keep the supplied T-A4 profile; keep the paper fixed and replacement pen tips at the same height.

## Features

- SVG outline preview, A4 placement and optional G-code download.
- Curves, basic shapes, affine group transforms and separate pen strokes.
- Colour passes with a parked, confirmed pen change between colours.
- Editable pen stock, colour themes, backups and Micron/Sharpie pen assignments.
- A4/A5/A6, postcard, envelope and custom sizes with positioning guides.
- Postcard message/address layout and private TrueType font import.
- Optional visible-layer hatching and responsive pen-path previews.
- Built-in test drawings and pause, continue and cancel controls.

Outline mode follows SVG paths; Layered colour fills creates hatching for supported filled artwork. Imported SVG text must be converted to paths; the Postcard text editor creates paths directly. See the [user guide](docs/USER_GUIDE.md) for limitations, machine coordinates and operating instructions.

## Acknowledgements

This independent project is inspired by **Rev Dan Catt** and his explanations of pen plotting, handwriting capture and creative tools. Our design reference is [Dan’s YouTube video](https://youtu.be/nD3XlqFhcEI). Thank you, Dan, for sharing your process and ideas.

The colour-theme names and reference swatches credit **Studio Yorktown**: [Color Town Hall](https://studioyorktown.github.io/coloryorktownhall/). Physical pen mappings are adaptations for the available Micron pens, not exact ink matches.

This is Gordon’s independent implementation and is not an official product of, or endorsed by, Dan or Studio Yorktown. Dan’s videos, transcripts, screenshots and postcard artwork are not included in this repository. Acknowledgement does not grant a licence to third-party material.

## Licence

The project’s original software is available under the [MIT licence](LICENSE), copyright © 2026 Gordon Brindle. Preserve copyright and licence notices when redistributing it. Third-party works, names and palette references remain subject to their respective rights; the MIT licence does not relicense those works. Flask and pyserial retain their own licences.

## Development and checks

```sh
node --test tests/*.cjs
.venv/bin/python -m unittest discover -s tests -v
```

The automated sender tests use a simulated controller. They do not move hardware. Native browser geometry checks are available in `tests/browser.html`.

## GitHub Pages

The `Deploy launch page` Actions workflow publishes only `site/`, on pushes to `main` or a manual dispatch. In **Settings → Pages → Build and deployment**, select **GitHub Actions**. The launch page links to the local app and installation instructions; the Python server is never deployed to Pages.


## Recovering an interrupted plot

The Mac application stores these files under
`~/Library/Application Support/SVG Plotter/`, independently of the application
bundle. Replacing the app preserves them. Existing source-version recovery files
are not imported automatically; complete or discard that recovery in the old
sender before switching. Stop the old sender before starting the Mac app.

In the source version, progress is saved in `logs/plotter-state.json`, with the exact validated drawing in
`logs/plotter-job.json`. Keep both files together. These local files are ignored by Git
and are not uploaded to GitHub. The saved state includes command acknowledgements,
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
actual stopping position, lifts to Z0.5 and parks at X0 Y0. The display says
**Pausing** until the park is verified. This is a controlled return to the top-left;
it does not run another homing cycle or change the drawing registration.

**Continue** checks that the park is unchanged, returns to the saved XY position
with the pen raised, restores its previous up/down height and continues the next
unsent drawing command. Keep the same pen fitted and leave the paper fixed.
Cancel remains available during parking and return. If the connection or sender
fails during this auxiliary movement, the record is retained but automatic
recovery is blocked because the physical resume point is uncertain.

## Expanded pen inventory

The selectors now offer 29 pens: the existing 19 Pigma Microns, seven Stabilo
Point 88 fine 0.4 mm pens (red 88/40, blue 88/41, green 88/43, yellow 88/44,
orange 88/54, purple 88/55 and pink 88/56), and three Uni-ball Eye UB-157E
0.7 mm fine pens (black, blue and red). References are recorded as supplied
in Pens.txt. Existing Micron pen IDs and default selections are preserved;
the additional families can be selected for any colour pass. Pen labels and
saved jobs retain the brand, size and reference. Changing pens does not adjust
hatch spacing, pen height or machine settings automatically.


### Layered SVG artwork

Load the SVG and choose **Layered colour fills** under SVG treatment, then
review the preview and pen choices. Shapes are composited in SVG paint order
before hatching, so hidden areas are not drawn. White and very pale colours
(default: all RGB channels at least 235) remain bare paper while still hiding
lower layers. Untick the bare-paper option when using a pale pen.

Hatch spacing is applied after page placement, with 0.5 mm as the default for
the tested Sharpie Fine Point pens. The visible artwork is sampled on a 0.1 mm
grid; this is an approximate filled-artwork conversion, and very fine details
may disappear. Filled strokes are also hatched in this mode. Use **Outline
paths** for existing single-line drawings and pre-hatched SVGs.

This mode supports opaque solid fills and strokes, transformed groups and
compound paths with holes. Transparency and blending are rejected; gradients,
clipping, masks, linked content and SVG text still need conversion in an editor.
Colour changes use the existing pen-up home and confirmation workflow.
