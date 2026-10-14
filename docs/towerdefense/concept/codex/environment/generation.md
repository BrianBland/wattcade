# Source provenance and generation decisions

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
