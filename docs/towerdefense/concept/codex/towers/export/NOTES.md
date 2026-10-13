# Tower puppets — issue 129

Art generated with OpenAI image_gen.imagegen on retained #00FF00 sheets.
Pillow/NumPy key, despill, resize, extract emission and render the exported assets.
Reference: td-towers-base.png on codex/towerdefense-concept-art; working branch
codex/td-towers-work is based on towerdefense-concept-art.

FILES.txt enumerates every actual production file, including this note.
manifest.json indexes one manifest each for Tesla, Mortar and Prism.
Offsets, pivots, mountPosition and anchors use the 224x224 assembled rest frame.
Pad/subplatform outline centers and weapon mounts share [112,112]. Center the
octagonal bodies by outlineBounds, excluding sockets and side fittings; anchor
weapons by their feet. The 136px pad remains 2x a 68px game footprint.
Four clear pixels pad every part and every effect frame.
Include all parts with minLevel <= level; upgrades are cumulative through L5.
Every part has a same-canvas _glow.png; unlit parts have clear emissive layers.
Effect strips are already emissive RGBA, not body parts needing duplicate glows.

Only Mortar has aim.enabled=true: rotate head about [112,112], inherit transforms.
Its child barrel recoils 8px along local +y; the muzzle anchor follows the barrel.
Tesla/Prism remain fixed. Tesla L3 adds auxiliary coils, L5 adds arcing metal orbs;
Mortar adds hot indicators/vents (glowScale=1.8). Prism L1 omits a winding; L5 coils
sit large center-front/small rear-right. Aiming and accepted centering are preserved.
Their animations.passive loops for 1600ms; animations.attack is a 640ms one-shot.
Each state defines glowGain/glowStrength/effectOpacity keys in milliseconds,
four VFX frames, frameDurationMs, frameSize, offset, parent and additive blending.
Tesla crackles with high-contrast blue-white arcs; copper is non-emissive. Prism
breathes; attacks brighten and fork through generated electrical/crystal frames.
Use premultiplied additive RGB for effects; do not recolor non-emissive steel.
Cable and range_center anchors are fixed on pad; all coordinates are rest-frame.

preview.png is rendered from the actual manifests and PNGs on #211d19:
L1/L3/L5 passive, glow peak and attack for Tesla/Prism; 0/45/180-degree Mortar
and matching recoil poses. Each cell includes a 68px-footprint reduction.
Working files include passive/attack GIFs and their same-time comparison.
Validation covers 480 aiming/recoil poses, 300 animation samples, concentric outlines,
fixed-rig invariance, glow/effect canvases, visible upgrades, clipping and budget.
The full production directory is below 1.5MB. No game code changed.
The concept's steep overhead depth is retained; only Mortar uses 2D aiming rotation.
Rebuild with python -B build.py --output PATH in the working folder.
