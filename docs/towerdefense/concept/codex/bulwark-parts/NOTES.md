# Bulwark puppet

Art: original OpenAI `image_gen.imagegen` roster from commit `0f5539c`; model identifier was not exposed. All visible colour textures are roster pixels, resampled and masked with Pillow/NumPy/SciPy. No creature was repainted.
Anatomy: Domed siege shell with acid glands; four short two-section leg pairs and six flexing shell plates.
15 source parts, 15 matching glow layers, 23 assembled instances. Frame 640×640; nominal length 480px. Source right appendages are mirrored, except Glider has two explicit original wings.
Checks: 264 parent/child contacts at the required ±20° appendage and ±6° body/tail poses, plus ±25°/±8° limits and crossed combinations. **No joint gaps observed or flagged.** No clipped diagnostic pose or green fringe. Probes follow tissue thickness (1px for thin tails). Added underlap pixels outside opaque parent silhouettes: 0.
Lighting limitation: original baked highlights retain some lateral bias; strict 12 oclock relighting remains approximate. Thin dark material uses reviewed masks; original dark contours remain. Source masks and thresholds are available for further edge painting.
Rebuild: `python build.py && python render.py` here; shared code lives in `../puppet-tools/` and requires Pillow, NumPy, SciPy. All previews are scripted from the manifest. Glow blends additively; zero-energy masks are provided for unlit parts.

## Produced files
- `assembled-base.png`; `assembled-ground.png`; `assembled.png`
- `build.py`; `comparison.png`; `game-scale.png`
- `joints-test.png`; `manifest.json`; `parts-sheet.png`
- `reference-mask.png`; `render.py`; `sheet-raw.png`
- `source-colour-frame.png`; `validation.json`; `NOTES.md`
- `parts/head.png`, `parts/head_glow.png`; `parts/carapace_1.png`, `parts/carapace_1_glow.png`
- `parts/carapace_2.png`, `parts/carapace_2_glow.png`; `parts/carapace_3.png`, `parts/carapace_3_glow.png`
- `parts/carapace_4.png`, `parts/carapace_4_glow.png`; `parts/carapace_5.png`, `parts/carapace_5_glow.png`
- `parts/tail_plate.png`, `parts/tail_plate_glow.png`; `parts/socket_front_r.png`, `parts/socket_front_r_glow.png`
- `parts/foot_front_r.png`, `parts/foot_front_r_glow.png`; `parts/socket_mid_front_r.png`, `parts/socket_mid_front_r_glow.png`
- `parts/foot_mid_front_r.png`, `parts/foot_mid_front_r_glow.png`; `parts/socket_mid_rear_r.png`, `parts/socket_mid_rear_r_glow.png`
- `parts/foot_mid_rear_r.png`, `parts/foot_mid_rear_r_glow.png`; `parts/socket_rear_r.png`, `parts/socket_rear_r_glow.png`
- `parts/foot_rear_r.png`, `parts/foot_rear_r_glow.png`
