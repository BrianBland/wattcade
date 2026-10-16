# Dynamo Defense (towerdefense)

CONTRACT-REQUESTs: none.

## Layout
- `sim/defs.ts` (pure): enemy kinds, towers + level tables, 3 curved Bézier lanes (`laneAt` arc-length lookup), 6 build pads, base geometry. Aim angle 0 = up from the base.
- `sim/waves.ts` (pure, rng passed in): `planWave` heavies per wave, lane bias (main lane, second front from wave 8), dart packs, boss every 5; per-lane colour counts feed the next-wave forecast.
- `sim/meta.ts`: Garage upgrades (cost = base x growth^level), `metaMods`, `autoInvest`, `partsForWave`.
- `sim/sim.ts`: `createTdSim(ctx, { autopilot?, skipGarage? })`, `sim/save.ts` owns `readSave` (legacy/v2 → game-local v3). `sim/types.ts`: `TdSnapshot` view-model.
- `render/`: `layout.ts` (pure; wide = side panels, narrow = top bar; tested vs insets), `renderer.ts` (cached background, particles, fx, shake/flash, cues -> `audio/sfx`, ambient flame/hum, taps), `sprites.ts` (procedural enemies, towers, dynamo base + turret), `panels.ts` (weapons/rail/dynamo, wave/base/surge/forecast/legend, workshop, garage, banners).

## Rules (all numbers are `towerdefense.*` tunables)
- Weapons per spec: Gatling = sim +1% (bullets per crank rev), Flamer = resistance 35% (dps per watt), Rail = ERG 0.95 FTP (charges at >= 0.75 FTP from any weapon, max 3; Z tap = 1, hold 0.5 s = all) plus a weak targeting laser while selected.
- Enemies: mini/dart (blue), brute/charger (red, chargers sprint the last half), bastion/carrier (purple, carriers drop minis), prism (cycles colour every 4 s from wave 12), Goliath boss (gold, shield cycles; escorts at 66/33% HP). Right colour x1.5, wrong x0.25.
- Dynamo: towers fire at `ftpFraction / towerNominalFtp` speed (0.65 FTP = 100%, cap 160%, 0 under 15 rpm). Sprinting = Overdrive (x1.5 damage + tower speed).
- Towers: Tesla (chain, blue), Mortar (splash shells, red), Prism Lens (beam at the toughest, purple); Lv 1-5. Scrap from kills/waves buys, upgrades, sells (50%) and repairs the base.
- Power Surge every 3 waves from wave 3: 15 s at `min(5, powerZone)` >= 4 within 45 s fires an EMP (kills small fry, damages heavies), +scrap, +1 rail charge. Short effort, so judged on power (SPEC short-effort rule); `targetZone.source: 'power'` (also on the Rail band). `hooks.storm`/`hooks.surge` set while active.
- Spin-up (cadence drill) every 3 waves from wave 4: 15 s at >= 95 rpm (`cadence3s`) within 40 s -> Gatling Overclock (double fire rate) for 30 s + scrap. Sets `GameHud.targetCadence`. Fake scripts never reach 95 rpm, so tests drive it with manual cadence.
- Endless roguelite runs (#121): base HP 70; falling or Pause → Return to Garage banks all parts, clears combat, emits `runEnded{reason: fell|bail}` and returns to Garage; `isOver()` stays false. All core tunables/options/pips removed.
- Waves end early (heal) when heavies are dead after `waveMinS`, else at `waveMaxS` (60 s).

## Controls (bike-first)
- A/B/Y weapons, Z rail, paddles aim (auto-aim after 1.5 s idle, prefers the priority lane), D-pad left/right = priority lane, up = all lanes, down = workshop.
- Workshop: left/right = pad (6 pads + base repair), up/down = option (preset to the tower the lane's next push needs), A = build/upgrade, B = close (auto-closes after 10 s). Taps: pads, base, rows, weapon cards, rail pips.
- Garage (skipped initially for new riders/autopilot; always shown after fall/bail): up/down + A buys, left/right sets start wave, B starts; auto-starts after `garageAutostartS` (30 s) above `garageCadenceRpm` (30 rpm); `garageBreatherS` (6 s) delays auto-start after a return. Manual start still works during the breather. Garage trainer effect = neutral sim grade.

## Progression / save
- Game-owned `{ v: 3, bestWave, bank, upgrades, runs, autoInvest, totals }`; totals add runsFallen/runsBailed; v2 core fields dropped without losing progress. Registers GameModule.save; shared pure reader validates types/bounds/upgrades, explicitly migrates v1→v2→v3, and blocks newer/invalid saves intact. All arcade games own independent readers; no global save bump. Parts bank/persist on wave clears and boss kills, at fall/bail and on dispose; no duplicate credit.
- Reset all run-only combat state on restart; retain ride totals. Summary: runs/runsFallen/runsBailed/partsEarned/wavesCleared across the ride, wavesSurvived and bestRunSurges = best single run (achievements cannot combine runs). Z2 autopilot seed 1 falls at wave 51 around 40 min and starts again.

## Testing
`npx vitest run src/games/towerdefense`: scenarios (sprints, idle-falls, endless-restart, intervals, z2-economy, surge-ready), v2→v3 migration, fall/bail banking, duplicate bail/dispose, fresh restart, breather/auto-start, other-game preservation, spin-up/surge targets, geometry, waves, garage purchase via TimelineInput, workshop flow, power-gated towers, rail cap/dump, layout vs insets.

## Known gaps
Renderer checked with throwaway Playwright screenshots (landscape/portrait/phone), not yet on a real iPad; sounds untested by ear. Manual (non-autopilot) play not balance-tested.
