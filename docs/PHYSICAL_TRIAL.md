# T-A4 release trial

Use scrap paper cut to 148 × 105 mm before trying a finished postcard.
These steps require someone at the machine. No physical trial has been recorded
for version 1.3.1 yet. Do not start by replacing a sender during a drawing.

## Connection and a small drawing

1. Save the current drawing and any postcard draft; finish or cancel an active
   job. Quit the old sender before opening the new app.
2. Open About and confirm version 1.3.1. Refresh connections and connect the
   Writing Robot T-A4. Confirm the bed and homing path are clear before Home.
3. Load the small-star test. Confirm readiness and draw it on scrap paper.
4. During a second trial, Pause. Check that the pen lifts and parks at the
   top-left. Continue should return pen-up and complete the drawing without
   shifting it. Check Cancel separately using a fresh small drawing.

## Postcard placement and colour changes

1. Fix a carrier sheet to the bed. Choose the 148 × 105 mm postcard preset.
   Load `examples/postcard-trial/carrier-guide.svg` at **Keep original size and
   position**. Plot the guide on the carrier, then align the scrap card with
   its corners. This trial uses the bed's top-left origin, not a centred card.
2. Load `front-calibration.svg` at original size, using Outline paths.
   Assign Orange, Light Brown and Dark Brown to the three passes. Check the
   displayed order and keep pen-tip heights consistent when changing pens.
3. Measure each square: 10 × 10 mm. The frame should be 5 mm from every card
   edge. Check that the two diagonal lines remain separate and the centre
   cross is centred. The app should park and wait before each pen change.
4. Flip the card left-to-right, keep its top edge at the top and register it
   against the same corners. Load `back-text.svg` at original size and use a
   fine black pen. Its address is fictitious. Check text size, spacing and
   the centre divider before adapting your real postcard draft.

## Interruption recovery

Use only a disposable test drawing and keep the paper and pen fixed.

- Disconnect/reconnect **USB only**, keeping plotter power on. Check that
  automatic reconnection or Reconnect and resume retains the correct pen and
  does not repeat completed strokes. Do not home or move the carriage first.
- Check a reset-recovery trial separately. Follow the app's displayed paper,
  lifted-pen and pen-refitting confirmations. It returns to the last verified
  completed stroke; an unfinished stroke may be retraced.
- If the paper shifts, the carriage is moved or the pen height changes, stop
  the trial; saved coordinates cannot restore physical registration.

## Record the result

Record macOS and app version, connection outcome, measured square dimensions,
pause/continue result, pen-change order and the recovery mode tested. Attach a
photo of the scrap card if registration or text needs adjusting.
