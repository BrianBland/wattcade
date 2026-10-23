# Seaside — story runtime (#184) + voxel engine (#185)

~2 h story ride, master issue #183. Storyboard, stills and clips stay on the unmerged reference PR #175 (`seaside-storyboard`).
Registered in `devGames` (picker only with `?dev=1` / under vite dev); move to `games` when Chapter 1 is playable.

## Sim (`sim/`)
- `story.ts` 33 scenes from the storyboard (chapter, kind, minutes, effort %FTP, trainer, monologue ≤ 8 words, look + dream).
- `types.ts` the snapshot seam `{ chapter, sceneId, sceneT, routeS, speed, effortTarget, monologue, look }`; additive fields.
- `graph.ts` plan time / route metres / effort / checkpoints · `pace.ts` speed = plan × (W/planned)^⅓ × nudge (±20 %);
  effort-gated scenes (`{ effortS }`) advance at W/planned; `{ m }` rail, `{ s }` fixed (set pieces always resolve).
- `monologue.ts` one line, 4 s, hidden in sprints / ≥ 105 % FTP · `sim.ts` menu → story; saves at chapter starts and
  mid long scenes; events `scene`, `chapter`, `save`, `storyEnd`; simOpts `chapter`, `save`, `skipMenu`.

## Voxels + worlds (`voxel/`, `world/`)
- `voxel/` sparse 32³ grid, culled mesher with baked AO, exact greedy merge, `voxelMaterial` (jitter, bevel, cool light,
  mixed-size cubes, water swell, baked `sunVis`, dissolve).
- `world/def.ts` WorldDef as data: palette, terrain (`height` fill or `shape` voxel(x,y,z)), route (`route.ts` arc-length
  spline, signed lateral d), corridor, scatter, sun, sky, look, rig, lod. Registry `worlds.ts`: `coast` (6 km Highway 1),
  `belly` (shape world, glow voxels).
- `corridor.ts` paths (road / boardwalk / stone / obsidian) at a fixed voxel size per route segment; `ground` skips/caps
  terrain under it, `span` keeps the void; shape worlds carve a slab. `sunShadow.ts` coarse level + lazy route patches.
- `streaming.ts` (pure): quadtree detail = max(route dist, camera dist / 3), hysteresis, road + prop segments, prefetch
  +1.5/3/6 s and +40/120 m, evict after 8 s unwanted. `terrainLOD.ts`: worker pool, clusters built ahead under 6 ms/frame,
  atomic swap, 0.5 s dissolve.

## Render (`render/`)
- `renderer.ts` placeholder Canvas 2D (sky, rail ticks, stage box, plate, bubble, card, menu); `layout.ts` keeps it above
  `insets.bottom`. Swapping the stage box for `WorldView` is the next step.
- `worldView.ts` WorldView: `frame({ t, routeS, speed, look, dream })`, `setWorld`, `setInsets` (`viewLayout.ts`), dev
  overlay (fps · tris · calls · tiles). `looks.ts` `LookDirector` (6 s blends, dream eased 0.08/s) · `post.ts`.
- `perf.ts` `PerfGovernor` (< 40 fps 2.5 s → ½ then ⅓ res, chunky grade) + `pixelSetting(save)` (`pixelLook` auto|on|off).
- `stills/` later-scene prototypes (perf references).

## Run / measure
- `npm run sim -- --game seaside --script z2 --minutes 150` (~123 min) · `/dev/seaside-play.html?script=z2&speed=30`.
- `/dev/seaside-ride.html?world=coast|belly&inset=140` · `/dev/seaside.html?still=lava&play=1` (fps + auto fallback).
- `scripts/seaside-bench.ts` · `seaside-hitch.ts --minutes 10` (max 17 ms, 0 > 33 ms) · `seaside-pops.ts` (coast max 7.2 px).
- Prototype scenes 1280×720 tris/calls: belly 0.78 M/32, drill 0.27/21, monkey 3.18/56, lava 1.84/106, reentry 0.20/74.
  **iPad (Bluefy) fps not yet measured** (highway ≥ 50, later scenes ≥ 40 or auto-fallback).
