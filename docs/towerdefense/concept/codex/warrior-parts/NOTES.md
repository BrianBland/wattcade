# Codex Warrior — segmented puppet

Art: OpenAI `image_gen.imagegen` (model identifier not exposed). The original roster Warrior from commit `0f5539c` supplies the visible art. The FIRST generated 20-part sheet supplies concealed body backing; its raw export is preserved. Python produces the cutouts and scripted composites.
Branch: `codex/warrior-parts`, based on `towerdefense-concept-art` at `8538813`. All files below are relative to this folder and exist. No game code changed.
Processing: Pillow, NumPy and SciPy segment the original head, eight dorsal plates, tail, jaw and three distinct sections of each right leg. Original sockets, upper-leg bends and scythe shapes remain separate, with independent pivots for all front/middle/rear pairs. Source masks adapted from the hybrid spike are repaired to retain solid dark chitin. New underlaps fit inside the parent's opaque rest silhouette; visible joints are not enlarged. Glow PNGs contain additive emission, including hot eye/seam cores; base materials remain complete.
Reproduce: `python build.py && python render.py` from this folder, with Pillow, NumPy and SciPy installed. `render.py` independently reads the saved parts and manifest; the previews and joint tests are scripted composites, not generated pose paintings.
Checks: 640×640 frame; nominal 480px length (475px measured at 50% alpha); 20 right/central assets and 10 mirrored left instances; readable six-legged red silhouette at approximately 105px. All part canvases have 6px padding. Added underlap coverage outside the parent's rest silhouette: 0 pixels.
Gaps: **none observed at any joint in `joints-test.png`**. All 348 parent/child contact checks across the required four poses and wider ±25° limb / ±8° plate limits, including combined limits, pass. No diagnostic pose clips; no green fringe pixels detected. Numerical checks measure overlap and pivot coverage; full-size poses were also visually inspected. Dark chitin contours are intentional.
Lighting limitation: preserving the original roster textures retains their baked specular highlights and slight lateral bias, so strict 12 o'clock relighting remains approximate. `comparison.png` presents the original and corrected puppet at the same scale and head alignment.

## Produced files
- `sheet-raw.png` — unmodified FIRST generated 1402×1122 chroma-key sheet; `reference-warrior.png` — original 400×380 Warrior source; `reference-masks.png` — seven source alpha guides in a 2800×380 strip; `manifest.json` — offsets, pivots, ends, parents, z order, glow paths and underlap measurements.
- `assembled.png` — transparent 640×640 assembly; `assembled-ground.png` — same on `#211d19`; `assembled-base.png` — transparent assembly without emission; `comparison.png` — 1280×704 original/puppet comparison.
- `joints-test.png` — 3584×960, four scripted poses in brief order: limbs +20°, limbs −20°, plates +6°, plates −6°; left limb rotations mirror the right. Each 640×640 rest frame has a 128px diagnostic margin for extended claws. `game-scale.png` — 140×140 transparent frame, approximately 105px creature length.
- `build.py` — source segmentation, hidden overlap construction and manifest builder; `render.py` — manifest renderer, additive glow composition and checks; `validation.json` — all joint contacts and export measurements; `NOTES.md` — this report.

The following table lists every base PNG and its matching, same-canvas emissive PNG (40 files). All are RGBA, trimmed, and padded by at least 4px; only the right paired parts are stored.

| Base file | Glow file |
| --- | --- |
| `parts/head.png` | `parts/head_glow.png` |
| `parts/mandible_r.png` | `parts/mandible_r_glow.png` |
| `parts/thorax_1.png` | `parts/thorax_1_glow.png` |
| `parts/thorax_2.png` | `parts/thorax_2_glow.png` |
| `parts/thorax_3.png` | `parts/thorax_3_glow.png` |
| `parts/abdomen_1.png` | `parts/abdomen_1_glow.png` |
| `parts/abdomen_2.png` | `parts/abdomen_2_glow.png` |
| `parts/abdomen_3.png` | `parts/abdomen_3_glow.png` |
| `parts/abdomen_4.png` | `parts/abdomen_4_glow.png` |
| `parts/abdomen_5.png` | `parts/abdomen_5_glow.png` |
| `parts/tail_tip.png` | `parts/tail_tip_glow.png` |
| `parts/coxa_front_r.png` | `parts/coxa_front_r_glow.png` |
| `parts/femur_front_r.png` | `parts/femur_front_r_glow.png` |
| `parts/claw_front_r.png` | `parts/claw_front_r_glow.png` |
| `parts/coxa_mid_r.png` | `parts/coxa_mid_r_glow.png` |
| `parts/femur_mid_r.png` | `parts/femur_mid_r_glow.png` |
| `parts/claw_mid_r.png` | `parts/claw_mid_r_glow.png` |
| `parts/coxa_rear_r.png` | `parts/coxa_rear_r_glow.png` |
| `parts/femur_rear_r.png` | `parts/femur_rear_r_glow.png` |
| `parts/claw_rear_r.png` | `parts/claw_rear_r_glow.png` |
