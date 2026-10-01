# Dynamo Defense (towerdefense) — Agent H

CONTRACT-REQUESTs: none.

## API
- `index.ts` exports `module: GameModule` (tags sprint+intervals). `createSim(ctx, opts)` reads `opts.autopilot` (cast).
- `sim/sim.ts`: `createTdSim(ctx, opts)`; snapshot is `TdSnapshot` (enemies with polar angle/r + x,y on a 100x100 field,
  weapon, swapLeft, aimAngle, railCharges, tracers, beams, kills...). Pure logic; only `ctx.rng` / fixed dt.
- `render/renderer.ts`: Canvas 2D `TdRenderer` (loaded via dynamic import). Untested visually, typecheck only.
- `scenarios.ts`: sprints (>=8 waves), idle (isOver, <=2 waves), intervals (each weapon >=60 s, sim+erg+resistance cmds).
- Summary keys: wavesSurvived, kills_{blue,red,purple,gold}, weaponSeconds_{gatling,flame,rail}, railChargesFired, baseHpLeft.

## Design notes
- Weapon effect id `weapon` is re-set on swap start: Gatling sim +1% grade, Flame resistance 35%, Rail erg 0.95 FTP.
- Rail has no passive damage: only stored charges (charge while ftpFraction >= 0.75, any weapon). Z fires from any weapon
  (tap = 1 charge on release; hold 0.5 s = dump all, event `railFired{charges}`).
- Waves end at waveMin (25 s) if heavies dead (heals 10 base HP), else forced at waveMax (60 s); wavesSurvived counts ended waves.
- Autopilot: picks weapon by proximity-weighted threat per element (2.5 s dwell), auto-aim, dumps rail at 3 charges
  and single-fires at armored targets when Rail selected.
- All numbers are `ctx.tuning` tunables (gatlingRevsPerShot, railChargeS, railMaxCharges, flameLevelPct, ...).
- Saves `{ bestWave }` via ctx.save at game over / dispose.

## Tests
`npx vitest run src/games/towerdefense` (scenarios via runHeadless; rail tests via createGameSession).

## Gaps
Renderer unverified in browser; no sound.
aimMode 'axes': aim = atan2(L, R) when paddles active.
