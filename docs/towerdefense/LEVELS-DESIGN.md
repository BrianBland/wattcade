# Dynamo Defense: levels design

Agreed with the owner on 2026-11-07. Builds on `LEVELS-HANDOFF.md` (branch `td-ground-spike`), which keeps the
exploration results, map metrics and ground-kit notes. Where the two differ, this file wins.

## 1. Levels

- A **level** is a generated map (road, pads, turret, hive, Glider spawns, ground style) plus a **wave plan** with
  a **fixed length**. Every level comes from a seed, and the same seed always gives the same level.
- Structure: **warm-up wave → sets → done.** The warm-up is an easy wave at recovery settings. A set is 2–3 work
  waves followed by a boss of one brood colour, and an easy recovery wave sits between sets. There is **no
  cool-down wave**: the overworld handles cool-downs.
- Bosses follow from length: about 0–1 boss at 15 min, 1 at 20–25, 2 at 30–40 and 3 at 60 (seeded variety within
  that band). A level ends when its last wave or last boss is cleared.
- Difficulty: a level ramps from wave 1 to a peak (`levelPeakWave` + the level's depth) over its length, so a long
  level is longer rather than deeper; later campaign levels have more depth. (Phase 6 tuning; phase 7 retunes income.)
- **Chaining:** the clear screen offers **Next level**. The next level starts straight away, and its warm-up wave
  is the bridge between the two levels. Scrap resets and the base is rebuilt. **Finish** returns to the overworld.
- Clear grade: 1–3 **stars** from base HP left (clear / ≥ 50% / ≥ 90%, tunable). A fall fails the level, with
  no stars.

## 2. Workout fit

- Length is a property of the level. Campaign levels run **15–40 min**, mostly short enough to chain two of them.
- **Intensity** (Easy / Steady / Hard) is picked at launch. It scales the work-wave trainer targets (sim grade,
  resistance level, ERG % FTP) and enemy HP together. Recovery and warm-up waves stay at recovery settings. All
  factors are `towerdefense.*` tunables.
- Per-wave trainer mapping is unchanged: Gatling = sim grade, Fireball = resistance level, Rail = ERG, plus called
  efforts.

## 3. Selector and modes

The selector is an in-game screen that replaces the Garage front page. It uses the existing `inMenu()` menu input
(controller and touch), so the shell and contracts don't change.

- **Campaign:** fixed seeded levels, about 5 per ground style (6 styles), each unlocking the next.
  Lengths are mixed between 15 and 40 min.
- **Quick Ride:** a random seed at a chosen length (15 / 20 / 30 / 40) and intensity.
- **Endless:** today's sets forever on a generated map, with its own best-wave record.

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

## 5. Meta: unlocks replace the Garage

- The permanent stat upgrades go: `sim/meta.ts` UPGRADES, parts, autoInvest and Forward Base.
- **Unlocks are earned with stars:** tower kinds, the Lv 4 and Lv 5 tiers, Overcharge and Slow field, Hard
  intensity, and later ground styles. Unlocks gate options. They never add stat creep.
- Save v4: unlocks, campaign progress (stars per level) and the Endless best. Old best-wave stats are dropped
  (owner OK). Profiles with Garage progress are grandfathered into the starter unlock tier.
- As built: slow field 4★, Overcharge 8★, Lv 4 12★, Hard 20★, Lv 5 30★; grandfathered riders get 12★ of unlocks.
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
  Every-style, per-colour boss, 40-minute and Endless goals wait for new reward items.
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
