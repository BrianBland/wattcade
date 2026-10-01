# Keeper's Light (lighthouse)

CONTRACT-REQUESTs: none.

## API
- `index.ts` exports `module: GameModule` (id `lighthouse`); renderer is dynamic-imported (`render/renderer.ts`, three.js).
- `sim/sim.ts`: `createLighthouseSim(ctx, opts?: { seed?, autopilot? })`. `autopilot: true` auto-builds in a fixed order (used by scenario `z2-docks`).
- `scenarios.ts`: z2-docks, idle, mash, storm-ready, z2-no-storm-response (per SPEC 6.2). Summary keys: minutesInZone, shipsDocked, shipsLost, buildingsBuilt, stormsWeathered, stormsFailed, coin.
- Snapshot has `hooks.storm` (true during storm warning AND storm, so storm-ready starts pushing at the warning).

## Mechanics (all numbers are `ctx.tuning` keys, `lighthouse.*`)
- In zone (effortZone == targetZone 2): fog/chop fall, lamp rises. Below: fog rises (bells slow it). Above (non-storm): chop rises.
- Ships: spawn 40-60 s, sail 60 s, dock if fog<0.5+piers, chop<0.5+piers, lamp>=0.15. Chop failure = spilled, else lost.
- Storm: first at ~0.6x interval (~5-7 min), then every 480-720 s, 20 s warning, 60-90 s storm, +3% grade effect `storm`, requirement zone>=3 with 25 s slack (integrity meter; 0 -> lamp out, stormsFailed). 15 s mid-storm surge needs zone 5; held >=70% gives bonus salvage.
- Swell: effect `swell`, +-1% sine, 180 s period. Virtual gears enabled.
- minutesInZone counts zone==2 time (any phase) plus storm-compliant time.
- Town (14 plots, buildings, coin, timber, totals) saved via ctx.save on build, every 60 s, and in dispose(); loaded via ctx.load.
- Controls: left/right = plot cursor, up/down = building type, A = build.

## Testing
`npx vitest run src/games/lighthouse` (uses core runHeadless; stub removed).

## Known gaps
- Renderer is untested visually (typecheck only); no sound; HUD is plain DOM text.
