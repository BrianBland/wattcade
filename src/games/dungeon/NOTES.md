# Crank Crawler (dungeon) - NOTES

CONTRACT-REQUESTs: none.

## Layout
- `sim/world.ts` per-floor maze (random spanning tree on 5x4 grid + loops), Z corridors with door tiles, boss room (deepest) holds STAIRS, dead ends get chests, 1-2 shrine rooms. Room layouts: open / quads / scatter (PIT tiles) / braziers (PILLAR tiles). Pits & braziers block walking, not projectiles; the centre cross + border ring stay clear so rooms stay connected.
- `sim/loot.ts` 7 weapon archetypes x 5 elements x rarities 0-4, plus rarity 5 uniques (homing, orbit, split, nova, ricochet). Gear slots helm/armor/boots/ring. `score` decides auto-equip vs auto-sell.
- `sim/meta.ts` roguelite upgrades (cost = base x growth^level), `metaMods`, `autoInvest` (cheapest first).
- `sim/sim.ts` phases: `camp` (spend bank, choose start floor; D-pad + A or Z or tap a row via `GameSim.receive({type:'campRow',row})`; auto-starts after 45 s pedalling, B starts now) then endless `run`. `autopilot`/`skipCamp` skip camp.
- `render/renderer.ts` + `render/sprites.ts`; sound via `src/audio/sfx.ts` driven by `snapshot.cues` (id-ordered; renderer plays unseen ids, rate-limited).

## Rules
- Controls (hands-off, #85): the hero AI (`sim/ai.ts` helpers + `autopilotCtl`) always moves, aims and fights; no manual aim/move/dash (the AI rolls out of crowds itself, `aiRollCdS`). All 4 shifters are virtual gears (`useVirtualGears(true)`). Rider actions: A Strike (AoE hit + slow, needs an enemy in reach), B Ward (blocks all damage for `wardDurS`), Y Rally (faster attacks; only while a spin-up is called, today the Whirlwind shrine), Z Potion (`potionCdS`). AI safety-net potion below `autoPotionHpFrac` only if the rider hasn't drunk in 10 s. Cooldowns (#86, `core/cooldown.ts`): base `strikeCdS` 30 / `wardCdS` 45 / `rallyCdS` 35 / `potionCdS` 6, refilled at `cdRefillZ1..5` (1 / 1.5 / 2 / 2.6 / 3.2 x) by `min(5, powerZone)`; a detected sprint finishes all (`cdSprintCompletes`). The on-screen buttons are the cooldowns (`games/kit/actionButton.ts`, fill bottom-to-top, effort tint/flourish, glow when ready; tap = `receive({type:'action',id})`), in a control dock above the HUD inset (`render/layout.ts`, tested); during a boss the camera centres between hero and boss. Snapshot: `ai.path`/`ai.targetId`, `actions`, `refill`. D-pad is reserved for stances (#87).
- Save v2 `{ ver: 2, bank, upgrades, bestFloor, runs, autoInvest, stance, stancesUnlocked, totals }` (`migrateSave`: v1 Swiftness refunded as coins). No lives: a death banks every run coin (no loss) and returns to camp; the next descent resets hero level and loot, camp upgrades persist. `isOver()` is always false. Camp is cool-down (`gradeCamp` 0 %, Z1-2), auto-starts after `campAutoStartS` 45 (autopilot 10). Second Wind (#88) fires on a lethal hit: `secondWindHeal` 50 %, `secondWindInvulnS` 1, knockback, clears nearby enemy shots; recharge `secondWindCdS` 540 at base (≈6 min of Z2), effort-scaled, not finished by sprints. The regen upgrade is now 'Regeneration'.
- Start floor defaults to the deepest unlocked (Delver: +2/level, capped at bestFloor-1); deeper starts give a scaled starter weapon and hero level 1+2*(floor-1).
- Elites (5% + 1.5%/floor, max 25%): Undying (regen), Splitting, Warded (shield bubble), Swift, Volatile (death blast telegraph). x2.6 HP, guaranteed item.
- Shrines activate when their room is cleared (optional): Fury Z3+ 20s/50s -> weapon +2; Patience hold Z2 over 90s -> 1-4 items; Gold 2 sprints/60s -> coin rain + heal; Whirlwind `whirlRpm` (95) for 15s/45s -> +1 potion + coins (`targetCadence`). Fury is judged on power zone (HR lags); boss shield / Fury / Gold targets are `source: 'power'`. HUD targetZone follows the active shrine.
- Hit-stop (sim freezes 0.08-0.35 s) on elite/boss kills, level-ups, uniques, shrine rewards.
- Melee enemies follow a room-local BFS flow field; `move()` nudges toward tile centres so corners don't snag; autopilot paths in combat when closing distance; friendly hits use swept segments.

## Balance (autopilot, FTP 200, z2)
- Fresh hero: ~9-11 floors/hour, rare deaths (enemyDamageScale 1.3). With auto-invest over 6 hourly runs: floor 11 -> 13 -> 15 -> 19 -> 24 -> 26. ~2-4 uniques/hour.

## Testing
`npx vitest run src/games/dungeon` (world connectivity, meta, camp purchase via TimelineInput, scenarios incl. 60-min z2-hour).

## Known gaps
- Renderer verified via throwaway Playwright screenshots only. Pit visuals not screenshot-checked. Manual (non-auto-move) play not balance-tested.
- Stances (#87, `sim/stances.ts`): D-pad left/right cycles Vanguard (flame/pellet, close, 0.6x dmg taken) / Ranger (arrow/bolt, far) / Skirmisher (star/spark, kite, +5% move) / Arcanist (orb; camp unlock `arcanist`, else orbs feed the Ranger). Each has its own weapon slot; loot fills the matching slot and `stanceDropBias` of weapon drops roll for the current stance. `stanceCdS` 8, `stanceSwapS` 1.5 (no attacks). Style bonus `styleBonus` (+10% armor/fire/move/dmg) while cadence is in the stance band (70-82 / 92-100 / 88-98 / 85-95) AND power ≥ Z2, hidden while a spin-up is called. Per-shot damage x `dmgCadenceRef`/cadence (0.8-1.5) so damage per second follows power, not cadence; parity test in `test/stances.test.ts`.
