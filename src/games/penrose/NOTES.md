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
- `engine/`: the prototype's level player and generators, untyped (`// @ts-nocheck`), as modules sharing one scope
  (`install($scope)`, order in `engine/index.ts`): `core` (materials, view, wheel, themes, roads, makeLevel and the
  level flow, wheel-over-roads overlay pass), `machines`, `levels` (hand-built), `studies`, `gen9` (main generator:
  TIERS, planLevel3, checkPlan3, solve3, genDef3, candidates3), `persp`, `machines2`, `combos` (+ sceneryPass),
  `gravity`, `gravity2`, `curtain` (curtain generator), `audit` (screen audit). Colour management is off
  (`LinearSRGBColorSpace`) to keep the look. `render/engineTypes.ts` is the typed surface, including `tools`.
- `campaign.ts`: the chapters, as data: hand-built ids, `'<tier>:<seed>'` (gen9) or `'cg:<seed>'` (curtain).
- `render/renderer.ts`: builds the sky / stage / status / fade DOM, feeds the engine rider from the snapshot (not while
  the autopilot drives), reports level, wins, falls and load back through `send`.
- `render/layout.ts`: status line and stage above the HUD inset (tested in `test/layout.test.ts`).
- `dev/penrose.html?level=N&inset=120`: fake-bike harness; `window.__pp` exposes the session and renderer.
- Level design (with `npm run dev` up): `scripts/penrose-gen-sweep.mjs` (tiers | gen <tier> <from> <to> |
  curtain <from> <to>: plan, solve and idle-ride seeds), `scripts/penrose-audit.mjs [n|item...]` (overlaps, hidden
  road, joins per view), `scripts/penrose-solve-check.mjs` (every campaign level solves and is idle safe).
  The prototype's earlier generators (gen1–gen8, the dynamo) were superseded by gen9 and are not ported.

## Known gaps (next PRs)
- The level logic lives in the renderer, so it is not deterministic and the headless runner can't play levels
  (no `scenarios.ts` yet). Plan: move `Road`, the wheel stepper and machine state into `sim/` as pure math
  (the screen joins only need the iso projection per camera yaw), leaving three.js meshes in `render/`.
- The engine is untyped and still uses its own frame-dt for machines and the wheel.
- Hints are the prototype's prose (keyboard-free, buttons named by letter); no achievements or sound yet.

Checked: all 35 levels solve on the engine autopilot inside the port (same times as the prototype), and the full
vitest suite and `tsc` pass.
