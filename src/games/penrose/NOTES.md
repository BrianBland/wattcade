# penrose (Penrose Pedals)
CONTRACT-REQUEST: none. Under-construction game (`wipGames`), upgraded to a pure strict-TS simulation + leak-free Three.js diorama renderer (42 levels in 9 chapters).

## What it is
An isometric Monument Valley-style cycling puzzle ride. Holding loops keep the wheel circling safely while you study the diorama; machines on Zwift Ride face buttons Y/A/B/Z (or direct 3D cap taps) engage with auto-latching detents so your pedalling turns turntables, swings bridges, rotates the camera, and opens optical perspective joins. Cadence drives lifts and conveyors, real FTP effort (with ERG cadence-surge parity) drives see-saws, hard-push beams, and the tide, and paddles/D-pad offer a gentle ±10° visual peek and directional nudge.

## Layout
- `campaign.ts`: 9 curated chapters (42 levels) with pacing vibe tags (`Cruise`, `Cadence`, `Effort`, `Mixed`, `Finale`), teaching every mechanic cleanly before combining.
- `sim/`: deterministic, strict-TS simulation (zero Three.js or DOM imports; runs identically in browser and Node headless scenarios):
  - `math.ts` & `road.ts`: pure 3D vector/matrix math, exact orthographic iso camera basis, OBB ray occlusion, `SimRoad` with dirty-flagged projection cache, turtles, and wall frames.
  - `machines.ts`: all mechanisms with auto-latching (`makeDetentStepper`), real FTP + ERG cadence-surge parity (`seesaw`, `wallArm`), signed headwind/tailwind load (`windSock`), momentary doors, clutch bridge with catch-zone warning & recoil, reflection pools, conveyors, and companion occluders.
  - `world.ts`: fixed-dt substepped wheel stepper, cadence-coupled pacing (pauses smoothly below 12 rpm), road slope grade, station checkpoints, optical perspective joins, and semantic `SimEvent` stream.
  - `levelsCh1to4.ts`, `levelsCh5to8.ts`, `levelKit.ts`, `compose.ts` (beat composer), `cube.ts` (6-wall 2-storey rotating Cube tower), `catalog.ts` (lazy per-level builder, instant startup).
  - `sim.ts`: `GameSim` bridge with `ctx.tuning` tunables, normalized gear scaling, honest `hud()` (`touchControls: []`, frame-0 controls, `ControlHint.active` + `indicator`, live `targetCadence`/`targetZone`), D-pad Up 2-tier hints, `checkpoint()`, `menuActions()` (with Chapters & Levels picker), and mastery/achievement tracking.
- `render/`: purely reactive Three.js diorama renderer (disposes every geometry, material, texture, and render target on level change and `unmount()`):
  - `themes.ts`: 7 theme palettes, three-tone camera-yaw-compensated shader + atmospheric `HAZE`, `LevelDisposer`, shared canvas textures.
  - `blooms.ts`: 7 procedural 3D blooms, themed wheel incorporating `profile.color`, standing pennant+shaft goal beacon, `makeRibbon`.
  - `sceneBuilder.ts`: declarative `VisualProp` builder, one-time `wheelOnTop` layer tagging, throttled half-res portal `WebGLRenderTarget`s, reflection pools, diegetic cues (hidden-gap ghost bridges, conveyor live lane highlight, lift floor beacons, clutch catch glow & recoil, hint focus halos, spark bursts), and `prefers-reduced-motion`-aware sky life.
  - `renderer.ts`: mounts WebGL view inside `layout(W, H, insets)`, renders auto-fading micro-toasts, 2-tier hints, direct 3D cap tap targets, and the Chapters & Levels picker modal.
- `scenarios.ts`: Node headless scenarios (`autopilot-tour`, `idle-safe-z2`, `intervals-effort-level`), verified alongside all 42 levels in `test/campaign.test.ts`.
