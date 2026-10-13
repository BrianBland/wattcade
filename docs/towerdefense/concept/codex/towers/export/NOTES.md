# Tower puppets — issue 129

Art generated with OpenAI image_gen.imagegen on retained #00FF00 sheets.
Pillow/NumPy key, despill, resize, extract emission and render the exported assets.
Reference: td-towers-base.png on codex/towerdefense-concept-art; working branch
codex/td-towers-work is based on towerdefense-concept-art.

FILES.txt enumerates every actual production file, including this note.
manifest.json indexes one manifest each for Tesla, Mortar and Prism.
Offsets, pivots, mountPosition and anchors use the 224x224 assembled rest frame.
The pad and main mounting points share [112,112]; placement uses source sockets,
not image bounding-box centers. The 136px pad remains 2x a 68px game footprint.
Four clear pixels pad every part and every effect frame.
Include all parts with minLevel <= level; upgrades are cumulative through L5.
Every part has a same-canvas _glow.png; unlit parts have clear emissive layers.
Effect strips are already emissive RGBA, not body parts needing duplicate glows.

Only Mortar has aim.enabled=true: rotate head about [112,112], inherit transforms.
Its child barrel recoils 8px along local +y; the muzzle anchor follows the barrel.
Tesla and Prism remain fixed, including all their upgrades, when aiming changes.
Their animations.passive loops for 1600ms; animations.attack is a 640ms one-shot.
Each state defines glowGain/glowStrength/effectOpacity keys in milliseconds,
four VFX frames, frameDurationMs, frameSize, offset, parent and additive blending.
Passively breathe the emissive pixels and add sparse sparks; attack charges,
brightens and forks through the generated electrical/crystal effect frames.
Use premultiplied additive RGB for effects; do not recolor non-emissive steel.
Cable and range_center anchors are fixed on pad; all coordinates are rest-frame.

preview.png is rendered from the actual manifests and PNGs on #211d19:
L1/L3/L5 passive, glow peak and attack for Tesla/Prism; 0/45/180-degree Mortar
and matching recoil poses. Each cell includes a 68px-footprint reduction.
Working files include passive/attack GIFs and their same-time comparison.
Validation covers 480 aiming/recoil poses, 300 animation samples, socket centering,
fixed-rig invariance, glow/effect canvases, visible upgrades, clipping and budget.
The full production directory is below 1.5MB. No game code changed.
The concept's steep overhead depth is retained; only Mortar uses 2D aiming rotation.
Rebuild with python -B build.py --output PATH in the working folder.
