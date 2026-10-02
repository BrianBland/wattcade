# shell + debug (Agent E)

CONTRACT-REQUEST: none.

## Layout
- `src/main.tsx` -> `shell/App.tsx` (screen state machine) + `debug/DebugOverlay.tsx`. CSS in `src/styles/main.css`.
- `shell/services.ts` is the ONLY file importing core/input/progression/devices (adapters, singletons `input`, `dataHub`). Everything else uses it.
- `shell/screens/`: ProfilePicker, ProfileEditor (+backup export/import), Connect, ArcadeMenu, GameHost, PauseMenu, Summary, Achievements.
- Pure/tested: `shell/nav.ts` (grid nav reducer), `shell/format.ts`. `shell/useMenuNav.ts` drives InputHub.beginTick itself in menus (D-pad/A/B + Enter/Esc).
- `debug/`: `panels.tsx` (device, derived, controller, mixer, tuning), `TrainerTest.tsx`, `types.ts` (`DebugSnapshot`, `DebugActions`), polled at 5 Hz from `services.debugSnapshot()`.

## Behavior
- Flow: profiles -> connect -> menu -> game -> summary. On quit: `session.finish()`, SessionStore.save, `awardSession`, profile saved.
- No device connected (or Fake toggle on) => session uses core FakeBike with chosen script. Real devices => shared `dataHub`.
- Pause (system `pause`): `session.pause()` + mixer panic; resume releases. Wake lock requested in GameHost.
- Debug overlay toggled by system action `toggleDebug`, persisted in localStorage; sets `input.debugOpen` (shifters -> difficulty/timeScale via `onDebugAdjust`).
- Trainer test: debug mixer panel; `applyTest(cmd)` -> during a session sets mixer effect `trainer-test` (priority 99, ttl 10 s; so difficulty scaling and clamps still apply); with no session it calls the real trainer's `apply` directly. "clear" button removes it.
- Fake sliders: +/- buttons edit `fakeBike.manual` (switching from script to manual) ; script picker includes `manual`.

- HUD chip shows ride time (`bike.activeSeconds`, pedalling time). Pause menu has a Sound on/off toggle (`wattcade.sound` flag).
- `src/audio/sfx.ts`: shared WebAudio synth (`play(name, { minGapS })`, `unlockAudio()` called by GameHost on mount/gesture). Renderers import it; nothing runs in Node.

- GameHost passes `send` to `renderer.mount`, forwarding to optional `GameSim.receive(action)` (canvas UI taps).

## Gaps
- ProfileEditor fields are touch/keyboard only (no D-pad field navigation); Save/Cancel via mouse/touch.
- PauseMenu difficulty starts at 1.00 display (not read back from mixer). GameHost `onSave` closure captures the profile at mount.
- Touch overlay (`attachTouch`) attached to the game mount only; not visually tested. Not browser-tested at all with real devices.
- Tests: `npx vitest run src/shell src/debug`.
- Fixes (smoke test): GameHost disconnects its ResizeObserver and guards the RAF/resize callbacks after unmount; Connect shows a friendly "Web Bluetooth unavailable" message; debug top panels sit 64 px down; mixer last-cmd is formatted; inline SVG favicon; profile cards show XP/next-level XP.
- Fake bike keys (W/S cadence, E/D power, R/F HR via event.code, `shell/fakeKeys.ts`) active in GameHost; first press switches FakeBike to manual seeded from current raw values; hint shown in the game host when fake.
- In-game HUD (`shell/hud/`): `HudLayer` (10 Hz poll of `session.sim.hud?.()` + bike) renders a bottom strip: `ZoneWidget` (5-zone bar, in-zone marker, targetZone outline, W/%FTP/HR, ~3 min bar chart + HR line), gear/diff chip (pulses on change; Gear only when `hud.gears`), `Legend` (Ride hoods; dim if unmapped, lit when held, `active` outlined; expanded when paused or first 8 s). Pure math + History in `zoneMath.ts` (tested). Legend toggle in pause menu, persisted in localStorage `wattcade.legend`.
- Connect: HR card shows progress steps via `HeartRateMonitor.connect(onProgress)` (cast; harmless if the arg isn't supported yet) and errors. Editor has the zone-source hint.
- HUD tweaks: history bars scale to max(1.6×FTP, window max), target label above the zone bar, fake-key hint lives in the zone widget; FtmsTrainer.connect(onProgress) wired; trainer status detail on the Connect card and debug device panel.
- HUD layout: bottom band of .game-host sized by --hud-h (= 3 button rows); .mount ends above it so game UI is never covered (renderers get resize()). Left hood (paddle, shifters, D-pad) | translucent centre panel (zone widget, Menu, time, gear box) | right hood (face, shifters, paddle). Hoods are touch buttons (InputHub.holdTouch/releaseTouch); clusters built by hud/padModel.ts from GameHud.controls. --k sizes the buttons.
- Compact legend is now a text list (`hud/CompactLegend.tsx`, pure `legendLines.ts` tested): coloured key glyphs + label, identical labels merged, active first, 2 columns; expanded drawing unchanged.
