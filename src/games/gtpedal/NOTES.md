# Grand Theft Pedal (gtpedal)

CONTRACT-REQUEST: add optional `GameSim.settings?(): GameSetting[]` (+ `GameSetting` type) to contracts.ts for per-game
pause-menu settings. Today the shell reads it structurally (`src/shell/gameSettings.ts`) and sends
`receive({ type: 'setting', key, value })`, so no contracts.ts edit was needed; formalising it would type-check it.
Design: `DESIGN.md`. Status: milestone 1 (playground feel). No missions, `isOver()` always false.

## Layout
- `sim/world.ts` (pure): ~240 m neighbourhood. `heightAt(x,z,bridgeRad)` analytic height field: kickers/berms
  (concave face, gentle back, rolled-off sides), sunken bowl, sunken plaza (5 steps down, ramp out north),
  canal with a two-leaf drawbridge (`bridgeAngle(t)` cycles closed/rising/open/falling), 6 m edge walls.
  `BUILDINGS` (AABBs), `LINES` (path/ramp/rail/tram polylines), `PARKED_BIKES`, `nearestOnLine`.
- `sim/physics.ts` (pure): `stepBody` — drive from effort (power3s/FTP) × bike power, drag + rolling decay,
  slope gravity, ground follow, launch when ground drops away faster than a ballistic arc, landings, building
  hits (crash above `crashSpeed`, bonk below), walls (>0.8 m step), grind on tram/rail lines, line snapping.
  Heading: 0 = +z, π/2 = +x; rider's right is (-cos h, sin h). `switchLine` for paddle taps.
- `sim/bikes.ts` bike table. `sim/weapons.ts`: ammo tables, `pickLock`, `lob`, `stepProjectile`, `radialLaunch`, patches.
- `sim/cops.ts`: Segway/horse `stepCop` (sight, pursue via `sim/nav.ts` A* graph, stun/flail/launch, tackle).
  `sim/nav.ts`: nodes (line points + building corners), visibility edges, `findPath`, `visible`.
- `sim/sim.ts`: modes bike / foot / ragdoll. Paddle tap (< `tapS`) = switch line (bike) or cycle target (foot);
  hold = free steer (`lineLeave` hold) or switch at forks (`forks`); in the air paddles spin. A = dismount/steal,
  B = fire (bazooka launch only), Y = hop,
  Z = grind, shifters = cycle weapon. Tricks (spin ≥180, grind ≥0.6 s, big air) give a decaying speed boost.
  Spin landed sideways or wall hit ⇒ ragdoll, then on foot; bike left behind. Canal = splash, bank respawn.
  Weapons/cops/heat/co-op/busts: see DESIGN.md. Test setup opts: spawn, npcs, heat, cops, copSpawn, ammo, startWeapon.
  Trainer grade: `terrain` sim effect = slope × grade scale, capped, quantised to 0.5 %; both from the pause menu
  (`settings()`/`receive`, saved) falling back to tunables `gradeScale`/`gradeMax`.
  Autopilot (`simOpts.autopilot`): waypoint loop with wall probing, brakes for corners / open bridge
  (`daredevil: true` shuttles the avenue and asks target-follow for `sprintFtp`×FTP; emits `bridgeAttempt`), swaps onto other bikes it passes.
- `render/renderer.ts`: three.js blocky world, id-keyed pools for cops/projectiles/patches/blasts/flames/crates,
  3D reticle, co-op pad, DOM HUD + event toasts. `render/camera.ts` pure jump-aware chase cam (tested).
  `render/jsr.ts` JSR beauty sliver (toon/ink/props/graffiti/sky/grade); `snapshot.art` from `artStyle` tunable or `simOpts.artStyle`. `render/layout.ts` pure HUD layout + camera view offset
  for `insets.bottom` (tested).

## Not done / next
- Tandem/cargo special rules; e-bike heat is the only per-bike rule besides handling.
- Held back: achievements, cosmetic titles, card clip (arcade.test accepts `drawCard` art when no clip exists;
  achievements.test lists gtpedal as PENDING). sfx.
- Not tuned on a real trainer yet; all bike↔game numbers are `gtpedal.*` tunables.
