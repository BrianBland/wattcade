# Dynamo Defense environment — issue 131

Art tool: OpenAI image_gen.imagegen, guided by the original battlefield and
td-towers-base concepts and issue 129's accepted tower material treatment.
Processing/proofs: Python, Pillow and NumPy; sources and build.py are on
codex/td-environment-work, docs/towerdefense/concept/codex/environment/.
FILES.txt lists every production file; SHA256SUMS.txt records their content.

manifest.json: 33 independent pieces; canonical 512×512 registration frame;
offset/pivot/parent/z, per-part sizes, tile/strip repeats and 3 spawn anchors.
parts/ground_1..3.png: three calm dark alien-rock tiles, each 512×512.
parts/trench_floor.png: 512×512 packed rubble/dirt, slightly lighter than ground.
parts/trench_lip.png and trench_lip_fractured.png: 512×96 geological cut banks,
seamless along x, with transparent y edges; top = outer ground, bottom = floor.
These are excavated lanes following the user's clarification, not retaining
walls. Steel shoring is intentionally omitted; barriers are independent props.
parts/creep_1..6.png: purple-black branching hive growth with pustule emission.
parts/burrow_1..3.png: dark hive openings and individually registered spawn points.
parts/splat_1..6.png: exactly neutral grey acid/ichor masters for brood tinting.
parts/props_*.png: 12 rock, crate, barrel, barrier, sandbag, junction and vent props.
Every part has a same-size *_glow.png; non-emissive terrain/props use clear masks.
Organic masks isolate purple emission; splat masks are neutral white emission.
Decals/props have ≥4px clear padding and their visual alpha centroids at pivot.

preview.png is scripted from this manifest and these decoded PNGs on #211d19:
three 3×3 ground repeats, both banks bent into S-curves, all organic decals,
all splats in neutral/blue/red/purple/gold, all props, and glow-off examples.
The generated scenic mockup is retained only on the working branch, separately
from this asset proof. It illustrates the excavation direction, not gameplay.

Validation checks exact opposite-edge equality, source-crop completeness,
alpha/glow registration, clear padding, no green fringe, centroids, neutrality,
24 brood-tint samples, all PNG decoding and the <1.5MB production budget.
Assets have overhead material relief matching the concept; geological bank
faces and barrel rims show depth, so they are not a flat mathematical projection.
No cast ground shadows are authored. Game code is unchanged; integration is later.
