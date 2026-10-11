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
- Stances (#87, `sim/stances.ts`): D-pad left/right cycles Vanguard (flame/pellet, close, 0.6x dmg taken) / Ranger (arrow/bolt, far) / Skirmisher (star/spark, kite, +5% move) / Arcanist (orb; camp unlock `arcanist`, else orbs feed the Ranger). Each has its own weapon slot; loot fills the matching slot and `stanceDropBias` of weapon drops roll for the current stance. Cycling is free (no cooldown): each press moves the pick, the stance commits `stanceCommitS` 0.4 s after the last press (cycling back to the current stance does nothing), then `stanceSwapS` 0.5 s with no attacks; a swap resets the shot timer and the style bonus only starts `styleSettleS` 3 s after a swap, so rapid swapping can't farm bonuses or free shots. Style bonus `styleBonus` (+5% armor/fire/move/dmg) while cadence is in the stance band (70-82 / 92-100 / 88-98 / 85-95) AND power ≥ Z2, hidden while a spin-up is called. Per-shot damage x `dmgCadenceRef`/cadence (0.8-1.5) so damage per second follows power, not cadence; parity test in `test/stances.test.ts`.
- Pacing (#89, `sim/director.ts`, pure): warm-up (run's first floor, `paceWarmupS` 120) → explore Z2 → ambush Z3-4 (`paceAmbushS` 40, `ambushEnemies` 4 +1/3 floors, needs a locked fight room, ≥ `paceFirstAmbushS` 75) → recover (60) → called spin-up (`paceSpinupS` 20 >`paceSpinRpm` 100; answered if ≥50% above → all actions recharge + coins; Rally live) → boss → cool-down. Rides past `paceSecondEffortMin` 30 get a 2nd ambush. Per segment `grade_<seg>` offsets (grade mode) or `erg_<seg>` FTP targets (ERG: camp 'Trainer mode' toggle, saved `erg`; no gears; boss shield = called surge `ergBossSurge` 1.15, counts as sprinting). Speed is flat 60-90 rpm; >90 only pays in a called spin-up (`ai.cadenceSpeed`). Rooms 9-21 x 7-15 (cells 27x19); camera smooth-follows and zooms to 0.8 in arenas. ~7.3 min/floor on z2.
- Bosses (#90, `sim/boss.ts`, pure): 6 bosses by floor ((floor-1)%6; Bone King and Frost Wyrm reuse the skeleton/slime sprites with new palettes until #91). 3 phases at `bossPhase2Hp` .66 / `bossPhase3Hp` .33 with a 1.5 s stagger, banner, cleared shots; attacks speed up 12%/phase. No timed shield: every `bossBigEveryS` 20 (-3 s/phase) a telegraphed (`bossWindupS` 2) big attack, then EXPOSED `bossExposedS` 5 (stunned, x`bossExposedMult` 2; sprint or ERG surge x`bossSprintDamageMult` 1.5). Ward up at the big attack = parry +2 s; first Strike in the window +1.5 s; Arcanist +1 s. Turning Tide after `bossTideAfterS` 120: +`bossTideRate` 1%/s damage taken (cap +100%). Boss-surge grade / ERG surge run during windup+exposed. Intro and death set pieces.

## Difficulty (balance pass)
Zone 2 with no actions is survivable for a while, not forever. Bot targets (40-min rides, 8 seeds, see the PR table):
a steady z2 rider dies about once every 25-30 min (first death ~18 min) and stalls on bosses (~100 s fights, ~30% reach
Turning Tide); a rider who answers ambushes/spin-ups/Exposed windows and uses actions (`hook-responsive` script +
`actionBot` sim opt) clears more bosses, goes deeper and dies less. Floor 1 is eased (no deaths there in tests).
- Zone-2 regen only works out of combat from floor 2 on (`regenInCombatFrac` 0; half on floor 1).
- Enemy damage grows `enemyDamageGrowth` per floor (1.28), floor 1 x `floor1Ease` (0.5), base `enemyDamageScale` 2.1.
- Boss HP grows `bossHpGrowth` per floor (1.42) from `bossHp` 4500 (floor 1 x0.55).
- Boss Fury: after `bossFuryAfterS` (60 s, not floor 1) boss-fight damage climbs `bossFuryRate` (3%/s, max +150%),
  racing Turning Tide. Sprinting in Exposed windows does x2 (`bossSprintDamageMult`).
- The autopilot steps in on an Exposed boss while Strike is ready so the rider's Strike lands.
- Camp: Might +10%/level, Vitality +12%/level, both from 300 coins (x1.3).
- `actionBot` (headless only): Strike on Exposed boss or 3+ enemies, Ward on late windups or low HP in a crowd,
  Rally on called spin-ups, potion under 50% HP.
- Sprinting pays on its own (no buttons): a sprint heals 25% max HP (Second breath, `sprintHealFrac`), cuts damage
  taken 50% while sprinting (`sprintGuard`), makes the hero Fired Up for 30 s (x1.4 damage, `sprintFiredUpS/Dmg`),
  takes 60 s off Second Wind (`sprintSecondWindS`), and a sprint started while the boss is idle breaks its guard
  (4 s Exposed, `bossSprintBreakS`). Before this, sprints-only did worse than z2: sprints rarely landed in Exposed
  windows and its 0.6 FTP base did less damage than z2's 0.65 between sprints.
- `styleBonus` 0.05 (was 0.08): the harder game amplified the Ranger's in-band edge past 10% on long rides.
- Tests: the gating stance-parity test is deterministic (invulnerable hero, shared 40 s prefix, then 76/86/96 rpm;
  compares weapon-normalised `stats.output / stats.fireT`). Long bot rides live in `test/balance.test.ts`
  (`npm run test:balance`, skipped unless BALANCE=1).
- Dock: one stance card (left) = active stance name (✓ when in style), its weapon (name, level, power, count, element)
  and gear pips, plus small chips for the other stances (weapon icon + weapon level; the D-pad pick fills, the AI
  suggestion pulses). The active stance's cadence band is published as `hud().targetCadence` ("<Stance> style"), shown
  by the shell's zone widget; called targets (spin-up, whirl shrine) take priority. No separate stance panel.
- HUD compaction (#104 follow-up): no dock action buttons. The shell's controller-overlay diamond (A Strike, B Ward,
  Y Rally, Z Potion with cooldown fills) is the only action/cooldown display and doubles as the touch target
  (`PadKey` pointer handlers -> `input.holdTouch`), shown while the controller legend is on (default; pause menu toggle).
  The stance card is one slim row bottom-left (stance badge + weapon icon + Lv/element, ✓ in style; other stances as
  tiny icon+level chips). Minimap drawn at about half size (capped ~110u), translucent. Dev measurement: the renderer
  records HUD boxes in `globalThis.__dgHud` for dev-shot's HUD-area %.
- The slim row also shows each equipped gear item (slot icon + item level, rarity-coloured border/tint). Top-left
  status panel is compact (thin HP/XP bars, one line with Lv/floor, coins, potions, Second Wind pip), scaled from CSS
  px (`hu`) so iPad's device scale doesn't double it; the boss bar starts right of it, so they no longer overlap.

## Hero pathing
- `findPath` (sim/ai.ts) is 8-directional A* (diagonals cost sqrt2, never cut a wall corner, octile heuristic, insertion-order tie-break so it stays deterministic), then string-pulled: waypoints are kept only where a straight, body-width (`PLAYER_R + 0.05`) leg is no longer clear. Scratch buffers are reused across calls.
- If the hero is pushed off a straight leg (dodges, knockback), the sim re-plans when the next leg isn't clear (checked at most every 0.25s).
- The path dots are resampled every 0.6 tiles along the smoothed polyline from the hero, so diagonal legs draw as diagonal dotted lines.

## Harder fresh characters, stronger camp (retune after diagonal pathing)
- Knobs: enemyDamageScale 2.1→2.75, enemyDamageGrowth 1.28→1.34, potionHeal 0.45→0.38, wardDurS 3→2, strikeDamageMult 6→4,
  sprintHealFrac 0.3→0.45, sprintGuard 0.5→0.6, sprintSecondWindS 60→120, sprintFiredUpS 30→60, sprintFiredUpDmg 1.4→1.7.
- Camp: Might +15% dmg / Vitality +18% HP per level (were +10% / +12%), both cost 250 x1.28^lvl (were 300 x1.3^lvl).
- Targets (12 seeds, 40 min, fresh): z2 ~2.25 deaths (every ~18 min) < sprints ~1.75 < responsive ~1.67 < action bot ~1.0;
  upgraded riders (rides 3-5 of a chain) die far less and go 2-4 floors deeper.
- `action-hour` runs two seeds with loose per-seed bounds plus averaged bounds (`seeds` / `assertAvg` in scenarios.ts).
  The floor-8 / 12-curse achievements are checked on a fixed summary instead of a lucky ride.

## Steeper depth scaling (upgraded riders still die)
- enemyDamageGrowth 1.34→1.55, enemyHpGrowth 1.26→1.32, bossHpGrowth 1.42→1.5, enemyDamageScale 2.75→2.4,
  floor1Ease 0.5→0.35, sprintFiredUpS 60→90, sprintFiredUpDmg 1.7→2.
- 12 fresh seeds: 0% of rides die on floor 1 on their first run; 5-ride chains keep dying at depth (z2 ~1/ride, action bot ~0.5-0.75/ride on rides 3-5).
- test:balance uses 12 seeds, checks floor-1 first-run deaths < 10%, and that upgraded 3rd rides still die.

## Corridor wedging fix
- Root cause: `move()` refused any step while the body's 4 corners overlapped a wall, and only nudged toward the
  corridor centre for pure-axis moves. Smoothed (diagonal) legs left the hero grazing a wall at corridor mouths,
  where it froze. Stuck time (1s windows with a path, nothing within 6 tiles, < 0.5 tiles moved; 12 seeds x 15 min):
  ca077ef 0.8%, 44eaa81 26.3%, now 1.4%.
- Fix: a body already overlapping a wall eases back to its tile centre first; the perpendicular nudge now also applies
  to mostly-axis moves. Stuck detector: < 0.25 tiles progress in 0.75s with a path -> 3s of raw (unsmoothed) tile paths.
- No death spiral: dying on the floor you started on lowers the default start by 2 (still adjustable at camp).
- Retune (hero now covers more ground): enemyDamageScale 2.4->1.9, enemyDamageGrowth 1.55->1.45.

## Movement flow (pure pursuit)
- Paths are plain tile-centre A* paths with a wall-proximity cost (`wallCost` 0.35 per orthogonal wall), so they keep off
  room walls and follow corridor centre lines. The hero steers at the farthest point up to 1.3 tiles ahead along the path
  that its body (+0.1 margin) can reach in a clear straight line (pure pursuit), and eases to 82% speed into sharp bends.
- The hero's wall-collision radius is 0.3 (hit radius stays 0.35) so it has slack in 1-tile corridors.
- Stuck detector only runs while exploring and just re-plans.
- `sim.navStats()` (headless only) reports explore time, mean speed vs max, time < 50% speed, wall contact, corridor
  speed, corridor off-centre time, overshoot (> 0.4 tiles off the planned leg) and fallbacks; ai.test.ts gates them.
- 12 seeds x 15 min explore: mean speed 94.0% -> 99.2%, corridor 94.7% -> 98.8%, < 50% speed 2.3% -> 0%,
  wall contact 4.5% -> 0.2%, overshoot 0.4% -> 0.2%, fallbacks 29 -> 7.
- styleBonus 0.05 -> 0.03: with the hero no longer losing time, Ranger's +fire bonus at 96 rpm cleared 12.6% more rooms.
