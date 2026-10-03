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
- Before finishing: `npx tsc --noEmit -p .` and `npx vitest run <your folder>` green; write `<folder>/NOTES.md` (≤ 40 lines).
- **HUD insets (every renderer):** the shell HUD floats over the bottom of the render surface. Implement `setInsets()` and honor `insets.bottom` (also from `mount` ctx): lay out ALL foreground content (play focus, UI, panels, tickers, toasts, menus) in the height above it; draw backgrounds full-bleed. Never hard-code a HUD margin. Put pure layout math in a function with a unit test asserting nothing important lands below `H - insets.bottom` (see `hamster/render/layout.ts`). `src/games/insets.test.ts` enforces `setInsets` for every registered game.
- Tests: Vitest, `environment: node` by default; add `// @vitest-environment jsdom` at the top of a test file that needs the DOM.

Scripts: `npm run dev | dev:ipad | build | test | typecheck | sim | sim:all | deploy`.

## Integration seams (agreed APIs between parallel agents)
These let agents build in parallel. Implement your side exactly; code against the other side structurally (local interface types) if it doesn't exist yet.

**Input (Agent B, `src/input/index.ts` exports):**
- `class InputHub` — constructor `(opts?: { deadzone?: number; invertL?: boolean; invertR?: boolean })`; `applySettings(s: ProfileSettings)`; `beginTick(dt: Seconds): void` (computes edges, advances paddleIdleS); `state(): Readonly<InputState>`; `onSystem(cb: (a: SystemAction) => void): () => void`; `setControllerState(raw: ControllerRawState): void` (fed by core's DataHub); `attachKeyboard(target: EventTarget): () => void`; `attachGamepad(): () => void` (polls inside beginTick); `attachTouch(container: HTMLElement): () => void`; `setScript(s: ScriptedInput | null)`; `debugOpen: boolean` (when true, shifters emit difficulty/timeScale system hooks via `onDebugAdjust(cb: (k: 'difficulty' | 'timeScale', delta: number) => void)`); `raw(): ControllerRawState` for the overlay. Nothing touches `window` unless an `attach*` is called (must run in Node).
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

**Progression (Agent D, `src/progression/index.ts` exports):** `ProfileStore`, `SessionStore`, `awardSession`, `defaultProfile(name?)`, `defaultSettings()`, `levelForXp(xp)`, `xpForLevel(L)`, `ACHIEVEMENTS`.

**Devices (Agent A/B):** `src/devices/ftms/index.ts` → `FtmsTrainer` (static `connect()`), codecs; `src/devices/hr/index.ts` → `HeartRateMonitor` (static `connect()`); `src/devices/zwiftRide/index.ts` → `ZwiftRideController` (static `connect()`), `parseRideMessage`. Each `connect()` must be called from a user gesture. Each device also exposes `stats(): { packets: number; lastPacketAt: number }` for packets/s in the overlay.
