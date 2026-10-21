# Keeper's Light (lighthouse)

## Layout
- `sim/layout.ts` (pure): 28 plots in 5 districts (harbour 10 incl. 4 beach, hillside 6, hilltop 4, headland 3, Gull Rock islet 5 incl. 2 beach), `islandHeight(x,z)` (terraced island, lighthouse headland, islet), bridge position.
- `sim/town.ts` (pure): building catalogue (names/effects per level, costs, caps, shore-only), `upgradeCost`/`upgradeGrow`, neighbour rules (`NEAR` 8.5, `homeBonus`, `pierBonus`, `orchardBonus`, `millBonus`, `preview`), `DISTRICTS` milestones, `LENS` tiers.
- `sim/extras.ts` (pure): decor catalogue, visitor ships + gifts, bloom festivals, seasons, cosmetic weather tables.
- `sim/sim.ts`: `createLighthouseSim(ctx, opts?: { seed?, autopilot? })`; autopilot builds an order, then lens, upgrades, then decor with spare coin.
- `render/`: `panel.ts` (pure build-menu row window sized to the HUD height, tested), `renderer.ts` (cameras, ships, lifeboat run, build cursor + ghost incl. next-level ghost, neighbour link arcs + range ring, bridge, cues/ambience), `world.ts` (terrain, scenery, lighthouse + lens tiers), `sea.ts`, `sky.ts` (+ post-storm rainbow), `buildings.ts` (all building levels + ships), `life.ts` (paths MST incl. bridge, flowers/trees/orchards, villagers by home level, fishers, porters, gulls, butterflies, smoke), `wildlife.ts` (dolphin pod escorting ships in calm seas, whale visits, seals on the reefs, puffins on the lighthouse cliff, sheep that multiply with bloom), `fx.ts` (coin shower, build sparkles, splashes, spouts, fireworks), `keeper.ts` (keeper: potters, polishes the lens in zone, waves at docking ships, holds cap in storms, climbs to light the lamp at dusk), `decor.ts` (decor + gifts placed along the town's paths; festival dressing), `music.ts` (adaptive generative waltz-shanty), `postcard.ts` (end-of-ride recap via `GameRenderer.ending`: orbit + this ride's buildings pop in, then a postcard; album of 24 per rider in IndexedDB `wattcade-lighthouse`, shown in the log), `hud.ts` (HUD, build/decorate tabs, flying coins, Keeper's Log), `snap.ts`.
- Seasons recolour terrain (`world.ts setSeason`) and trees/grass/flowers (`life.ts`); weather drives sky clouds/rain/snow and kites. Life adds kids, ship greeters and festival dancers.
- ~400 draw calls incl. shadow pass with a full town (static meshes merged per material, decor instanced).

## Progression (all numbers are `ctx.tuning` keys, `lighthouse.*`, or constants in town.ts)
- Buildings: cottage→house→inn, garden→flower garden→glasshouse, orchard (2), pier→long pier→fishery, market→bazaar→trade hall, windmill (2), fog bell→bell tower, shipyard (2, beach), lifeboat station (beach), beacon (2).
- Upgrades cost base x3 / x7 and need the plot's `grow` >= 0.5 / 1.0; grow rises only in zone (`growPerMin` 0.03, x Steady Light).
- Beach plots (6) are reserved: non-shore buildings may only take one while free beach > unbuilt shore buildings (pier x2, shipyard, lifeboat). Demolish (last build row, press A twice on the same plot within 8 s) refunds `demolishRefund` (75%) of build + upgrade cost; opened districts are saved (`open`) so demolishing never relocks land.
- Neighbours: homes +20% per garden/orchard (max 3) and +25% next to the market; pier +20% cargo next to market; orchard +25% next to a garden; windmill +50% next to an orchard.
- Districts open from lifetime milestones (buildings / ships docked / storms weathered): hillside 5b; hilltop 10b+25s; headland 14b+80s+3 storms; Gull Rock 18b+250s+10 storms.
- Lens tiers 2-4 (needs hillside/hilltop/headland): lamp +20%/tier, fog clearing +15%/tier, dock fog limit +0.03/tier; visuals: brass rings, twin beams, pennant.
- Steady Light: +10% per 5 min continuous in zone (cap x1.5) on cargo and growth; breaks after 12 s out of zone; paused while easing down after a storm (`stormCalmAfterS`) or during a wind-up.
- Lifeboat: a ship that would be lost/spilled is rescued for half cargo, then 240 s cooldown. Shipyard: cargo x1.3/x1.6, more steamers, Lv2 ships call 15% more often.
- Zone source: the calm Z2 hold uses `effortZone` (HR-aware, 4 s debounce). Storm warning + storm + surge use `min(5, powerZone)` (1.5 s debounce, `stormZoneGraceS`), because HR can't follow a 60–90 s push or a 15 s surge; `hud()` marks them `source: 'power'`.
- Resistance: flat sim grade during calm riding, plus virtual gears. The old rolling swell and its tunables are removed; storms still add `stormGradePct` (+3%).
- Clockwork wind-up (calm only, every 4–7 min): 40 s window, 20 s at ≥ `windRpm` (90) → lamp full, +15 coin, +2 timber. Shown in the storm banner slot plus `hud().targetCadence`.
- Bloom (`meadow`): 1/400 per in-zone minute, +15% per garden level.
- No conflicting goals: during a storm ships heave to offshore (progress and spawns frozen, "Sheltering" chip), so pushing hard never costs a ship; a weathered storm calms the sea (chop ≤ 0.1, fog ≤ 0.2). For `stormCalmAfterS` (90 s) after a storm, and during a clockwork wind-up, riding above zone neither churns the sea nor breaks the streak (HR is still high).
- Whales (`whaleEveryS` 600): during a Steady Light streak in calm seas; toast + `whaleSighted` event + 0.5% bloom; `whales` in summary and log.
- Delight (cosmetic or coin-only, never a new demand on the rider): decor tab (Y in the build menu; 7 items, 1-3 levels, coin only, needs 2 buildings); special visitors (`visitorChance` 0.12 once eligible; circus 5b → carousel, royal 10b+20 ships → bandstand, research 7b+40 ships → telescope; lost visitors retry); festivals at 10/25/50/75/100% bloom (`festivalS` 300, +25·n coin, dancing, bunting, fireworks at night); season = `floor(rides / ridesPerSeason) % 4` (2 rides each, spring first); weather every 4–7 min from a per-season table on its own seeded stream (doesn't shift gameplay RNG).
- Music layers by streak: pad → bass (1 min) → accordion (3 min; music box at night) → fiddle tune (5 min); festival adds tambourine + bells; storms go minor with drums. Silent when ducked or the sim stops. `render/audio.ts` owns the local mix: music ~5–6 dB back, scenery ~3–6 dB forward, softer stings/horns/coins and storm beds; quieter bass/percussion in dense arrangements. Shared recipes retain their levels for other games. `render/ambience.ts`: varied shore breakers over blended sea swells, weather-driven gusts/rain, delayed rolling thunder (sharper cracks in surges). Sim-time scheduling, pause/mute/duck gating and teardown discard pending strikes; scenery timers use sim dt. Shared SFX noise loops through long envelopes. Tests cover timing, weather, frame rates and lifecycle; Chromium offline audio verifies full surf/thunder tails.
- Ideal autopilot (storm-ready, 60 min rides): hilltop ride 1, headland ride 2, Gull Rock + max lens ride 4, all upgrades ~ride 5.
- Save `{ v: 2, buildings, levels, grow, coin, timber, meadow, lens, totals, rides, decor, gifts, festivals }` (old saves: festivals = milestones already passed).

## Controls (bike-first)
- Watch: A = build menu, Y = camera, Z = Keeper's Log (B closes). Build tab: Upgrade, 10 buildings, Lighthouse lens; left/right = next valid plot, up/down = row, A = act. Y = Decorate tab (D-pad = row, A = buy, stays open). B = close.
- The overlay draws no buttons: prompts live only in the shell's controller legend (its hoods are touch buttons). Taps: plots, lighthouse, a row (tap the selected row again to build), the log (closes it).

## Testing
`npx vitest run src/games/lighthouse`: scenarios + `test/sim.test.ts` (build flow, districts, upgrades, lifeboat, lens, streak, storms vs ships, whales, decor, festivals, visitors, seasons/weather, saves).

## Known gaps
- Renderer checked with throwaway Playwright screenshots, not on a real iPad; sounds and music untested by ear. Decor absorbs ~2.5k coin; after that coin still piles up. 
