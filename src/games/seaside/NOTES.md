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

## Perf notes (SwiftShader, 1600×900)
- Coast still ≈ 4–5 M faces / 8 M tris incl. shadow pass; build ≈ 2 s. Fine for stills, far too heavy for iPad.
- For the real engine: greedy-merge flat runs (needs jitter off or baked into a tiny texture), stream chunks along the rail,
  drop far LOD to a heightfield mesh, bake shadows/AO, cap the near ring to ~60 m with fog.

## Not yet
- No sim/game module, no audio, no scenarios. Nothing registered in `src/games/registry.ts`.
