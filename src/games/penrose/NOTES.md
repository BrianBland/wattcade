# penrose (Penrose Pedals)
CONTRACT-REQUEST: none. Dev-flag game (`devGames`), ported from the design prototype (35 levels in 8 chapters).

## What it is
An isometric perception-puzzle ride. The wheel never stops; loops hold it, and it leaves a loop only where a piece
completes the road. Roads that meet on screen count as joined. Machines (turntables, hubs, crossovers, see-saws, lifts,
shutters, the wind sock, the camera) sit on face buttons Y/A/B/Z: press to engage, and your pedalling drives them.
Lifts follow cadence, the tide follows average effort (FTP-relative), see-saws tip only under a hard push.

## Layout
- `sim/sim.ts`: the bridge. Face-button presses (only for machines in the current level) and pause-menu picks
  (restart, watch a solve, skip, back) become numbered `cmds` in the snapshot; the renderer applies each id once.
  Snapshot carries cadence3s, gear and `effort` = ftpFraction × `effortAtFtp` (tide: rises above 100, full at 140).
  Trainer: sim grade `gradeBase + gradePerLoad × load`, with `load` reported by the renderer. Virtual gears on.
  Save `{ done: levelIds[], at }`; autopilot solves never count as clears.
- `render/engine.ts`: the prototype's level player moved over whole (`// @ts-nocheck`): roads, wheel, machines,
  perspective joins, the wheel-over-roads overlay pass, scenery, every hand-built level and the level generators.
  It draws straight to one WebGL canvas in the stage; colour management is off (`LinearSRGBColorSpace`) to keep the look.
  `engineTypes.ts` is its typed surface; `simulate(dt)` advances a level without drawing (scripted checks).
- `render/renderer.ts`: builds the sky / stage / status / fade DOM, feeds the engine rider from the snapshot (not while
  the autopilot drives), reports level, wins, falls and load back through `send`.
- `render/layout.ts`: status line and stage above the HUD inset (tested in `test/layout.test.ts`).
- `dev/penrose.html?level=N&inset=120`: fake-bike harness; `window.__pp` exposes the session and renderer.

## Known gaps (next PRs)
- The level logic lives in the renderer, so it is not deterministic and the headless runner can't play levels
  (no `scenarios.ts` yet). Plan: move `Road`, the wheel stepper and machine state into `sim/` as pure math
  (the screen joins only need the iso projection per camera yaw), leaving three.js meshes in `render/`.
- `engine.ts` is untyped and still uses its own frame-dt for machines and the wheel.
- Hints are the prototype's prose (keyboard-free, buttons named by letter); no achievements or sound yet.

Checked: all 35 levels solve on the engine autopilot inside the port (same times as the prototype), and the full
vitest suite and `tsc` pass.
