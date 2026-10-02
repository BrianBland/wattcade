# core (Agent C)
CONTRACT-REQUEST: none.

## API (`src/core/index.ts`)
makeRng, SimClock, TuningRegistry, BikeStateStore, ResistanceMixer, DataHub, GameLoop, FakeBike, FakeTrainer,
SCRIPTS, SessionRecorder, InputSource, TimelineInput/NullInput (local scripted input for headless),
createGameSession, runHeadless, testProfile (FTP 200 / maxHr 185 / 75 kg).

- `createGameSession` per CLAUDE.md. Extras: optional `tuningRegistry` opt; session also exposes `dataHub`, `clock`, `loop`, `commands` (all mixer commands sent).
  Fake bike is on when `fake` is truthy, or when `fake` is undefined and no `dataHub` was passed. `fake:false` = real devices only.
  `pause()` = loop pause + mixer.panic(true) (sends sim/0 immediately); `resume()` reverses.
- Step order: clock.advance -> input.beginTick -> fakeBike.tick -> bikeStore.tick -> mixer.tick -> sim.update -> recorder.tick.
- `frame()` timeScale is forced to 1x when `dataHub.hasRealDevices()` (trainer/hr/controller flags; fake does not count).
- DataHub: `new DataHub(store?)`, `.store`, `attachTrainer/attachHr/attachController(dev, {setControllerState})` (each returns detach),
  `sendCommand`, `capabilities()`, `onChange`, `disconnectAll`. A trainer with kind 'fake' sets `connected.fake`, not `.trainer`.
  Fake HR does not set `connected.hr`; effortZone 'auto' uses HR whenever fresh (<5 s).
- Mixer: rate limit (750 ms) uses sim time (== real time at 1x). `compute()` = unthrottled command; `debug()` = {activeEffects, chosenMode, lastCommand, lastResult, difficulty, gear, gearsEnabled, panic}.
  Mixer owns the gear (1..11, neutral 6) from pressed shift buttons when virtual gears are enabled; store.gear mirrors it.
  With no effects the mixer sends sim grade 0 (+gear offset).
- Zone boundaries (power, as fraction of FTP): <.55, <.76, <.91, <1.06, <1.21, <=1.5, >1.5.
- TuningRegistry: keys `<ns>.<key>`; `core.sprintFtp`, `core.gearStepPct` use ns `core`. localStorage persistence only when `window` exists
  (override with `{storage}`); `set/reset/list/get/onChange`.
- Scripts: `{name, cadence(t), powerFtp?(t, {hooks, seed}), usesHooks?, input?}`; power is FTP fraction; script power overrides the trainer model in sim/resistance modes, but ERG always wins (2 s time constant toward target; cadence 0 -> 0 W).
  `storm-ready` reads `snapshot().hooks.storm`. `mash` is a stateless hash of (2 s slot, seed).
- FakeBike manual mode (no script): `fakeBike.manual = {cadence, power|null, hr|null}`; `useScript(name|null)`.

## runHeadless / scripts/sim.ts
`runHeadless({game, script, minutes, seed, simOpts?, tuning?})` stops early if `sim.isOver()` (simMinutes = actual).
`npm run sim -- --game X --script Y --minutes N --seed S [--autopilot]` prints one JSON line (full mixerCommands).
`npm run sim:all` loads `src/games/<id>/scenarios.ts` for each registry game (missing -> skipped, note on stderr), prints one JSON line per
scenario (mixerCommands/events as counts, plus ok/failures), exits 1 on failure. `runAll()` is exported for tests.

## Tests
`npx vitest run src/core` (zones, crank revs, sprints, mixer, TTL, ERG convergence, determinism, headless, tuning, loop).

## Gaps
No DataHub unit tests with real device mocks beyond fake; ControllerDevice adapter untested. No FIT export.
