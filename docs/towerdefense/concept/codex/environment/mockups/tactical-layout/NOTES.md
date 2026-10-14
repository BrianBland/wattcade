# Tactical route and tower placement mockup

Owner authorized changing the original curves and adding sharp corners.
Level-ground routes: two side approaches with defended elbows, a direct centre
approach, lower side doglegs and a shared outpost apron. Six tower sites.
13-unit floor envelopes,1.25-unit shoulders; all pads radius4.2 and13–16 units
from their own route, >=12.95 from every route, >=17 from outpost. All tower
footprints stay inside the100×100 field. Background registration unchanged.

layout.py calculates clearance and uniform arc-length coverage at real base
Tesla24/Mortar36/Lens44 ranges from sim/defs.ts. placement-check.json retains
all per-pad/per-lane measurements. At range24, side pads cover54.19/61.18 units
of their own route versus38–42 in the preceding cubic mockup. Centre sites
trade some own-route coverage for cross-lane coverage. This is geometric firing
opportunity, not a balance simulation; summed coverage includes overlap.
Side route length120.87,centre93.0 units. Centre arrives earlier at equal speed.

prepare-scale.mjs/route.mjs adapt the local integration proof to waypoints and
arc-length positioning; no game code changes. Gliders cross clear rock gaps.
Actual rigs, outpost and all six towers are unchanged at sim-derived size.
Production movement would round steering inside the elbow envelopes and
interpolate heading; the mockup adapter uses piecewise-linear positions/headings.

Generated art: OpenAI image_gen.imagegen. Inputs: tactical scale guide plus
original-direction terrain, accepted tower sheet and eight-enemy overview.
exec-c15e19ac-ec81-4ef8-a6f1-ca34b37b3a84.png → background-study.png;
initial material pass rounded lower turns excessively (not shown as final).
exec-adc10a87-89c9-4b4b-a3de-e132bc83290c.png → background-raw.png;
corrected against path-guide.png to restore clear lower elbows and floor width.
No actors, towers, outpost or cables baked into the generated terrain.

Exact produced files:
layout.py; map-layout.json; path-guide.png; placement-check.json;
route.mjs; prepare-scale.mjs; scale-guide-with-real-rigs.png;
background-study.png; background-raw.png; capture.mjs; real-sprites.png;
readability-aids.png; capture.json; NOTES.md.

Capture1366×1024CSS@2x,2732×2048PNG. Current sprites shown without aids;
separate aid comparison usesblue0.5/rim0.45. No browser errors. Source hash in
capture.json. Direction mockup only; production files and PR138 unchanged.
