# Dynamo Defense painted battlefield — issue 131

Art: OpenAI image_gen.imagegen, guided by the approved trench-mockup.png.
The user approved replacing tiled terrain with one cohesive painted fixed map.
Processing/proofs: Pillow/NumPy; no contrast or darkness flattening of terrain.
Work: codex/td-environment-work, docs/towerdefense/concept/codex/environment/.
FILES.txt enumerates every production file; SHA256SUMS.txt hashes them.

background.webp: opaque 1536×1024 rock plateaus and sunken dirt trenches,
full original resolution, WebP quality 92. Geological shading and ambient
occlusion are intrinsic to the landscape. No baked creatures, machinery,
cables, luminous creep, splats, industrial props or weapon effects.
map-layout.json: registered world field, three fixed lane curves, outpost
center and six plateau pads. Left/center curves retain sim/defs.ts; the right
curve is traced to the painted floor. Original coordinates are included.
MAP_INTEGRATION.md documents the required shared lane/pad integration changes.
Game code is unchanged; this artwork is not yet integrated into gameplay.
manifest.json: schema v2; fixed background plus 27 independent overlay pieces.
Old tile/lip PNGs are removed from production; rejected v1 is archived on work.

parts/creep_1..6.png: veined purple-black growth and independent emission.
parts/burrow_1..3.png: independently placed hive mouths.
parts/splat_1..6.png: neutral-grey masters for blue/red/purple/gold tinting.
parts/props_*.png: 12 rock, crate, barrel, barrier, sandbag, junction, vent props.
Every piece has a same-size *_glow.png; non-emissive props have clear masks.
Offsets/visual-center pivots use an independent canonical 512×512 frame.

preview.png: scripted scene from exported terrain/layout/overlays and actual
accepted #129/#130 rig references: three built towers on plateau, the original
Warrior and illustrative cables. Full-color full-size proof is on work.
overlays-preview.png: all 27 pieces, neutral splats, all four brood tints,
and glow-off examples. Both are review images, not runtime backgrounds.
Tower/outpost/Warrior reference assets are not bundled production assets.

Validation: full-resolution decode/detail, compression fidelity, fixed curves,
all six full pad footprints beyond banks, terrain support along all paths,
alpha/glow registration, tinting, source completeness, padding, no green fringe,
complete inventories, checksums and the <1.5MB production budget.
