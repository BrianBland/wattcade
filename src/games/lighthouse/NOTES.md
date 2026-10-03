# Keeper's Light (lighthouse)

CONTRACT-REQUESTs: none.

## Layout
- `sim/layout.ts` (pure): 28 plots in 5 districts (harbour 10 incl. 4 beach, hillside 6, hilltop 4, headland 3, Gull Rock islet 5 incl. 2 beach), `islandHeight(x,z)` (terraced island, lighthouse headland, islet), bridge position.
- `sim/town.ts` (pure): building catalogue (names/effects per level, costs, caps, shore-only), `upgradeCost`/`upgradeGrow`, neighbour rules (`NEAR` 8.5, `homeBonus`, `pierBonus`, `orchardBonus`, `millBonus`, `preview`), `DISTRICTS` milestones, `LENS` tiers.
- `sim/sim.ts`: `createLighthouseSim(ctx, opts?: { seed?, autopilot? })`; autopilot builds an order, then lens, then cheapest ready upgrade.
- `render/`: `renderer.ts` (cameras, ships, lifeboat run, build cursor + ghost incl. next-level ghost, neighbour link arcs + range ring, bridge, cues/ambience), `world.ts` (terrain, scenery, lighthouse + lens tiers), `sea.ts`, `sky.ts`, `buildings.ts` (all building levels + ships), `life.ts` (paths MST incl. bridge, flowers/trees/orchards, villagers by home level, fishers, porters, gulls, butterflies, smoke), `hud.ts` (HUD, build list, Keeper's Log, `keeperRank`), `snap.ts`.
- ~400 draw calls incl. shadow pass with a full town (static meshes merged per material, decor instanced).

## Progression (all numbers are `ctx.tuning` keys, `lighthouse.*`, or constants in town.ts)
- Buildings: cottage→house→inn, garden→flower garden→glasshouse, orchard (2), pier→long pier→fishery, market→bazaar→trade hall, windmill (2), fog bell→bell tower, shipyard (2, beach), lifeboat station (beach), beacon (2).
- Upgrades cost base x3 / x7 and need the plot's `grow` >= 0.5 / 1.0; grow rises only in zone (`growPerMin` 0.03, x Steady Light).
- Neighbours: homes +20% per garden/orchard (max 3) and +25% next to the market; pier +20% cargo next to market; orchard +25% next to a garden; windmill +50% next to an orchard.
- Districts open from lifetime milestones (buildings / ships docked / storms weathered): hillside 5b; hilltop 10b+25s; headland 14b+80s+3 storms; Gull Rock 18b+250s+10 storms.
- Lens tiers 2-4 (needs hillside/hilltop/headland): lamp +20%/tier, fog clearing +15%/tier, dock fog limit +0.03/tier; visuals: brass rings, twin beams, pennant.
- Steady Light: +10% per 5 min continuous in zone (cap x1.5) on cargo and growth; breaks after 12 s out of zone, paused for 45 s after a storm while easing down.
- Lifeboat: a ship that would be lost/spilled is rescued for half cargo, then 240 s cooldown. Shipyard: cargo x1.3/x1.6, more steamers, Lv2 ships call 15% more often.
- Zone source: the calm Z2 hold uses `effortZone` (HR-aware, 4 s debounce). Storm warning + storm + surge use `min(5, powerZone)` (1.5 s debounce, `stormZoneGraceS`), because HR can't follow a 60–90 s push or a 15 s surge; `hud()` marks them `source: 'power'`.
- Clockwork wind-up (calm only, every 4–7 min): 40 s window, 20 s at ≥ `windRpm` (90) → lamp full, +15 coin, +2 timber. Shown in the storm banner slot plus `hud().targetCadence`.
- Bloom (`meadow`): 1/400 per in-zone minute, +15% per garden level.
- Ideal autopilot (storm-ready, 60 min rides): hilltop ride 1, headland ride 2, Gull Rock + max lens ride 4, all upgrades ~ride 5.
- Save `{ v: 2, buildings, levels, grow, coin, timber, meadow, lens, totals }`.

## Controls (bike-first)
- Watch: A = build menu, Y = camera, Z = Keeper's Log (B closes). Build menu rows: Upgrade, 10 buildings, Lighthouse lens. Left/right = next valid plot (free plots, built plots for Upgrade), up/down = row, A = act, B = close. Taps: plots, lighthouse, rows, buttons.

## Testing
`npx vitest run src/games/lighthouse`: scenarios + `test/sim.test.ts` (layout, build flow, districts, upgrades need growth, shore-only, lifeboat, lens, streak, neighbours, log, saves).

## Known gaps
- Renderer checked with throwaway Playwright screenshots, not on a real iPad; sounds untested by ear. Coin piles up once everything is built (only Keeper rank keeps climbing).
