# Glider · blue-wing polish and paired horns

Polish reference: OpenAI `image_gen.imagegen` (model ID not exposed); applied with JavaScript to the existing puppet. Corrected metallic chitin patches interrupting the blue wing membranes, including both inner bases and the left middle-finger end. Saturated blue remains; dark ribs and blue veins retain their structure.
Replaced the clipped/asymmetric head horn with a mirrored pair of polished dark horns. Both belong to the existing head texture and move with the skull. Old horn remnants were removed from the overlapping head/thorax textures. Horns fit the existing canvases; no new part or joint was added.
Exact manifest and all 26 base/glow canvas sizes retained. Same names, offsets, pivots, parents, z-order, animation and rig. Skitter art and game code unchanged.
168 scripted joint contacts pass at ±20°/±6° and ±25°/±8°, including crossed poses. **No joint gaps observed or flagged.** No clipping or green fringe. Current checks: `polish-validation.json`; older colour-pass reports are historical.
Browser checks: `/dev/td-aids.html` as-is and `/dev/td-roster.html?view=grid`, Chromium device scale2; zero page/load errors. Glider checked at45px on tan floor and dark rock without tint/rim/underglow aids, including glow disabled.
Shared screenshots refreshed in `../skitter-parts/preview-aids-2x.png` and `../skitter-parts/preview-roster-2x.png`. `blue-game-size-2x.png` is the Glider-only crop of the full game-size screenshot.
Reproduce: extract pristine Glider folder at `90700e8`, run `node polish-glider.cjs <pristine-folder>`, existing `python -B render.py`, then `python -B ../skitter-parts/blue-previews.py`. Use shared `capture-preview.mjs` with Vite serving5173 to recapture.
Original-body saturated-blue pass remains reproducible through `apply-rich-blue.cjs`; apply this polish afterward. Historical crystal tools restore earlier art directions.

## Files produced or refreshed in this pass
- `NOTES.md`; `as-is-game-size-2x.png`; `assembled-base.png`
- `assembled-ground.png`; `assembled.png`; `blue-game-size-2x.png`
- `blue-validation.json`; `comparison.png`; `feature-test.png`
- `game-scale.png`; `joints-test.png`; `parts-sheet.png`
- `parts/head.png`; `parts/head_glow.png`; `parts/thorax_1.png`
- `parts/thorax_1_glow.png`; `parts/wing_l.png`; `parts/wing_r.png`
- `polish-glider.cjs`; `polish-paint.png`; `polish-validation.json`
- `validation.json`
