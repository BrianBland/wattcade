# starfighter ("Crank Fighter", Agent I)
CONTRACT-REQUEST: none.

Two-button vertical shooter. Shifters are guns, so `useVirtualGears(false)`; `hud().gears=false`.
- Left gun = shiftUpL/shiftDnL/D-pad; right gun = shiftUpR/shiftDnR/A/B/Y/Z. Hold = auto-fire, tap = one shot.
  Each gun auto-aims the lowest enemy in its half of the screen (crossers switch halves).
- Cadence -> fire rate: shared shot-credit pool from crank revs (`revsPerShot`), banked up to `maxCredits`.
- Power -> `thrust` (enemy/hazard speed + score mult) and shield regen (`shieldRegenPerFtp`). `bike.sprinting` -> overdrive twin beam.
- Paddles optional: if `paddleIdleS < 0.6` they steer (R-L); otherwise auto-steer dodges rocks and boss bolts.
- Structure: cruise (`cruiseS` 150 s, zone 2) -> attack run (`attackS` 70 s dense waves, zone 4, `attack` climb effect +3.5 %) -> boss
  (HP scales per run) -> cruise. Base effect `base` = 0.5 % grade. Time limit `timeLimitS` 1200 s; dies at 0 HP.
- Combo (x1..x5, resets on hit/4 s idle), score, shield then hull HP. Everything numeric is a tunable (`starfighter.*`).
- `hud().targetZone`: cruise {2,2}, attack/boss {4,4}.

Files: index.ts, sim/sim.ts (pure), render/renderer.ts (Canvas, HUD at top, ship uses profile.color), scenarios.ts, test/sim.test.ts.
Scenarios (autopilot): sprints 15 min (survives, 3 bosses), idle 5 min (dies ~65 s), intervals 20 min (grade 4.0 in runs).
Test: `npx vitest run src/games/starfighter`. Not yet in registry.ts (orchestrator). `npm run sim` needs registration.
Gaps: no sfx; renderer untested in a browser; autopilot ignores dodging-vs-shooting trade-offs.
