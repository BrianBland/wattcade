# Purgatour (dungeon) - NOTES

CONTRACT-REQUESTs: none.

## Layout
- `sim/world.ts` per-floor maze (random spanning tree on 5x4 grid + loops), Z corridors with door tiles, boss room (deepest) holds STAIRS, dead ends get chests, 1-2 shrine rooms. Room layouts: open / quads / scatter (PIT tiles) / braziers (PILLAR tiles). Pits & braziers block walking, not projectiles; the centre cross + border ring stay clear so rooms stay connected.
- `sim/loot.ts` 7 weapon archetypes x 5 elements x rarities 0-4, plus rarity 5 uniques (homing, orbit, split, nova, ricochet). Gear slots helm/armor/boots/ring. `score` decides auto-equip vs auto-sell.
- `sim/descent.ts` (pure) the fixed descent: 7 floors (Keep 1-2, Catacombs 3, Crypt 4, Deep 5-6, the Broom Wagon 7 with the Grim Sweeper, `boss` variant 6), zone shortcut starts, Categories (Cat 4 .. World Tour) and `RunResult`.
- `sim/meta.ts` roguelite upgrades (cost = base x growth^level), `metaMods`, `autoInvest` (cheapest first).
- `sim/sim.ts` phases: `camp` (spend bank, choose start floor; D-pad + A or Z or tap a row via `GameSim.receive({type:'campRow',row})`; auto-starts after 45 s pedalling, B starts now) then endless `run`. `autopilot`/`skipCamp` skip camp.
- `render/renderer.ts` + `render/sprites.ts`; sound via `src/audio/sfx.ts` driven by `snapshot.cues` (id-ordered; renderer plays unseen ids, rate-limited).

## Rules
- Controls (hands-off, #85): the hero AI (`sim/ai.ts` helpers + `autopilotCtl`) always moves, aims and fights; no manual aim/move/dash (the AI rolls out of crowds itself, `aiRollCdS`). All 4 shifters are virtual gears (`useVirtualGears(true)`). Rider actions: A Strike (AoE hit + slow, needs an enemy in reach), B Ward (blocks all damage for `wardDurS`), Y Rally (faster attacks while a spin-up is called), Z Potion (`potionCdS`). AI safety-net potion below `autoPotionHpFrac` only if the rider hasn't drunk in 10 s. Cooldowns (#86, `core/cooldown.ts`): refilled at `cdRefillZ1..5` by `min(5, powerZone)`; a detected sprint finishes all (`cdSprintCompletes`). D-pad Left/Right switches Mid-Ride Pace Bias (Cool Off / Cruise / Push Hard); D-pad Up opens the Skill Tree.
- Save v4 (`SAVE_VER = 4`): `{ ver: 4, bank, upgrades, bestFloor, runs, autoInvest, archetype, climbs, totals }` (`migrateSave`: v1 Swiftness & v3 Arcanist refunded as coins). No lives: a death banks every run coin and returns to Camp; the next descent resets hero level, skill tree and loot while Camp upgrades & Hero Archetype unlocks persist. `isOver()` is always false. Camp is cool-down (`gradeCamp` 0 %, Z1-2), auto-starts after `campAutoStartS` 45 (autopilot 10). Second Wind (#88) fires on a lethal hit.
- Start floor defaults to floor 1 (or unlocked Shortcuts zone starts); deeper starts give a scaled starter weapon, hero level 1+2*(floor-1), and `floor - 1` starting Skill Points.
- Elites (5% + 1.5%/floor, max 25%): Undying (regen), Splitting, Warded (shield bubble), Swift, Volatile (death blast telegraph). x2.6 HP, guaranteed item.
- Shrines activate when their room is cleared (optional): Fury Z3+ 20s/50s -> weapon +2; Patience hold Z2 over 90s -> 1-4 items; Gold 2 sprints/60s -> coin rain + heal; Whirlwind `whirlRpm` (95) for 15s/45s -> +1 potion + coins (`targetCadence`). Fury is judged on power zone (HR lags); boss shield / Fury / Gold targets are `source: 'power'`. HUD targetZone follows the active shrine.
- Hit-stop: the sim freezes 0.08-0.1 s (capped by HIT_STOP_MAX) on elite/boss kills, boss intro/phases, level-ups, uniques, shrine rewards.
- Melee enemies follow a room-local BFS flow field; `move()` nudges toward tile centres so corners don't snag; autopilot paths in combat when closing distance; friendly hits use swept segments.

## Balance (autopilot, FTP 200, z2)
- Fresh hero: ~9-11 floors/hour, rare deaths (enemyDamageScale 1.3). With auto-invest over 6 hourly runs: floor 11 -> 13 -> 15 -> 19 -> 24 -> 26. ~2-4 uniques/hour.

## Testing
`npx vitest run src/games/dungeon` (world connectivity, meta, camp purchase, archetypes, 3-branch skill trees, mutually exclusive forks, mid-ride pace control, scenarios incl. 60-min z2-hour).

## Known gaps
- Renderer verified via throwaway Playwright screenshots only. Pit visuals not screenshot-checked. The hero always auto-moves; there is no manual-move mode to balance-test.
- Pacing (#89, `sim/director.ts`, pure): warm-up (run's first floor, `paceWarmupS` 120) → explore Z2 → ambush Z3-4 (`paceAmbushS`, `ambushEnemies` 4 +1/3 floors) → recover (60) → called spin-up → boss → cool-down. Shaped per Hero Archetype (`sim/archetypes.ts`) and live Pace Bias (`Cool Off` / `Cruise` / `Push`).
- Bosses (#90, `sim/boss.ts`, pure): 7 bosses across the descent (ending with the Grim Sweeper). 3 phases at `bossPhase2Hp` .66 / `bossPhase3Hp` .33 with a 1.5 s stagger, banner, cleared shots; attacks speed up 12%/phase. Every `bossBigEveryS` 20 (-3 s/phase) a telegraphed (`bossWindupS` 2) big attack, then EXPOSED `bossExposedS` 5 (stunned, x`bossExposedMult` 2; sprint or ERG surge x`bossSprintDamageMult`, default 2). Ward up at the big attack = parry +2 s; first Strike in the window +1.5 s. Turning Tide after `bossTideAfterS` 120: +`bossTideRate` 1%/s damage taken (cap +100%).

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

## Sprites v2 (#91)
- `render/art.ts`: flat ASCII art, 16 px actors and 32 px Bone King / Frost Wyrm, with per-frame row overrides (walk x2,
  attack, hurt). The other four bosses use their minion art scaled x2 and re-outlined at 32 px.
- `sprite2()` adds a 1 px outline and light/shadow ramps when rasterising (cached per frame/palette); `anim()` picks the
  frame (walk at 7-9 fps; attack on wind-up/shot; hurt flinch). Held weapon art per weapon style, rotated to the aim.
- Background: autotiled wall tops (edge outline + lit rim per open side, inner corners), shaded bricks, wall torches.
- Light map at 1/4 resolution: ambient dark with holes at the hero, torches and braziers (flickering). Render cost at 2x
  DPR on the box: median 0.8 -> 1.7-2.0 ms per frame.

## Achievements and effects
- Depth rewards require defeating a boss at floor 10 / 15 / 20 or deeper. `dungeon.bestClearedFloor` is distinct from
  the old floor-entry counter, so entering a deep floor or starting there from camp cannot qualify.
- Perfect Exposure requires three bosses at floor 5+ in one dive, with a Strike in every Exposed window and at least
  two windows per fight. A killing Strike counts before the boss-defeat event is emitted.
- Full Arsenal requires epic+ weapon pickups for all four unlocked stances in one dive. Pickups count even when
  auto-sold; later auto-equipping never removes collection credit. A new descent clears the collection.
- Elite Hunter (75 elites) and Untouchable (8 bosses) count within a dive using death events as boundaries. A death
  before a successful dive, or after its threshold is reached, does not invalidate that success.
- Curse Eater (100 curses), Not Today (25 Second Wind saves), and Spin Doctor (3 answered spin-ups in one ride) keep
  their goals. Second Wind emits exactly one event per save. The 2,000-kill stance goals are named Veteran milestones.
- Achievement IDs, reward mappings, and previously earned rewards remain intact; this change does not bump the
  progression rules version or revoke rewards. New depth progress starts from verified boss defeats.
- Retune check: six fresh 35-minute `hook-responsive` rides with `autopilot` + `actionBot`, seeds 11–16, default
  tuning/FTP 200. Before: 2–3 game achievements per ride, Full Arsenal and Perfect Exposure in all six. After:
  0–1 per ride (Curse Breaker in five); neither collection nor exposure unlocks. These bots test early clustering,
  not human unlock rates or the whole late-game curve. An upgraded invulnerable fixture verifies Full Arsenal can
  still emit once all four epic collections are complete; it is not a pacing benchmark.
- Curse Breaker is now 6 curses in one ride (was 12: about 60+ min even for the action bot; 40-min rides see 5-8).
- Events: `kill` carries `stance` and `elite`; `bossDefeated` carries `floor`, `stance`, `windows`, `struck`;
  `fullArsenal` carries `stances: 4` and `minRarity: 3` to distinguish the new collection from older rare-weapon events.
- Effects: damage numbers on every hit (rapid hits on one enemy merge; crits pop), red numbers for damage taken,
  segment banners (warm-up, explore, recover, cool-down) that stack with others, SECOND WIND banner, coins fly to the
  HUD counter (which pulses), and a ring + "<action> ready" pulse on the hero when an action finishes refilling.
- Damage numbers draw from the RNG exactly where the old big-hit numbers did, so seeds and balance are unchanged.

## Pixel combat / weapon variety
- Dedicated boss art, native pixel rendering, ten weapon families and modifier palettes: see `render/NOTES.md`.
- `dev/dungeon.html` previews the real armory, boss poses and live game; `scripts/dungeon-render-smoke.mjs` captures/checks them.

## Hero Archetypes, Skill Trees & Mid-Ride Pace Control
- `sim/archetypes.ts` (pure): replaces universal stances with 3 Launch Hero Archetypes (`rouleur` Z2-Z3 Steady Base, `puncheur` Z2 + Z5 Sprints, `grimpeur` Z3-Z4 Sustained Climbs — unlocked at Floor 4 or 10 climbs). Each archetype configures `DirectorCfg` (ERG %FTP & Grade % parity), silhouette/jersey kit, weapon drop family, and combat stats.
- Mid-ride Pace Bias (`PACE_MODES` `-1/0/+1`: Cool Off / Cruise / Push Hard): D-pad Left/Right (or bottom-left HUD chips) lets the rider dial workout effort up or down mid-ride in both ERG and Grade modes, trading lighter effort + regen vs higher damage + refill + XP/coins.
- `sim/skillTree.ts` (pure): replaces post-boss 1-of-3 perks with Diablo-style 3-branch skill trees per archetype (5 nodes per branch: T1 0/2, T2 0/2, T3 mutually exclusive Fork A vs Fork B 0/1 locked for the run, T4 Capstone Keystone 0/1).
- Level-ups bank `+1 SP` (`unspentSP`); Boss kills award `+1 Bonus SP` + a Boss Trophy Relic (`+1` rank to T1/T2 in the archetype's primary branch). When `unspentSP > 0` at room clear, the Quick-Pick Strip auto-opens on flat recovery road (`skillOfferDelayS`, `skillAutoPickS`), with `[Y]` toggling Full 3-Branch Tree. `D-pad Up`, tapping the HUD SP pill, or Pause Menu `menuActions()` opens the Full Tree Build Inspector safely at any time.
- Save v4 (`SAVE_VER = 4`): refunds retired `arcanist` stance upgrade (2,500c) and persists `archetype` and `climbs`. `snapshotFormat` bumped to `3`.

## The descent (run ending)
- A descent is `FLOORS` = 7 floors; bosses meet in their tuned order, then the Grim Sweeper (floor 7, `finalFloorRooms` 4 rooms, `sweeperHpMult` 1.25). Beating him opens the finish (the stairs); walking through calls `winRun()`, banks coins + `winBonusCoins` x Category coins, unlocks the next Category, and returns to Camp with a Build Summary Card (`buildTitle`, chosen Forks & Capstones, Grimpeur unlock progress).
- Shortcuts (max 3): start at a zone reached (floors 1/3/4/5) with `floor - 1` starting Skill Points.

## P0 stabilization & cleanup
- Workout preservation & Camp safety: `inMenu()` is true only before the first run (`sessionRuns === 0`); post-death Camp locks inputs for 2.1 s (`campLockT`, disabled in `autopilot`).
- Combat/ERG/HUD correctness: Skill Tree / Level-Up overlays clear combat grades (`boss-surge`/`swamp`/`wounded`/`curse-mire`) to `campGrade` (or `cooldown.erg`) and hide `touchControls`; `SECOND WIND` emits one banner; Strike `usable`/`active` reflects `strikeInReach()`; ERG mode honors active shrines, lets riders shatter curses at 100+ rpm for 5 s, and requires `ftpFraction >= ergBossSurge * 0.85` for Exposed x2 boss damage.
- Art32 & renderer lifecycle: `loadArt()` returns a shared Promise exposed via `renderer.ready()`; derived rotated/flashed sprite cache is LRU-bounded and cleared on `unmount()`.

## Unified Polish (AV/Juice, Minimap & Biomes, Combat Spectacle, Loot UX)
- `sim/elementProcs.ts` (pure): elemental combat procs (Storm crit/Strike chain lightning, Frost shatter on slowed kills, Fire death ignition, Venom spore cloud, Arcane gravity pull) and Archetype-flavored Strikes (`ARCHETYPE_STRIKE`: Rouleur heavy knockback Aegis Slam, Puncheur 5-shard Volt Volley, Grimpeur Col Crusher). Ward-parrying a boss big attack fires 3 golden counter-bolts + shockwave + hitstop.
- `sim/lootOffer.ts` (pure): timed non-blocking Loot Choice card (`lootPromptS` 8 s) with stat deltas (`PWR`, `Normal->Storm`, `HP`, `CRIT`, etc.); upgrades auto-equip on expiry, interesting sidegrades/uniques auto-sell on expiry; `[Y]` flips the choice contextually (and pauses/hides cleanly whenever the Skill Tree / Quick-Pick overlay is open). Rally (`[Y]` when no loot offer is active) is always usable off cooldown, with a 1.35x Spin-Up surge duration bonus during called spin-ups.
- Audio, Juice & Boxless HUD: see `render/NOTES.md` (`audioBus.ts`, `music.ts`, `musicScore.ts`, `sound.ts`, `juice.ts`, `playerHud.ts`, `minimap.ts`, `biomeBanner.ts`, `combatFx.ts`).
