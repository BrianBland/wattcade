# Dynamo Defense: handoff for the procedural-levels pivot

Written 2026-11-07 at the end of a long design/exploration thread. Everything below is either **decided by the
owner**, **built and pushed** (with the branch named), or **open** (explicitly marked). Read `CLAUDE.md` and
`docs/SPEC.md` first; this file assumes them.

## 1. The pivot in one paragraph

Dynamo Defense (`src/games/towerdefense`) is a single fixed map today: one painted serpentine road, endless waves in
"sets" (3 work waves → boss → easy recovery wave), a Garage of permanent meta upgrades, achievements tuned to endless
depth. The owner wants **many procedurally generated levels** instead: generated road + pads per level, ground
composited from painted **material kits** in several visual styles, and levels that fit a workout. That raises:
waves per level, per-level pacing (zero, one or several bosses), a level and/or workout-mode selector
(X-minute / intensity), rescaled tower upgrades, reworked achievements, and whether the meta upgrades survive or become
unlocks. The fixed painting (`public/td/environment/road/portrait.webp`) may be discarded.

## 2. Branches (all pushed, none merged, no PRs open)

A stack, each on top of the previous:

| Branch | Contents | Keep? |
|---|---|---|
| `td-recovery-waves-l5-achievements` | Fix: easy/recovery waves rated Fireball/Rail against the full work demand, so riding the recovery target fired nothing (`weaponDemand()` in `sim/sim.ts`). Harder Overbuilt (4 Lv 5 at once) and Full Workshop (every pad Lv 5); sim emits `towerSold`, reports `bestMaxedTowers`. | **Yes**: a real bug fix, valid for any map. |
| `td-pads-order` | 12 pads (layout drawn plates for unpainted ones), `padOrder(turned)` = ◀▶ in on-screen order per orientation; renderer reports orientation with a `padOrder` action. | `padOrder` and the plate drawing generalise; the fixed 12-pad layout will be superseded by per-level pads. |
| `td-colour-bosses` | One boss per brood colour, keeping its weapon/trainer mode all fight: Swarm Tyrant (blue, swarm packs), Ram Tyrant (red, charges), Bulwark Tyrant (purple, shield plates; rail and Exposed/sprint break them). HP-gated phases escalate the trick. Boss waves avoid the last boss's colour. `boss*` tunables. | **Yes**: owner-approved design. |
| `td-ground-spike` | Generated-ground harness `dev/td-ground.{ts,html}`, kit brief + competition docs, kit checks/review script, map lab (`scripts/td-map-lab/`), this file. | Dev/reference; the compositor is the prototype for the real renderer. |
| `td-ground-kits-winners` | The six winning material kits (PNG masters), force-added under `public/td/ground-kits/`. Reference only (owner rule: generated stills never go to `main`; production assets get converted and committed deliberately). | Source art for the production kits. |

Suggested order: get the first three reviewed and merged (they are independent of maps), then build levels on top.
Rebasing the stack onto current `main` is the first chore. Check `git log origin/main` first.

## 3. Owner decisions so far

- **Procedural levels, not one painted map.** Ground comes from material kits composited per level. A painted
  map is no longer required.
- **Road may be narrower:** 11 → 8 units is fine with current enemies if lane spread drops to ±1.5 (from ±2.25), the
  boss shrinks (radius ≈4, from 5.2; size only) and the turret deck shrinks (radius 8, from 11). Owner proposed the
  turret/boss shrink.
- **Road styles worth generating** (from mocks, see §5): trident (dive/climb/descend), ring-in-bridge-out,
  even zigzag, lasso; **bridges are fine** but the final approach to the turret must never run under a deck
  (the late pass rides on top; draw anything under a deck as an x-ray outline).
- **Pads are placed intentionally per layout**, not slotted into gaps; ◀▶ follows on-screen order.
- **One boss per colour** (above). **Readability rule:** large areas of ground never use saturated blue, red or
  purple (brood colours); road clearly lighter than its surroundings.
- Owner preferences: a PR per phase; recommendations rather than surveys; ask before throwaway work; no generated
  stills in `main`.

## 4. Open design questions (decide early, with the owner)

1. **Level structure.** Waves per level, pacing per level (sets? custom curves?), 0/1/several bosses, length.
   Today's pacing: work waves 90–150 s with a 45 s lull, easy wave 120 s, a boss every 4th wave of each set of 5.
2. **Workout fit.** Level length/intensity as a workout: "X-minute" and "intensity" modes. Trainer effort is
   already per wave (Gatling = sim grade, Fireball = resistance level, Rail = ERG % FTP; called efforts; recovery
   waves at recovery settings). Natural mapping: level = a workout (warm-up wave → sets → cool-down), mode picks
   minutes and how hard the work waves are.
3. **Selector UI.** Level and/or mode selection. Today the Garage is an in-game menu (`inMenu()`, controller + touch).
   Other games pick a variant before launch (Squadron ships, Cadenza). Must work on controller (Zwift Ride) and touch.
4. **Economy and upgrades.** Scrap per level (resets each level?), tower costs and Lv 1–5 scaling for maps with
   different pad counts and lengths. Today: `LEVEL_COST = [1.4, 2.4, 4, 7]` × base (Tesla 60, Flamer 80, Lens 100).
5. **Achievements.** Current ones assume endless depth (survive 8/15/22 waves, 30 Hive Tyrants, Spotless counts,
   Full Workshop = every pad Lv 5). Need level-based ones (clear levels, stars/grades, styles, bosses per colour,
   workout minutes). Progression hooks: `src/progression` (awardSession, ACHIEVEMENTS), arcade-curve rules in
   achievements tests.
6. **Meta upgrades vs unlocks.** Today: Garage parts (`sim/meta.ts` UPGRADES: plating, barrels, burner, capacitor,
   capacity, servos, salvage, foundry, stockpile, headstart; parts from waves/bosses, autoInvest). With levels,
   permanent stat creep may fight per-level balance. Options: keep (roguelite power), replace with **unlocks**
   (towers, tower upgrades, abilities, styles, harder modes), or hybrid. Consider `src/cosmetics` (level track
   with picks) for the reward side. **Owner has not decided; bring a recommendation.**
7. **Endless.** Keep an endless mode alongside levels? Saves (v3) and achievements depend on the answer.

## 5. Map exploration results (what the generator should know)

Tooling: `scripts/td-map-lab/` (see its README): coverage scorer, pad search (annealing, graded penalty), arc/spiral
road builder, mock designs, SVG renderer.

Metrics used: Flamer reach share (15-unit Flamer reach covering the road), longest unreachable stretch, Tesla
overlap, Glider-path coverage, pads covering two road passes, how early the road nears the turret, walked length,
self-clearance. Constraints: pad ≥ road half-width + shoulder + pad radius (4.2) + 1 from the road centre, pads
> 12.4 apart, clear of the turret, x ≤ 71 and 14 ≤ y ≤ 97 (HUD-safe in short landscape; field is 80×112, rotated
90° in landscape), walked length ~240–290 (today 257).

| Layout (12 searched pads) | Length | Flamer reach | Gap | Notes |
|---|---|---|---|---|
| Today's road + today's pads | 257 | 51% | 39 | the baseline problem |
| Today's road, searched pads | 257 | 96% | 10 | coverage comes from pad placement |
| Even zigzag (hand-drawn) | 262 | 96% | 10 | 8 two-pass pads, clean ◀▶ rows |
| A1 trident, 8-wide road | 272 | 95% | 14 | road nears turret at 34% of the walk |
| C ring-in, bridge-out (deck exit) | ~324 | 92% | 11 | most dramatic; exit rides the deck |
| D lasso, one bridge | 292 | 93% | 14 | fine, C dominates it |
| Spiral, turret at centre | 315 | 93% | 11 | needs turret moved; affects Gliders/HUD |
| Dive + climbing zigzag + return | 438 | 66% | 76 | too long for the field |

Lessons: let a search place pads, but draw roads deliberately (search-drawn roads came out kinked); keep runs
≥ ~22–26 apart so a pocket pad reaches two passes; long roads need more pads or faster enemies; a spiral wants a
centred turret. Prior art consulted: BTD (Cubism crossings, Ravine bridges, In The Loop corner loops, Logs hiding
units), Defense Grid Kill Zone (spiral in/out), Kingdom Rush (fixed slots), Rogue Tower / Isle of Arrows
(procedural, tile-based).

## 6. Ground rendering (prototype → production)

`dev/td-ground.ts` (`/dev/td-ground.html`): composites ground for any road from a **material kit**, under the real
turret, towers and aliens. Techniques that worked:
- **Road**: copy a straight painted road strip along the road's arc length and offset (mirrored side so the light
  stays even), scaled from the kit's road width to the map's.
- **Texture bombing** (jittered cells copying random windows of a swatch, blended over noisy seams with sharpened
  weights) for ground, gravel halo and hive overlay. Mirror-tiling produced kaleidoscope artefacts; copying the wide
  gravel halo along the road smeared on curves.
- **Keyed stamp sheets** (#00FF00 / #FF00FF, detected by coverage) cut into props/decals/clearing/apron/deck/hive
  mouth by connected components; premultiplied sampling avoids key fringes. Clearings normalised to 10 units and the
  apron to the turret, both with ragged faded edges. Deck strips tile along the bridge.
- Bake once per level and orientation; nothing per frame.

Kit brief and competition: `docs/towerdefense/ground-kit/BRIEF.md` (deliverables, scale 16 px/unit, light, palette
rules, styles), `COMPETITION.md`. Checks: `?check=<kits>` and `node scripts/td-kit-review.mjs <kits> [--blind]`
(needs `npm run dev -- --port 5203`, `CHROMIUM_PATH`).

**Winning kits** (on `td-ground-kits-winners`):

| Style | Kit | Notes / import cleanup |
|---|---|---|
| Outpost Rock | `outpost-codex` | closest to the old painting; drop ochre dust decals that look like empty pads |
| Scrapyard | `scrapyard-grok-b` | dark rutted cinder on rust; a few dark smears near tight curves |
| Badlands | `badlands-grok-c` | readable caliche road; **green key fringe** on clearings/decals: stronger despill on import |
| Volcanic | `volcanic-grok` | basalt, ash road, dim ember cracks, toned-down sulfur |
| Overgrown Ruins | `overgrown-grok-b` | best-looking; path separation fixed |
| Blight | `blight-grok-c` | darker ash, varied bones |

Production work: convert to WebP, move to a real asset path (e.g. `public/td/kits/<style>/`), add a pack/manifest
step like `scripts/td-pack-aliens.ts`, and move the compositor from `dev/` into `src/games/towerdefense/render/`
(DOM-free parts unit-tested). Hive overlay and props scatter were tuned for the spike only.

## 7. Code that assumes one fixed map (what has to become per-level data)

- `sim/road.ts`: `ROAD_WAYPOINTS`, `ROAD`, `ROAD_PADS`, names, `PAINTED_PADS`, `TURRET`, `TURRET_R`, `HIVE_MOUTH`,
  `FLYER_SPAWNS`, `PAINT_BOXES`.
- `sim/defs.ts`: `PADS`, `BASE_PAD`, `roadAt`/`flightAt`/`ROAD_LENGTH`, `padOrder`.
- `sim/sim.ts`: reads all of the above; `PAD_ORDERS`; spawn offsets (lane spread); boss/turret sizes.
- `render/`: `battlefield.ts` (painting), `cables.ts` (grid routing per pad), `layout.ts` (`focus` clearance points
  from ROAD/pads for HUD insets; tests and `scripts/towerdefense-layout-smoke.mjs`), `renderer.ts` (vector ground,
  pads, bridges), `construction.ts`, `machinery.ts` (towers at `PADS[i]`).
- `achievements.ts`: Full Workshop uses `PADS.length`.
- Tests that pin geometry: `test/road.test.ts`, `test/sim.test.ts` (pad order), `test/cables.test.ts`, layout tests.
- Determinism: generation must use `ctx.rng()`/a seed, never `Math.random`. Every bike↔game number is a tunable.

## 8. Suggested phases (PR each)

1. **Land the stack**: rebase/merge the recovery fix, bosses, pad order (owner review).
2. **Level data seam**: a `TdLevel` (road, pads, turret, hive, flyer spawns, style, pacing) threaded through sim and
   renderer; today's map becomes level 0; behaviour identical; tests green.
3. **Narrow road + smaller turret/boss**: lane spread, sizes, art scale, layout smoke.
4. **Generator**: seeded road styles (zigzag, trident, ring+bridge, lasso) + pad search + validators (clearance,
   HUD-safe in both orientations, length band) + headless balance gate (`scripts/td-balance.ts`) to reject outliers.
5. **Ground renderer**: production compositor + kit import (WebP, cleanup), bridges with layered drawing.
6. **Level/workout structure + selector**: per the decisions in §4.
7. **Economy, upgrades, meta/unlocks, achievements**: per §4; balance sweeps.

Verification norms in this repo: `npx tsc --noEmit -p .`, `npx vitest run src/games/towerdefense`, full
`npx vitest run`, layout smoke (`node scripts/towerdefense-layout-smoke.mjs`, `TOWERDEFENSE_BASE`,
`CHROMIUM_PATH`), balance sweep (`npx tsx scripts/td-balance.ts --riders=... --seeds=...`), screenshots of both
orientations, then iPad (Bluefy) by the owner. `scripts/towerdefense-hud-smoke.mjs` already failed on the base
commit (pre-existing).

## 9. Gotchas from this thread

- Never `pkill -f <pattern>` that matches your own command line (it kills the shell); stop dev servers by port.
- Vite fails to resolve deps through a symlinked `node_modules` outside the repo; `npm install` per worktree.
- The git stash is shared across worktrees; prefer WIP commits.
- `public/td/ground-kits/` is git-ignored on purpose (candidate art).
- Agents iterating against automated gates optimise for the gate: two kit gates (road level, clearing size) were
  harness bugs that pushed agents toward worse art until fixed. Check screenshots, not just pass/fail.
- In this environment, files can't be sent to the owner directly; share paths on their machine or push a branch.
