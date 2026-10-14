# Environment working files — issue 131

Tool: OpenAI image_gen.imagegen; processing and manifest proofs: Pillow/NumPy.
Original battlefield/tower concepts and accepted issue 129 towers guide material.
The user clarified that lanes must be carved out of ground, not bordered by walls.
trench-mockup.png is the generated scene illustrating that excavation direction.
It is not the scripted production preview and does not claim game integration.

FILES.txt enumerates every actual file; SHA256SUMS.txt records content hashes.
raw/props-sheet-raw.png: 12 worn industrial/rock/canvas props on green.
raw/organic-sheet-raw.png: retained first pass; not used by the exporter.
raw/organic-sheet-v2-raw.png: corrected margins, six growth patches, three burrows.
raw/splat-sheet-raw.png: six distinct neutral-grey liquid splash masters on green.
raw/terrain-sheet-raw.png: three ground textures, floor, unused wall-like lips.
raw/cut-banks-sheet-raw.png: six geological incision strips; first and third used.
All six raw source sheets retain their original #00FF00 matte and resolution.
references/: unchanged original battlefield/towers, accepted tower lineup,
and the actual Warrior cutout used to assess game-scale readability.
generation.md records prompts, source paths, imagegen output names and decisions.
build.py exports, validates and renders entirely from manifest/assets.
requirements.txt pins Pillow/NumPy; proofs also need system DejaVu Sans fonts.
production-NOTES.md is copied to the production export's NOTES.md.
export/ is an exact copy of public/td/environment/, including its own inventory.
preview-full.png: lossless full-color version of the scripted production proof.
ground-tiling.png: three actual 3×3 periodic ground renders.
trench-s-curve.png: source floor and cut-bank strip warped with arc-length UVs.
game-scale.png: actual Warrior cutout at 105px on three manifest-rendered lanes.
comparison.png: original battlefield, exported terrain, accepted towers and props.
validation.json records 33 pairs, seams, tint samples, dimensions and byte budget.

Rebuild: python -B build.py --output /workspace/wattcade/public/td/environment
Recheck: same command with --verify-only. No game sources are read or changed.
No emissive features were invented for terrain or metal: their masks are empty.
Natural cut banks supersede the brief's occasional steel shoring per user request.
Depth relief follows the concept; visible cut faces are not a flat mathematical
projection. No cast ground shadows. Bank orientation/repeat rules are in manifest.
