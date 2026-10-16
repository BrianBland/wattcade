# watershed (ERG water-cycle game)
CONTRACT-REQUEST: none. `requires: { erg: true }` (arcade gate: `src/shell/services.ts#missingRequirement`).

## Sim (`sim/`, pure + deterministic)
- `terrain.ts`: 96×144 U valley (x across, y downstream, sea level 0), two rock ridges with saddles, lake + side basins.
- `water.ts` `Water`: particle water + erosion (splat depth grid, flow down `max(h,SEA)+pressure·w`, Beyer-style
  erosion with a brush, bedrock fade, thermal slump). `Emit` = spring(s) by share, or a rain disc/rectangle.
- `sky.ts` `Sky`: evaporation (sunlit patches), cloud drift + cloudlets, rain footprint, rain-per-column → `springs()`.
- `objectives.ts` `Jobs`: grist mill (heavy water), sawmill (fast water), Millbrook flooding, fields, beaver dam
  (raises terrain; health = remaining height above its own baseline), per-block objectives.
- `salmon.ts` `SalmonRun`: path traced up real channels from the mouth (forks follow steering), lane steering in the
  fish frame (right = lane −), intro hold, escalating predators, charging bears, falls needing `leapRpm`.
- `events.ts`: seeded geological event deck (quake/slide/volcano + rare meteor), heightfield edits to h and h0, `mat` grid.
- `plan.ts`: `makePlan(20|30|45|60)` (pre-game menu; `PLAN` = 45 min, 16 blocks), each block with a `phase`, opt. `job`/`beavers`.
- `sim.ts`: ERG effect `flow`; controls (◀▶/paddles steer, hoods dart L/R, Y view, A boost); cues ring for the renderer;
  score; save `{rides, bestCarved, bestDelta, bestSalmon, bestScore}`.

## Render (`render/`)
`renderer.ts` (drops as spray only, cameras per phase/view, cues → sound/popups), `terrainView.ts` (2× terrain,
procedural shader), `waterView.ts` (merged liquid surface), `outerLand.ts` (world beyond + boundary fence),
`skyLayer.ts`, `jobsLayer.ts`, `eventsLayer.ts`, `creatures.ts`, `riverbank.ts`, `scenery.ts`, `models.ts`, `hud.ts`, pure `layout.ts`,
`upsample.ts` (tested).

## Tools
- `npm run snap:watershed -- --script spin --minutes 15 --every 5 [--autopilot]` → PNGs in `out/watershed/`.
- `/dev/watershed.html?script=grind&min=10&autopilot=1&inset=120` (vite dev) renders without the shell.

## Numbers (seed 1, 46 min, testProfile FTP 200)
Autopilot: 6/8 objectives, ~80+ salmon home, 2 springs. No steering: ~2 objectives. Sim ~0.4 ms/step (desktop).

## Gaps / next
- Salmon/sky/job params are constants, not ctx.tuning yet. Renderer cost (55k-vertex meshes, riverbank) unprofiled
  on iPad. Not built: story-mode levels (SPEC §6.4 "Later").

Save boundary: `sim/save.ts` registers an independent GameModule.save reader: detached payloads, runtime validation and preservation of unsupported newer saves. Shell commits the final checkpoint before awarding XP; failed writes remain retryable.
