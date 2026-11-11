# watershed (ERG water-cycle game)
CONTRACT-REQUEST: none. `requires: { erg: true }` (arcade gate: `src/shell/services.ts#missingRequirement`).

## Sim (`sim/`, pure + deterministic)
- `terrain.ts`: 96×144 U valley (x across, y downstream, sea level 0), two rock ridges with saddles, lake + side basins.
- `water.ts` `Water`: particle water + erosion (splat depth grid, flow down `max(h,SEA)+pressure·w`, Beyer-style
  erosion with a brush, bedrock fade, thermal slump). `Emit` = spring(s) by share, or a rain disc/rectangle.
- `sky.ts` `Sky`: evaporation (sunlit patches), cloud drift + cloudlets, rain footprint, rain-per-column → `springs()`.
- `objectives.ts` `Jobs`: grist mill (heavy water), sawmill (fast water), Millbrook flooding, fields, beaver dam
  (raises terrain; health = remaining height above its own baseline), per-block objectives.
- `salmon.ts` `SalmonRun`: path traced up real channels from last trace's mouth; rows behind the school are frozen and
  untouched forks keep last trace's branch (only forks 4..18 rows ahead follow steering), lane steering in the
  fish frame (right = lane −), intro hold, escalating predators, charging bears, falls needing `leapRpm`.
- `events.ts`: seeded geological event deck (quake/slide/volcano + rare meteor), heightfield edits to h and h0, `mat` grid.
- `plan.ts`: `makePlan(20|30|45|60, skipWarmup?)` (pre-game menu; `PLAN` = 45 min, 16 blocks), each block with a `phase`, opt. `job`/`beavers`;
  menu Y/tap skips the warm-up (drops evaporate+cloud; rain starts from a `warmCloud`-size cloud).
- `sim.ts`: ERG effect `flow`; controls (◀▶/paddles steer, hoods dart L/R, Y view, A boost); cues ring for the renderer;
  score; save `{rides, bestCarved, bestDelta, bestSalmon, bestScore}`.

## Render (`render/`)
`renderer.ts` (drops as spray only, cameras per phase/view, cues → sound/popups), `camFit.ts` (overview fitted to the screen;
wide = sideways, spring left, HUD strip on top), `freeCam.ts` (pinch/drag/twist/wheel offset on the auto cam; double-tap resets;
`focusState`/`easeToward` fly to a landmark, close + tilted low), `landmarks.ts` (spring, mills, Millbrook, dam: Z cycles, HUD chips tap),
`terrainView.ts` (2× mesh, but colour + normal come per pixel from fine-grid textures so triangles don't show; colour alpha = fresh cuts,
drawn as dark wet crumbling earth), `waterView.ts` (merged liquid surface), `outerLand.ts` (world beyond + boundary fence),
`skyLayer.ts` (cloud clears the highest ground under its footprint: `layout.ts#cloudAltitude`), `jobsLayer.ts` (+ `buildings.ts`: cottages, mills, dam sticks; chimney smoke), `eventsLayer.ts`, `creatures.ts` (no target markers;
bears walk/rear/swipe, eagles spiral/bank/dive with a water shadow; spray), `wildlife.ts` (articulated bear, eagle, beaver + pose fns), `riverbank.ts`, `scenery.ts`, `models.ts`, `hud.ts`, pure `layout.ts`,
`upsample.ts` (tested).

## Tools
- `npm run snap:watershed -- --script spin --minutes 15 --every 5 [--autopilot]` → PNGs in `out/watershed/`.
- `/dev/watershed.html?script=grind&min=10&autopilot=1&inset=120` (vite dev) renders without the shell.

## Numbers (seed 1, 46 min, testProfile FTP 200)
Autopilot: 6/8 objectives, ~80+ salmon home, 2 springs. No steering: ~2 objectives. Sim ~0.4 ms/step (desktop).
## Gaps / next
- Salmon/sky/job params are constants, not ctx.tuning yet. Renderer cost (55k-vertex meshes, riverbank) unprofiled
  on iPad. Not built: campaign levels (design doc linked from the PR); per-pixel terrain maps upload ~440 KB at 10 Hz.
- Achievement thresholds live in `achievements.ts` (500 salmon, 200 harvests, 3 rides ≥ 20 active min, 8,000 delta).
