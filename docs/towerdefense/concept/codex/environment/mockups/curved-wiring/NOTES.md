# Curved battlefield with socket-correct rich cabling

Owner requested returning to the previous curved, original-style mockup.
Terrain is ../original-direction/background-raw.png, byte-for-byte unchanged.
map-layout.json retains all three cubic curves and all six pad positions.
No tower, outpost or alien art changes; actual rigs at1366×1024CSS,deviceScale2.

Small wiring changes demonstrated:
- Each tower connects to a separate actual outpost deck cable_1..6 anchor.
- True tower pad cable anchors replace the old generic hub-to-pad lines.
- Curved armoured feeds with narrow return hoses run mostly on rocky ground.
- Paired inner runs follow the rock islands; outer runs curve around the apron.
- Short lane crossings are buried, with small flush access plates at entries.
- Cables draw behind all machinery/actors; no black spokes through the flywheel.
Paths and pads need no movement for this proof. Incoming pad socket orientation
could be adjusted later for simpler hookups, but is unchanged here.

Cable art: OpenAI image_gen.imagegen, using ../../references/td-towers-base.png.
exec-b24f1ea2-a212-4ac5-8041-41babb2bf627.png → cable-sheet-raw.png.
Prompt: isolated straight gunmetal armoured power conduit, brass couplings,
narrow recessed cyan energy channel, authentic worn metal, top-down lighting,
constant thickness, repeating ribs/collars, green#00FF00 background.
Pillow source key/crop only: cropx380..980 then alpha bounding box produces
cable-texture.png (600×153). Canvas warps its arc-length texture along splines;
return hose, contact shadow and flush access covers are proof renderer details.
No cabling is baked into the terrain; no new production asset kit is delivered.

Exact produced files:
map-layout.json; cable-sheet-raw.png; cable-texture.png; cables.js;
route.mjs; capture.mjs; real-sprites.png; readability-aids.png;
capture.json; NOTES.md.

capture.json records six unique socket assignments, actual transformed endpoints,
route waypoints/lengths, buried lengths, exact source hash and screenshot params.
real-sprites.png shows unchanged current shells; readability-aids.png separately
shows proposedblue0.5/rim0.45. All eight real rigs and six towers are present.
No browser errors. Captures2732×2048 pixels. Cables remain a local review renderer;
production files, simulation, PR138 and the accepted curve definitions unchanged.
