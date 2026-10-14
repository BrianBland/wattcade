# Dynamo Defense environment — curved original-style revision of PR138

Terrain generated/edited with OpenAI image_gen.imagegen; WebP export with Pillow.
Fixed1536×1024 painting; registered field [318,32,900,900]. Game code unchanged.
13-unit route envelopes; low1.25-unit shoulders; level worn dirt/rock routes.
Original-style detailed basalt and worn industrial remnants; shared apron and six pads.
All three curves and previousPosition fields retained from the preceding map.


Files produced/updated in this revision (exact names):
background.webp; map-layout.json; MAP_INTEGRATION.md; NOTES.md; preview.png;
FILES.txt; SHA256SUMS.txt. All other files are retained byte-for-byte:
manifest.json, overlays-preview.png and54 PNGs in parts/.
FILES.txt is the exact complete63-file production inventory; SHA256SUMS.txt
hashes every other file (including FILES.txt). No obsolete terrain tiles/strips.

preview.png: reduced real-puppet curved-wiring mockup of the source painting,
#135 tower and #136 outpost exports, and all eight actual alien rigs at sim size.
Full2732×2048 proofs and cabling source/render scripts live on the working branch.
overlays-preview.png: all27 retained pieces, neutral splats, four brood tints,
glow-off examples. Both are review images; background has no actors/effects.

Retained overlays: creep_1–6, burrow_1–3, splat_1–6; props_boulder,
props_boulder_split, props_crate, props_ammo_crate, props_barrel,
props_coolant_barrel, props_barrier, props_barrier_broken, props_sandbags_curve,
props_sandbags_straight, props_junction, props_vent. Each has its matching
_glow.png; all offsets, pivots, alpha and emission layering are unchanged.

Working branch: codex/td-environment-work, folder
 docs/towerdefense/concept/codex/environment/.
measure.py/terrain-measurements.json: geometry-masked actual decodedRGB/value.
mockups/curved-wiring/: six actual socket connections and textured curved feeds.
The cables are a local proof renderer, not baked scenery or production cable assets.
proofs/current/: three exact iPad URL captures and384 Warrior offset poses.
No solid pixels exceed the13-unit envelope;0.0423% sample neutral floor stones.
MAP_INTEGRATION.md describes required shared lane/pad adoption under #133.
No live gameplay integration or actual hardware-browser test is claimed.
