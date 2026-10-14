# Glider · continuous crystal wings

Wing repaint: OpenAI `image_gen.imagegen` (model ID not exposed), registered to existing membrane pixels with JavaScript. Continuous translucent ice-blue panels now carry angular fracture lines and lighter facets; 69 scattered perforations filled, with one small trailing-edge chip per wing. Structural gaps between bone fingers remain.
Manifest unchanged byte-for-byte from `191b5e3`, as are all part canvases, offsets, pivots, parents and z-order. All 11 non-wing parts and their glow files are unchanged. Bone fingers remain; former hole rims are inpainted, and glow is cleared in newly filled holes and chipped regions.
168 scripted joint contacts pass at ±20°/±6° and ±25°/±8°, including crossed poses. **No joint gaps observed or flagged.** No clipping or green fringe. Rig and pixel-scope checks: `wing-validation.json`.
Browser: game-own `/dev/td-aids.html` and `/dev/td-roster.html?view=grid`, Chromium device scale 2, no page/load errors. Glider checked at 45px on tan floor and dark rock, with glow on/off and no tint/rim/underglow aids.
Shared captures refreshed in `../skitter-parts/preview-aids-2x.png` and `../skitter-parts/preview-roster-2x.png`; exact scale check here: `as-is-game-size-2x.png`. No game or animation code changed.
Reproduce this wing pass: extract pristine `glider-parts/` at `191b5e3`; run `node fill-crystal-wings.cjs <pristine-folder>`, then existing `python -B render.py`, then `python -B ../skitter-parts/blue-previews.py`. With Vite running, use existing `capture-preview.mjs` to recapture.
Earlier shell retone sources/tools remain available. The old `retone-blue.cjs` and `build.py` restore perforated wings; apply this wing pass afterward. `retone-validation.json` retains shell/canvas checks and records the revised wing treatment.

## Files produced or refreshed by this wing pass
- `NOTES.md`; `as-is-game-size-2x.png`; `assembled-base.png`
- `assembled-ground.png`; `assembled.png`; `comparison.png`
- `crystal-wing-paint.png`; `feature-test.png`; `fill-crystal-wings.cjs`
- `game-scale.png`; `joints-test.png`; `parts-sheet.png`
- `parts/wing_l.png`; `parts/wing_l_glow.png`; `parts/wing_r.png`
- `parts/wing_r_glow.png`; `retone-validation.json`; `wing-validation.json`
