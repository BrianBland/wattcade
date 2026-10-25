# Seaside — runtime, voxels, workout, fishing, Lou’s shop, Chapters 1, 2a, 2b (#184–191)

~2 h story ride (#183); storyboard + media on unmerged PR #175. `devGames` (`?dev=1` / vite dev) until all chapters land.
## Sim (`sim/`)
- `story.ts` 33 scenes (chapter, kind, minutes, %FTP, trainer, monologue, look + dream); `types.ts` additive snapshot.
  Restarts save Morning immediately; optional shop outings use the coast fishing shots.
- `graph.ts` plan / route / effort / checkpoints; `pace.ts` power⅓ × nudge. `sim.ts` menu → story, saves at chapters /
  long-scene checkpoints; events scene/chapter/save/storyEnd/trainer/pull/cast/bite/catch/escape/purchase/part/drillReady.
- `workout.ts` scene-mode effect per tick (profiles, swells, fish surges, set pieces, drill ERG, fan, pulses); all `seaside.*`.
- `pull.ts` 9 sprints (fish tire in 110–190 s, escape at 240 s); `fishing.ts` FishingStop; `catalogue.ts` kg, $/kg.
- `economy.ts` cents; Surf $40 / Deep $90; credit forfeits extras; short money → one bonus FishingStop per shop.
- #190 `belly.ts`: wake (cadence → two blinks), parts (A in reach; ridden past = scooped up), `drillView` (layers off
  the effort plan; depth grows only while boring). Drills gate on the ERG target (held = on plan, idle only creeps).
## World (`world/`, pure, rebuilt per worker)
- Sparse 32³ voxels, AO/greedy meshing; WorldDef data (terrain, route, corridor, scatter, sky, LOD); coast, belly, island.
- Corridors keep a fixed voxel size; `span(s)` marks void crossings (bridge deck, pier: terrain below kept). Nothing is
  built past a route's ends. Streaming reprioritizes each frame, prefetches, evicts after 8 s; atomic swaps + 0.5 s dissolve.
- #189 `coastLayout.ts`: Chapter 1 in route metres (`CH1`): elevation from grade keys (rollers = the scene's trainer
  profile), pullouts, the creek gorge, the town, route highway → harbour street → 480 m pier. `coastBuild.ts`
  structures voxelized into tiles (bridge, pier, houses, Lou's shack, 5×7 font); props = scatter. Sun NW over the sea.
- #190 `bellyLayout.ts` gut in u = −z: floor = belly grade integrated, 5 chambers, stomach wall holed on the drill axis.
  `bellyProps.ts` junk, boat, parts, drill rig, tunnel + a face per layer + cracks. Belly rails 2.5 / 1.5 m/s.
- #191 `islandLayout.ts` round island: paddle in, boardwalk + stone road spiral up (road = grades integrated), ground =
  f(radius) read off the road; `islandBuild.ts` head (K m/unit) + hall massif as a structure, scatter; trees clear of
  `approachLane`. Steep flank: columns by the carved road reach down to its bed. Rails: cutStones 4.5, temple 0.8 m/s.
## Render (`render/`)
- `renderer.ts`: one WorldView, `setWorld` coast / belly / island; shops = dioramas; Evening still the placeholder.
  2D HUD above insets. `bellyShots`/`islandShots` (pure) + `belly.ts`/`island.ts` sets (wheels, fire, hall, statue).
- `morningShots.ts` (pure, tested): scene → shot. Rides map progress onto `rideSpan` (within 2 % of rail length);
  stops have fixed poses; Big One / Under run on plan seconds (progress × planS, so mid-scene resumes stay in sync).
- `morning.ts`: shot blends, title fog, bird, gulls, Big One shadow, splash, teeth. Set switches dispose GPU resources.
- `worldView.ts`: eye / atmos / calm / roll / post per frame; streaming + dissolves on a wall clock; bar pitch from the
  view direction. `fishingRig.ts` shared rod; `shopView.ts` dioramas; `perf.ts` governor (½ / ⅓ res).
## Verification (no media committed)
- `npm run typecheck`; `npm test`; `npm run sim -- --game seaside --script z2 --minutes 150` (summary `Z3 minutes`).
- `scripts/seaside-{morning,belly,island}-review.ts` → /tmp/seaside-… (later ones wait 5 s: first LOD coarse). Swiftshader
  ms/frame: coast ≈ 250, belly ≈ 100, island 110–290 (props: coarse giants, no ragged holes; one canopy colour per column).
  Also `seaside-{shop-review,bench,hitch,pops}.ts`; `/dev/seaside-play.html?scene=…&progress=…`.
- **iPad/Bluefy hardware fps remains unmeasured** (highway ≥ 50, later ≥ 40 or fallback). Known: a blue strip along the
  inland shoulder (sea backdrop through a corridor/terrain gap; predates #189).
