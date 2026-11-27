# wattcade

Web "bike arcade" (KICKR CORE + Zwift Ride + Garmin HR) for iPad/Bluefy via Web Bluetooth. **The spec is `docs/SPEC.md`.** Shared types: `src/contracts.ts` (orchestrator-owned; never edit it from a subagent — add a `CONTRACT-REQUEST:` line at the top of your `NOTES.md` instead).

## Ground rules (short form of SPEC §0)
- TypeScript strict, Vite, Preact (UI), Three.js (3D), Canvas 2D, Vitest, tsx. No game engine, no extra runtime deps without a reason in your `NOTES.md`.
- Write only inside the folders you own (SPEC §2/§5/§6).
- Game `sim/` code never imports DOM, `three`, Preact, or `render/`. Renderers load via dynamic `import()`.
- Sims are deterministic: use only `ctx.rng()` and `ctx.clock`. No `Math.random`/`Date.now`/`performance.now` in sims.
- Every bike↔game number is a `ctx.tuning` tunable.
- Bluetooth byte parsing/encoding lives in pure, unit-tested functions; Web Bluetooth glue is thin and separate.
- Do not copy code from GPL reference projects; implement from SPEC protocol facts.
- Before finishing: `npx tsc --noEmit -p .` and `npx vitest run <your folder>` green; keep `<folder>/NOTES.md` concise (trim superseded entries when replacing behavior).
- **Workout preservation (`inMenu()`):** `inMenu()` is pre-ride lobby only (before active pedaling). Never return `true` from an in-ride hub/camp after a run starts, or Pause will abandon the workout instead of finishing to Summary.
- **ERG + Grade parity:** every power/sprint hook must work in both modes — never award free bonuses merely because `erg` is on (check actual `bike.ftpFraction`), give ERG riders a cadence/surge alternative for sprint-triggered mechanics, and clear combat resistance channels when opening hubs or modal pickers.
- **Renderer lifecycle & cleanup:** implement `ready()` when loading async assets, bound derived/rotated sprite caches, release offscreen canvases/listeners/audio in `unmount()`, and remove or bypass superseded art/UI paths (plus stale blurbs, roles, and tunable descriptions) in the same PR.
- **Audio routing:** route game music and custom WebAudio synths through `audioOut()` / `sfxGraph()` in `src/audio/sfx.ts` (never create a standalone `AudioContext`) and stop/dispose them in `unmount()` so global mute and external-media ducking stay intact.
- **HUD honesty & touch controls:** gate `ControlHint.active` and action `usable` on actual usability, and publish `hud().touchControls` (`[]` on directly tappable menus/pickers; only active buttons during play).
- **HUD insets (every renderer):** the shell HUD floats over the bottom of the render surface. Implement `setInsets()` and honor `insets.bottom` (also from `mount` ctx): lay out ALL foreground content (play focus, UI, panels, tickers, toasts, menus) in the height above it; draw backgrounds full-bleed. Never hard-code a HUD margin. Put pure layout math in a function with a unit test asserting nothing important lands below `H - insets.bottom` (see `hamster/render/layout.ts`). `src/games/insets.test.ts` enforces `setInsets` for every registered game.
- **Shaped HUD opt-in:** `Insets.occlusions`, when present, supplies the actual occupied HUD rectangles in render-surface CSS pixels. A renderer may reclaim gaps only when its layout tests keep every foreground sprite and control clear of those rectangles. Keep the rectangular edge-inset behavior when shape data is absent; existing renderers need no changes.
- Tests: Vitest, `environment: node` by default; add `// @vitest-environment jsdom` at the top of a test file that needs the DOM.

Scripts: `npm run dev | dev:ipad | build | test | typecheck | sim | sim:all | deploy`.

## Integration seams (agreed APIs between parallel agents)
These let agents build in parallel. Implement your side exactly; code against the other side structurally (local interface types) if it doesn't exist yet.

**Input (Agent B, `src/input/index.ts` exports):**
- `class InputHub` — constructor `(opts?: { debounceMs?: number; deadzone?: number; now?: () => number; paddleExpo?: number })`; `applySettings(s: ProfileSettings)`; `beginTick(dt: Seconds): void` (computes edges, advances paddleIdleS); `state(): Readonly<InputState>`; `onSystem(cb: (a: SystemAction) => void): () => void`; `setControllerState(raw: ControllerRawState): void` (fed by core's DataHub); `attachKeyboard(target: EventTarget): () => void`; `attachGamepad(): () => void` (polls inside beginTick); `attachTouch(container: HTMLElement): () => void`; `setScript(s: ScriptedInput | null)`; `debugOpen: boolean` (when true, shifters emit difficulty/timeScale system hooks via `onDebugAdjust(cb: (k: 'difficulty' | 'timeScale', delta: number) => void)`); `raw(): ControllerRawState` for the overlay. The left Ride paddle is always inverted; there is no invert option. Nothing touches `window` unless an `attach*` is called (must run in Node).
- `class ScriptedInput` — `(timeline: Array<{ t: Seconds; press?: Button; release?: Button; paddleL?: number; paddleR?: number }>)`.

**Core (Agent C, `src/core/index.ts` exports):**
- `interface InputSource { beginTick(dt: Seconds): void; state(): Readonly<InputState> }` (InputHub satisfies it).
- `TuningRegistry` (`scoped(ns: string): Tuning`, `list()`, `set(key, v)`, `reset(ns?)`), `ResistanceMixer` (implements `ResistanceController`; `setDifficulty`, `panic(on: boolean)`, `tick(dt, input)`, `debug()`), `BikeStateStore`, `DataHub`, `GameLoop`, `FakeBike`, `FakeTrainer`, `SessionRecorder`, `SCRIPTS` (record of script name → script), `makeRng(seed)`.
- `createGameSession(opts: { game: GameModule; profile: Profile; input: InputSource; dataHub?: DataHub; fake?: { script?: string } | false; seed?: number; simOpts?: Record<string, unknown>; onEmit?: (e) => void; onSave?: (data: unknown) => void }): GameSession` with `{ ctx, sim, mixer, bikeStore, tuning, recorder, fakeBike?, loop, frame(realDtS: number): void /* steps sim per §2 loop rule */, step(n: number): void, pause(), resume(), finish(): SessionRecord, debugValues(): Record<string, number|string|boolean> }`. Both the shell and the headless runner use this.
- `runHeadless({ game, script, minutes, seed, simOpts? }) → { game, script, seed, simMinutes, wallMs, summary, stats, mixerCommands: TrainerCommand[], events, isOver }`.
- Tuning keys: games call `ctx.tuning.num('revsPerShot', …)`; the registry namespaces them as `<gameId>.revsPerShot`. Core uses `core.*` keys.

**Game scenarios (Agents F/G/H, `src/games/<id>/scenarios.ts`):**
```ts
export const scenarios: Array<{
  name: string; script: string; minutes: number; seed: number;
  simOpts?: Record<string, unknown>;          // passed as createSim's opts (e.g. { autopilot: true })
  assert(summary: Record<string, number | string>, stats: SessionRecord['stats'],
         run: { mixerCommands: TrainerCommand[]; isOver: boolean; events: Array<{ t: number } & GameEvent> }): string[]; // failures
}>;
```
`createSim(ctx, opts)` reads extra opts (e.g. `autopilot`) by casting `opts`. The `storm-ready` script reads `(sim.snapshot() as any).hooks?.storm`.

**Media (`src/media/index.ts`, SPEC §5.6):** music games set `requires: { media: ['pcm'] }` and read `ctx.media` (`timeline: MediaTimeline`, `positionS()`, `started()`); everything (beats, onsets, sections, intensity) is in program seconds. Optional `GameModule.mediaPreview(g, w, h, timeline, profile)` draws in the picker. Scenarios may set `media: { synth: { style: 'edm'|'rock'|'ambient'|'mixed', songs, seed, mix, short } }` (default: one synth EDM song). Sims never touch the player; the shell keeps them in sync.

**Progression (Agent D, `src/progression/index.ts` exports):** `ProfileStore`, `SessionStore`, `awardSession`, `defaultProfile(name?)`, `defaultSettings()`, `levelForXp(xp)`, `xpForLevel(L)`, `ACHIEVEMENTS`.

**Cosmetics (`src/cosmetics/`):** `catalog.ts` (`ITEMS`, every item and its source), `unlocks.ts` (pure: `riderLook(profile)`, `isUnlocked`, `equip`, `choosePick`, `pendingPicks`, `newUnlocks`, `nextReward`), `draw/rider.ts` `drawRider(g, look, crankRevs, wheelM, opts)`. Renderers may draw the rider; sims never import cosmetics.

**Live updates (`src/live/`, see its NOTES.md):** each push to main is a version the app can load mid-ride, game by game, in three layers: tuning (live), renderer/art (swapped live), sim/logic (next start; the rider can skip it). So: put balance numbers in `ctx.tuning` tunables (a default-only change ships as tuning, no restart), and bump `GameModule.snapshotFormat` whenever a snapshot change would break an older or newer renderer. A game's chunk carries its own copies of what it imports; only `src/audio/sfx` and `voices` are shared with the page (`src/live/shared.ts`); a change to code the shell runs too (core, ui, shared audio) is an app change that needs a reload.

**Devices (Agent A/B):** `src/devices/ftms/index.ts` → `FtmsTrainer` (static `connect()`), codecs; `src/devices/hr/index.ts` → `HeartRateMonitor` (static `connect()`); `src/devices/zwiftRide/index.ts` → `ZwiftRideController` (static `connect()`), `parseRideMessage`. Each `connect()` must be called from a user gesture. Each device also exposes `stats(): { packets: number; lastPacketAt: number }` for packets/s in the overlay.
