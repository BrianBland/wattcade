# Source provenance and generation decisions

Current production is the painted fixed-map revision described at the end.
The initial export/tiling description below is historical v1, now archived.

All generated images use OpenAI `image_gen.imagegen`. Raw cutout sheets are
1536×1024 RGB PNGs. Their flat #00FF00 matte is retained unchanged. The separate
1536×1024 scenic trench mockup uses a painted battlefield background.

## References consulted

- `references/td-towers-base.png`: original concept, unchanged from
  `codex/towerdefense-concept-art`, `docs/towerdefense/concept/codex/td-towers-base.png`.
- `references/td-battlefield-landscape.png`: unchanged original battlefield from
  that branch and directory. Both were viewed before generation.
- `references/accepted-towers.png`: unchanged `revised-lineup.png` from
  `codex/td-towers-work/docs/towerdefense/concept/codex/towers/`.
- `references/warrior.png`: unchanged `assembled.png` from
  `towerdefense-concept-art/docs/towerdefense/concept/codex/warrior-parts/`.

Issue 129 and PR 135's description, NOTES and generation history were consulted.
The accepted direction prioritizes real original silhouettes/materials, authored
registration, restrained metal colors and separate emissive layers. Ground
readability is explicitly quieter than the original battlefield.

## Raw generations

1. `exec-9ccf95bd-f59e-4673-b843-a61eaa62d000.png` → `raw/props-sheet-raw.png`.
   References: original tower and battlefield images. Requested 4×3 separate
   cutouts, worn riveted gunmetal/brass/copper/soot/rust, subdued hazard markings,
   overhead light, no shadows. Two boulders, square/long crates, two barrel lids,
   whole/broken barriers, curved/straight sandbags, cable junction and vent.
2. `exec-cb54c37e-a749-44d3-a27d-d35e6f40f843.png` → `raw/organic-sheet-raw.png`.
   References: original battlefield and tower materials. Requested 3×3 cutouts,
   six distinct purple-black veined creep patches with small glowing pustules,
   three low burrows, no ground or cast shadows. Some tendrils approached cell
   boundaries; this first pass is retained but not used.
3. `exec-7f408bff-dd41-4189-9901-996fcf55ead1.png` → `raw/terrain-sheet-raw.png`.
   Reference: original battlefield. Requested three quiet desaturated dark alien
   rock squares, slightly lighter packed dirt/rubble floor and two lip strips.
   Original strips included steel shoring; they were superseded after the user's
   excavation clarification. Only the four surface squares are exported.
4. `exec-3bd60ea2-a680-4090-a4dc-c28e9e3315dc.png` → `raw/splat-sheet-raw.png`.
   Reference: original battlefield. Requested 3×2 neutral-grey liquid decals:
   radial ichor, directional splash, double pool, perforated acid ring, vertical
   smear and explosive streak rosette. No colored body material, shadows or ground.
5. `exec-2330e3b2-1644-43cf-993e-950ddf5ecee3.png` → `raw/organic-sheet-v2-raw.png`.
   References: original organic sheet and original battlefield. Requested complete
   tendrils, smaller contained objects, matching six silhouettes, and geological
   hive mouths rather than monster jaws. Export crops follow actual component
   bounds rather than an assumed equal grid; no opaque source edges are clipped.
6. `exec-765f1146-5203-4097-b4f1-6a632f182176.png` → `trench-mockup.png`.
   References: both original concepts and accepted tower lineup. User requested
   a mockup of lanes carved into the ground. Prompt specified three broad winding
   excavated dirt lanes, exposed layered geological banks, sparse spoil, calm dark
   terrain, hive entrances, original flywheel outpost, reference towers and local
   outpost props. No freestanding lane walls or barricade corridors. This image
   demonstrates scene direction; no production state is substituted with it.
7. `exec-8785298a-fe45-4112-9b6c-8445bac57a81.png` → `raw/cut-banks-sheet-raw.png`.
   Reference: trench-mockup.png. Requested six 2×3 natural excavation bank strips:
   upper ground rim at top, exposed dark geological cut face, loose chips toward
   bottom/floor, transparent green surrounding; no metal, retaining posts, masonry
   blocks or cast ground shadow. First layered and third fractured variants used.

## Export and proofs

`build.py` keys/unmixes green edges, checks cutout source boundaries, scales and
pads cutouts, registers visual centroids, isolates existing purple emissive pixels
and neutral splat highlights, and writes palette PNGs. Terrain luminance is
compressed around #211d19 (floor slightly lighter) so creatures read above it.
Opposite texture neighborhoods are blended with smooth weights and exact matching
edge pixels; no mirrored half-tile replacement is used. Strips repeat only on x.
Palette colors are despilled after quantization to prevent averaging fringes.

Scripted previews reload `manifest.json` and decoded production PNGs. Geological
banks are bent with arc-length UVs and oriented ground-to-floor consistently on
both lane sides. Every exported decal/prop and every requested tint is shown.
Base art remains complete without additive glow; non-emissive pairs are clear.
The original Warrior is a read-only reference and is not included in production.

The 2D assets retain original-style overhead relief; cut-bank faces and barrel
rims are visible. This is documented rather than described as mathematically flat
orthographic projection. No game code, fresh generated production previews,
unproduced assets, or renderer integration are claimed.


## Painted fixed-map revision — user-approved architecture

The user rejected the flattened production terrain as bland and approved using
one cohesive painted terrain background matching trench-mockup.png. They also
requested towers on top of the plateau, rather than within trenches. The raw
PNG paintings are retained without color flattening; production encodes the full
1536×1024 image as WebP quality 92. Independent overlays remain unchanged.

- exec-bf55665a-4027-4c99-9cb8-a3a3f3e5fa36.png → raw/battlefield-painted-v2-raw.png.
  References: initial geometry guide (retained in archive/map-layout-guide-initial.png)
  and trench-mockup.png. Requested exact guide lane composition with the mockup's
  rich fractured basalt, eroded geological cut faces, brown recessed floors,
  loose spoil and six empty plateau placement sites. No actors, outpost, towers,
  cables, lights, organic growth or industrial props in the painting.
- exec-138eb409-590d-4d75-879f-db5b14ea414d.png → raw/battlefield-painted-v3-raw.png.
  References: v2 and the initial guide. Local request to level six plateau
  mounting patches at their given pixel centers, preserving all trenches,
  material texture, geological depth and global composition.
- exec-24d6fa4f-7bd0-453e-be6b-e8c3a35aa1e6.png → raw/battlefield-painted-v4-raw.png.
  References: v3, initial guide and initial cyan registration overlay (retained
  as archive/registration-before-path-trace.png). Requested right-floor
  registration correction only, continuous packed brown navigable floor,
  preserved left/center trenches and all material style. This is exported.

The image model does not enforce pixel-exact geometry. Rather than claiming it
followed every guide exactly, the final right-floor centerline was measured from
brown floor support and fit to a cubic with fixed spawn/base endpoints. The final
rounded controls [103,16],[84,18],[87,66],[50,90] follow the authored floor.
Left/center retain existing game controls. Both original and revised right
controls are exported for the future integration; no game code was changed.
Final plateau pad positions are selected with full-footprint bank clearance
and >=91.5% rock-top material support on the retained source painting,
not merely centered somewhere near a trench. The integration handoff documents
applying lane/pad changes together in the shared simulation/render definition.

Final map-layout-guide.png and registration.png are scripted final geometry
proofs; they are not generated terrain. scene.py renders the actual decoded
background and overlay manifest with accepted tower and outpost export references
copied unchanged from codex/td-towers-work and codex/td-outpost-work, plus their
unchanged original rendering scripts. The original Warrior stays a reference.
These external rigs are review-only and not new production machinery assets.
Proof cables are drawn in the script and are not bundled cable art assets.

Primary assembled proof shows three built towers. all-six-pads.png verifies all
six footprints. Portrait uses the same registered map. The reference comparison
uses the actual approved trench-mockup.png and actual assembled delivery, not
newly generated substitute scenes. Overlay proof enumerates all retained 27
pieces and every required brood tint. Archived v1 exports are not live assets.


## Shallow-path iPad integration revision

The latest owner request supersedes deep cut faces and busy plateaus. Source
references D-full-1.25.jpg, visibility-variants.jpg and floor-variants.jpg are
copied unchanged from towerdefense-concept-art30cca91 into references/integration/.
All three existing curve controls are preserved; no new tracing or fitting.
layout.py draws a13-unit floor plus1.25-unit shoulder per side and wider apron,
using targetRGB110,80,58 against neutralRGB49,49,51. This is geometry guidance,
not a runtime schematic. Image generation textures it into continuous terrain.

- exec-98a8b458-9977-4233-9d17-04921e071b36.png → raw/battlefield-shallow-v5-raw.png.
  References: exact new map-layout-guide and old v4. Requested13-unit smooth
  packed umber floors, shallow low rubble edges, removal of all vertical cliff
  faces, darker neutral broad plateaus and half the detail. No actors/objects.
- exec-8896df31-0125-45af-8137-b6f5d2908a71.png → raw/battlefield-shallow-v6-raw.png.
  References: v5 and guide. Requested less orange floors at110,80,58, broad quiet
  charcoal slate masses and another half reduction in fine chipping/contrast.
- exec-d89e5d4a-5fb8-476b-b44f-0056250f4527.png → raw/battlefield-shallow-v7-raw.png.
  References: v6 and guide. Requested lighter floor by approximatelyRGB+9,+8,+7
  to avoid undershooting the owner's warm umber target, preserving all geometry.
  This is the production source. Decoded floor mean114,86,63; plateau52,49,48.
- exec-27b23583-83f6-4b54-934c-cfa0fd01ce01.png → raw/battlefield-shallow-v8-raw.png.
  Reference: v7. Requested tiny floor correctionRGB-4,-6,-5. The model instead
  produced mean101,72,51, darker than intended, so this is NOT exported.

Raw sources remain unchanged. No scripted terrain recolouring, repainting or
boundary warping is applied. Production is the full v7 RGB painting encoded
WebP92. The model does not guarantee exact RGB: actual measured decoded values
and geometry-masked material support are reported, rather than intended values.
The RGB target110,80,58 is33.3% under Rec.709 encoded-sRGB weighting; the delivered
floor is35.3%, on the lighter side, rather than the rejected near-dark floor.
Linear relative luminance is reported separately and is not display value.

capture-integration.mjs uses the actual unmodified dev/td-integration.html and
td-rig.ts from towerdefense-concept-art30cca91. All requested screenshots use
real alien rigs, exact viewport1366×1024 atdeviceScale2 and actual served PR
assets, with no floor/rock mock-up recolouring. All tower/outpost asset files
match fetched PR135/136 heads byte-for-byte (51 and43 files respectively).
The extra scripted proof places real Warriors at±2.25 on all three paths and
measures384 gait poses. Measurement excludes faint shadow/glow/antialias and
checks both mathematical floor bounds and actual warm earth pixels. Served
asset hashes and browser errors are recorded with captures. preview.png is a
reduced real-puppet capture. Earlier schematic/Warrior-only scene proofs and
their original scene.py are archived under archive/deep-v2, not shown as current.


## Final pushed direction

The owner rejected the smooth-floor style, explored original-style textured
terrain and tactical angular routes, then explicitly restored the curved map
and authorized pushing it. Current production source is
mockups/original-direction/background-raw.png (exec-66623461 refinement),
not raw/battlefield-shallow-v7-raw.png. The current scripted preview is the
real-rig curved-wiring mockup. Each mockups/*/NOTES.md inventories every local
artifact and generation provenance; the tactical route experiment is retained
only as history. Cabling remains renderer-owned proof work, not baked scenery.
Historical smooth-floor colour/hue tests are diagnostic for this restored
material direction; measurements report actual values without claiming the
earlier smooth-floor targets are met.
