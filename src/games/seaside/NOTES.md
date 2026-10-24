# Seaside — runtime, voxels, workout, fishing, Lou’s shop, Chapter 1, Chapter 2a (#184–190)

~2 h story ride (#183); storyboard + media on unmerged PR #175. `devGames` (`?dev=1` / vite dev) until all chapters land.
## Sim (`sim/`)
- `story.ts` 33 scenes (chapter, kind, minutes, effort %FTP, trainer, monologue, look + dream). `types.ts` additive snapshot.
- `graph.ts` plan / route / effort / checkpoints; `pace.ts` power⅓ × nudge. `sim.ts` menu → story, saves at chapters /
  long-scene checkpoints; events scene/chapter/save/storyEnd/trainer/pull/cast/bite/catch/escape/purchase/part/drillReady.
- `workout.ts` scene-mode effect per tick (profiles, swells, fish surges, set pieces, drill ERG, fan, pulses); all `seaside.*`.
- `pull.ts` 9 sprints (fish tire in 110–190 s, escape at 240 s); `fishing.ts` FishingStop; `catalogue.ts` kg, $/kg.
- `economy.ts` cents; Surf $40 / Deep $90; credit forfeits extras; short money → one bonus FishingStop per shop.
- #190 `belly.ts`: wake (cadence → two blinks), parts (A in reach; ridden past = scooped up), `drillView` (layers off
  the effort plan; depth grows only while boring). Drills gate on the ERG target (held = on plan, idle only creeps).

## World (`world/`, pure, rebuilt per worker)
- Sparse 32³ voxels, AO/greedy meshing; WorldDef data (terrain, route, corridor, scatter, sky, LOD); coast + belly.
- Corridors keep a fixed voxel size; `span(s)` marks void crossings (bridge deck, pier: terrain below kept). Nothing is
  built past a route's ends. Streaming prefetches, evicts after 8 s; worker builds; atomic swaps + 0.5 s dissolve.
- #189 `coastLayout.ts`: Chapter 1 in route metres (`CH1`): elevation integrated from grade keys (the rollers use the
  scene's trainer profile; the descent is solved to land the town at `TOWN_Y`), pullouts (van, Turnout 1, Lou's lot),
  the diagonal creek gorge + the road's swing across it, the town flat, and the route: highway → harbour street → 480 m
  pier. `coastBuild.ts` structures voxelized into terrain tiles at tile size (LOD for free): arch bridge, pier (pilings,
  rails, lamps, PIER arch, bait stand), houses + Lou's shack with a 5×7 pixel font; small props are route scatter.
- Sun moved over the sea (NW, 31°): the old NE morning sun put the whole road below the spurs in baked shade.
- #190 `bellyLayout.ts` gut in u = −z: floor = belly grade integrated, 5 chambers, stomach wall holed on the drill axis.
  `bellyProps.ts` junk, boat, parts, drill rig, tunnel + a face per layer + cracks. Belly rails 2.5 / 1.5 m/s.
## Render (`render/`)
- `renderer.ts`: Morning / belly on one WorldView (`setWorld` coast ↔ belly), shops = dioramas, later chapters the
  placeholder. 2D canvas HUD above insets. #190 `bellyShots.ts` (pure) + `belly.ts` (pool lights ride with the eye).
- `morningShots.ts` (pure, tested): scene → shot. Rides map progress onto `rideSpan` (within 2 % of rail length);
  stops have fixed poses; Big One / Under run on plan seconds (progress × planS, so mid-scene resumes stay in sync).
- `morning.ts`: shot blends, title fog, bird, gulls, Big One shadow, yank + splash, bubbles, teeth, lighthouse.
- Scene switches dispose outgoing prop geometry, materials, textures and particle instance buffers.
- `worldView.ts`: eye / atmos / calm / roll / post per frame; streaming + dissolves on a wall clock; bar pitch from the
  view direction. `fishingRig.ts` shared rod; `shopView.ts` dioramas; `perf.ts` governor (½ / ⅓ res).
## Verification (no media committed)
- `npm run typecheck`; `npm test`; `npm run sim -- --game seaside --script z2 --minutes 150` (summary `Z3 minutes`);
  `npx tsx scripts/seaside-morning-review.ts [names]` → /tmp/seaside-morning.
- `seaside-belly-review.ts` → /tmp/seaside-belly (waits 5 s: first LOD is coarse). Swiftshader belly ≈ 100 ms vs coast
  ≈ 250 ms/frame. Also `seaside-{shop-review,bench,hitch,pops}.ts`; `/dev/seaside-play.html?scene=…&progress=…`.
- **iPad/Bluefy hardware fps remains unmeasured** (highway ≥ 50, later ≥ 40 or fallback). Known: a blue strip along the
  inland shoulder (sea backdrop through a corridor/terrain gap; predates #189).
