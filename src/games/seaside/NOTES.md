# Seaside — runtime, voxels, workout, fishing, Lou’s shop, Chapters 1, 2a, 2b, 3a, 3b (#184–193)

~2 h story ride (#183); storyboard + media on unmerged PR #175. `devGames` (`?dev=1` / vite dev) until all chapters land.
## Sim (`sim/`)
- `story.ts` 33 scenes; `types.ts` additive snapshot. `workout.ts` scene-mode effect per tick; all `seaside.*`.
- `graph.ts` plan / route / effort / checkpoints; `pace.ts` power⅓ × nudge. `sim.ts` menu → story, saves at chapters /
  long-scene checkpoints; events scene/chapter/save/storyEnd/trainer/pull/cast/bite/cue/….
- `pull.ts` 9 sprints; `fishing.ts`; `catalogue.ts`; `economy.ts` cents, Surf $40 / Deep $90, one bonus stop per shop.
- #190 `belly.ts`: wake (cadence → two blinks), parts (A in reach; ridden past = scooped up), `drillView` (layers off
  the effort plan; depth grows only while boring). Drills gate on the ERG target (held = on plan, idle only creeps).
- #192 `fan.ts`: glow = 1 − cooled + `heat` (creeps back out of the band, capped; blown off in it); then the eating
  (no band). Fan progress never drops below `effortFloor`. Magma eel: one 12 s pull, `magmaRunPeriodS` surges.
- #193 Drill II = the #190 drill with `GATE_LAYERS` spread over its two bores by plan time. `gate.ts`: `TILT_S`, the
  fall's beats (`fallView`: tip, black, dot → Earth), one `cue` event (`earth`) for the music pass.
## World (`world/`, pure, rebuilt per worker)
- Sparse 32³ voxels, AO/greedy meshing; WorldDef data. Corridors: fixed voxel size, `span(s)` = void crossings (terrain
  below kept), `start` = none before it. Streaming reprioritizes, prefetches, evicts after 8 s; atomic swaps + dissolve.
- #189 `coastLayout.ts` (`CH1`): grade-key elevation, pullouts, gorge, town, harbour, pier; `coastBuild.ts` structures.
- #190 `bellyLayout.ts` gut in u = −z: floor = belly grade integrated, 5 chambers, stomach wall holed on the drill axis.
  `bellyProps.ts` junk, boat, parts, drill rig, tunnel + a face per layer + cracks. Belly rails 2.5 / 1.5 m/s.
- #191 `islandLayout.ts` round island: boardwalk + stone road spiral up (road = grades integrated), ground = f(radius)
  read off the road; `islandBuild.ts` head + hall massif as a structure, scatter clear of `approachLane`.
- #192 `cavernLayout.ts` in u = −z: stone passage → winding cave (floor = cavern grade integrated, rock warming with
  depth) → mouth → hall, bridge level 20 m over lava to the gate (#193 rides on along it). `cavern.ts` fills only the
  runs a column needs (floor slab, wall shell, ceiling; banks, cliffs, one lava layer, piers). Torch cages = scatter.
  #193: `GLYPH_STONES` (rocks, then columns; flat path-side face on the voxel grid), the gate panel + pilasters, the
  bore carved at `gateAxis`; `gateProps.ts` tunnel / faces / cracks in tunnel space (the set places them).
## Render (`render/`)
- `renderer.ts`: one WorldView, `setWorld` coast / belly / island / cavern; dioramas; reentry on = placeholder. `*Shots.ts`
  pure + sets; `cavern.ts` torch flames/lights, eels (`LEAPS`, some vault the bridge), embers, line smoke, fan + eel;
  `gate.ts` (built near the gate): glyph decals (`kit.glyphDecal`, brighten as you pass), drill rig, tunnel, the Earth.
- `morningShots.ts` (pure): rides map progress onto `rideSpan`; stops have fixed poses. Sets dispose GPU resources.
- `worldView.ts`: eye / atmos / calm / roll / post (+ `shimmer` heat haze) per frame; streaming + dissolves on a wall
  clock; bar pitch from the view direction. `fishingRig.ts` shared rod; `shopView.ts` dioramas; `perf.ts` governor.
## Verification (no media committed)
- `npm run typecheck`; `npm test`; `npm run sim -- --game seaside --script z2 --minutes 150` (summary `Z3 minutes`).
- `scripts/seaside-{morning,belly,island,cavern,shop}-review.ts`, `seaside-{bench,hitch,pops}.ts`, `/dev/seaside-play.html`.
  Swiftshader ms/frame: coast ≈ 250, belly ≈ 100, island 110–1100, cave ≈ 430 (fill-bound walls), hall ≈ 290.
- **iPad/Bluefy hardware fps remains unmeasured** (highway ≥ 50, later ≥ 40 or fallback). Known: a blue strip along the
  inland shoulder (sea backdrop through a corridor/terrain gap; predates #189). BellySet keeps its own drill rig code.
