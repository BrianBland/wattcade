# Seaside — story runtime (#184)

Story ride (~2 h, three chapters) from the storyboard (`docs/seaside/storyboard.html` on `seaside-storyboard`, PR #175).
Master issue #183. The voxel engine prototype stays on that branch until #185 ports it.

## Registration
`devGames` in `src/games/registry.ts`: always in `allGames` (headless runner, tests), in the picker only with the dev
flag (`?dev=1`, remembered; `?dev=0` clears; always on under `vite` dev). Move to `games` when Chapter 1 is playable.

## Sim (`sim/`)
- `story.ts` 33 scenes transcribed from the storyboard: chapter, kind, minutes, effort segments (%FTP), base trainer
  command, monologue (≤ 8 words), look + dream. Ride length = minutes × a per-scene speed.
- `types.ts` the snapshot seam. Base fields `{ chapter, sceneId, sceneT, routeS, speed, effortTarget, monologue, look }`;
  other issues add fields additively. Also `SeasideSave` (unknown save fields are preserved).
- `graph.ts` pure: plan time, route metres, effort at a position, base effort (sprints excluded), checkpoints, resume.
- `pace.ts` pure: rail speed = plan speed × (W / planned W)^⅓ × nudge; nudge = 1 + gain × lag (s behind plan), ±20 %.
  Effort-gated scenes advance at W / planned W (floor 0.1, cap 2) plan-seconds per second.
- Scene length is one of `{ m }` (rail), `{ effortS }` (fish, drill, fan) or `{ s }` (cutscenes, shops, the Big One,
  re-entry: un-winnable set pieces always resolve).
- `monologue.ts` queue: one line, 4 s, 1 s gap, dropped after 30 s; hidden while `bike.sprinting` or the plan ≥ 105 % FTP.
- `sim.ts`: menu (continue / start over, + chapter select after the first full ride; auto-picks after 20 s; renderer taps
  send `{ type: 'menu', index }`) → story. One `scene` resistance effect per scene (#186 refines it).
  Saves at each chapter start and at 50 % of scenes ≥ 5 min; finishing clears the checkpoint, `rides++`, unlocks select.
- Events: `scene`, `chapter`, `save`, `storyEnd`. `hooks.powerFtp` = planned effort (for `target-follow`).
- simOpts: `chapter` (start there, no menu), `save` (instead of the profile's), `skipMenu` (continue if possible).

## Render (`render/`)
Placeholder Canvas 2D: look-tinted sky, rail ticks scrolling with `routeS`, grey stage box with the scene label, title
plate + progress, bubble top-left, chapter card, menu. `layout.ts` keeps all of it above `insets.bottom` (tested).
#185 swaps the stage box for the voxel world (dynamic `import()` from `loadRenderer`).

## Run
- `npm run sim -- --game seaside --script z2 --minutes 150` → whole story, ~123 min.
- `/dev/seaside-play.html?script=z2&speed=30&scene=drill1&menu=1&inset=120`; keys 1–5 = ×1/×10/×30/×60/×120.
- Tests: `npx vitest run src/games/seaside` (graph, pace, monologue, layout, sim, scenarios incl. ±10 % of 2 h).
