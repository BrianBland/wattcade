# Dynamo Defense: levels design

Agreed with the owner on 2026-11-07. Builds on `LEVELS-HANDOFF.md` (branch `td-ground-spike`), which keeps the
exploration results, map metrics and ground-kit notes. Where the two differ, this file wins. The continuous-combat
redesign (owner, 2026-11-18; design doc https://claude.ai/artifact/YQ8rHrAopkk4YWDhvCzf4E) replaced waves, lulls,
trainer modes and called efforts; the sections below are updated to match it.

## 1. Levels

- A **level** is a generated map (road, pads, turret, hive, Glider spawns, ground style) plus a **wave plan** with
  a **fixed length**. Every level comes from a seed, and the same seed always gives the same level.
- Structure: **warm-up → sets → done**, as one continuous stream of segments ("waves" in code) that roll into
  each other with no lulls. A set is 2–3 build segments (`segmentS` 120, pressure ramps from `buildPressure` 0.75
  to the set's peak), a peak or a boss peak, then a trough (`troughS` 100, half-rate drones, a clean trough heals
  `troughHeal` 30). Only a fresh run has a quiet start (`firstLullS` 15). There is **no cool-down**: the overworld
  handles cool-downs. Building happens any time; troughs are the natural moment.
- Bosses follow from length: about 0–1 boss at 15 min, 1 at 20–25, 2 at 30–40 and 3 at 60 (seeded variety within
  that band). A boss peak lasts until the boss dies, capped at `bossPeakMaxS` 300; a boss alive at the cap breaks
  through for 30 base damage. A level ends when its last segment is done (it waits up to 45 s for the field).
- Difficulty: a level ramps from wave 1 to a peak (`levelPeakWave` + the level's depth) over its length, so a long
  level is longer rather than deeper; later campaign levels have more depth. (Phase 6 tuning; phase 7 retunes income.)
- **Chaining:** the clear screen offers **Next level**. The next level starts straight away, and its warm-up wave
  is the bridge between the two levels. Scrap resets and the base is rebuilt. **Finish** returns to the overworld.
- Clear grade: 1–3 **stars** from the base HP lost over the whole level, clear heals not counted (owner,
  2026-11-09): clear / at most 50 % lost / flawless, no base damage (`starTwoHp`, `starThreeHp`; owner, 2026-11-19:
  3★ was at most 15 % lost). A fall fails the level, with
  no stars.

## 2. Workout fit

- Length is a property of the level. Campaign levels run **15–40 min**, mostly short enough to chain two of them.
- **Intensity** (Easy / Steady / Hard) is picked at launch. It scales every tier's rated power and enemy HP
  together. All factors are `towerdefense.*` tunables.
- The rider sets the effort: the shifters pick tier I–V (0.45–1.05 FTP at 85 rpm on Steady), the trainer stays in
  resistance mode and the game is the gearbox. The flow suggests a tier (warm-up I, trough II, build III, peak
  and boss IV, boss openings V). Any weapon can be mounted at any tier (Y / B / Z, 3 s swap); sprinting is
  Overdrive. There are no called efforts.

## 3. Selector and modes

The selector is an in-game screen that replaces the Garage front page. It uses the existing `inMenu()` menu input
(controller and touch), so the shell and contracts don't change.

- **Campaign:** fixed seeded levels, about 5 per ground style (6 styles), each unlocking the next.
  Lengths are mixed between 15 and 40 min.
- **Quick Ride:** a random seed at a chosen length (15 / 20 / 30 / 40) and intensity.
- **Endless:** today's sets forever on a generated map, with its own best-wave record.
  As built: every Endless run plays the next map of its own seed series (`endlessMap(save.endlessSeed)`, grounds
  the campaign has reached). The painted level 0 stays for tests and dev pages (`simOpts.level`). Quick Ride and
  Endless maps are built in the background (`render/levelPool.ts`), and their cards preview them once built.

## 4. Economy

- Scrap is per level and resets when a level starts. Starting scrap and income scale with level length and pad
  count, tuned so a full-length level lets you max roughly half the pads.
- Tower Lv 1–5 costs stay as they are today (`LEVEL_COST = [1.4, 2.4, 4, 7]` × base). Balance comes from tuning
  income, not from changing costs.
- As built (phase 7): a level's difficulty climbs faster than Endless, so each wave also pays the scrap of the
  Endless waves it skips. Building is manual (owner, 2026-11-08): no Auto-crew and no one-tap work orders; the
  lull between waves is when the rider decides, and they can buy as much as scrap allows. Sweeps use a headless
  build bot (`botBuild`, on with autopilot) as a stand-in rider: Steady z2 clears 28 of 30 campaign levels; the
  deepest ground (Blight II, Blight V) needs more than zone 2.

- Balance (2026-11-09, superseded by the 2026-11-19 sweep below): below its rated demand a Fireball or Railgun turret climbs from `weaponPowerMin` (20 %)
  at `weaponPowerFloor` (75 % of the target) to full output at the target, and fades to zero below the floor, so
  a short ride leaks instead of collapsing in wave 3. Sweeps of all 30 levels with the build bot and the action
  bot (it fires the Railgun; without it deep Railgun waves looked like a wall), riders at a share of each target:

  | Rider | Easy | Steady | Hard |
  |---|---|---|---|
  | on target | 30 × 3★ | 30 × 3★ | 30 × 3★ |
  | 90 % | | 23 × 3★, 7 × 2★ | 23 × 3★, 7 × 2★ |
  | 80 % | 19 × 3★, 11 × 2★ | 15 × 3★, 15 × 2★ | mostly 2★, 2 × 1★ |
  | 70 % | mixed, 6 falls | mostly 2★/1★, 5 falls | mostly 2★/1★, 7 falls |
  | zone 2 (0.65 FTP) | 30 × 3★ | 11 × 3★, 18 × 2★, 1 × 1★ | mixed, 8 falls |

- Balance (continuous combat, 2026-11-19): riders at a share of the suggested tier's power (`follow-power`),
  build bot and weapon bot, campaign levels I-1, I-3, I-5 and III-3 (15/25/40/25 min), seeds 1–2. One boss break-
  through costs 30 HP. 3★ means a flawless clear (no base damage). Details in [BALANCE.md](BALANCE.md).

  | Rider | Easy | Steady | Hard |
  |---|---|---|---|
  | 100 % and 115 % | all 3★ | all 3★ | all 3★ |
  | 85 % | 6 × 3★, 2 × 2★ | 5 × 3★, 3 × 2★ | 4 × 3★, 4 × 2★ |
  | 70 % | 2 × 3★, 4 × 2★, 2 × 1★ | 6 × 2★, 2 falls | 6 × 2★, 2 falls |

## 5. Meta: unlocks replace the Garage

- The permanent stat upgrades go: `sim/meta.ts` UPGRADES, parts, autoInvest and Forward Base.
- **Unlocks are earned with stars:** the Mortar, the Lv 4 and Lv 5 tiers, Hard intensity, and later ground styles. Unlocks gate options. They never add stat creep.
- Save v4: unlocks, campaign progress (stars per level) and the Endless best. Old best-wave stats are dropped
  (owner OK). Profiles with Garage progress are grandfathered into the starter unlock tier.
- As built: Mortar 4★, Lv 4 8★, Hard 20★, Lv 5 30★; grandfathered riders get 12★ of unlocks. (Overcharge and
  Slow field were dropped with the continuous-combat redesign: sprint Overdrive is the effort trigger and the
  Mortar's concussion is the slow.)
  Tower kinds are not gated: each counters one brood colour, so a locked kind would make some waves unwinnable.
  Quick Ride offers the grounds the campaign has reached.

## 6. Achievements

- Retire the wave-depth and run-shape ones (8/15/22 waves, Spotless counts, Full Workshop and others that assume
  endless depth).
- New achievements:
  - clear N levels
  - clear a level in every style
  - beat each colour's boss
  - 3-star a level
  - clear a 40-min level, and clear one on Hard
  - chain two levels in one ride
  - one Endless depth goal
- Keep the lifetime tallies: kills, scrap, hours, Tyrants, calls.
- As built: six successors take the six freed rewards one for one (every achievement grants one item): Holding the
  Line (5 levels), Fortress (15), Unbreakable (30), Clean Sweep (3★ on 10 levels), Hard Line, Double Shift.
  The remaining goals followed with recoloured jerseys and paints (no new art): Brood Hunter (a Tyrant of every
  brood colour, Tyrant Hide paint), Cartographer (a clear on all 8 road styles, Road Map jersey), Full Shift (clear
  a 40-minute level, Hi-Vis jersey), Night Watch (20 Endless waves, Night Watch paint). The save keeps
  `bossColors` and `roadsCleared` so the first two count across rides. "Every style" counts road styles, since a
  Quick Ride reaches every road style early while every ground needs most of the campaign (Unbreakable covers that).
- **Revocation:** reworked or retired achievements are revoked along with their rewards. Bump
  `RULES_VERSION` (`src/progression/levels.ts`) and list the ids in `src/progression/rebalance.ts`.
  `rebalanceProfile` must subtract the bonus XP of ids that no longer exist, using a frozen table of their old
  bonusXp, because today it looks bonuses up in the current list. Cosmetic picks above the new level are then
  forgotten by the existing mechanism.

## 7. Phases (one PR each)

1. Land the stack (#246).
2. Level data seam: `TdLevel` threaded through the sim and renderer, with today's map as level 0 and behaviour
   unchanged.
3. Narrow road (8 units, lane spread ±1.5), boss radius ≈4, turret deck radius 8.
4. Seeded generator: zigzag, trident, ring+bridge and lasso roads; pad search (from `scripts/td-map-lab`);
   validators; a headless balance gate.
5. Production ground renderer and kit import (WebP, manifest, cleanup per the handoff §6).
6. Level/workout structure (§1–2) and selector (§3).
7. Economy, unlocks, save v4, achievements and revocation (§4–6), with balance sweeps.

Each phase is verified with tsc, vitest, the layout smoke, balance sweeps, and portrait and landscape screenshots
(screenshots stay outside `main`).
