# Glider · steel-blue crystal retone

Art repaint: OpenAI `image_gen.imagegen` (model ID not exposed); atlas registered to original pixels with JavaScript. Brittle steel-blue crystal, lighter facets, sharp glints and dark per-part outlines.
Rig preserved byte-for-byte from `88ffc23`: same filenames, native canvases, offsets, pivots, parents, z-order and every manifest field. Only base/glow pixels and derived documentation/previews changed.
Both shoulder-pivoted wings retain bone fingers and every original transparent hole. Ice-blue membranes use 78% source opacity; bones stay opaque. Broader cyan veins and body core are independent `_glow` layers.
168 scripted contacts pass at ±20°/±6° and ±25°/±8° with crossed poses. **No joint gaps observed or flagged**; no clipping or green fringe. Canvas and manifest assertions: `retone-validation.json`.
Browser checks: `npm run dev`, Chromium deviceScaleFactor=2; `/dev/td-aids.html` as-is column and `/dev/td-roster.html?view=grid`, with zero page/load errors. Exact 40/45/50px Skitter and 45px Glider checks include glow-off shells on tan floor and dark rock, with no tint/rim/underglow aids.
Shared captures: `../skitter-parts/preview-aids-2x.png`, `../skitter-parts/preview-roster-2x.png`, `../glider-parts/as-is-game-size-2x.png`. Map assets copied unchanged from #138 into `public/td/environment/`. No game/rig code changed. Typecheck and 45 towerdefense tests pass.
Repaint: extract pristine folder at `88ffc23`, then run `../skitter-parts/retone-blue.cjs <species> <pristine-folder>` with Node. Run existing `render.py`, shared `blue-previews.py`, then `verify-blue.cjs` with the same inputs. Do not run old `build.py`: it restores original dark roster art.
Capture: `node ../skitter-parts/capture-preview.mjs` with Vite running; requires existing playwright-core and `/usr/bin/chromium`.

## Files actually produced or refreshed in this folder
- `as-is-game-size-2x.png`; `assembled-base.png`; `assembled-ground.png`
- `assembled.png`; `comparison.png`; `crystal-paint-atlas.png`
- `crystal-paint-layout.json`; `feature-test.png`; `game-scale.png`
- `joints-test.png`; `parts-sheet.png`; `retone-validation.json`
- `validation.json`; `NOTES.md`
- `parts/abdomen.png`, `parts/abdomen_glow.png`; `parts/claw_hanging_r.png`, `parts/claw_hanging_r_glow.png`
- `parts/head.png`, `parts/head_glow.png`; `parts/socket_hanging_r.png`, `parts/socket_hanging_r_glow.png`
- `parts/tail_01.png`, `parts/tail_01_glow.png`; `parts/tail_02.png`, `parts/tail_02_glow.png`
- `parts/tail_03.png`, `parts/tail_03_glow.png`; `parts/tail_04.png`, `parts/tail_04_glow.png`
- `parts/tail_tip.png`, `parts/tail_tip_glow.png`; `parts/thorax_1.png`, `parts/thorax_1_glow.png`
- `parts/thorax_2.png`, `parts/thorax_2_glow.png`; `parts/wing_l.png`, `parts/wing_l_glow.png`
- `parts/wing_r.png`, `parts/wing_r_glow.png`
