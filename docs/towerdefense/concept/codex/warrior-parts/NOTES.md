# Codex Warrior — segmented puppet

Art: OpenAI `image_gen.imagegen` (model identifier not exposed), generated together as one 20-part sheet and refined together. Reference: my roster Warrior from commit `0f5539c`; the hybrid animation was inspected.
Branch: `codex/warrior-parts`, based on `towerdefense-concept-art` at `8538813`. All files below are relative to this folder and exist. No game code changed.
Processing: Python, Pillow, NumPy and SciPy key the green matte, trim with 6px padding, separate warm emission (including hot eye/seam cores), retain complete base textures, and assemble from `manifest.json`. Rounded caps use source-sheet joint art enlarged for 15–20% underlap; cap highlights are aligned to 12 o'clock in the rest frame. Body plates overlap about 25%.
Reproduce: `python build.py && python render.py` from this folder, with Pillow, NumPy and SciPy installed. `render.py` independently reads the saved parts and manifest; the previews and joint tests are scripted composites, not generated pose paintings.
Checks: 640×640 frame; measured opaque head-to-tail length 480px; 20 right/central assets and 10 derived left instances; readable six-legged red silhouette at 105px. Base-only preview retains continuous opaque chitin. No shadows are baked into the transparent assets.
Gaps: **none observed at any joint in `joints-test.png`**. All 348 parent/child contact checks across the four required poses and wider ±25° limb / ±8° plate limits, including combined limits, pass. No rendered pose clips; no green fringe pixels detected. The numerical probe checks overlap and pivot coverage; the strip was also visually inspected for gaps and flat cut seams. Dark chitin contours are intentional.
All requested deliverables were produced. The ball caps are deliberately broader than the roster's joints to permit rotation.

## Produced files
- `sheet-raw.png` — unmodified final generated 1402×1122 chroma-key sheet; `manifest.json` — assembled-frame offsets, pivots, limb ends, parents, z order and glow paths.
- `assembled.png` — transparent 640×640 assembly; `assembled-ground.png` — same on `#211d19`; `assembled-base.png` — transparent assembly with glow disabled.
- `joints-test.png` — 2560×704, four side-by-side poses in brief order: limbs +20°, limbs −20°, plates +6°, plates −6°; left limb rotations mirror the right. `game-scale.png` — 140×140 transparent frame, nominal 105px body length.
- `build.py` — sheet extraction and manifest builder; `render.py` — manifest-driven renderer and checks; `validation.json` — all joint contacts and export measurements; `NOTES.md` — this report.

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
