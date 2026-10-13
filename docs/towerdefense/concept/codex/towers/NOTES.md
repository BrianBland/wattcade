# Tower working files — issue 129

Generating tool: OpenAI image_gen.imagegen, guided by reference-towers.png.
All raw sheets use #00FF00; every pose/GIF is rendered from exported manifests.
FILES.txt enumerates every actual file in this folder and export/.
raw/*-sheet-raw.png: retained first-pass sheets; Tesla supplies the shared pad.
raw/*-sheet-v2-raw.png: revised bases, heads, barrel and cumulative upgrade pieces.
raw/tesla-head-v2-raw.png: refined short, wide solenoid and sphere.
raw/tesla-effects-raw.png and raw/prism-effects-raw.png: generated electrical and
crystalline passive/attack VFX, four frames per state. No machinery in those sheets.
reference-towers.png: original copied unchanged from codex/towerdefense-concept-art,
docs/towerdefense/concept/codex/td-towers-base.png; absent from towerdefense-concept-art.
generation.md records source provenance and instructions for every raw sheet.
build.py: key/despill/crop, octagonal outline and weapon socket placement, PNG export,
manifest-driven aiming, recoil, time-keyed emission and additive-effect rendering.
requirements.txt: Pillow/NumPy; no runtime game dependencies or game changes.
validation.json: 480 aiming/recoil poses plus 300 animation samples; concentric outlines,
fixed Tesla/Prism geometry, frame padding, upgrades, clipping, anchors and size budget.
glow-off.png: L5 rigs without emission (only Mortar aims to 45 degrees).
animate.py: reproduce GIFs with python -B animate.py.
animations/towers-passive.gif: L1/L3/L5 restrained pulse and sparks; Mortar rests.
animations/towers-attack.gif: Tesla/Prism discharge; Mortar alone aims and recoils.
animations/towers-behavior.gif: same-time L5 passive versus attack comparison.
animations/towers-rotation.gif: compatibility copy of towers-attack.gif.
animations/towers-upgrades.gif: cumulative L1–L5 upgrades with corrected behavior.
compare.py/comparison.png: original concept, first pass and current centered rigs.
revised-lineup.png: current L1/L5 rigs at rest. alignment.png exposes pad/base outlines.
export/: exact production folder, with its own NOTES.md and FILES.txt inventory.
export/preview.png: passive/peak/attack states for Tesla/Prism; Mortar angles/recoil;
each pose includes a 68px-footprint reduction. FX strips live in export/*/effects/.

Rebuild: python -B build.py --output /workspace/wattcade/public/td/towers
Recheck: add --verify-only. The 224px rest frame has transparent headroom;
136px pad remains 2x 68px. Pad/subplatform outlines and weapon mounts share [112,112].
Only Mortar has aiming enabled; Tesla/Prism body parts and upgrades remain fixed.
The concept's steep overhead depth is retained, rather than strict orthographic.
No baked ground shadows. Passive loops 1600ms; attack is a 640ms one-shot.
