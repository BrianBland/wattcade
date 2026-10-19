# Seaside — art-direction prototype (not a registered game yet)

Story/pacing: `docs/seaside/storyboard.html`. Stills: `docs/seaside/stills/*.png`.
Render them: `npx tsx scripts/seaside-stills.ts [highway turnout shop lou]` (starts Vite, drives headless Chromium via SwiftShader).
Live: `npm run dev` → `/dev/seaside.html?still=highway|turnout|shop|lou&stats=1`.

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
- `stills/shopStill.ts` Lou's counter diorama at 2 cm voxels + HTML paper UI overlay (price tags, receipt); `stillLouSheet` character sheet.

## Motion test (`stills/ride.ts`)
- 10 s ride → cut → cast, bite, pull, haul-up (23.5 s). Pure `setTime(t)`; articulated rod (7 bending joints), shader swell on a separate water mesh, splash particles + rings.
- Clip: `npx tsx scripts/seaside-clip.ts` → `docs/seaside/clips/ride-fish.mp4` (SwiftShader, ~1 s/frame).
- iPad perf: `npm run dev:ipad`, open `/dev/seaside-ride.html` (fps overlay). Knobs: `?lite=1`, `mid=0 far=0 shadows=0 close=0 res=0.75 midv=2 farv=12 smap=2048 t=12`.

## Fast path (default for the clip): `?lod=1&lodres=32&lodmin=4&skirt=2&lodk=1.2&bake=1`
- `voxel/greedy.ts` merges faces exactly (AO-constant strips, colour variants folded via `COAST_FOLD`, per-cube noise moved to `voxelMaterial` shader).
- `world/terrainLOD.ts` quadtree of 32-voxel tiles around the camera (1/8 m underfoot, doubling per ring), built on demand + cached = streaming. One land + one water mesh per tile, skirts hide cracks.
- `world/sunShadow.ts` bakes terrain self-shadowing (sweep toward a fixed sun, 3 nested levels); faces carry `sunVis`, which scales only direct light. Live shadow map now holds only props (trees, rails, van, bike).
- Bench: `npx tsx scripts/seaside-bench.ts "<query>" …` (frames → /tmp/seaside-bench). Headless SwiftShader, 1280×720:
  original 1057 ms/frame, 10.7 M tris → fast path 125 ms, 0.64 M tris, 565 calls. Clip recording 816 s → 132 s.
- Tiles build in a Web Worker pool (`world/tileWorker.ts` → pure `world/tileBuild.ts`); the visible set swaps atomically
  when all its tiles are ready (no holes); positions ahead on the route are prefetched. Visible tiles merge into 2×2
  clusters; props merge into 48 m clusters (`buildClusteredMeshes`). 125 ms → 133 ms render, 565 → 94 draw calls.
- `npx tsx scripts/seaside-hitch.ts "<query>"`: main-thread cost while riding. Inline builds: 271 ms worst frame;
  workers: 15 ms worst, 0/705 frames over 16 ms.
- Next: measure on the iPad.

## Not yet
- No sim/game module, no audio, no scenarios. Nothing registered in `src/games/registry.ts`.
