# Seaside — art-direction prototype (not a registered game yet)

Story/pacing: `docs/seaside/storyboard.html`. Stills: `docs/seaside/stills/*.png`.
Render: `npx tsx scripts/seaside-stills.ts [highway turnout shop lou]`; live: `/dev/seaside.html?still=…&stats=1`.

## Voxel pipeline (`voxel/`)
- `grid.ts` sparse 32³ chunks of palette indices; world-space brushes (`wbox`, `wellipsoid`, `wsegment`).
- `mesh.ts` pure culled-face mesher, baked per-vertex AO (quad diagonal flipped toward the brighter pair), per-voxel ±brightness jitter. Unit-tested.
- `palette.ts` named sRGB hex → linear table. Cubes are one flat colour each; variety comes from palette variants + jitter + AO.
- `three.ts` one `BufferGeometry` per chunk, `MeshLambertMaterial({ vertexColors })`.

## Scenes (`world/`, `stills/`)
- `world/coast.ts` heightfield → LODs: close 1/8 m (ring around camera), near 1/4 m, mid 1 m, far 6 m, detail 1/16 m props.
  Road spline `roadX/roadY`, sea-side cliff edge `edgeD`, mountain spurs, sea stacks, kelp, foam, cypresses, guardrail, signs, van.
- `world/rider.ts` first-person kit in camera space: drop bars + Zwift-Ride-style hood buttons, neutral gloves, head unit; rod + reel; leaned bike; bobber.
- `stills/stage.ts` renderer, gradient sky shader, exp fog, sun with shadow box, hemisphere light, FP fill light. NeutralToneMapping keeps colours vivid.
- `world/lou.ts` Lou, one reusable model: red watch cap, white beard + walrus moustache, rosy nose, pipe, gold earring, yellow oilskin bib. Finishes `live`/`stone` (temple statue), poses `counter`/`wheel` (the car).
- `stills/later/` 5 scenes, `tick(t)`-animated; clips: `npx tsx scripts/seaside-scenes.ts` (`?play=1` plays live).
- `stills/shopStill.ts` Lou's counter diorama at 2 cm voxels + HTML paper UI overlay (price tags, receipt); `stillLouSheet` character sheet.
## Motion test (`stills/ride.ts`)
- 10 s ride → cut → cast, bite, pull, haul-up (23.5 s). Pure `setTime(t)`; articulated rod (7 bending joints), shader swell on a separate water mesh, splash particles + rings.
- Clip: `npx tsx scripts/seaside-clip.ts` → `docs/seaside/clips/ride-fish.mp4`. iPad: `npm run dev:ipad` → `/dev/seaside-ride.html` (fps overlay).

## Fast path (clip default): `?lod=1&lodres=32&lodmin=4&skirt=2&lodk=0.85&bake=1&road=1&routelod=3&hyst=1.3&fade=0.5&decor=0.25`
- `voxel/greedy.ts` merges faces exactly (AO-constant strips, colour variants folded via `COAST_FOLD`, per-cube noise moved to `voxelMaterial` shader).
- `world/terrainLOD.ts` quadtree of 32-voxel tiles around the camera (1/8 m underfoot, doubling per ring), built on demand + cached = streaming. One land + one water mesh per tile, skirts hide cracks.
- `road=1`: the road corridor (|d| ≤ 6.2 m) skips the rings: fixed 1/8 m segments (1/2 m past 200 m), built once, so it
  stays flat to the horizon; coarse terrain touching it is capped below the road. Reuse for boardwalk/bridges.
- `decor`: real half-size cubes on tiles ≤ 1/4 m (bumps in clumps off the asphalt; rubble at the foot of 1-step risers).
- Anti-popping: detail follows max(route distance, camera distance / 3) (`routelod`), hysteresis, 0.5 s Bayer dissolve.
  `scripts/seaside-pops.ts`: cube px at a level change avg 6.3 → 3.9, max 12.8 → 7.3; render +12% (185 → 208 ms).
- `world/sunShadow.ts` bakes terrain self-shadowing (sweep toward a fixed sun, 3 nested levels); faces carry `sunVis`, which scales only direct light. Live shadow map now holds only props (trees, rails, van, bike).
- Tiles build in a Web Worker pool (`world/tileWorker.ts` → pure `world/tileBuild.ts`); the visible set swaps atomically
  when all its tiles are ready (no holes); positions ahead on the route are prefetched. Visible tiles merge into 2×2
  clusters; props merge into 48 m clusters (`buildClusteredMeshes`). 125 ms → 133 ms render, 565 → 94 draw calls.
## Looks (`render/looks.ts`, `render/post.ts`) — `?look=raw|crafted|illustrated|pixel|morning|midday|fever`
- Material: per-cube bevels, mixed-size sub-cubes (`?detail=`, 2×2/4×4 in patches), cool ambient / warm sun (`LOOK`). Post: ink outlines
  (depth silhouettes + 1/depth creases), split-tone grade, posterize + Bayer dither, low-res pixels, bloom/halation,
  and a `dream` dial (vignette, hue drift, chromatic fringe, wobble). Sheets: `npx tsx scripts/seaside-looks.ts`.
- Not yet: sim/game module, audio, scenarios; nothing in `src/games/registry.ts`.
