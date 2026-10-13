# Tower working files — issue 129

Generating tool: OpenAI image_gen.imagegen (reference-guided generation).
First-pass and revision-2 RGB sheets were generated on #00FF00 for chroma keying.
No new assembled poses were generated; build.py renders every preview from manifests.

FILES.txt enumerates every actual file produced in this folder and export/.
raw/*-sheet-raw.png: retained first-pass sheets; Tesla supplies the shared pad.
raw/*-sheet-v2-raw.png: regenerated base/head/barrel/upgrade parts per user feedback.
raw/tesla-head-v2-raw.png: separately refined short, wide solenoid and blue sphere.
reference-towers.png: unchanged approved reference copied from
codex/towerdefense-concept-art:docs/towerdefense/concept/codex/td-towers-base.png.
That reference is absent from towerdefense-concept-art; this work branches from it.
generation.md records the reference and the instructions used for the three sheets.
build.py: explicit source crops, matte removal, despill, fit without distortion,
paired upgrade placement, emissive extraction, manifest export and affine renderer.
requirements.txt: Pillow and NumPy; no runtime/game dependencies were added.
validation.json: all 480 L1–L5 poses checked, padding, emission canvases, parent graph,
cumulative visible upgrades, static anchors, 8px rotating Mortar recoil and size budget.
glow-off.png: L5/45-degree assemblies with emissive overlays disabled.
animate.py: manifest-only animated previews; run python animate.py to reproduce.
animations/towers-rotation.gif: L1/L3/L5 heads rotate; Mortar barrels recoil.
animations/towers-upgrades.gif: cumulative L1–L5 additions at 45 degrees, with recoil.
compare.py and comparison.png: original concept, rejected first pass and revised rigs.
revised-lineup.png: revised L1 and L5 rigs at zero degrees for all three towers.
export/: exact production folder; its NOTES.md and FILES.txt describe every export.
export/preview.png: 36 requested poses and reduced 68px-footprint views on #211d19.

Rebuild: python build.py --output /workspace/wattcade/public/td/towers
Recheck: python build.py --output /workspace/wattcade/public/td/towers --verify-only
Production contains only PNG assets, manifests, preview and documentation.
The pad is shared by all towers. Every part has a matching glow canvas, even unlit ones.
Head children rotate; the Mortar barrel recoils in that rotated coordinate frame.
Revision 2 follows the concept's steep overhead view with visible machinery depth
per the user's request; it is not strict orthographic. No baked ground shadows.
