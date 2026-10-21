# SVG Plotter for the Writing Robot T-A4

An SVG plotting app maintained by Gordon Brindle for a USB-connected Writing Robot T-A4.

[**Open the launch page**](https://GWB2025.github.io/svg-plotter-ta4/) · [**Open the running local app**](http://127.0.0.1:8769/) · [User guide](docs/USER_GUIDE.md)

## Launch the app

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

Opening the app does not connect to USB or start movement. Select the device, connect, clear the bed and home it, then follow the readiness checks. Begin with the small-star example. Use only the tested T-A4 profile; keep the paper fixed and replacement pen tips at the same height.

## Features

- SVG outline preview, A4 placement and optional G-code download.
- Curves, basic shapes, affine group transforms and separate pen strokes.
- Colour passes with a parked, confirmed pen change between colours.
- Pigma Micron pen assignments and nine colour-theme adaptations.
- Built-in test drawings and pause, continue and cancel controls.

Filled SVG shapes produce outlines; solid colour requires explicit hatch paths. Text must be converted to paths. See the [user guide](docs/USER_GUIDE.md) for limitations, machine coordinates and operating instructions.

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
