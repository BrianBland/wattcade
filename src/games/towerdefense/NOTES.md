# Dynamo Defense (towerdefense)

CONTRACT-REQUESTs: none.

## Layout
- `sim/defs.ts` (pure): enemy kinds, towers + level tables, 3 curved Bézier lanes (`laneAt` arc-length lookup), 6 build pads, base geometry. Aim angle 0 = up from the base.
- `sim/waves.ts` (pure, rng passed in): `nextBrood` (brood colour order: no colour > `broodMaxRun` in a row, all three in every `broodCoverWaves`), `planWave` (`broodShare` of the wave's colour slots in the brood colour, the rest off-colour for the towers; red/purple slots are heavies, blue slots are swarm packs of `swarmPackSize` darts or drones; lane bias, dart packs, prisms, boss every 5); per-lane colour counts feed the forecast.
- `sim/meta.ts`: Garage upgrades (cost = base x growth^level), `metaMods`, `autoInvest`, `partsForWave`.
- `sim/sim.ts`: `createTdSim(ctx, { autopilot?, skipGarage?, cores? })`, `readSave` (migrates the v1 `{ bestWave }` save). `sim/types.ts`: `TdSnapshot` view-model.
- `render/`: `layout.ts` (pure; wide = side panels, narrow = top bar; tested vs insets), `renderer.ts` (cached background, particles, fx, shake/flash, cues -> `audio/sfx`, ambient flame/hum, taps), `sprites.ts` (procedural enemies, towers, dynamo base + turret), `panels.ts` (weapons/rail/dynamo, wave/base/surge/forecast/legend, workshop, garage, banners).

## Rules (all numbers are `towerdefense.*` tunables)
- Brood waves (#119): each wave is one colour; the turret mounts its weapon for the whole wave (no manual or per-enemy switching): Gatling = sim +1% (bullets per crank rev), Flamer = resistance 35% (dps per watt), Railgun = ERG 0.95 FTP (laser). Rail charges still build at >= 0.75 FTP in any wave (max 3; Z tap = 1, hold 0.5 s = all).
- Lull (`lullS` 15 s) before every wave, wave 1 included: no spawns, brood card + countdown (`snapshot.brood`, `nextBrood` for the forecast). The weapon and its trainer mode switch at the lull's start at a recovery value (`lull*`), ramping to full over the last `rampS` (6 s). Event `broodAnnounced`; `waveStart` fires when the lull ends.
- Enemies: mini/dart (blue swarm; no blue heavies), brute/charger (red, chargers sprint the last half), bastion/carrier (purple, carriers drop minis), prism (cycles colour every 4 s from wave 12), Goliath boss (gold, shield cycles; escorts at 66/33% HP). Right colour x1.5, wrong x0.25.
- Dynamo: towers fire at `ftpFraction / towerNominalFtp` speed (0.65 FTP = 100%, cap 160%, 0 under 15 rpm). Sprinting = Overdrive (x1.5 damage + tower speed).
- Towers: Tesla (chain, blue), Mortar (splash shells, red), Prism Lens (beam at the toughest, purple); Lv 1-5. Scrap from kills/waves buys, upgrades, sells (50%) and repairs the base.
- Power Surge every 3 waves from wave 3: 15 s at `min(5, powerZone)` >= 4 within 45 s fires an EMP (kills small fry, damages heavies), +scrap, +1 rail charge. Short effort, so judged on power (SPEC short-effort rule); `targetZone.source: 'power'` (also on the Rail band). `hooks.storm`/`hooks.surge` set while active.
- Spin-up (cadence drill) every 3 waves from wave 4: 15 s at >= 95 rpm (`cadence3s`) within 40 s -> Gatling Overclock (double fire rate) for 30 s + scrap. Sets `GameHud.targetCadence`. Fake scripts never reach 95 rpm, so tests drive it with manual cadence.
- Reactor cores (lives, `cores` default 3; 0 = unlimited): losing the base clears the field and rebuilds it; the last core ends the run (`isOver`).
- Waves end early (heal) when the field is clear after `waveMinS` (the drone stream stops once the wave has sent everything and `waveMinS` has passed), else at `waveMaxS` (60 s). Boss waves use the same brood rules until #125.

## Controls (bike-first)
- Z rail, paddles aim (A/B/Y unbound until #120) (auto-aim after 1.5 s idle, prefers the priority lane), D-pad left/right = priority lane, up = all lanes, down = workshop.
- Workshop: left/right = pad (6 pads + base repair), up/down = option (preset to the tower the lane's next push needs), A = build/upgrade, B = close (auto-closes after 10 s). Taps: pads, base, rows, rail pips.
- Garage (returning riders only; skipped on the first run and under autopilot): up/down + A buys, left/right sets start wave, B starts; auto-starts after 30 s pedalling.

## Progression / save
- `{ v: 2, bestWave, bank, upgrades, runs, autoInvest, totals }`; parts bank on every wave clear and boss kill, persisted then, at game over and on dispose.
- Balance (autopilot, FTP 200, fresh save, seed 1): 20 min z2 = 24 waves, ~23 trainer-mode changes (was 208), towers ~72% of kills (was 93%); sprints/intervals ~24-25 waves; 30 min z2 = 35 waves; idle with 1 core falls at ~4 min (wave 3).

## Testing
`npx vitest run src/games/towerdefense`: scenarios (sprints, brood-z2 (mode changes <= waves, mixer modes = announced), idle, idle-cores, intervals, z2-economy, surge-ready), brood planner (runs, cover, share, determinism), lull/ramp, spin-up/surge targets, geometry, waves, garage purchase via TimelineInput, workshop flow, power-gated towers, rail cap/dump, layout vs insets.

## Known gaps
Renderer checked with throwaway Playwright screenshots (landscape/portrait/phone), not yet on a real iPad; sounds untested by ear. Manual (non-autopilot) play not balance-tested.
