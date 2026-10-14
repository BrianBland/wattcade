# Painted map integration

The user approved a fixed painted landscape following trench-mockup.png.
This supersedes the old ground-tile/lip-strip design in #131/#133.
This PR supplies art and geometry; it does not change game code.

## Registered coordinates

background.webp is 1536×1024. Its 100×100 world field occupies image
rectangle [318,32,900,900]. Outpost [50,90] maps to image [768,842].
For a renderer field origin (fieldX,fieldY) and square size fieldSize:

    imageScale = fieldSize / 900
    imageX = fieldX - 318 * imageScale
    imageY = fieldY - 32 * imageScale
    draw image at (imageX,imageY), size (1536,1024) * imageScale
    actorX = fieldX + worldX * fieldSize / 100
    actorY = fieldY + worldY * fieldSize / 100

Terrain and actors must share this transform. Do not independently cover-scale
terrain while preserving the old actor transform. The portrait proof crops the
same image at x318..1218. Outer viewport space can use a rock-colored backdrop.
The side spawns intentionally begin outside the world field.

## Adopt lanes and pads together

Left/center control points exactly retain current sim/defs.ts. The right-hand
lane follows the authored brown floor with controls:
[103,16], [84,18], [87,66], [50,90]. Its original controls are retained in
previousControls. This minor path revision keeps creatures off the cut face.
Update the shared lane table when integrating this map, not only render geometry.

Existing PADS are eight units off lane centers, too close to the richer banks.
map-layout.json supplies all six new positions, original positions, stable ids,
lane assignments and near/far flags. Apply them in the shared sim/render pad
source so targeting, build selection, auto-crew, cables and art stay aligned.
Each 4.2-unit-radius footprint has >=1 unit of clearance beyond the intended
bank extent (floor half-width 4 + bank width 2), and pad centers are >=17 units
from the outpost. Numeric clearance and whole-footprint rock-top material checks accompany
registration.png/all-six-pads.png; material support is measured on the retained
source PNG and codec fidelity is verified separately.
Painted rim shapes vary organically; review the actual assembly as well.

## Separate layers and proofs

The background contains only terrain and its intrinsic geological shading.
Actors, machinery, cables, emission, creep, burrows, splats and props remain
separate. Existing tower/outpost PRs supply machinery; this folder supplies
27 overlays. The preview uses those exact exported rigs and the original Warrior.
Its illustrative cables belong to the proof renderer, not a new cable asset kit.

manifest.json.size is the canonical 512×512 overlay registration frame;
background.size is the separate painted image. Place each overlay pivot at its
world position, preserving its offset relative to that pivot. Purple organic
emission and neutral white splat emission remain independently controllable.

preview.png is a reduced scene proof; overlays-preview.png shows all overlays
and brood tints. Neither is a runtime background or a claim of integration.
