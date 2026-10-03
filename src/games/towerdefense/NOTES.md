# Dynamo Defense (towerdefense)

CONTRACT-REQUESTs: none.

## Layout
- `sim/defs.ts` (pure): enemy kinds, towers + level tables, 3 curved Bézier lanes (`laneAt` arc-length lookup), 6 build pads, base geometry. Aim angle 0 = up from the base.
- `sim/waves.ts` (pure, rng passed in): `planWave` heavies per wave, lane bias (main lane, second front from wave 8), dart packs, boss every 5; per-lane colour counts feed the next-wave forecast.
- `sim/meta.ts`: Garage upgrades (cost = base x growth^level), `metaMods`, `autoInvest`, `partsForWave`.
- `sim/sim.ts`: `createTdSim(ctx, { autopilot?, skipGarage?, cores? })`, `readSave` (migrates the v1 `{ bestWave }` save). `sim/types.ts`: `TdSnapshot` view-model.
- `render/`: `layout.ts` (pure; wide = side panels, narrow = top bar; tested vs insets), `renderer.ts` (cached background, particles, fx, shake/flash, cues -> `audio/sfx`, ambient flame/hum, taps), `sprites.ts` (procedural enemies, towers, dynamo base + turret), `panels.ts` (weapons/rail/dynamo, wave/base/surge/forecast/legend, workshop, garage, banners).

## Rules (all numbers are `towerdefense.*` tunables)
- Weapons per spec: Gatling = sim +1% (bullets per crank rev), Flamer = resistance 35% (dps per watt), Rail = ERG 0.95 FTP (charges at >= 0.75 FTP from any weapon, max 3; Z tap = 1, hold 0.5 s = all) plus a weak targeting laser while selected.
- Enemies: mini/dart (blue), brute/charger (red, chargers sprint the last half), bastion/carrier (purple, carriers drop minis), prism (cycles colour every 4 s from wave 12), Goliath boss (gold, shield cycles; escorts at 66/33% HP). Right colour x1.5, wrong x0.25.
- Dynamo: towers fire at `ftpFraction / towerNominalFtp` speed (0.65 FTP = 100%, cap 160%, 0 under 15 rpm). Sprinting = Overdrive (x1.5 damage + tower speed).
- Towers: Tesla (chain, blue), Mortar (splash shells, red), Prism Lens (beam at the toughest, purple); Lv 1-5. Scrap from kills/waves buys, upgrades, sells (50%) and repairs the base.
- Power Surge every 3 waves from wave 3: 15 s at power zone 4+ within 45 s fires an EMP (kills small fry, damages heavies), +scrap, +1 rail charge. Counts power zone (HR lags too much). `hooks.storm`/`hooks.surge` are set while active.
- Reactor cores (lives, `cores` default 3; 0 = unlimited): losing the base clears the field and rebuilds it; the last core ends the run (`isOver`).
- Waves end early (heal) when heavies are dead after `waveMinS`, else at `waveMaxS` (60 s).

## Controls (bike-first)
- A/B/Y weapons, Z rail, paddles aim (auto-aim after 1.5 s idle, prefers the priority lane), D-pad left/right = priority lane, up = all lanes, down = workshop.
- Workshop: left/right = pad (6 pads + base repair), up/down = option (preset to the tower the lane's next push needs), A = build/upgrade, B = close (auto-closes after 10 s). Taps: pads, base, rows, weapon cards, rail pips.
- Garage (returning riders only; skipped on the first run and under autopilot): up/down + A buys, left/right sets start wave, B starts; auto-starts after 30 s pedalling.

## Progression / save
- `{ v: 2, bestWave, bank, upgrades, runs, autoInvest, totals }`; parts bank on every wave clear and boss kill, persisted then, at game over and on dispose.
- Balance (autopilot, FTP 200, fresh save): z2 ~40-43 min / wave ~52 before the third core; 20 min sprints/intervals ~30 waves.

## Testing
`npx vitest run src/games/towerdefense`: scenarios (sprints, idle, idle-cores, intervals, z2-economy, surge-ready), geometry, waves, garage purchase via TimelineInput, workshop flow, power-gated towers, rail cap/dump, layout vs insets.

## Known gaps
Renderer checked with throwaway Playwright screenshots (landscape/portrait/phone), not yet on a real iPad; sounds untested by ear. Manual (non-autopilot) play not balance-tested.
