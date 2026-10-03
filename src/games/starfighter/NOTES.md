# Sprocket Squadron (starfighter; was "Crank Fighter")
CONTRACT-REQUESTs: none. The id stays `starfighter` so old saves keep their best score (`{ best }` loads into save v2).

## Layout
- `sim/content.ts` sectors (5 themes cycle: Kuiper Drift, Ember Nebula, Crystal Reach, Ion Storm, The Maw; each has an enemy mix + boss), enemy/boss/power-up tables, gun spread per level.
- `sim/meta.ts` hangar upgrades (cost = base x growth^level), `metaMods`, `autoInvest` (cheapest first). `sim/types.ts` snapshot types.
- `sim/sim.ts` `createSfSim(ctx, opts?: { autopilot?, skipHangar?, sector? })`. Phases: `hangar` (spend scrap, pick start sector; D-pad/left shifters choose, A buys/launches, B launches now, taps via `receive({type:'hangarRow',row})`; launches after 30 s pedalling) then `run`. Autopilot/skipHangar skip the hangar (auto-invest still applies).
- `render/`: `renderer.ts` (field, particles, side/top info panels, boss bar, banners, hangar, sound cues + engine ambience), `layout.ts` (pure; field + panels above the HUD inset, tested), `sprites.ts` (pixel art, ship tinted by profile colour), `bosses.ts` (vector bosses), `backdrop.ts` (nebula tile, planet, parallax stars, warp streaks).

## Rules (every number is a `starfighter.*` tunable or a content-table constant)
- Shifters are guns: left = shiftUpL/shiftDnL/D-pad, right = shiftUpR/shiftDnR/A/B/Y/Z. Hold = auto-fire, tap = one pull. Each gun auto-aims the lowest enemy in its half. `useVirtualGears(false)`.
- Cadence -> shot credits (`revsPerShot`, x Autoloader). Power -> thrust (scroll/enemy speed, score) + shield regen. Sprint -> overdrive beam (also burns enemy bolts). Missiles and wingmen fire while cadence > 30.
- Sector = cruise (`cruiseS` 150, zone 2) -> attack run (`attackS` 70, zone 4, +`attackGradePct` 3.5 %) -> boss (zone 4; escapes after `bossTimeoutS` 150 with no clear bonus) -> warp (`warpS` 6) -> next sector. Enemy HP +18 %/sector, damage +6 %/sector, formations grow over sectors 1-3.
- Enemies: drone, armor, weaver, diver (locks on, then dives), gunner (hovers, fires 3 aimed bolts), splitter (-> 2 shards). Golden enemies (1.5 %) always drop a power-up. Leaks hurt.
- Bosses: Dreadnought (spreads), Hive Carrier (homing orbs + drones), Twin Lancer (two halves, telegraphed lane lasers; one per gun side), Spiral Core (bullet spiral), The Maw (cycles all patterns). Enraged below 50 %.
- Power-ups: Gun Up (spread levels 1-5), Missiles 20 s, Shield Cell, Repair, Wingman 30 s, Nova (screen clear). Pity drop after 35 s (x1.5 in cruise). Losing a ship costs a gun level.
- Cruise challenge, once per cruise (40 s window), optional. Odd sectors: Slipstream, 20 s at power zone 3+ -> 3 power-ups + scrap. Even sectors: Spin-Up, 15 s at >= `spinUpRpm` (95) in zone 2 -> Rapid Fire (`rapidFireMult` x2 credits per rev for 30 s) + scrap. HUD: `targetCadence` during Spin-Up.
- Zone source (SPEC short-effort rule): attack runs, bosses and Slipstream are judged on `min(5, powerZone)` and `hud()` marks them `source: 'power'`; cruise Z2 keeps the profile zone source.
- Ships: `lives` 3 (0 = unlimited) + Escape Pods. Last ship lost -> game over. `timeLimitS` 0 = endless.
- Scrap from kills/sector clears is banked (save every 30 s, on sector clear, ship loss, game over, dispose).
- Save v2 `{ best, bank, upgrades, bestSector, runs, autoInvest, totals }`.

## Balance (autopilot, FTP 200)
- Fresh ship: z2 / intervals reach sector 5-8 in ~21-35 min. Boss fights 20-90 s. Hangar auto-invest over 45-min interval rides: sector 7 -> 9 -> 11 -> 12 -> 14 -> 15 -> 16 -> 17.

## Testing
`npx vitest run src/games/starfighter`: scenarios (sprints, idle, intervals, z2-half-hour), guns per side, HUD zones, Twin Lancer halves, boss escape, lives, hangar buy/tap/auto-launch/carry-over, old-save migration, Slipstream on power with HR in Z1, Spin-Up cadence target/pass/fail, Rapid Fire doubling pulls, attack source power, card, determinism, layout vs HUD inset.

## Known gaps
- Renderer checked with throwaway Playwright screenshots (1180x820, 820x1180), not on a real iPad; sounds not checked by ear. Manual paddle steering not balance-tested.
