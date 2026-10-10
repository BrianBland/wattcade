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
- `sim/bikes.ts` bike table; `sim/weapons.ts` weapon list + `pickLock` (nearest in forward cone, sticky).
- `sim/sim.ts`: modes bike / foot / ragdoll. Paddle tap (< `tapS`) = switch line (bike) or cycle target (foot);
  hold = free steer (`lineLeave` hold) or switch at forks (`forks`); in the air paddles spin. A = dismount/steal,
  B = fire (bazooka launch only), Y = hop,
  Z = grind, shifters = cycle weapon. Tricks (spin ≥180, grind ≥0.6 s, big air) give a decaying speed boost.
  Spin landed sideways or wall hit ⇒ ragdoll, then on foot; bike left behind (re-mounting your own bike
  isn't a steal). Canal = splash, respawn on the bank. Heat stub + one cop that chases at heat ≥ 1.
  Trainer grade: `terrain` sim effect = slope × grade scale, capped, quantised to 0.5 %; both from the pause menu
  (`settings()`/`receive`, saved) falling back to tunables `gradeScale`/`gradeMax`.
  Autopilot (`simOpts.autopilot`): waypoint loop with wall probing, brakes for corners / open bridge
  (`daredevil: true` shuttles the avenue and asks target-follow for `sprintFtp`×FTP; emits `bridgeAttempt`), swaps onto other bikes it passes.
- `render/renderer.ts`: three.js, height-field ground mesh, box buildings/bikes/NPCs, line overlays, bridge
  leaves, lock-on reticle, chase camera, DOM HUD. `render/layout.ts` pure HUD layout + camera view offset
  for `insets.bottom` (tested).

## Not done / next
- Weapons other than bazooka, glass/flat tires in play, oil/fire patches, real cop AI, co-op repaint.
- Tandem/cargo special rules; e-bike heat is the only per-bike rule besides handling.
- Held back: achievements, cosmetic titles, card clip (arcade.test accepts `drawCard` art when no clip exists;
  achievements.test lists gtpedal as PENDING). sfx.
- Not tuned on a real trainer yet; all bike↔game numbers are `gtpedal.*` tunables.
