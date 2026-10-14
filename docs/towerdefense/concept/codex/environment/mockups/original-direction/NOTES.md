# Original-style level-ground direction mockup

Generated terrain: OpenAI image_gen.imagegen. Actual actors: unchanged puppet
assets drawn by towerdefense-concept-art's real integration page.
Pathing drawn first: same registered1536×1024 image, field[318,32,900,900],
existing three cubic controls, 13-unit movement floors, six pad positions.
prepare-scale.mjs produces the guide with all8 actual alien rigs, six towers
and the outpost at the same registered scale. No generated actors in proofs.

Imagegen inputs: scale-guide-with-real-rigs.png, original
../../references/td-battlefield-landscape.png, roster
../../../puppet-tools/overview.png, ../../references/accepted-towers.png.
First generation exec-713e0147-4156-4a6c-ae83-2717a7f34430.png:
background-study.png. Prompt: level battle-worn industrial/rock terrain,
original mockup materials, exact registered paths, real-size sprite reference,
no trenches/cliffs, no actors, structures or cables baked into output.
Refinement exec-66623461-0c97-4557-bc42-49eff0d7c2dd.png:
background-raw.png. Prompt: preserve geometry/materials, reduce bright small
rubble edges and repetitive pipe remnants while retaining textured richness.

Exact produced files in this folder:
prepare-scale.mjs; scale-guide-with-real-rigs.png; background-study.png;
background-raw.png; capture.mjs; real-sprites.png; readability-aids.png;
capture.json; NOTES.md.

capture.mjs routes only the background image in the real integration page.
Both proofs:1366×1024CSS,deviceScale2,2732×2048PNG,aliens×1.25 sim size.
real-sprites.png: no shell tint or outline; current real metallic/chitin art.
readability-aids.png: planned blue shell tint0.5 and soft rim0.45; separate test.
Warrior78px; Skitter40px before existing1.3× swarm adjustment; Tyrant149px.
Actual six tower and outpost exports match PR135/136; cables are page placeholders.
No browser errors. SourceSHA256 and exact capture parameters in capture.json.

Material fit improved; the small dark blue brood still loses contrast on rock
without the planned readability changes. This is an art-direction/scale mockup,
not a production certification of painted boundary widths or terrain values.
No production files or PR metadata changed by this exploration.
