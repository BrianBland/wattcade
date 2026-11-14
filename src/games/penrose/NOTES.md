# penrose (Penrose Pedals)
CONTRACT-REQUEST: none. Under-construction game (`wipGames`, caution tape in the picker), ported from the design prototype (36 levels in 9 chapters).

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
- `engine/`: the prototype's level player and generators, untyped (`// @ts-nocheck`), as modules sharing one scope
  (`install($scope)`, order in `engine/index.ts`): `core` (materials, view, wheel, themes, roads, makeLevel and the
  level flow, wheel-over-roads overlay pass), `machines`, `levels` (hand-built), `studies`, `gen9` (main generator:
  TIERS, planLevel3, checkPlan3, solve3, genDef3, candidates3), `persp`, `machines2`, `combos` (+ sceneryPass),
  `gravity`, `gravity2`, `curtain` (curtain generator), `audit` (screen audit), `decor` (seeded wall-art decals that
  shade like the wall), `cube` (wall machines and The Cube: box turns per edge, camera per storey, per-wall checkpoints,
  one button per storey via `machine.live`), `studies2` (conveyor, reflection pools, portal doors, clutch bridge, seam
  studies), `surfaces` (tiling ground textures), `terrain` (plateaus on a base; `autoTerrain` lays them under a level via `def.terrain`; `strip` swaps hand floors for plateaus, `anchors`/`L.anchors` extend the base under piers), `levels3` (levels using them, spread through the chapters), `compose` (beat composer: stations joined by gate, mirror, clutch, see-saw, camera-join, curtain and door beats, turning so a level winds on itself under a ground and on-screen layout check, with knots (a 270 degree turn that changes level and bridges over itself); `'bc:<seed>'`, plans tested in `test/compose.test.ts`). Colour management is off (`LinearSRGBColorSpace`) to keep the look. `render/engineTypes.ts` is the typed surface, including `tools`.
- `campaign.ts`: the chapters, as data: hand-built ids, `'<tier>:<seed>'` (gen9), `'cg:<seed>'` (curtain) or `'bc:<seed>'` (composer).
- `render/renderer.ts`: builds the sky / stage / status / fade DOM, feeds the engine rider from the snapshot (not while
  the autopilot drives), reports level, wins, falls and load back through `send`.
- `render/layout.ts`: stage above the HUD inset (tested). No text over play: machine letters sit on caps; hint in pause menu.
- `dev/penrose.html?level=N&inset=120`: fake-bike harness; `window.__pp` exposes the session and renderer.
- Level design (with `npm run dev` up): `scripts/penrose-gen-sweep.mjs` (tiers | gen <tier> <from> <to> |
  curtain <from> <to>: plan, solve and idle-ride seeds), `scripts/penrose-audit.mjs [n|item...]` (overlaps, hidden
  road, joins per view), `scripts/penrose-solve-check.mjs` (every level solves, idle safe). gen1–8 not ported.

## Known gaps (next PRs)
- The level logic lives in the renderer, so it is not deterministic and the headless runner can't play levels
  (no `scenarios.ts` yet). Plan: move `Road`, the wheel stepper and machine state into `sim/` as pure math
  (the screen joins only need the iso projection per camera yaw), leaving three.js meshes in `render/`.
- The engine is untyped and uses its own frame-dt. Hints are prose; no achievements or sound yet.

Checked: all 36 levels solve on the engine autopilot inside the port (same times as the prototype), and the full
vitest suite and `tsc` pass.
