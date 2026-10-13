# Tower working files — issue 129

Generating tool: OpenAI image_gen.imagegen (reference-guided generation).
Three 1536x1024 RGB sheets were generated on flat #00FF00 for chroma keying.
No new assembled poses were generated; build.py renders every preview from manifests.

FILES.txt enumerates every actual file produced in this folder and export/.
raw/tesla-sheet-raw.png: generated shared pad, base, head and four upgrade pairs.
raw/mortar-sheet-raw.png: generated base, drum, recoil barrel and four upgrade pairs.
raw/prism-sheet-raw.png: generated base, crystal head and four upgrade pairs.
reference-towers.png: unchanged approved reference copied from
codex/towerdefense-concept-art:docs/towerdefense/concept/codex/td-towers-base.png.
That reference is absent from towerdefense-concept-art; this work branches from it.
generation.md records the reference and the instructions used for the three sheets.
build.py: explicit source crops, matte removal, despill, fit without distortion,
paired upgrade placement, emissive extraction, manifest export and affine renderer.
requirements.txt: Pillow and NumPy; no runtime/game dependencies were added.
validation.json: all 60 L1–L5 poses checked, padding, emission canvases, parent graph,
cumulative visible upgrades, static anchors, 8px rotating Mortar recoil and size budget.
glow-off.png: L5/45-degree assemblies with emissive overlays disabled.
export/: exact production folder; its NOTES.md and FILES.txt describe every export.
export/preview.png: 36 requested poses and reduced 68px-footprint views on #211d19.

Rebuild: python build.py --output /workspace/wattcade/public/td/towers
Recheck: python build.py --output /workspace/wattcade/public/td/towers --verify-only
Production contains only PNG assets, manifests, preview and documentation.
The pad is shared by all towers. Every part has a matching glow canvas, even unlit ones.
Head children rotate; the Mortar barrel recoils in that rotated coordinate frame.
Limitation: generated bevels retain some depth cues; strict overhead lighting and
approved-reference fidelity require human art review. No baked ground shadows.
