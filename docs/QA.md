# QA and balance report (Agent Q)

All runs headless via `runHeadless` with `autopilot: true`, FTP 200 test profile, seeds 1-5.
Scenario thresholds are in each game's `scenarios.ts`; `npm run sim:all` uses seeds 1-13 as listed there.

| Game | Script (min) | Seeds 1-5 key numbers | Verdict |
|---|---|---|---|
| dungeon | sprints (20) | boss beaten all 5; 6 rooms; deaths 1-3; ends 7.8-7.9 min | ok |
| dungeon | z2 (20) | boss beaten all 5; deaths 1-3; ends 9.4-10.1 min | ok |
| dungeon | idle (5) | 0 rooms cleared; deaths 0-15 (see note) | ok |
| lighthouse | z2 (30) | docked 28-34, lost 2-6, minutesInZone 29.05, built 7-8, stormsWeathered 0, stormsFailed 2-3 | ok (storm failure expected) |
| lighthouse | storm-ready (30) | docked 27-31, lost 3-8, stormsWeathered 2-3, stormsFailed 0 on every seed | ok, comfortable margin |
| lighthouse | mash (20) | docked 0-2, lost 21-23, minutesInZone 2.9-3.7, stormsWeathered 1-2 | ok |
| lighthouse | idle (10) | docked 0, lost 10-11, stormsFailed 1 | ok |
| towerdefense | sprints (20) | wavesSurvived 9,10,9,9,9 (threshold 8), base dies at 7.9-8.7 min | ok (was 8-9, marginal) |
| towerdefense | intervals (20) | wavesSurvived 13,16,12,13,13; each weapon >= 60 s | ok |
| towerdefense | idle (5) | wavesSurvived 2 on every seed, base dead at 2.2-2.4 min | ok |

Notes on implausible-looking results:
- dungeon idle deaths: the autopilot ignores power and walks into room 1, where it dies and respawns repeatedly. A real idle rider does not move. Harmless, no change. Seed 5 has 0 deaths (autopilot kited without taking damage).
- lighthouse mash docks almost nothing and loses ~22 ships: intended (random power never holds Z2).
- lighthouse storm-ready weathers 2 storms in 30 min on 3 of 5 seeds and 3 on the others; never fails one.

## Sanity pass
`src/core/qa.sanity.test.ts`: every game x every built-in script (7 scripts) for 2 sim-minutes, snapshots sampled every 3 sim-s plus final snapshot, summary, stats and mixer commands deep-scanned for NaN/Infinity. 21 cases, no findings; no sim fixes needed.

## Changes
- `src/games/towerdefense/sim/sim.ts`: `earlyClearHeal` default 10 -> 14. Sprints waves on seeds 2 and 3 were exactly 8 (threshold 8). Raising baseHp instead pushed idle to 3 waves (breaks the idle assert); healing only applies to cleared waves, so it lifts sprints/intervals margin while idle stays at 2.
- `src/games/lighthouse/render/renderer.ts`: camera now 50 deg fov, 4:3 default aspect, positioned at (-6, 32, 78) looking at (-6, 8, 14). Ship lanes moved to the open sea in front of the shore (x -28..12, z 28..36) so ships no longer sail into the cliff. Projected check at 4:3: lamp top at NDC y 0.56, town at x 0.16-0.48, ships left and lower across the sea. Removed the forced `position: relative` on the container (shell `.mount` is absolutely positioned; HUD is absolute inside it). Not verified in a real browser.
- Added `src/core/qa.sanity.test.ts` and this file.

## HUD overlap check (every game, every release)
With the HUD visible at 1180x820 and 820x1180 (and Fake bike on), confirm nothing important (play focus, wheel/ship/player, panels, tickers, toasts, last list rows, canvas buttons) sits under the bottom HUD band. Backgrounds should still reach the screen edge.
