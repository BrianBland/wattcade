# Skitter puppet

Art: original OpenAI `image_gen.imagegen` roster from commit `0f5539c`; model identifier was not exposed. All visible colour textures are roster pixels, resampled and masked with Pillow/NumPy/SciPy. No creature was repainted.
Anatomy: Palm-bodied swarm alien; four three-segment leg pairs and an eight-link whip tail.
25 source parts, 25 matching glow layers, 37 assembled instances. Frame 640×640; nominal length 480px. Source right appendages are mirrored, except Glider has two explicit original wings.
Checks: 432 parent/child contacts at the required ±20° appendage and ±6° body/tail poses, plus ±25°/±8° limits and crossed combinations. **No joint gaps observed or flagged.** No clipped diagnostic pose or green fringe. Probes follow tissue thickness (1px for thin tails). Added underlap pixels outside opaque parent silhouettes: 0.
Lighting limitation: original baked highlights retain some lateral bias; strict 12 oclock relighting remains approximate. Thin dark material uses reviewed masks; original dark contours remain. Source masks and thresholds are available for further edge painting.
Rebuild: `python build.py && python render.py` here; shared code lives in `../puppet-tools/` and requires Pillow, NumPy, SciPy. All previews are scripted from the manifest. Glow blends additively; zero-energy masks are provided for unlit parts.

## Produced files
- `assembled-base.png`; `assembled-ground.png`; `assembled.png`
- `build.py`; `comparison.png`; `game-scale.png`
- `joints-test.png`; `manifest.json`; `parts-sheet.png`
- `reference-mask.png`; `render.py`; `sheet-raw.png`
- `source-colour-frame.png`; `tail-test.png`; `validation.json`
- `NOTES.md`
- `parts/head.png`, `parts/head_glow.png`; `parts/thorax_1.png`, `parts/thorax_1_glow.png`
- `parts/thorax_2.png`, `parts/thorax_2_glow.png`; `parts/thorax_3.png`, `parts/thorax_3_glow.png`
- `parts/thorax_4.png`, `parts/thorax_4_glow.png`; `parts/coxa_front_r.png`, `parts/coxa_front_r_glow.png`
- `parts/femur_front_r.png`, `parts/femur_front_r_glow.png`; `parts/claw_front_r.png`, `parts/claw_front_r_glow.png`
- `parts/coxa_mid_front_r.png`, `parts/coxa_mid_front_r_glow.png`; `parts/femur_mid_front_r.png`, `parts/femur_mid_front_r_glow.png`
- `parts/claw_mid_front_r.png`, `parts/claw_mid_front_r_glow.png`; `parts/coxa_mid_rear_r.png`, `parts/coxa_mid_rear_r_glow.png`
- `parts/femur_mid_rear_r.png`, `parts/femur_mid_rear_r_glow.png`; `parts/claw_mid_rear_r.png`, `parts/claw_mid_rear_r_glow.png`
- `parts/coxa_rear_r.png`, `parts/coxa_rear_r_glow.png`; `parts/femur_rear_r.png`, `parts/femur_rear_r_glow.png`
- `parts/claw_rear_r.png`, `parts/claw_rear_r_glow.png`; `parts/tail_01.png`, `parts/tail_01_glow.png`
- `parts/tail_02.png`, `parts/tail_02_glow.png`; `parts/tail_03.png`, `parts/tail_03_glow.png`
- `parts/tail_04.png`, `parts/tail_04_glow.png`; `parts/tail_05.png`, `parts/tail_05_glow.png`
- `parts/tail_06.png`, `parts/tail_06_glow.png`; `parts/tail_07.png`, `parts/tail_07_glow.png`
- `parts/tail_tip.png`, `parts/tail_tip_glow.png`
