# Painted battlefield integration

This is one fixed painted map. Routes are level worn earth/rock with low rubble shoulders.
The owner returned to the richer original material direction. No procedural map assembly or variable layouts.
The production PR changes assets and geometry data only, not game code.

## Registration (unchanged)

background.webp: 1536×1024; field image rectangle [318,32,900,900],
100×100 field units. Outpost [50,90] maps to image [768,842].

    imageScale = fieldSize / 900
    imageX = fieldX - 318 * imageScale
    imageY = fieldY - 32 * imageScale
    drawImage(background, imageX, imageY, 1536*imageScale, 1024*imageScale)
    actorX = fieldX + worldX * fieldSize / 100
    actorY = fieldY + worldY * fieldSize / 100

Terrain and actors share this transform. The side spawns start outside the field.

## Adopt map-layout.json in the shared simulation/renderer definitions

All three curves exactly retain the previous #138 map-layout.json controls.
Left: [-3,16],[28,18],[18,66],[50,90].
Centre: [50,-3],[34,28],[66,52],[50,90].
Right: [103,16],[84,18],[87,66],[50,90].
The earlier simulation right controls remain in previousControls for reference.
Do not trace or refit these curves. floorWidth=13 (6.5 either side), bankWidth=1.25
per side. The shared apron has an 11-unit radius at [50,90].

Six plateau pads, radius4.2, stable ids and lane assignments, one near and one
far per lane. Each centre is 13–16 units from its assigned curve and at least
12.95 from every curve: floor half-width6.5 + shoulder1.25 + pad4.2 + clearance1.
All centres are at least17 units from the outpost. previousPosition is preserved
unchanged; archive/map-layout-deep-v2.json on the working branch also retains
the immediately preceding painted-map placements. Apply lanes/pads together
so targeting, selection, movement and art agree. Integration remains #133.

## Layers (unchanged)

Background is opaque terrain only. Towers, outpost, aliens, cables, creep,
burrows, splats, props and emissions stay separate. All 54 overlay PNGs are
byte-identical to the preceding #138 delivery. manifest.json.size is the
canonical 512×512 overlay frame; background.size is the separate full image.
Place each overlay by its pivot and offset; glow uses alpha-weighted additive
RGB once. Neutral splats multiply by brood RGB. Props have clear glow masks.

## Real-puppet proof and cabling handoff

Current proof: mockups/curved-wiring/real-sprites.png on the working branch.
It uses the unchanged original-style painting, actual alien rigs, PR135 tower
and PR136 outpost exports at1366×1024CSS,deviceScale2. Eight alien species,
all six towers and the outpost use their real sim-derived/manifest sizes.
The proof renderer connects each tower to a unique cable_1..6 deck socket,
using actual transformed anchor positions. Armoured texture follows curved
routes with return hoses; short floor crossings are buried with flush covers.
Wiring draws beneath all actors and machinery, never through the flywheel.

Cabling is renderer-owned review work, not baked into background.webp and not
a new production cable kit. Source texture, route/capture scripts, actual
endpoints and hashes are in mockups/curved-wiring/. Path/pad data unchanged by
that exploration. The sharp tactical waypoint study is not adopted.

preview.png is a reduced current curved-wiring proof from the source painting;
overlays-preview.png shows the unchanged kit and brood tints. Neither is a
runtime background. Earlier proofs/ screenshots and384 Warrior gait poses
belong to the rejected smooth-floor painting; they do not certify this source.

terrain-measurements.json reports decoded meanRGB, Rec.709-weighted encoded
sRGB display value and linear relative luminance separately. Masks cover the
registered field and apron, excluding shoulders. The owner returned to richer
textured materials: neutral stones and warm industrial ruins make old hue,
colour-target and calm-plateau checks diagnostic rather than compliance claims.
Numeric geometry, centreline support, codec fidelity and overlay checks remain.
Final proof captures: proofs/current/, all three exact requested iPad URLs and
384 maximum-offset Warrior poses. No solid pixels outside13-unit geometry;
99.9577% of sampled footprint pixels are warm dirt; neutral stones explain the
remaining0.0423%. Source hashes and zero browser errors are recorded in JSON.
