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

## Gaps
- ProfileEditor fields are touch/keyboard only (no D-pad field navigation); Save/Cancel via mouse/touch.
- PauseMenu difficulty starts at 1.00 display (not read back from mixer). GameHost `onSave` closure captures the profile at mount.
- Touch overlay (`attachTouch`) attached to the game mount only; not visually tested. Not browser-tested at all with real devices.
- Tests: `npx vitest run src/shell src/debug`.
