# SVG Plotter 1.5.0 — ink stock, 28 October 2026

Adds bottled ink records, synchronised RGB/HEX entry, paper and performance
notes, availability, search, editing and duplication. Pens can link to their
current bottled ink; an explicit action copies its RGB. Ink names appear in
new pen assignments and saved pen-change prompts. Existing drawings and recovery
retain their original details. Bottle availability is independent of filled pens.

## Verification

68 JavaScript and 106 Python checks passed (174 total). New tests were first run
failing before implementation. They cover legacy migration without read-time
writes, persistence, malformed input, stale editors, ink–pen–theme remapping on
backup import, deduplication, atomic rejection, RGB editing, linking/unlinking,
colour copying, search, availability, both backup formats, authenticated API
access and preservation of interrupted-job snapshots without USB access.
Existing rotation, swatch, catalogue, drawing and recovery checks also passed.

An isolated Chrome preview using a temporary catalogue was inspected visually.
A demo bottle was created with HEX #128080; RGB updated to 18,128,128. A new test
pen linked to the bottle without changing its colour until Copy ink RGB to pen
was used. Saving showed the bottled ink name alongside the physical pen. No test
records were added to Gordon's catalogue and no USB connection was opened.

## Compatibility and attribution

The catalogue is written as schema 2. Schema-1 catalogues and backups are read
and upgraded on the next save; reading alone does not rewrite files. Older
app versions cannot read schema 2. The Ink stock panel links to Dan Catt's
Pens & Paper lesson and thanks him. No individual bottled products, performance
claims, or RGB values have been invented or attributed to the video. Existing
Materials guide source data is unchanged. There are no new runtime dependencies
or device movement commands. No new physical ink/plotting tests are claimed.

The Apple silicon 1.5.0 bundle passed its resource smoke test and strict
code-signature verification. The installed 1.4.1 sender was checked through
its status API before replacement: disconnected, no active thread and no saved
plot. Its prepared (unstarted) swatch drawing and schema-1 catalogue export were
retained locally before the update.
