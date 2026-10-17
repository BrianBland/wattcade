# Dynamo Defense balance pass — 2026-10-17

The selected tower multiplier is **0.85**. Fresh-save passive endurance remains near the inherited baseline: median **33.8 minutes**, mean **38.2**, with **40.9–55.1%** effective turret damage across eight seeds. Responsive riding with combat actions reaches a **53.9-minute median**. Set cadence, enemy HP growth, and the one-order-per-lull rule are unchanged.

## What changed

- Wave/brood planning and continuous-swarm intervals now use separate seeded random streams. Previously ignition draw counts changed future broods and spawn packs when damage or rider actions changed; same-seed tuning comparisons were confounded. Combat offsets/ignition remain random, so survival is still not strictly monotonic in damage.
- New construction orders can fund multiple levels, like existing upgrade orders. The quote shows final level and total cost; acceptance buys precisely those levels once. Direct workshop builds remain level 1. Ranking a new pad uses its basic coverage price so a funded bundle does not delay filling the field.
- The resistance filter uses the same leak-danger weights as scoring (blue 1, red 5, purple 8). A large drone count can no longer discard a Flamethrower needed against dangerous off-colour reds. Six of eight final passive layouts include Flamethrowers; anti-air coverage remains preferred against dominant Gliders.
- The global tower damage multiplier changes from 1.1 to 0.85 to offset the stronger funded field. Easy waves and their incoming lulls remain at recovery throughout; their displayed setting matches the trainer. Only the following work lull ramps up.

## Method

`node --import tsx scripts/td-balance.ts --riders=z2,responsive,actions,recovery --json`

The harness uses the real session, fixed 30 Hz simulation, Auto-crew, 200 W FTP and 75 kg profile, seeds 1–8 and a fresh save per run. It stops at the first fall (maximum 90 min), before any automatic restart or investment of garage parts. The first 45-second lull is included. Effective damage excludes overkill and respects boss phase gates; shares include EMP in the denominator. `fallingWave` includes a fall during an incoming lull. Wave leak diagnostics include spillover until the next spawn interval starts.

- `z2`: steady 0.65 FTP, no combat actions.
- `responsive`: answers cadence calls and boss exposure hooks; otherwise 0.65 FTP, no combat actions.
- `actions`: responsive riding plus the existing sparse Rail/Overcharge/Slow bot.
- `recovery`: the same actions with 0.5 FTP through all lulls and easy waves. This measures recovery at its actual effort.

These are deterministic synthetic riders, not a fatigue model or hardware validation. Complete reported numbers are in [balance-2026-10-17.csv](balance-2026-10-17.csv); omit `--json` for one summary row per run. `--seeds=1,2,5,8 --riders=z2 --multipliers=0.75,0.85,0.95` reproduces the scalar comparison. Without `--multipliers`, the harness uses the current default.

## Results

| Rider | First fall min–max (min) | Median | Mean | Calls won | Bosses killed |
| --- | ---: | ---: | ---: | ---: | ---: |
| Passive Z2 | 31.4–55.6 | 33.8 | 38.2 | 37.5–85.7% | 2–4 |
| Responsive | 31.6–55.4 | 33.8 | 38.1 | 100% | 2–4 |
| Responsive + actions | 38.8–58.6 | 53.9 | 50.8 | 100% | 3–4 |
| Actions + easy recovery | 38.9–55.4 | 53.0 | 49.9 | 100% | 3–4 |

| Seed | Z2 min | Responsive min | Actions min | Easy recovery min | Z2 turret share |
| --- | ---: | ---: | ---: | ---: | ---: |
| 1 | 31.4 | 31.6 | 55.3 | 55.4 | 53.0% |
| 2 | 55.6 | 55.4 | 55.0 | 55.0 | 49.5% |
| 3 | 34.4 | 34.3 | 52.9 | 53.0 | 40.9% |
| 4 | 33.2 | 33.3 | 43.7 | 43.8 | 55.1% |
| 5 | 39.7 | 39.5 | 38.8 | 38.9 | 53.4% |
| 6 | 46.2 | 46.0 | 46.6 | 46.5 | 51.4% |
| 7 | 33.1 | 33.0 | 55.3 | 53.0 | 50.1% |
| 8 | 32.0 | 32.0 | 58.6 | 53.8 | 40.9% |

All 32 runs build every pad. Passive runs buy 18–31 upgrade levels and kill 2–4 bosses; no boss escapes were observed. Easy intervals remain 120 seconds when cleared promptly and can extend to 150 seconds while enemies remain. At deeper waves, spillover and swarm pressure can still end a run during recovery; the 0.5 FTP rider has nearly the same survival distribution as the full-power action rider.

## Choice and limits

With the final construction rules, the four-seed passive scalar sweep produced:

| Multiplier | Survival median (min) | Turret share range |
| --- | ---: | ---: |
| 0.75 | 35.9 | 44.7–56.7% |
| 0.85 | 35.8 | 40.9–53.4% |
| 0.95 | 35.8 | 37.7–50.3% |

0.85 keeps the passive turret share in the intended 40–60% band across the final eight seeds. 0.95 adds little endurance and makes seed 8 tower-heavy; 0.75 buys little pacing improvement. Seed 2 remains a 55.6-minute passive outlier, so 30–40 minutes is an aggregate anchor, not a forced cutoff. Deep active runs can be tower-heavy (seed 8: 31.4% turret share with actions), outside the passive target band on that deep run.

Answering calls alone improves call success to 100% but produces almost no aggregate survival increase in this sweep. Combat actions provide the clear endurance benefit (~20 additional median minutes), and are still optional. Tuning stronger call rewards is a separate product decision.

The inherited #163 baseline (commit `d2a7a92`, multiplier 1.1, same first-run harness) had passive median 33.9 minutes (28.8–47.3), responsive median 46.0 and responsive+actions median 54.8. Those comparisons used shared combat/planning RNG, so same-seed changes could reroll the future encounter mix; the final isolated planner makes subsequent comparisons more useful.

## Verification

- Regression: large damage/ignition changes keep the brood and forecast-pack sequence identical.
- Construction: funded levels and exact total, stale level quote, duplicate acceptance, low-bank coverage, dangerous red push versus genuine blue/air dominance.
- Trainer: all three modes stay at recovery through the easy lull and wave start, then the next work lull ramps normally.
- Scenario durations, assertions and damage-share target bands are unchanged. Boss-input fixtures use a Rail-first seed under the isolated planner; the sprint-damage fixture isolates firing reach to keep testing the same damage bonus.
