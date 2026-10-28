# SVG Plotter 1.4.1 — materials guide, 27 October 2026

Adds an offline Materials guide with all 16 rows and eight original fields from
the supplied comparison. Credits Dan Catt in the guide and About; links to his
Pens & Paper lesson and course. Missing properties and source timestamps are
retained. The supplied spreadsheet snapshot and its Drive original are unchanged.
The lesson URL was identified through Dan's own penplotter.com course page.

## Verification

All 64 JavaScript and 101 Python tests passed (165 total). New checks cover
reference completeness, attribution, timestamp conversion, escaped document
content, case-insensitive multiword search, category filtering, empty results,
clearing filters, keyboard navigation and read-only integration. Existing plot,
rotation, swatch, catalogue and recovery regression checks also passed.
JavaScript/Python syntax and Git whitespace checks passed.

An isolated local preview was visually inspected in Chrome without connecting
to USB. The guide rendered all 16 cards and its source credit. Searching Bristol
with the Paper category showed one result; clearing filters restored the list.
About displayed version 1.4.1 and the specific Dan Catt acknowledgement.
The preview was then closed. The separately packaged Apple silicon app passed
its smoke test and strict code-signature verification.

The installed 1.4.0 app was observed actively drawing the 24-pen Sharpie swatch
sheet. It was left running; 1.4.1 is built separately for installation after the
plot finishes. The guide changes no device commands, job state, catalogue schema
or runtime dependencies. No new physical plotting or materials tests are claimed.
