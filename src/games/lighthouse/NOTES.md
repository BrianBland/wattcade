# Keeper's Light (lighthouse)

CONTRACT-REQUESTs: none.

## Layout
- `sim/layout.ts` (pure): 20 plots (4 beach plots for piers), `islandHeight(x,z)` terraced island + lighthouse headland, shared by sim and renderer.
- `sim/sim.ts`: `createLighthouseSim(ctx, opts?: { seed?, autopilot? })`. `autopilot` builds in a fixed order on `suggestPlot` (scenario `z2-docks`).
- `render/`: `renderer.ts` (camera views, ships, build cursor + ghost preview, cues -> `audio/sfx`, ambient surf/wind/rain), `world.ts` (terrain with painted paths, rocks/reefs/islets, lighthouse + beam + ivy), `sea.ts` (vertex-shader waves, shallow tint, shore foam; `waveHeight` JS mirror), `sky.ts` (dome, sun/moon/stars, clouds, fog banks, rain, lightning), `buildings.ts` (building + ship models), `life.ts` (paths MST, flowers/grass/trees, villagers, fishers, porters, gulls, butterflies, smoke), `hud.ts` (DOM overlay), `snap.ts` (snapshot type).
- Static meshes are merged per material (`util.mergeStatic`) and decor is instanced: ~390 draw calls incl. shadow pass with a full town.

## Mechanics (all numbers are `ctx.tuning` keys, `lighthouse.*`)
- Zone loop, ships, storms, swell, virtual gears unchanged from SPEC 6.2 (see tunables at the top of sim.ts). Docking check order: chop -> spilled, else dark/fog -> lost.
- Buildings: cottage, garden (new: cheap, cottages +10% each, blooms fastest), pier (beach only), market, fog bell, beacon (`lamp2`, needs 5 cottages).
- Growth: per-plot `grow` (0..1) rises only while in zone (`growPerMin`, garden 2x). Island-wide `meadow` (bloom %) rises with in-zone time (`meadowPerMin`, +50% per garden). The renderer turns these into flowers, trees, paths (dirt -> cobble), washing lines, veg patches, lighthouse ivy.
- Ships have kinds (smack/schooner/steamer, cargo x0.8/1/1.4) and names; snapshot gives `etaS` and `check` (what would happen if they arrived now) for the forecast panel. Docked ships stay 25 s at a free pier (or the mooring).
- Day/night: `dayLengthS` 1800, sessions start mid-morning. Villagers go home at night and in storms.
- Save `{ v: 2, buildings, grow, coin, timber, meadow, totals }`; saves without `v: 2` (old 14-plot layout) are discarded.

## Controls (bike-first)
- Watch mode (default, hands-off): A = open build menu, Y = cycle camera (island / harbour / lighthouse).
- Build menu: opens on an affordable building at a suggested plot, so A, A builds. Left/right = next free valid plot, up/down = building, A = build (closes), B = close; closes after `buildIdleS` (30 s).
- Touch: tap a plot / panel row / Build / Close / View -> `GameSim.receive` (`plot`, `select`, `build`, `mode`, `view`).
- Toast nudges when a new building becomes affordable (at most every 45 s).

## Testing
`npx vitest run src/games/lighthouse`: scenarios (runHeadless) + `test/sim.test.ts` (layout sanity, A-A build, pier on beach only, B/idle close, taps, save discard, growth only in zone, garden boost).

## Known gaps
- Renderer checked with throwaway Playwright screenshots (day/night/fog/storm/build/portrait), not on a real iPad; sound untested by ear.
- Deeper progression (districts, building levels, adjacency, new building types) is a planned follow-up.
