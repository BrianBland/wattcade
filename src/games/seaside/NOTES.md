# Seaside — runtime, voxels, workout, fishing, Lou’s shop, Chapter 1 (#184–189)

~2 h story ride (#183); storyboard + media on unmerged PR #175. `devGames` (`?dev=1` / vite dev) until all chapters land.
## Sim (`sim/`)
- `story.ts` 33 scenes (chapter, kind, minutes, effort %FTP, trainer, monologue, look + dream). `types.ts` additive snapshot.
- Restarts save Morning immediately; optional shop outings use the coast fishing shots.
- `graph.ts` plan / route / effort / checkpoints; `pace.ts` power⅓ × nudge. `sim.ts` menu → story, saves at chapters /
  long-scene checkpoints. Events scene/chapter/save/storyEnd/trainer/pull/cast/bite/catch/escape/purchase/bigOneReady.
- `workout.ts` scene-mode effect per tick (profiles, swells, fish surges, set pieces, drill ERG, fan, pulses); all `seaside.*`.
- `pull.ts` 9 sprints; fish tire in 110–190 s below target, escape at 240 s. Z2 ~130 min vs on-cue ~120 min.
- `fishing.ts` FishingStop (spot → cast → wait → bite → pull → haul/card); `catalogue.ts` kg, $/kg, fight.
- `economy.ts` integer cents; Surf $40 / Deep $90; credit forfeits extras; short money → one bonus FishingStop per shop.

## World (`world/`, pure, rebuilt per worker)
- Sparse 32³ voxels, AO/greedy meshing; WorldDef data (terrain, route, corridor, scatter, sky, LOD); coast + belly.
- Corridors keep a fixed voxel size; `span(s)` marks void crossings (bridge deck, pier: terrain below kept). Nothing is
  built past a route's ends. Streaming reprioritizes each frame, prefetches, evicts after 8 s; atomic swaps + 0.5 s dissolve.
- #189 `coastLayout.ts`: Chapter 1 in route metres (`CH1`): elevation integrated from grade keys (the rollers use the
  scene's trainer profile; the descent is solved to land the town at `TOWN_Y`), pullouts (van, Turnout 1, Lou's lot),
  the diagonal creek gorge + the road's swing across it, the town flat, and the route: highway → harbour street → 480 m
  pier. `coastBuild.ts` structures voxelized into terrain tiles at tile size (LOD for free): arch bridge, pier (pilings,
  rails, lamps, PIER arch, bait stand), houses + Lou's shack with a 5×7 pixel font; small props are route scatter.
- Sun moved over the sea (NW, 31°): the old NE morning sun put the whole road below the spurs in baked shade.

## Render (`render/`)
- `renderer.ts`: Morning scenes on WorldView (lazy, workers start on the first shot), shops = counter dioramas, later
  chapters still the placeholder stage. HUD (fishing prompts, bubble, card, title) is the 2D canvas; layout above insets.
- `morningShots.ts` (pure, tested): scene → shot. Rides map progress onto `rideSpan` (within 2 % of rail length);
  stops have fixed poses; Big One / Under run on plan seconds (progress × planS, so mid-scene resumes stay in sync).
- `morning.ts`: camera blends between shots, title fog (thins with pedalling, ink fades with it), the big bird,
  gulls, Big One shadow, yank + splash, underwater fog, bubbles, the closing ring of teeth, a far lighthouse.
- `worldView.ts`: eye / atmos / calm per frame; streaming + dissolves on a wall clock (paused story time used to freeze
  tile fade-ins); bar pitch from the view direction (Euler x broke at westward headings). `post.ts` ink ignores planar
  slope. `fishingRig.ts` / `fishingPose.ts` shared rod; `shopView.ts` dioramas; `perf.ts` governor (½ / ⅓ res).
## Verification (no media committed)
- `npm run typecheck`; `npm test`; `npm run sim -- --game seaside --script z2 --minutes 150`; Morning stills of every
  shot: `npx tsx scripts/seaside-morning-review.ts [names]` → /tmp/seaside-morning.
- Also `seaside-{shop-review,bench,hitch,pops}.ts`; `/dev/seaside-play.html?scene=…&progress=…`.
- **iPad/Bluefy hardware fps remains unmeasured** (highway ≥ 50, later ≥ 40 or fallback). Known: a blue strip along the
  inland shoulder (sea backdrop through a corridor/terrain gap; predates #189).
