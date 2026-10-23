# Seaside — story runtime (#184), workout (#186)

Story ride (~2 h, three chapters) from the storyboard (`docs/seaside/storyboard.html` on `seaside-storyboard`, PR #175,
master issue #183). The voxel engine prototype stays on that branch until #185 ports it.

**Registration:** `devGames` in `src/games/registry.ts`: always in `allGames` (headless runner, tests), in the picker only with the dev
flag (`?dev=1`, remembered; `?dev=0` clears; always on under `vite` dev). Move to `games` when Chapter 1 is playable.

## Sim (`sim/`)
- `story.ts` 33 scenes transcribed from the storyboard: chapter, kind, minutes, effort segments (%FTP), base trainer
  command, monologue (≤ 8 words), look + dream. Ride length = minutes × a per-scene speed.
- `types.ts` the snapshot seam. Base fields `{ chapter, sceneId, sceneT, routeS, speed, effortTarget, monologue, look }`;
  others add fields additively (#186: `pull`, `cadenceBand`, scene `pulls`, `TrainerPlan` `profile`/`swell`/`pulse`).
  Also `SeasideSave` (unknown save fields are preserved).
- `graph.ts` pure: plan time, route metres, effort at a position, base effort (sprints excluded), checkpoints, resume.
- `pace.ts` pure: rail speed = plan speed × (W / planned W)^⅓ × nudge; nudge = 1 + gain × lag, +20 % behind, −2 % ahead
  (harder work finishes sooner). Effort-gated scenes advance at W / planned W (floor 0.1, cap 2) × the cadence rate.
- `workout.ts` pure: one `scene` effect per tick, always in the scene's mode (≤ 1 mode change per scene, `trainer`
  events). Rides: route `profile` keyframes + eased-in `swell`s (cavern 0 → −3..−5 %). Fish: base level, surging to
  60–80 % (by size) while the fish runs. Drills: ERG = the effort plan (Z3 + rests); 60–75 rpm = +15 % bore rate. Fan:
  80–100 rpm band (×0.3 outside). Paddle: grade pulses on a clock; wings: resistance pulses every 3 crank revs. Set
  pieces ramp up through their sprint, then let go. All `seaside.*` tunables.
- `pull.ts` pure: 9 sprints (story `sizes` re-time each ≥ 100 % segment to 110–150 % FTP × 6–25 s). Fish fights hold
  the scene; stamina drains with work (×0.5 below target), escapes after 90 s. Set pieces (Big One, breakthrough,
  re-entry) always resolve; effort → `spectacle`. Events `pull`; summary: fish landed, sprints on target, best, drill.
- Scene length: `{ m }` (rail), `{ effortS }` (fish, drill, fan) or `{ s }` (cutscenes, shops, the Big One, re-entry).
- `monologue.ts`: one line, 4 s, 1 s gap, dropped after 30 s; hidden while sprinting or the target ≥ 105 % FTP.
- `sim.ts`: menu (continue / start over, + chapter select after the first full ride; auto-picks after 20 s; renderer taps
  send `{ type: 'menu', index }`) → story. Saves at each chapter start and at 50 % of scenes ≥ 5 min; finishing clears the checkpoint, `rides++`, unlocks select.
- Events: `scene`, `chapter`, `save`, `storyEnd`, `trainer`, `pull`. `hooks.powerFtp` (target), `hooks.cadence` (band).
- simOpts: `chapter` (start there, no menu), `save` (instead of the profile's), `skipMenu` (continue if possible).

**Render** (`render/`): placeholder Canvas 2D: look-tinted sky, rail ticks scrolling with `routeS`, grey stage box with the scene label, title
plate + progress, bubble top-left, chapter card, menu. `layout.ts` keeps all of it above `insets.bottom` (tested).
#185 swaps the stage box for the voxel world (dynamic `import()` from `loadRenderer`).

## Run
- `/dev/seaside-play.html?script=z2&speed=30&scene=drill1&menu=1&inset=120`; keys 1–5 = ×1/×10/×30/×60/×120.
- Tests: `npx vitest run src/games/seaside`. Scenarios: z2 ≈ 123 min (`npm run sim -- --game seaside --script z2 --minutes 150`), sprints ≈ 121 min and 6/6 fish, both
  2 ERG blocks + 9 trainer sprints (resistance runs ≥ 50 %); idle resolves set pieces / lets fish go, waits on rides.
