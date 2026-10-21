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
