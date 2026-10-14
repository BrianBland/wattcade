# Painted battlefield working files — issue 131 revision

Art: OpenAI image_gen.imagegen, guided by the approved trench-mockup.png.
User rejected flattened modular terrain and approved one painted fixed map.
Left/center lanes stay fixed; the right lane is traced to its painted floor.
Six full tower footprints move onto rock plateaus with bank clearance.
FILES.txt lists every actual file; SHA256SUMS.txt records hashes.

raw/battlefield-painted-v2-raw.png: whole clean terrain guided by lane layout.
raw/battlefield-painted-v3-raw.png: plateau mounting-site refinement.
raw/battlefield-painted-v4-raw.png: right-floor correction; production source.
raw/*-sheet-raw.png and organic-sheet-v2-raw.png: all six retained green sheets.
Current overlay cutouts still use organic v2, splats and props sheets.
trench-mockup.png: approved scenic direction; not the runtime background.
map-layout-guide.png: final scripted geometry guide, not generated art.
layout.py/map-layout.json: registered field, fixed curves and plateau pads.
registration.png: final painted terrain with movement/footprint guides.
build.py: full-resolution export, overlay preparation, validation, inventories.
scene.py: compose real accepted rigs, cables, actors and exported terrain.
MAP_INTEGRATION.md: transforms and required later shared sim/renderer changes.
production-NOTES.md: copied into the production export's NOTES.md.
requirements.txt: Pillow/NumPy; proofs also use system DejaVu Sans.
generation.md: actual prompts/output provenance, including this revision.
references/: original concepts/Warrior, accepted tower lineup, read-only tower
and outpost export PNGs and their original render scripts for honest assembly.
battlefield-assembled.png: full-color 1536×1024 proof with three built towers.
all-six-pads.png: same map with all six towers built on plateau.
portrait.png: crop of the same map retaining tower/outpost footprints.
game-scale.png: reduced assembly; comparison.png: approved vs delivered.
overlays-full.png: every independent overlay/tint and glow-off example.
export/: exact production copy, with its own notes and inventories.
validation.json: actual map, pad, overlay, tint, fidelity and budget checks.
archive/: rejected v1 and initial geometry/registration proofs for history.

Rebuild: python -B layout.py; python -B build.py --output /workspace/wattcade/public/td/environment
Verify: same build.py command with --verify-only. No game code changes.
Integration must adopt right-lane controls and plateau pads in map-layout.json.
Painted cut-face shading is intentional. Actors/effects remain separate.
