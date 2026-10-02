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
- Debug overlay: system action `toggleDebug` (persisted); sets `input.debugOpen` (shifters -> difficulty/timeScale). Trainer test via mixer effect `trainer-test`; fake sliders edit `fakeBike.manual`.
- HUD chip shows ride time (`bike.activeSeconds`, pedalling time). Pause menu has a Sound on/off toggle (`wattcade.sound` flag).
- `src/audio/sfx.ts`: shared WebAudio synth (`play(name, { minGapS })`, `unlockAudio()` called by GameHost on mount/gesture). Renderers import it; nothing runs in Node.
- GameHost passes `send` to `renderer.mount`, forwarding to optional `GameSim.receive(action)` (canvas UI taps).

- UI kit (`components/ui.tsx`): Panel, KeyHints/Key (Ride colours), ScreenHeader, Field (focusable row), Stepper, Choice,
  Toggle, CountUp, Spinner; `Bits.tsx` Btn plays `uiSelect`. CSS tokens/glass panels/focus ring at the top of `main.css`.
- `useMenuNav(count, layout, onSelect, onBack, enabled, { initial, onAdjust, onY })`: layout = cols or row lengths (`navRows`);
  onAdjust takes left/right on value rows; UI sounds (`uiMove/uiSelect/uiBack/uiTick/uiWake`) play from here.
- Editor: rows from pure `editorFields.ts` (tested); left/right adjust, A toggles/cycles/types, delete needs a second A.
  Pause: difficulty reads back the session mixer (`getDifficulty`). Summary: staged reveal, ride chart, XP count-up/fill.
  Achievements: progress for lifetime ones (`achievementProgress.ts`). Picker focuses the last rider; Y edits.

## Gaps
- Touch overlay (`attachTouch`) attached to the game mount only; not visually tested. Not browser-tested at all with real devices.
- Fake bike keys (W/S cadence, E/D power, R/F HR via event.code, `shell/fakeKeys.ts`) active in GameHost and the warm-up stage (`fakeKeysDom.ts`); first press switches FakeBike to manual seeded from current raw values; hint shown in the game host when fake.
- In-game HUD (`shell/hud/`): `HudLayer` (10 Hz poll of `session.sim.hud?.()` + bike) renders a bottom strip: `ZoneWidget` (5-zone bar, in-zone marker, targetZone outline, W/%FTP/HR, ~3 min bar chart + HR line), gear/diff chip (pulses on change; Gear only when `hud.gears`), `Legend` (Ride hoods; dim if unmapped, lit when held, `active` outlined; expanded when paused or first 8 s). Pure math + History in `zoneMath.ts` (tested). Legend toggle in pause menu, persisted in localStorage `wattcade.legend`.
- HUD layout: .mount is edge-to-edge; the HUD (left hood | translucent centre panel | right hood, buttons via InputHub.holdTouch/releaseTouch, clusters from hud/padModel.ts) floats over the bottom --hud-h band. GameHost measures that band (.hud-probe) and gives renderers `Insets` via mount ctx + optional `setInsets()`: draw backgrounds full-bleed, keep foreground UI and play focus above `insets.bottom`.
- Warm-up lobby (`warmup/WarmupStage.tsx`): rendered behind every non-game screen. Runs a lobby session of `lobbyGame`
  (services `startLobby/stopLobby`), draws its renderer full-bleed, owns keyboard/gamepad/fake keys and the InputHub tick.
  Restarts (keeping road position) on rider/device/fake changes. Guest (no profile) on profiles/editor; demo (fake) rides never credit.
- Menu input: `menuInput.ts` is the single press source for `useMenuNav` (stage delivers presses buffered across sim steps;
  otherwise, e.g. the in-game pause menu, it ticks the hub itself). `setMenuGate` lets App swallow the waking press.
- Warm-up credit: real devices and >= 2 min pedalling (`WARMUP_CREDIT_S`). Credited on: game start (before the game session),
  HUD "End ride" (-> Summary), rider/device change, 3 min stopped (auto-save), and next launch via a localStorage
  checkpoint (`wattcade.pendingRide`, every 20 s / on hide). Toasts: `components/Toasts.tsx`.
- Screensaver: on profiles/menu/achievements/summary, 25 s without menu input fades the screens out (HUD stays, legend hides);
  the first tap or nav press only wakes. Shifters and HUD taps never wake. HUD centre button is configurable (`menu` getter).
- App keeps `profileRef` so async credit and game saves always apply to the latest profile.
- Road: Hills/Flat toggle in the arcade menu (`warmup.hills` tunable, saved per rider).

- Tests: `npx vitest run src/shell src/debug`.