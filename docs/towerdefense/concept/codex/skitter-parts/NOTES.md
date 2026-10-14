# Production compact Skitter

Approved art: `../skitter-redesign/candidate.png`, originally OpenAI `image_gen.imagegen` (model ID not exposed). No new art generated or redesign. Pillow/NumPy/SciPy segment source pixels and split emission; `sheet-raw.png` is a byte-identical copy of the approved candidate.
22 source parts and matching glow layers: head, four body plates (thorax_2 root), four right-side three-section leg chains and five chunky tail links. Game mirrors the four left legs. Frame640×640, centerX320, nominal480px length. Source highlights retained; dark metallic chitin, broad blue plates, silver accents and clustered eyes preserved.
Rounded, texture-matched underlaps tuck limbs20% and body/tail25% behind parents; no new underlap extends outside an opaque parent at rest. Every cutout is RGBA with6px padding. Source boundary tissue is assigned to the nearest anatomy region rather than discarded.
Glow decomposition removes only emissive energy, retaining blue plate/eye material on the base. Additive glow reconstructs the lit source. `assembled-base.png` demonstrates a complete blue puppet with glow off; `comparison.png` compares the approved art and assembled puppet at matching scale.
396 scripted contacts pass at ±20°/±6° and ±25°/±8°, including crossed poses. **No joint gaps observed or flagged**; no clipping or green fringe. Exact topology, source hash and material checks: `production-validation.json`.
Unmodified game rig drives all eight legs and five tail links through a full gait cycle. Browser frames, walk-test and GIF show the actual renderer at eight phases. All three requested pages captured at device scale2, with zero page/load errors; typecheck and all45 towerdefense tests pass.
The exact integration URL currently labels Skitter40px; `map-52px-2x.png` additionally checks52px on floor and rock with no renderer aids. The as-is column also contains both floor and plateau samples. Existing Glider puppet retained; optional Glider conversion deferred.
Build/render: `python -B build.py` then `python -B render.py`. Capture: `npm run dev -- --port 5173`, then `node docs/towerdefense/concept/codex/skitter-parts/capture-production.mjs`. Browser needs playwright-core and /usr/bin/chromium.
Integration preview additionally needs public/td/towers from PR#135 and public/td/outpost from PR#136. Those exports were mounted temporarily for screenshots, not changed or committed. Reproduce with git fetch of refs/pull/135/head and refs/pull/136/head, then git archive their public/td directories into the checkout.
Superseded re-tone tooling is moved to archive/ as historical material. png-tools.cjs remains a shared PNG utility used by Glider documentation scripts. Archive tools are not the production build path. No game or rig code changed.

## Produced files
- `as-is-2x.png`; `assembled-base.png`; `assembled-ground.png`
- `assembled.png`; `browser-validation.json`; `build.py`
- `capture-production.mjs`; `compact.py`; `comparison.png`
- `game-scale.png`; `joints-test.png`; `manifest.json`
- `map-52px-2x.png`; `parts-sheet.png`; `preview-aids-2x.png`
- `preview-integration-2x.png`; `preview-roster-2x.png`; `production-validation.json`
- `render.py`; `sheet-raw.png`; `source-colour-frame.png`
- `tail-test.png`; `validation.json`; `walk-test.png`
- `walk.gif`; `NOTES.md`
- `parts/claw_front_r.png`, `parts/claw_front_r_glow.png`; `parts/claw_mid_front_r.png`, `parts/claw_mid_front_r_glow.png`
- `parts/claw_mid_rear_r.png`, `parts/claw_mid_rear_r_glow.png`; `parts/claw_rear_r.png`, `parts/claw_rear_r_glow.png`
- `parts/coxa_front_r.png`, `parts/coxa_front_r_glow.png`; `parts/coxa_mid_front_r.png`, `parts/coxa_mid_front_r_glow.png`
- `parts/coxa_mid_rear_r.png`, `parts/coxa_mid_rear_r_glow.png`; `parts/coxa_rear_r.png`, `parts/coxa_rear_r_glow.png`
- `parts/femur_front_r.png`, `parts/femur_front_r_glow.png`; `parts/femur_mid_front_r.png`, `parts/femur_mid_front_r_glow.png`
- `parts/femur_mid_rear_r.png`, `parts/femur_mid_rear_r_glow.png`; `parts/femur_rear_r.png`, `parts/femur_rear_r_glow.png`
- `parts/head.png`, `parts/head_glow.png`; `parts/tail_01.png`, `parts/tail_01_glow.png`
- `parts/tail_02.png`, `parts/tail_02_glow.png`; `parts/tail_03.png`, `parts/tail_03_glow.png`
- `parts/tail_04.png`, `parts/tail_04_glow.png`; `parts/tail_tip.png`, `parts/tail_tip_glow.png`
- `parts/thorax_1.png`, `parts/thorax_1_glow.png`; `parts/thorax_2.png`, `parts/thorax_2_glow.png`
- `parts/thorax_3.png`, `parts/thorax_3_glow.png`; `parts/thorax_4.png`, `parts/thorax_4_glow.png`
- `walk-frames/00.png`; `walk-frames/01.png`; `walk-frames/02.png`; `walk-frames/03.png`
- `walk-frames/04.png`; `walk-frames/05.png`; `walk-frames/06.png`; `walk-frames/07.png`
Archived files moved (previous-pass outputs):
- `archive/NOTES.md`; `archive/blue-previews.py`; `archive/build.py`; `archive/capture-preview.mjs`
- `archive/crystal-paint-atlas.png`; `archive/crystal-paint-layout.json`; `archive/render.py`; `archive/retone-blue.cjs`
- `archive/retone-validation.json`; `archive/verify-blue.cjs`
