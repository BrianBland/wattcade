# Seaside — runtime (#184), voxel engine (#185), workout (#186), fishing (#187)

~2 h story ride (#183); storyboard + media on unmerged PR #175. `devGames` (picker: `?dev=1` / vite dev) until Chapter 1.

## Sim (`sim/`)
- `story.ts` 33 scenes (chapter, kind, minutes, effort %FTP, trainer, monologue ≤ 8 words, look + dream) · `monologue.ts`
  4 s lines, none ≥ 105 % FTP · `sim.ts` menu → story, saves at chapters + mid long scenes; opts chapter/save/skipMenu.
- `types.ts` snapshot seam, additive fields (#186: `pull`, `cadenceBand`, `hooks.cadence`). events scene/chapter/save/storyEnd/trainer/pull.
- `graph.ts` plan time / route metres / effort / checkpoints · `pace.ts` speed = plan × (W/planned)^⅓ × nudge (+20 %
  behind, −2 % ahead); effort-gated scenes (`{ effortS }`) advance at W/planned × cadence rate; `{ m }` rail, `{ s }` fixed.
- `workout.ts` (pure) one `scene` effect in the scene's mode (≤ 1 mode change/scene, `trainer` events): route grade
  `profile` + `swell` (cavern −3..−5 %), fish surge 55–85 % by heft (species fight × size), bite tug, set pieces ramp to 90 %, drill ERG = Z3 plan (60–75 rpm +15 %), fan 80–100 rpm,
  paddle/flap pulses, then let go. `pull.ts` 9 sprints sized 110–150 % FTP × 6–25 s; fish fights hold the
  scene (below target: tire in 110–190 s, escape 240 s; overtime off the pace lag), so z2 ≈ 130.5 vs on-cue ≈ 119.7 min.
- `fishing.ts` `FishingStop` per fish scene (`Scene.fishing`; its `pulls` = bite slots): spot (paddles / ◀▶ / tap, auto 10 s)
  → cast (rpm = distance) → wait (plan on effort, ×1.5 twitching ≥ 95 rpm; bite 2–6 s once due, or 150 s) → bite (A ≤ 2 s,
  else auto 3 s at ½ value) → pull (holds) → haul → card | escape (2 tries/fish) → done (≥ 0.5 × plan). `catalogue.ts`
  7 fish (kg, $/kg, fight), 2–3 spots/stop, `pickFish`, `fishHeft`. Events `cast` `bite` `catch` `escape`.

## Voxels + worlds (`voxel/`, `world/`)
- `voxel/` sparse 32³ grid, culled mesher + baked AO, greedy merge, `voxelMaterial`. `world/def.ts` WorldDef as data
  (terrain, `route.ts` spline, corridor, scatter, sky, look, rig, lod); `worlds.ts`: `coast` (6 km Highway 1), `belly`.
- `corridor.ts` fixed-size paths per route segment · `sunShadow.ts` · `streaming.ts` (pure) quadtree detail, prefetch,
  evict 8 s · `terrainLOD.ts` worker pool, ≤ 6 ms/frame builds, atomic swap, 0.5 s dissolve.

## Render (`render/`)
- `renderer.ts` placeholder Canvas 2D (stage box, plate, bubble, card, menu; fishing via `fishing2d.ts`, spot taps →
  `{ type: 'spot' }`); `layout.ts` keeps it above `insets.bottom`. `fishingPose.ts` pure pose for both views;
  `fishingRig.ts` voxel rod (7 joints bend with load), line, bobber, rings, splashes, fish (`world/fish.ts`).
- `worldView.ts` WorldView: `frame({ t, routeS, speed, look, dream })`, `setWorld`, `setInsets` (`viewLayout.ts`), dev
  overlay; `aim`/`bars` for fishing. `looks.ts` `LookDirector` (6 s blends, dream eased 0.08/s) · `post.ts`.
- `perf.ts` `PerfGovernor` (< 40 fps 2.5 s → ½ then ⅓ res) + `pixelSetting(save)` · `stills/` later-scene perf refs.

## Run / measure
- `npm run sim -- --game seaside --script z2 --minutes 150` (~130 min) · `/dev/seaside-play.html?script=z2&speed=30` ·
  `/dev/seaside-ride.html?world=coast|belly&inset=140` · `/dev/seaside.html?still=lava&play=1` · `/dev/seaside-fishing.html`.
- `scripts/seaside-bench.ts` · `seaside-hitch.ts --minutes 10` (max 17 ms, 0 > 33 ms) · `seaside-pops.ts` (coast max 7.2 px).
- Prototype tris/calls @720p: belly 0.78 M/32, monkey 3.18/56, lava 1.84/106. **iPad (Bluefy) fps not yet measured** (highway ≥ 50, later scenes ≥ 40 or auto-fallback).
