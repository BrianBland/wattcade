# Crank Crawler (dungeon) - NOTES

CONTRACT-REQUESTs: none.

## Layout
- `sim/world.ts` per-floor maze (random spanning tree on 5x4 grid + loops), Z corridors with door tiles, boss room (deepest) holds STAIRS, dead ends get chests, 1-2 shrine rooms. Room layouts: open / quads / scatter (PIT tiles) / braziers (PILLAR tiles). Pits & braziers block walking, not projectiles; the centre cross + border ring stay clear so rooms stay connected.
- `sim/loot.ts` 7 weapon archetypes x 5 elements x rarities 0-4, plus rarity 5 uniques (homing, orbit, split, nova, ricochet). Gear slots helm/armor/boots/ring. `score` decides auto-equip vs auto-sell.
- `sim/meta.ts` roguelite upgrades (cost = base x growth^level), `metaMods`, `autoInvest` (cheapest first).
- `sim/sim.ts` phases: `camp` (spend bank, choose start floor; D-pad + A or Z or tap a row via `GameSim.receive({type:'campRow',row})`; auto-starts after 45 s pedalling, B starts now) then endless `run`. `autopilot`/`skipCamp` skip camp.
- `render/renderer.ts` + `render/sprites.ts`; sound via `src/audio/sfx.ts` driven by `snapshot.cues` (id-ordered; renderer plays unseen ids, rate-limited).

## Rules
- Controls (hands-off, #85): the hero AI (`sim/ai.ts` helpers + `autopilotCtl`) always moves, aims and fights; no manual aim/move/dash (the AI rolls out of crowds itself, `aiRollCdS`). All 4 shifters are virtual gears (`useVirtualGears(true)`). Rider actions: A Strike (AoE hit + slow, needs an enemy in reach), B Ward (blocks all damage for `wardDurS`), Y Rally (faster attacks; only while a spin-up is called, today the Whirlwind shrine), Z Potion (`potionCdS`). AI safety-net potion below `autoPotionHpFrac` only if the rider hasn't drunk in 10 s. Snapshot exposes `ai.path`/`ai.targetId` (path dots + target marker) and `actions` (ready 0..1 bars, no numbers). D-pad is reserved for stances (#87).
- Save `{ bank, upgrades, bestFloor, runs, autoInvest }`. Every coin earned in a run is banked (persisted on room clear, death, descent, dispose). Death drops 20% of run coins. `dungeon.lives` tunable (default 3; 1 = permadeath roguelike; 0 = unlimited): the death that spends the last life ends the run (`isOver()`), coins banked; hearts shown in the HUD.
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
