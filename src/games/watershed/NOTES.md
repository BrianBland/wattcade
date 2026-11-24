# watershed (ERG water-cycle game)
CONTRACT-REQUEST: none. `requires: { erg: true }` (arcade gate: `src/shell/services.ts#missingRequirement`).

## Sim (`sim/`, pure + deterministic)
- `terrain.ts`: 96×144 U valley (x across, y downstream, sea level 0), two rock ridges with saddles, lake + side basins.
- `water.ts` `Water`: particle water + erosion (splat depth grid, flow down `max(h,SEA)+pressure·w`, Beyer-style
  erosion with a brush, bedrock fade, thermal slump). `Emit` = spring(s) by share, or a rain disc/rectangle.
- `sky.ts` `Sky`: evaporation (sunlit patches), cloud drift + cloudlets, rain footprint, rain-per-column → `springs()`.
- `objectives.ts` `Jobs`: grist mill (heavy water), sawmill (fast water), Millbrook, fields, one `dam` (beaver/gate/log:
  raised terrain; health = height left above its baseline), levee, per-block objectives.
- `salmon.ts` `SalmonRun`: path up real channels; rows behind the school frozen, only forks 4..18 rows ahead follow
  steering; lane steering in the fish frame (right = lane −), intro hold, predators, charging bears, falls need `leapRpm`.
- `events.ts`: seeded geological event deck (quake/slide/volcano + rare meteor), heightfield edits to h and h0, `mat` grid.
- `levels.ts`: campaign, 8 `LEVELS` (goal + 2 bonus = 3 drops; `WARMUP` + workout; `LevelRun` judges `LevelMetrics`). Tools:
  `gate` (A: beaver dam on the saddle by the current, faster in band), `levee` (Millbrook ring, built in band between `surge`
  blocks), `logDam` (lowest ridge-1 crest). Save `levels: {id: drops}`, `lastLevel`. Picker: ◀▶ level, ▲▼ Free Ride length.
- `plan.ts`: `makePlan(20|30|45|60, skipWarmup?)` (pre-game menu; `PLAN` = 45 min, 16 blocks), each block with a `phase`, opt. `job`/`beavers`;
  menu Y/tap skips the warm-up (drops evaporate+cloud; rain starts from a `warmCloud`-size cloud).
- `sim.ts`: ERG effect `flow`; controls (◀▶/paddles steer — in river blocks the *current marker* (`Emit.pull`, `current*` tunables),
  hoods dart L/R, Y view, Z landmark, A boost); `flowLine.ts` traces where water goes; cues ring for the renderer;
  score; save `{rides, bestCarved, …}`; `opts.level` skips the picker. Mills sit by saddle crest height (not notch depth).

## Render (`render/`)
`renderer.ts` (drops as spray only, cameras per phase/view, cues → sound/popups), `camFit.ts` (overview fitted to the screen;
wide = sideways, spring left, HUD strip on top), `freeCam.ts` (pinch/drag/twist/wheel offset on the auto cam; double-tap resets;
`focusState`/`easeToward` fly to a landmark, close + tilted low), `landmarks.ts` (spring, mills, Millbrook, dam: Z cycles, HUD chips tap),
`terrainView.ts` (2× mesh; colour/normal per pixel from fine textures: colour alpha = fresh cuts, normal alpha = water depth → caustics;
baked `relief` AO; cliffs, cloud shadows, close-up grain), `waterView.ts`, `sea.ts` (GPU sea shaded by depth from land height textures),
`flora.ts` (crisp trees/rocks + leaf/rock shaders), `fields.ts`, `outerLand.ts` (hills, ranges, fence); low warm sun, fog scaled to camera distance, CSS vignette,
`skyLayer.ts` (cloud clears the highest ground under its footprint: `layout.ts#cloudAltitude`), `jobsLayer.ts` (+ `buildings.ts`: cottages, mills, dam sticks; chimney smoke), `eventsLayer.ts`, `creatures.ts` (no target markers;
bears walk/rear/swipe, eagles spiral/bank/dive with a water shadow; spray), `wildlife.ts` (articulated bear, eagle, beaver + pose fns), `riverbank.ts`, `scenery.ts`, `models.ts`, `hud.ts`, pure `layout.ts`, `upsample.ts` (tested).
## Tools
- `npm run snap:watershed -- --script spin --minutes 15 --every 5 [--autopilot]` → PNGs in `out/watershed/`.
- `/dev/watershed.html?script=grind&min=10&autopilot=1&inset=120[&level=dam-buster|&menu=1&progress={"first-spring":3}]`.
## Numbers (seed 1, 46 min, testProfile FTP 200)
Autopilot: 6/8 objectives, ~80+ salmon home; clears all 8 levels. No steering: ~2 objectives, fails levels 2-8. ~0.4 ms/step.
## Gaps / next
- Salmon/sky/job params are constants, not ctx.tuning yet. Renderer cost (55k-vertex meshes, riverbank) unprofiled
  on iPad. Terrain maps upload ~440 KB at 10 Hz. Levels use the session's valley (a per-level seed needs a renderer rebuild).
- Achievement thresholds in `achievements.ts` (500 salmon, 200 harvests, 3 rides ≥ 20 min; campaign: clear 1 / 3 drops / all 8).
