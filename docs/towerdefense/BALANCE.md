# Dynamo Defense balance pass — 2026-11-19 (continuous combat)

This pass checks the continuous-combat redesign: tiers I–V on a game-owned gearbox, manual weapons, a continuous
stream with peaks and troughs, and bosses as 2–3 minute peaks that break through if they outlast `bossPeakMaxS`.
No tunables changed in this pass; the numbers below are the phase 1–4 defaults. The previous report (2026-10-17,
wave model, calls and combat actions) is in git history with [balance-2026-10-17.csv](balance-2026-10-17.csv).

## Method

`npx tsx scripts/td-balance.ts` (fixed 30 Hz session, 200 W FTP test profile, fresh save with every unlock,
headless build bot and weapon bot). Riders:

- `onNN`: `follow-power` at NN % of the suggested tier's rated power. It shifts with the suggestion (warm-up I,
  trough II, build III, peak and boss IV, openings V).
- `z2`: steady 0.65 FTP; the game still shifts tiers, so most of the time it rides under the rating.

The bots play weapon choice and building better than a person will, so the curve is an upper bound on what a
rider at that strength gets. These are synthetic riders, not a fatigue model or hardware validation.

## Campaign: stars by rider strength

`--campaign=0,2,4,12 --seeds=1,2`: Outpost I, III, V (15, 25, 40 min) and Badlands III (25 min, deeper).
Two runs per cell; `e` marks a boss break-through (30 HP, which alone costs the third star).

| Rider | Intensity | Outpost I | Outpost III | Outpost V | Badlands III |
| --- | --- | --- | --- | --- | --- |
| 70 % | Easy | 3 / 3 | 2e / 3 | 2 / 2e | 1e / 1e |
| 70 % | Steady | 3 / 2e | 2e / 2e | 2 / 2e | fell / fell |
| 70 % | Hard | 2 / 2e | 2e / 2e | 2 / 2e | fell / fell |
| 85 % | Easy | 3 / 3 | 3 / 3 | 3 / 2e | 3 / 3 |
| 85 % | Steady | 3 / 3 | 3 / 3 | 3 / 2e | 2e / 2e |
| 85 % | Hard | 3 / 3 | 2e / 3 | 3 / 2e | 2e / 2e |
| 100 % | all | 3 / 3 | 3 / 3 | 3 / 3 | 3 / 3 |
| 115 % | all | 3 / 3 | 3 / 3 | 3 / 3 | 3 / 3 |

Targets, which this meets: following the call earns 3★ everywhere; 85 % keeps 3★ on early levels and starts losing
bosses on long and deep ones; 70 % mostly earns 2★ and falls on deeper levels unless the rider picks Easy.
Intensity scales the asked power and alien HP together, so each rider's share of the call matters more than the
intensity label. 100 % never lost HP even on Hard; real riders' weapon and build choices will leave more room.

## Endless: first fall

`--riders=z2,on85,on100 --seeds=1,2,3,4 --minutes=150` on the painted level 0, Steady.

| Rider | First fall (min) | Median | Bosses killed / escaped | Turret share |
| --- | --- | ---: | --- | --- |
| z2 | 40.5, 43.1, 52.6, 59.1 | 47.9 | 6 / 5 | 0.42–0.58 |
| 85 % | 51.9, 52.1, 62.1, 65.2 | 57.1 | 8 / 10 | 0.47–0.50 |
| 100 % | 50.6, 60.1, 61.4, 75.4 | 60.7 | 12 / 7 | 0.46–0.56 |

The turret does 42–58 % of the damage in every run, inside the 40–60 % band from the previous pass: the rider's
weapon matters and towers stay worth building. Zone-2 Endless survives longer than the old 30–40 min anchor
(median 48), since troughs heal and bosses no longer end a run on their own. `endlessRamp` (0.7 difficulty waves
per segment) is the lever if Endless should bite sooner.

## Limits

- Two seeds per campaign cell and four per Endless rider; spreads between seeds are large (Endless z2 40–59 min).
- Boss break-throughs dominate star loss below 100 %; tuning `bossHpMult` or `bossPeakMaxS` moves the 85 % row most.
- Ride feel on a real KICKR (gearbox learning, shift latency, sprint detection) is not covered here.
