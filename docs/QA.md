# QA

Balance thresholds live in each game's `scenarios.ts`. `npm run sim:all` runs them.

`src/core/qa.sanity.test.ts` runs every finished arcade game against every built-in script for 2 sim-minutes and deep-scans snapshots, the summary, stats and mixer commands for NaN/Infinity.

## HUD overlap check (every game, every release)
With the HUD visible at 1180x820 and 820x1180 (and Fake bike on), confirm nothing important (play focus, wheel/ship/player, panels, tickers, toasts, last list rows, canvas buttons) sits under the bottom HUD band. Backgrounds should still reach the screen edge.
