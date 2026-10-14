# Skitter · steel-blue crystal retone

Art repaint: OpenAI `image_gen.imagegen` (model ID not exposed); atlas registered to original pixels with JavaScript. Brittle steel-blue crystal, lighter facets, sharp glints and dark per-part outlines.
Rig preserved byte-for-byte from `88ffc23`: same filenames, native canvases, offsets, pivots, parents, z-order and every manifest field. Only base/glow pixels and derived documentation/previews changed.
Four leg pairs retain all three sections and joints. Width-only thickening gives approximately 1.5× shaft mass (opaque area ratios 1.37–1.56). Cyan body core and joints live on independent `_glow` layers.
432 scripted contacts pass at ±20°/±6° and ±25°/±8° with crossed poses. **No joint gaps observed or flagged**; no clipping or green fringe. Canvas and manifest assertions: `retone-validation.json`.
Browser checks: `npm run dev`, Chromium deviceScaleFactor=2; `/dev/td-aids.html` as-is column and `/dev/td-roster.html?view=grid`, with zero page/load errors. Exact 40/45/50px Skitter and 45px Glider checks include glow-off shells on tan floor and dark rock, with no tint/rim/underglow aids.
Shared captures: `../skitter-parts/preview-aids-2x.png`, `../skitter-parts/preview-roster-2x.png`, `../glider-parts/as-is-game-size-2x.png`. Map assets copied unchanged from #138 into `public/td/environment/`. No game/rig code changed. Typecheck and 45 towerdefense tests pass.
Repaint: extract pristine folder at `88ffc23`, then run `../skitter-parts/retone-blue.cjs <species> <pristine-folder>` with Node. Run existing `render.py`, shared `blue-previews.py`, then `verify-blue.cjs` with the same inputs. Do not run old `build.py`: it restores original dark roster art.
Capture: `node ../skitter-parts/capture-preview.mjs` with Vite running; requires existing playwright-core and `/usr/bin/chromium`.

Shared preview captures refreshed again for Glider’s continuous crystal-wing pass; Skitter pixels and rig are unchanged.

## Files actually produced or refreshed in this folder
- `assembled-base.png`; `assembled-ground.png`; `assembled.png`
- `blue-previews.py`; `capture-preview.mjs`; `comparison.png`
- `crystal-paint-atlas.png`; `crystal-paint-layout.json`; `game-scale.png`
- `joints-test.png`; `parts-sheet.png`; `png-tools.cjs`
- `preview-aids-2x.png`; `preview-roster-2x.png`; `retone-blue.cjs`
- `retone-validation.json`; `tail-test.png`; `validation.json`
- `verify-blue.cjs`; `NOTES.md`
- `parts/claw_front_r.png`, `parts/claw_front_r_glow.png`; `parts/claw_mid_front_r.png`, `parts/claw_mid_front_r_glow.png`
- `parts/claw_mid_rear_r.png`, `parts/claw_mid_rear_r_glow.png`; `parts/claw_rear_r.png`, `parts/claw_rear_r_glow.png`
- `parts/coxa_front_r.png`, `parts/coxa_front_r_glow.png`; `parts/coxa_mid_front_r.png`, `parts/coxa_mid_front_r_glow.png`
- `parts/coxa_mid_rear_r.png`, `parts/coxa_mid_rear_r_glow.png`; `parts/coxa_rear_r.png`, `parts/coxa_rear_r_glow.png`
- `parts/femur_front_r.png`, `parts/femur_front_r_glow.png`; `parts/femur_mid_front_r.png`, `parts/femur_mid_front_r_glow.png`
- `parts/femur_mid_rear_r.png`, `parts/femur_mid_rear_r_glow.png`; `parts/femur_rear_r.png`, `parts/femur_rear_r_glow.png`
- `parts/head.png`, `parts/head_glow.png`; `parts/tail_01.png`, `parts/tail_01_glow.png`
- `parts/tail_02.png`, `parts/tail_02_glow.png`; `parts/tail_03.png`, `parts/tail_03_glow.png`
- `parts/tail_04.png`, `parts/tail_04_glow.png`; `parts/tail_05.png`, `parts/tail_05_glow.png`
- `parts/tail_06.png`, `parts/tail_06_glow.png`; `parts/tail_07.png`, `parts/tail_07_glow.png`
- `parts/tail_tip.png`, `parts/tail_tip_glow.png`; `parts/thorax_1.png`, `parts/thorax_1_glow.png`
- `parts/thorax_2.png`, `parts/thorax_2_glow.png`; `parts/thorax_3.png`, `parts/thorax_3_glow.png`
- `parts/thorax_4.png`, `parts/thorax_4_glow.png`
