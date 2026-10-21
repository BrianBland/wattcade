# wattcade — Build Spec (v0 demo)

Current Squadron rebuild: [Sprocket Squadron](SPROCKET_SQUADRON.md) supersedes the old trigger-driven Sprocket/Crank Fighter design. Shared music work is tracked in issues #64–#66.

A web-based "bike arcade" for a **Zwift Ride V1 frame + Wahoo KICKR CORE + Garmin watch (HR broadcast)**, played on an **iPad in the Bluefy browser** (Web Bluetooth). Three minimal-but-working games that prove the bike↔game mechanics, plus the foundation that makes new games easy to vibecode.

This file is both the product spec and the execution plan for Claude Code. **Orchestrator: read §0–§4 fully, then execute §9. Subagents: read §0–§4 and only your own section in §5–§7.**

---

## §0 Ground rules (all agents)

- **Stack:** TypeScript (strict), Vite, Preact (shell/UI/overlays), Three.js (3D games), Canvas 2D (2D games), Vitest, `tsx` for scripts. No game engine. No other runtime deps without a reason written in your folder's `NOTES.md`.
- **Pre-installed deps (Phase 0):** `preact @preact/preset-vite three @types/three idb-keyval` · dev: `typescript vite vitest tsx @types/web-bluetooth fake-indexeddb jsdom @types/node`.
- **Ownership:** each subagent writes **only inside its own folders** (listed in its section). The only shared file is `src/contracts.ts`, which the orchestrator owns; if you need a contract change, don't edit it — put a `CONTRACT-REQUEST:` entry at the top of your `NOTES.md` and work around it with a local type.
- **Sim/render split is mandatory:** game logic (`sim/`) must never import DOM APIs, `three`, Preact, or anything under `render/`. The headless runner imports sims in Node. Renderers are loaded with dynamic `import()`.
- **Determinism:** sims use only `ctx.rng()` (seeded) and `ctx.clock` for randomness and time. Never use `Math.random()`, `Date.now()`, or `performance.now()` inside a sim.
- **Tunables, not constants:** every gameplay number that ties the bike to the game (rates, thresholds, grades, multipliers) is registered through `ctx.tuning` so it shows up as a live slider in the debug overlay.
- **Tests:** each agent adds Vitest tests next to its code and runs `npx tsc --noEmit -p .` plus `npx vitest run <your folder>` until both are green before finishing.
- **Handoff:** each agent finishes by writing `<folder>/NOTES.md`, at most 40 lines: public API, how to test, known gaps, CONTRACT-REQUESTs. The orchestrator integrates from `NOTES.md` files and test output, not by reading all the source.
- **Licensing:** the reference projects below are GPL-3.0. Implement from the protocol facts written in this spec; **do not copy code** from them.
- **Bluetooth is untestable in CI.** Put all byte parsing and encoding in pure functions, with unit tests built from the test vectors in this spec. Keep the thin Web Bluetooth glue separate from them.

## §1 Hardware and protocol facts (source of truth)

**Target runtime:** Bluefy on iPadOS. It supports `navigator.bluetooth.requestDevice` and requires HTTPS. Feature-detect `getDevices()` to restore a browser-local saved setup automatically before player selection. Grant persistence on Bluefy needs hardware verification; retain manual selection as a fallback. Each `requestDevice` call needs its own user tap. Desktop Chrome must also work (used for development). Assume three BLE devices are connected at the same time.

### 1.1 KICKR CORE — FTMS (Fitness Machine Service)

- `requestDevice({ filters: [{ services: [0x1826] }], optionalServices: [0x1818, 0x180a] })`
- Characteristics:
  - `0x2AD2` Indoor Bike Data (notify)
  - `0x2AD9` Control Point (write + indicate)
  - `0x2ADA` Machine Status (notify)
  - `0x2ACC` Feature (read)
  - `0x2AD6` Supported Resistance Level Range (read: sint16 min, sint16 max, uint16 increment; resolution 0.1)
  - `0x2AD8` Supported Power Range (read)
- **Indoor Bike Data parsing** (little-endian). Starts with a uint16 flags field; the fields below follow in order, each present only if its flag bit says so:
  - bit0 = "More Data". **Inverted:** when the bit is **0**, Instantaneous Speed (uint16, 0.01 km/h) is present.
  - bit1: avg speed (uint16)
  - bit2: instantaneous cadence (uint16, **0.5 rpm**)
  - bit3: avg cadence (uint16)
  - bit4: total distance (uint24, m)
  - bit5: resistance level (sint16)
  - bit6: instantaneous power (sint16, W)
  - bit7: avg power (sint16)
  - bit8: expended energy (uint16 total kcal, uint16 per hour, uint8 per minute)
  - bit9: HR (uint8)
  - bit10: MET (uint8, 0.1)
  - bit11: elapsed time (uint16, s)
  - bit12: remaining time (uint16, s)

  A reading may be split across several notifications, so merge the fields you receive into the latest sample.
- **Control Point opcodes** (write, then wait for an indication `0x80, <requestOpcode>, <result>`; result `0x01` means success, `0x02` not supported, `0x03` invalid parameter, `0x04` failed, `0x05` control not permitted):
  - `0x00` Request Control. Must succeed first. On a `0x05` result, request control again.
  - `0x07` Start/Resume. Send it after control is granted.
  - `0x05` Set Target Power: sint16 watts. This is ERG mode.
  - `0x04` Set Target Resistance Level: spec says **uint8, resolution 0.1**; some firmware expects sint16. Send the uint8 form, and if the result isn't `0x01`, retry once as sint16 and remember which form worked. Clamp to the range from `0x2AD6`. Expose it as 0–100 % of that range.
  - `0x11` Set Indoor Bike Simulation: sint16 wind speed (0.001 m/s), sint16 grade (0.01 %), uint8 Crr (0.0001), uint8 Cw (0.01 kg/m).
    - **Test vector:** grade 5.25 %, wind 0, Crr 0.004, Cw 0.51 → `[0x11, 0x00,0x00, 0x0D,0x02, 0x28, 0x33]`.
  - Serialize writes: allow one outstanding control-point write at a time and queue the rest, coalescing queued ones so only the latest command of each type is sent.
- The trainer may be controlled by only one app at a time. The UI must tell the user to **close Zwift first**. The KICKR CORE accepts 3 concurrent BLE connections, so the Garmin watch can stay paired to it as a power sensor.
- The Ride uses a single-speed Zwift Cog, so there are no physical gears. **Virtual gears** are implemented in the core resistance mixer (§5.3).

### 1.2 Heart rate — Garmin "Broadcast Heart Rate" (standard Heart Rate Service)

- `requestDevice({ filters: [{ services: [0x180d] }] })`
- Characteristic `0x2A37` (notify). flags bit0: 0 means HR is uint8, 1 means uint16. Other fields can be ignored.
- **Test vectors:** `[0x00, 0x8C]` → 140 bpm; `[0x01, 0x2C, 0x01]` → 300 (as parsed).

### 1.3 Zwift Ride V1 controllers (proprietary, unencrypted on firmware ≤ 1.2.x)

- The controller advertises as a single device named "Zwift Ride" (sometimes "Zwift SF2") with service `0xFC82`.
  - `requestDevice({ filters: [{ namePrefix: 'Zwift' }], optionalServices: [0xfc82, '00000001-19ca-4651-86e5-fa29dcdd09d1', 0x180a, 0x180f] })`
- Inside service `0xFC82`:
  - **Async** `00000002-19ca-4651-86e5-fa29dcdd09d1` (notify): button data
  - **Sync RX** `00000003-19ca-4651-86e5-fa29dcdd09d1` (write without response): commands
  - **Sync TX** `00000004-19ca-4651-86e5-fa29dcdd09d1` (indicate): replies

  If exact UUID lookup fails, fall back to the first notify characteristic and the first write characteristic in that service. Log what was chosen.
- **Handshake:** subscribe to Async and Sync TX, then write ASCII `"RideOn"` (`52 69 64 65 4F 6E`) to Sync RX. The device replies starting with `RideOn`. No keepalive is required.
- Read firmware from Device Information `0x180A`/`0x2A26` and battery from `0x180F`/`0x2A19`. **If firmware ≥ 1.3.0, show a warning** ("Ride V2 firmware is locked to Zwift"). Also show a reminder not to update the controller firmware through Zwift.
- **Message format:** byte 0 is the opcode, and the rest is a protobuf message.
  - Opcode **`0x23`** = controller status.
    - Protobuf field 1 (tag `0x08`, varint) = **ButtonMap**. **A bit is 0 when that button is pressed.**
    - Field 3 (tag `0x1A`, repeated, length-delimited) = analog paddle, a nested message: field 1 = location (varint; 0 = left paddle, 1 = right; ignore 2 and 3), field 2 = value (**sint32 zig-zag**, range −100..100).
    - Skip unknown fields safely.
  - Opcode `0x19` = battery. Opcode `0x15` = empty. Ignore any other opcode, and log it in debug mode.
- **ButtonMap bits:**

  | Button | Bit | Button | Bit |
  |---|---|---|---|
  | left | `0x1` | up | `0x2` |
  | right | `0x4` | down | `0x8` |
  | A | `0x10` | B | `0x20` |
  | Y | `0x40` | Z | `0x80` |
  | shiftUpL | `0x100` | shiftDnL | `0x200` |
  | powerUpL | `0x400` | onOffL | `0x800` |
  | shiftUpR | `0x1000` | shiftDnR | `0x2000` |
  | powerUpR | `0x4000` | onOffR | `0x8000` |

- **Polarity safety net:** if the first 3 messages after connecting show more than 8 buttons "pressed", flip the polarity (treat 1 as pressed) and log it.
- **Test vectors** (synthetic, derived from the format above):
  - All released: `[0x23, 0x08, 0xFF, 0xFF, 0x03]`
  - A held: `[0x23, 0x08, 0xEF, 0xFF, 0x03]`
  - Left paddle at −100 while all buttons are released: `[0x23, 0x08, 0xFF, 0xFF, 0x03, 0x1A, 0x05, 0x08, 0x00, 0x10, 0xC7, 0x01]`
  - Right paddle at +50: nested `08 01 10 64`, so the message ends `… 0x1A, 0x04, 0x08, 0x01, 0x10, 0x64`
- The paddles' real rest values and travel direction are **unknown**. Everything must be configurable and visible in the debug overlay, and the probe page (§5.2) exists to capture real bytes.

### 1.4 General Bluetooth behavior

- On `gattserverdisconnected`, auto-reconnect using the same `BluetoothDevice` object with backoff (1, 2, 4, 8, max 15 s). Show the status in the UI and don't lose game state.
- All device classes emit plain data events. None of them know about games.

## §2 Architecture

```
src/
  contracts.ts            ← orchestrator (shared types; see §3)
  devices/ftms/           ← Agent A: KICKR FTMS
  devices/hr/             ← Agent A: HR
  devices/zwiftRide/      ← Agent B: Ride controller
  input/                  ← Agent B: unified input (Ride + keyboard + gamepad + touch), system combos
  probe/ + probe.html     ← Agent B: raw BLE probe/logger page
  core/                   ← Agent C: BikeStateStore, zones, crank counter, sprint detector,
                             ResistanceMixer, virtual gears, difficulty, Clock/loop, FakeBike,
                             FakeTrainer, scripts, SessionRecorder, headless runner, Tuning registry
  progression/            ← Agent D: profiles (IndexedDB), XP/levels, achievements, per-game save data
  shell/                  ← Agent E: Preact app: screens, game host, pause, summary
  debug/                  ← Agent E: debug overlay + tuning panel + fake-bike controls
  games/registry.ts       ← orchestrator (imports the three modules)
  games/dungeon/          ← Agent F   (sim/, render/, index.ts, test/)
  games/lighthouse/       ← Agent G
  games/towerdefense/     ← Agent H
scripts/sim.ts            ← Agent C: `npm run sim -- --game X --script Y --minutes N --seed S`
```

**Data flow:** devices (or the fake devices) → `core.DataHub` → `BikeStateStore` (ticked at the fixed sim rate) → `GameContext.bike()`. Inputs → `input.InputHub` → `GameContext.input()` (with pressed/released edges computed per sim tick). The game writes `ResistanceEffect`s → `ResistanceMixer` → a `TrainerCommand` (rate-limited) → `TrainerDevice.apply()`.

**Loop:** a fixed timestep of `1/30 s` for simulation. The shell runs `steps = realDt × timeScale / fixedDt` per animation frame (capped at 3000), then renders once. `timeScale` is adjustable from 1× to 100× in fake mode only; it's locked to 1× when real devices are connected. The headless runner steps as fast as possible with no renderer.

## §3 `src/contracts.ts`

See `src/contracts.ts` (written verbatim from the original spec; the orchestrator owns it).

## §3.1 Shared behavior every game can rely on

- **Resistance mixer** (core): the highest-priority mode wins. Effects in the same mode combine: sim grades add, ERG takes the max target, resistance levels add. Then:
  - **Difficulty knob:** scales positive grade, ERG watts, and resistance level.
  - **Virtual gears** (sim mode only, when enabled): add `(gear − 6) × tuning 'core.gearStepPct'` (default 0.8 %) to the grade.
  - **Clamps:** grade to [−5, maxGradePct]; ERG to [60 W, ergCap × FTP]; level to [0, 100].
  - **Rate limits:** send a command only when it changes by at least 0.2 % grade, 5 W, or 2 level, and at most once every 750 ms of real time.
  - **Panic/pause:** overrides everything with `{mode:'sim', gradePct:0}` until resumed.
  - **ERG low-cadence relief** ("spiral of death" guard): at a fixed target, slower cranks mean more torque. While in ERG and `cadence3s < core.ergReliefRpm` (55), the target drops toward `core.ergReliefFloor` (0.6) × target at 0.5/s. Once cadence is back above the threshold + 10 rpm, it ramps back to full over `core.ergReliefRecoverS` (8 s). Exposed as `ergRelief` in the mixer debug.
  - For the debug overlay, the mixer exposes `activeEffects`, `chosenMode`, `lastCommand`, and `lastResult`.
- **Short-effort rule (zone targets):** HR lags 30–60 s, so any zone requirement shorter than ~2 min (sprints, surges, storms, shrines, golden hamsters) is judged on `min(5, powerZone)`, and the game marks its `GameHud.targetZone` with `source: 'power'`. The shell HUD then shows the power scale and the floor watts for that target. Long holds (Z2 grinds) keep using `effortZone`, which follows the profile's zone source.
- **Cadence targets:** a game can set `GameHud.targetCadence` (`{ min, max?, label? }`, rpm on `cadence3s`). The HUD shows an rpm readout with an in-band/low/high chip. Use these for drills that ask for leg speed rather than watts (e.g. "spin 95+ rpm in an easy gear").
- **System input combos** (input layer; they are *not* passed to games):
  - Both powerUp buttons tapped together → `pause`
  - Both powerUp buttons held for 1 s → `toggleDebug`
  - Keyboard: `Esc` → pause, `` ` `` → toggleDebug, `0` → panic
  - Touch: triple-tap the top-left 60×60 px corner → toggleDebug
  - While the debug overlay is open, the left shifters change difficulty ±0.05 and the right shifters change timeScale (fake mode only).
- **Keyboard mapping:** arrows = D-pad; `L`=A, `K`=B, `I`=Y, `J`=Z (same diamond as the Ride's right hood); `Q`/`A` = shiftUpL/shiftDnL; `P`/`;` = shiftUpR/shiftDnR; `1`/`2` = powerUpL/powerUpR; `N`/`M` = left paddle −/+; `,`/`.` = right paddle −/+. Fake bike: `W`/`S` = cadence ±5, `E`/`D` = power ±10, `R`/`F` = HR ±5.
- **Gamepad API** (standard mapping): d-pad buttons 12–15; face buttons 1/0/3/2 (right/bottom/top/left) → A/B/Y/Z; LB/RB → shiftUp L/R; LT/RT → shiftDn L/R; Select/Start → powerUp L/R; left and right stick x → paddleL/paddleR.

## §4 Definition of done (demo)

1. `npm run dev` works on desktop Chrome with **Fake bike** mode, and all three games are playable with the keyboard.
2. `npm test` is green. `npm run typecheck` is clean. `npm run build` succeeds.
3. `npm run sim:all` runs every game headless under all of its scenario scripts at max speed and prints one JSON line per run. Each game's scenario assertions pass (defined in its section).
4. On the iPad with Bluefy over HTTPS, the three devices connect from the Connect screen. The debug overlay then shows live raw trainer data, paddle bars, the button grid, and the mixer's commands and results.
5. Profiles, XP, levels, and achievements persist across reloads, and the session summary shows XP gained.
6. `npm run deploy` (Cloudflare Pages via wrangler) is ready. The human runs it and sets up the domain.
7. `HARDWARE_TEST.md` gives a 15-minute manual checklist for the first real ride.

---

## §5 Foundation agents (Wave 1)

### §5.1 Agent A — Trainer + HR devices · owns `src/devices/ftms/`, `src/devices/hr/`

- Pure codecs:
  - `parseIndoorBikeData(DataView) → DeviceSample & extras`
  - `encodeSetSim`, `encodeSetPower`, `encodeSetResistance(u8|s16)`, `encodeRequestControl`, `encodeStart`
  - `parseControlPointResponse`
  - `parseResistanceRange`, `parsePowerRange`
  - `parseHeartRate`
- `FtmsTrainer implements TrainerDevice`:
  - static `connect()`: requestDevice, then request control, then start, then read capabilities
  - a serialized write queue that coalesces per opcode
  - regain control on a `0x05` result
  - reconnect with backoff (§1.4)
  - per-packet timestamps
- `HeartRateMonitor implements HrDevice`, with the same reconnect behavior.
- Tests: every flags combination that matters (speed-only; speed + cadence + power; More-Data-split packets; with HR), the sim test vector from §1.1, both resistance encodings, response parsing, and the HR vectors.

### §5.2 Agent B — Controller + input + probe · owns `src/devices/zwiftRide/`, `src/input/`, `src/probe/`, `probe.html`

- Pure codec: `parseRideMessage(Uint8Array) → { kind:'status', buttonMapRaw, paddles:{0?:n,1?:n} } | {kind:'battery',pct} | {kind:'other',opcode}`, plus polarity handling. Tests use the §1.3 vectors, including malformed and truncated input.
- `ZwiftRideController implements ControllerDevice`: connect, find characteristics (with fallback), handshake, read firmware/battery, ≥1.3 warning, reconnect.
- `InputHub`:
  - merges the Ride, keyboard, gamepad (polled each frame), touch (an on-screen D-pad/ABYZ overlay, hidden by default), and scripted input
  - applies deadzone/invert from profile settings
  - computes per-tick edges via `beginTick()` (called by the core loop before each sim step), so a press that lasts shorter than a tick is never missed
  - tracks `paddleIdleS`
  - detects system combos and exposes `onSystem(cb)`
  - `ScriptedInput` for tests: a timeline of `{t, press|release|paddle}`
- **Probe page** (`/probe.html`, standalone, no game code): buttons for "Pick any device", "Pick Zwift Ride", "Pick FTMS", and "Pick HR". It lists every service and characteristic with its properties, reads all readable values, subscribes to everything notifiable, and shows a timestamped hex log with Copy and Download buttons. For the Ride it also has a "Send RideOn" button and live parsed button/paddle output. This page is how we capture real bytes.

### §5.3 Agent C — Core engine · owns `src/core/`, `scripts/sim.ts`

- `DataHub`: attach/detach TrainerDevice, HrDevice, and ControllerDevice (feeds InputHub via an adapter); tracks connection flags and packet age.
- `BikeStateStore.tick(dt, profile)`: rolling averages, zones, crank-rev integration, sprint detection and count, kJ, active seconds, effort zone (with the `auto` source rule).
- `ResistanceMixer implements ResistanceController`: everything in §3.1, including TTL expiry in sim time, virtual gears driven by shifter presses from InputHub when enabled, the difficulty knob (`setDifficulty`), panic/pause, and a debug snapshot.
- `TuningRegistry implements Tuning`: namespaced per game; values overridable at runtime; persisted per profile and game in localStorage (a no-op in Node); `list()` for the overlay.
- `GameLoop`: fixed step with accumulator and timeScale; order per step is `input.beginTick → bikeStore.tick → mixer.tick → sim.update`. Provides `pause()`/`resume()`.
- `FakeBike` + `FakeTrainer implements TrainerDevice` (kind 'fake'):
  - FakeBike produces cadence, and optionally power, from a manual controller (sliders/keys) or a **script**.
  - FakeTrainer turns commands into power:
    - ERG: power approaches the target with a 2 s time constant.
    - sim: physics with mass = profile weight + 9 kg, Crr 0.004, CdA 0.3, and speed derived from cadence × virtual gear ratio.
    - resistance: `power = k × cadence × (1 + level/40)`.
  - If a script specifies power directly, that overrides the model.
  - Fake HR follows power with a 30 s lag: `hr = 60 + (maxHr − 60) × clamp(power/FTP × 0.75, 0, 1)`, plus noise from the seeded rng.
- **Built-in scripts** (all cadence 85–95 unless noted):
  - `idle` (0 W, 0 rpm)
  - `z2` (0.65 FTP steady)
  - `z2-drift` (wanders between 0.5 and 0.8 FTP)
  - `sprints` (0.6 FTP with 15 s at 1.5 FTP every 2 min)
  - `intervals` (4 × (3 min at 1.05 FTP, 2 min at 0.55))
  - `storm-ready` (0.65 FTP; jumps to 0.95 FTP whenever the scenario hook signals a storm)
  - `mash` (random 0.4–1.6 FTP)
  - cadence-led scripts for ERG games: `grind` (0.7 FTP at ~65 rpm), `spin` (0.7 FTP at ~105 rpm), and `cadence-follow` (rpm follows `snapshot().hooks.cadence`, default 90). `Script.cadence(t, env)` receives the hooks.
  - Scripts may read a `hooks` object the game exposes via `snapshot()` so they can react (for example, to storms), and can carry a paired `ScriptedInput` timeline.
- `SessionRecorder`: 1 Hz samples, events, stats → `SessionRecord`. Saving is done by progression.
- **Headless runner** `scripts/sim.ts` (`npm run sim`, `npm run sim:all`):
  - builds a GameContext with FakeBike, FakeTrainer, ScriptedInput, and a default test profile (FTP 200, maxHr 185, 75 kg)
  - runs `N` sim-minutes as fast as possible, rendering nothing
  - prints `{game, script, seed, simMinutes, wallMs, summary, stats, mixerCommands}` as one JSON line
  - `sim:all` runs every `(game, scenario)` pair declared by each game in `games/<id>/scenarios.ts` (format: `{name, script, minutes, seed, assert(summary, stats) → string[] /*failures*/}`) and exits non-zero on any failure
  - also export `runHeadless()` for Vitest
- Tests: zone boundaries, crank integration (90 rpm × 60 s = 90 revs ±0.5), sprint detection, the mixer's combine/clamp/rate-limit/panic/gear logic, TTL, FakeTrainer ERG convergence, and determinism (same seed → identical summary).

### §5.4 Agent D — Progression · owns `src/progression/`

- `ProfileStore` (idb-keyval): list/create/update/delete, `lastProfileId`, and JSON export/import (a backup, since Bluefy storage can be cleared). Default settings as in §3.
- `SessionStore`: save a `SessionRecord`; keep the last 200 per profile.
- `awardSession(profile, record) → { profile', xpGained, levelUps, newAchievements }`:
  - XP = `round(kJ) + 2 × activeMinutes + 1 × minutes in effortZone 2 + 5 × sprints` + achievement bonuses.
  - Level L requires cumulative `floor(400 × (L−1)^1.5)` XP (a 30-min zone 2 ride ≈ 330 XP).
  - Also updates `lifetime` and `lastPlayed`.
- **Achievements** (`AchievementDef` in contracts; ids are permanent, each has bonus XP):
  - Cross-game and fitness ones live in `progression/achievements.ts`; each game lists its own in `src/games/<id>/achievements.ts` (exported as `GameModule.achievements`, written with `progression/kit.ts`: `feat`, `tally`, `num`, `hasEvent`).
  - Two shapes: a **goal** on a number (`value(profile)`, or `count` accumulated per ride into `profile.counters` with `sum`/`max`/`bits`), shown with a progress bar; or a one-ride **feat** (`check(profile, record, earnedThisRide)`).
  - Kinds: variety (3/5/all games, 3 games in a week, 2 in a day), calendar (weekend, 3 days in a week, 4/12-week streaks from `profile.rideDays`, welcome back, night owl, early bird, New Year), lifetime totals (kJ, hours, rides, sprints, virtual km and sim-mode climbing from a power→speed model), one-ride fitness (30/60/90 min, an hour of Z2, 500 kJ, 20 min at 90+ rpm, 5 s at 2×FTP, variability ≤ 1.05), secrets (hidden until earned), and per game (floors, waves, sectors, eras, biomes, storms, songs…).
  - Game achievements only count rides of that game. Rules read `record.events` and `gameSummary`, so games only need to emit events and summary keys; `progression/scenarios.test.ts` runs real headless rides to keep those names honest.
- Tests use fake-indexeddb.

### §5.4b Cosmetics · `src/cosmetics/`

- **Cosmetic only.** Slots: bike, helmet/hat, jersey, paint (frame colour), pet, trail, ship (what you fly in Cadenza: Triad by default; Lancer and Manta from Cadenza achievements), title. Every item is in `catalog.ts` with one source: default, a level, an achievement, or a pick level.
- **Unlocks are derived, never stored:** defaults + level rewards up to `profile.level` + one item per earned achievement + picks. So catalogue changes apply to existing riders. Stored: `profile.cosmetics.loadout` (equipped id per slot; a missing or locked id falls back to the default) and `profile.cosmetics.picks` (level → chosen id).
- **Level track:** levels 2–50 each give one item. Every 5th level is a **pick**: choose one of three, and the other two come back in a later pick (after level 50, the passed-over items are offered three at a time every 5 levels). There's no shop or currency.
- **Every achievement grants exactly one item** (tested).
- **Pets** follow your effort. Runners trot ahead of the front wheel, with gait from distance travelled; below 0.6 m/s they sit and look back, and they ride in the cargo bike's box. Fliers hover behind your shoulder and flap faster the faster you go. **Trails** stream from behind the rear wheel (behind the Drive-In trailer when towing), scale with speed, and show nothing when stopped. Flames only roar near a sprint.
- **Drawing** (`draw/`, Canvas 2D, pure): `drawRider(g, look, crankRevs, wheelM, { t, speed, gear, trailer })` draws a side-on rider ~24 px tall at ground (0,0). Bikes set the hip, hands, crank and leg style (`pedal`, `run`, `dangle`), and the body adapts. The warm-up lobby, the profile picker, the arcade top bar, the profile editor, the Locker, reward picks and the summary all draw the same rider.
- **Shell:** the **Locker** (tabs per slot; locked tiles are silhouettes that preview in full colour when focused, with the unlock hint), the **reward pick** screen (after a summary when a pick is waiting, or from the Locker), "New gear" on the summary, the next reward on the profile card, and the title under the rider's name.

### §5.5 Agent E — Shell + debug overlay · owns `src/shell/`, `src/debug/`, `index.html`, `src/main.tsx`, `src/styles/`

- **Style:** an arcade-cabinet look (dark, neon accents, big type readable from the saddle about 1 m from an iPad). Everything navigable by Ride D-pad + A (select) / B (back), keyboard, and touch.
- **Screens:**
  - **Profile picker:** cards, "+ New", edit.
  - **Profile editor:** name, color swatches, FTP, max HR, weight, zone source, aim mode, paddle deadzone/invert, max grade; plus Backup export/import.
  - **Connect:** three big buttons (Trainer / Controller / Heart rate), each with a status, a "Fake bike" toggle, notes ("Close Zwift on this iPad first", "Enable Broadcast Heart Rate on your Garmin", "Record an Indoor Bike activity on your watch; it's your Garmin/Strava record for now"), and a firmware warning display.
  - **Arcade menu:** top bar (rider, level/XP, road, devices, achievements, switch rider, 📽) over one row of games: a looping carousel (wraps both ways) with the selection centred and enlarged (recorded clip of the real game from `public/cards/`, tags, blurb, progress line, time/kJ ridden, last played); the rest show a title and a still. Sorted by the rider's most recent plays, ties in registry order (most polished first). While the Drive-In is on, the row is replaced by its toggle alone.
  - **Game host:** full-screen container. Mounts the renderer from `loadRenderer()`, runs `GameLoop`, and keeps the screen awake with `navigator.wakeLock` if available.
  - **Pause:** Resume / Difficulty / Quit → summary. Pausing triggers mixer panic.
  - **Session summary:** duration, avg/max power, kJ, avg HR, a time-in-zone bar, sprints, game summary, XP gained with a level-up animation, new achievements.
  - **Achievements & stats:** grouped by game ("Everywhere" first), a "Closest goals" row, progress bars for goals, secrets shown as ???; the D-pad scrolls.
- **Debug overlay** (toggle via system action; remembered in localStorage; transparent; `pointer-events: none` except on its panels):
  - **Top-left, device panel:** raw power/cadence/speed/HR/resistance level, packets per second, last packet age, connection dots, controller firmware/battery.
  - **Top-right, derived panel:** power3s/10s, zones, ftpFraction, crankRevs, sprinting/sprintCount, gear, kJ.
  - **Bottom-left, controller panel:** live **paddle L/R bars** (raw −100..100 and processed −1..1), plus a lit **button grid** laid out like the Ride hoods.
  - **Bottom-right, mixer panel:** active effects, chosen mode, last command, last result code; **difficulty slider**; **panic** button; **timeScale** slider (fake only); fake-bike sliders and script picker; a "game" section with `ctx.debug` values.
  - **Collapsible tuning panel:** sliders/toggles generated from the `TuningRegistry`, with "reset to defaults".
  - All panels are small (monospace, 11–12 px) and readable over the game.
- Build the `GameContext` from core, progression, and input. On quit, save the SessionRecord and apply `awardSession`.
- Deploy scaffolding: add `wrangler` as a dev dependency. The `deploy` script is `vite build && wrangler pages deploy dist --project-name wattcade`. `dev:ipad` runs `vite --host` and prints a hint to use `cloudflared tunnel --url http://localhost:5173` for an HTTPS URL that Bluefy can open.

### §5.6 Media core (music + video for any game) · owns `src/media/`

Shared infrastructure for music games and the Drive-In: sources, analysis, a two-deck player with a queue, and one **program timeline** that games read. Source-agnostic: each source declares what it can do and games declare what they need.

- **Sources and capability flags** (`MediaSource`): `search(q)`, `browse?()`, `prepare(ref)`, `player()`. Each source has `caps: { pcm, video, pixels, rate: 'free'|'steps'|'none', pitchShift, mix }`.
  - `LocalSource` (phase 1): audio files picked from the iPad Files app (`<input type=file multiple>`, MP3/M4A/AAC/FLAC/WAV; Bandcamp downloads count). Blobs, metadata and analyses go in IndexedDB (separate databases, so listing never loads audio). All caps.
  - `SynthSource` (phase 1): seeded procedural songs (`edm`, `rock`, `ambient`, `album` styles), with known ground truth (beats, sections). Used by fake mode, headless scenarios and analysis tests.
  - `YouTubeSource` (phase 3): Data API v3 search plus the IFrame player. Caps `{ video, rate: 'steps' }` only. Used by the Drive-In (§6.6), never for analysis.
  - `JamendoSource` (phase 3, §5.7): Creative Commons catalogue search and streams. All caps except `pixels`/`video`; no offline storage.
- **Library:** our own minimal tag readers (ID3v2 `TIT2/TPE1/TALB/TRCK/TSRC/APIC`, MP4 `©nam/©ART/©alb/trkn/covr`, FLAC Vorbis comments plus `PICTURE`). Pure and tested with byte fixtures. Browse by Album / Artist / Song, with fuzzy search over title, artist and album. Each song keeps its file hash (SHA-256 of the bytes, the cache key), duration, ISRC if tagged, and a **palette** (5 colours, k-means over the cover art; a fallback derived from key/energy when there's no art).
- **Analysis** (`src/media/analysis/`, pure TS, no deps, runs in a Web Worker, deterministic, cached by hash plus `ANALYSIS_VERSION`). Input: mono PCM resampled to 22 050 Hz with `OfflineAudioContext`; the decoded copy is dropped afterwards.
  - STFT (own radix-2 FFT, 2048 window / 512 hop, Hann). Band energies low/mid/high (< 150 Hz, 150–2 k, > 2 k) plus a 10 Hz loudness/intensity curve (perceptual-ish weighting, normalised per song and smoothed).
  - **Onsets:** half-wave-rectified spectral flux per band, adaptive threshold (median + k·MAD), peak-picking with a minimum gap. Each onset is `{ t, band, strength }`.
  - **Tempo:** autocorrelation of the onset envelope with a log-Gaussian prior around 120 bpm. **Beats:** dynamic-programming beat tracking (Ellis 2007) with drift allowed. **Downbeats:** the bar phase (of 4) that maximises low-band onset energy on beat 1. **Phrases:** 8-bar groups, snapped to section changes.
  - **Key:** 12-bin chroma (mean) against the Krumhansl–Kessler profiles, giving key, mode and a Camelot code.
  - **Sections:** a self-similarity matrix on beat-synchronous chroma + MFCC-lite (16 mel bands, DCT), a Foote novelty curve, and peaks snapped to downbeats. Each segment is labelled by energy and trend: `intro | verse | build | drop | break | outro` (`build` = rising energy into a high-energy segment; `drop` = a high-energy segment right after a build or a novelty spike).
  - Output `SongAnalysis` (plain JSON, about 50–150 KB): `{ v, durationS, bpm, beats[], downbeats[], phrases[], onsets[], intensity[] @10Hz, bands[3][] @10Hz, sections[], key, palette, confidence: 'full' }`.
  - Quality aids: every analysis stage is unit-tested against `SynthSource` ground truth (tempo within ±1 bpm, beat F-measure ≥ 0.9, section boundaries within 1 bar). A **beat-grid nudge** in the preview (shift ± 10 ms, halve/double tempo) is stored per song.
  - Libraries considered (2026-10): Essentia.js is the most complete but AGPL-3.0, so it's excluded. Meyda (MIT, features only), @audio/beat and MMLL (MIT, beat tracking) and fft.js (MIT) aren't needed. Any of them may be added as a *dev* dependency to cross-check our results in tests.
- **Player (DJ-style decks):** songs are decoded to AudioBuffers (current + next only) and played by AudioBufferSourceNodes → 3-band EQ (low shelf / peaking / high shelf) → gain → master, all scheduled sample-accurately on the AudioContext clock from the plan. Tempo matching ramps `playbackRate` (pitch follows tempo like a turntable; no key lock), limited to ±8 %. Not `<audio>` elements: Safari is choppy at rate ≠ 1 when a media element is routed through Web Audio (WebKit bug 240405), and media-element timing is too loose for beat matching.
  - **Queue modes**, chosen in the picker and remembered per profile:
    - **Continuous:** album order, gapless: the next song is scheduled at the sample the previous one ends.
    - **Automix** (default): mix out at a phrase boundary in the last 25–90 s (prefer the outro / lowest-energy phrase); mix in at the incoming song's first phrase after its intro start. Beats are aligned and the incoming tempo is ramped to match, then eased back to native over 16 bars. A bass swap (EQ) runs over 8–16 bars. If the tempos differ by more than 8 %, or a song has no confident beat grid, it falls back to an echo-out plus quick crossfade. Optional "smart order" suggests the next song by Camelot compatibility and tempo.
    - **Crossfade:** equal-power, N s (default 6), no beat sync.
  - `planMix(analyses[], mode, opts) → MixPlan` is **pure** (transition times, rate ramps, EQ automation) and drives the decks. Tested headlessly.
- **Program timeline:** `buildTimeline(plan, analyses) → MediaTimeline` maps every song's beats, onsets, intensity, bands and sections onto one program clock (applying rate ramps and overlaps; in a transition the incoming song's events win after the bass swap). It adds `songs[]: { t0, t1, title, artist, bpm, key, palette }` and `confidence: 'full' | 'metadata'`. **Games only ever see the timeline.**
- **Clock:** the program position is the master clock. While a media session runs, the shell nudges the loop's `timeScale` within ±2 % (a phase-locked loop on `deck.currentTime` versus sim time) so the sim tracks the audio. A stall (buffering) holds the sim. Pause pauses the decks. A per-device **output latency offset** (tap-along calibration in Settings) is added. Headless runs use the sim clock directly, so sims stay deterministic.
- **Picker and queue UI** (`src/shell/media/`, Preact, shell UI kit, D-pad navigable; opened by the shell for any game with `requires.media`). `/media-lab.html` (Music Lab) runs the picker and player without a game, with a sync readout and tap-along latency calibration:
  - Library browse/search; song rows show duration, bpm, key and a difficulty/effort chip once analysed (analysis runs in the background as songs are added, with a progress bar).
  - **Preview pane:** cover and palette, a spectrogram/intensity strip with section colours, a simplified track side-profile from the game (`GameModule.mediaPreview?`), and an effort estimate (time per zone, kJ, estimated TSS at the rider's FTP). A 20 s audio preview starts at the most intense section.
  - **Queue panel:** up next, reorder, remove, add a whole album or "all by artist", the mode switch (Continuous / Automix / Crossfade), total length, and a whole-queue intensity strip.
- **Contract additions (approved with this spec):** `GameModule.requires.media?: Array<keyof MediaCaps>`; optional `GameModule.mediaPreview?(timeline, w, h, g: CanvasRenderingContext2D)`; `GameContext.media?: { timeline: MediaTimeline; positionS(): Seconds }`; `createGameSession` / `runHeadless` take `media?: { timeline } | { synth: { style, songs, seed, mix } }`; scenario entries may set `media`. `MediaTimeline` and `MediaCaps` live in `contracts.ts`.
- **Tests:** analysis versus synth ground truth, tag-parser fixtures, `planMix` (phrase alignment, rate limits, fallbacks), `buildTimeline` (monotonic, no gaps in continuous mode, events within a transition), and the clock PLL (converges, bounded).

### §5.7 Creative Commons catalogue (Jamendo) · owns `src/media/jamendo/`

Search-anything music on top of local files: Jamendo's CC catalogue (about 600 k tracks), fully analysable because the streams are plain MP3.

- **API:** `https://api.jamendo.com/v3.0/` with a `client_id` (register at devportal.jamendo.com; it's a public identifier, put it in `.env` as `VITE_JAMENDO_CLIENT_ID`). Responses send `Access-Control-Allow-Origin: *` (verified 2026-10-04). `tracks/` with `search`, `fuzzytags`, `speed`, `vocalinstrumental`, `order`, `limit ≤ 200`, `include=musicinfo` (tags, bpm-ish speed); `albums/tracks`, `playlists/tracks` and `artists/tracks` give whole sets for the queue.
- **Audio:** `audio` (stream) with `audioformat=mp32` (VBR) for both playback and analysis. Before relying on it, confirm the stream host also sends CORS headers. If it doesn't, analysis falls back to `audiodownload` (only when `audiodownload_allowed`), and failing that the track is marked "play only".
- **Terms** (non-commercial use is free): show the artist and "via Jamendo" with a **link back to the track page** wherever a Jamendo track is shown (picker rows, preview, title cards, summary). Follow each track's CC licence; never claim ownership.
- **No offline library:** audio is fetched for playback and analysis and not stored beyond the browser's normal HTTP cache. We keep only the derived `SongAnalysis` and metadata (keyed `jamendo:<id>`), so a replay re-streams but skips analysis.
- **Picker:** a "Catalogue" tab next to "My music": a search box, genre/tag and speed chips, popular/new ordering, add to queue, add album/playlist. Analysis runs in the background on queued tracks (stream → decode → worker); a track can't start until its analysis is done (progress chip).
- **Tests:** response mapping from fixtures, URL building, attribution present in every rendered row (jsdom), cache keys.

**Deferred: Spotify.** It was researched on 2026-10-04 and parked because it's too limited to be worth it: DRM (no PCM), audio-analysis gone for new apps, Connect playback only (no automix), and the Developer Policy bans games. A mic-free "approximate map" route exists if we ever want it: ISRC → MusicBrainz → AcousticBrainz `beats_position`, LRCLIB synced lyrics for sections, Deezer preview/bpm (all CORS-open).

---

## §6 Game agents (Wave 1, in parallel with §5)

Games code **only** against `src/contracts.ts`. Each game folder contains:
- `index.ts` exporting `module: GameModule`
- `sim/` (pure logic)
- `render/` (DOM/Canvas/Three)
- `scenarios.ts` (headless scenarios per §5.3)
- `test/`
- `NOTES.md`

Until core lands, test the sims with a local minimal stub context. Keep it in `test/` and delete it once `runHeadless` exists; the orchestrator will tell you. The avatar/player/keeper/turret uses `profile.color`. Keep renderers minimal: simple shapes and a HUD built from DOM or canvas text. Stubbing sound is fine.

### §6.1 Agent F — "Crank Crawler" (dungeon, 2D Canvas, RotMG-lite) · owns `src/games/dungeon/`

- **World:** a seeded procedural dungeon of about 8 rooms on a grid, connected by corridors, ending in a boss room. Tiles: floor, wall, **swamp**, door. There are 3 enemy types:
  - **Chaser:** melee.
  - **Spitter:** fires slow radial bullet rings, RotMG-style; bullets are dodgeable.
  - **Brute:** tanky.

  Doors lock until the room is cleared.
- **Movement:** D-pad, 8 directions. Speed = `base × curve(cadence3s)`: 0 rpm → 0.35, 60 → 0.8, 90 → 1.0, 110+ → 1.15. All curve points are tunables.
- **Aiming:** `aimMode`.
  - **rotate** (default): paddleL rotates the aim CCW and paddleR rotates it CW, at a rate ∝ deflection.
  - **axes:** L = x, R = y.
  - **buttons:** A/B/Y/Z fire in 4 directions, with diagonals from combos.
  - **auto:** nearest enemy. Also used whenever `paddleIdleS` > 1.5.

  Draw an aim reticle.
- **Firing:** automatic, one shot every `tuning 'revsPerShot'` crank revs (default 0.5). Damage = `base × clamp(ftpFraction, 0.3, 2.5)`.
- **Survival:** HP regen only while effortZone == 2 (×2 out of combat). Hands-off: the hero AI moves, aims and fights. Rider actions on the right-hood diamond: A Strike, B Ward, Y Rally (only when a spin-up is called), Z Potion (3 per run, short cooldown). All four shifters are virtual gears.
- **Resistance** (sim mode, virtual gears enabled):
  - base effect `terrain` 1 %
  - on swamp tiles, `swamp` +4 %
  - HP < 40 %: `wounded` +2 %
  - **boss:** every 45 s the boss "shields up" for 20 s. During that window it takes damage only while `bike.sprinting` (×3 damage), and `boss-surge` +5 % is applied.
- **Events:** `kill`, `roomCleared`, `death`, `bossStart`, `bossDefeated`. Summary: roomsCleared, kills, deaths, damageDealt, bossDefeated (0/1), timeS.
- **Scenarios** (autopilot input: the sim exposes an optional `autopilot` flag in opts, used only by tests, that steers toward the nearest enemy/door with auto-aim):
  - `sprints`, 20 min → bossDefeated = 1
  - `idle`, 5 min → roomsCleared = 0 and no crash
  - `z2`, 20 min → deaths ≤ 3 and roomsCleared ≥ 4
  - a swamp test: the mixer grade is higher while on swamp tiles (unit test)

### §6.2 Agent G — "Keeper's Light" (Zone 2 idle, **3D** Three.js) · owns `src/games/lighthouse/`

- **Scene** (low-poly, iPad-friendly, pixelRatio ≤ 2):
  - a cliff with a lighthouse and a rotating beam
  - an animated sea (sine-displaced plane) whose wave height = `chop`
  - scene fog density = `fog`
  - ships as simple hulls
  - a shoreline town built from boxes and cones placed on predefined plots
  - day/night tint that follows session time
- **Core loop** (target zone = effortZone 2; band tunables):
  - **In zone:** the lamp brightens, fog falls, and chop settles.
  - **Below zone:** fog rises.
  - **Above zone** (outside storms): chop rises.
  - A ship spawns every ~40–60 s and sails in over ~60 s. It **docks** only if fog < 0.5 and chop < 0.5 when it arrives. Otherwise it drifts and is lost (or spills cargo if chop was the problem).
  - Docked ships give timber and coin.
  - Delight layer (cosmetic or coin-only): a keeper who lights the lamp at dusk, ships that flash back at the beam, coins flying into the counter, special visitor ships with gifts, bloom festivals, a decorate tab, seasons per ride pair, calm-weather moods, wildlife, and adaptive music that grows with the Steady Light streak.
  - Goals never conflict: during a storm, ships shelter offshore and wait it out. For a short calm-down after a storm (HR is still high), and while spinning up the clockwork, riding above zone doesn't churn the sea.
- **Build:** D-pad cycles the plots/buildings; A builds. Buildings:
  - cottage: +passive coin
  - pier: +docking tolerance
  - market: coin ×1.25
  - fog bell: fog rises slower
  - second lamp: needs 5 cottages; lamp is stronger

  **The town persists** via `ctx.save/load` and keeps growing across sessions.
- **Storms** (the Z3+ spikes): every 8–12 min (tunable). A 20 s warning (dark clouds, horn), then 60–90 s of storm. During a storm the requirement flips to **power zone ≥ 3** to keep the lamp alive, and a `storm` effect adds +3 % grade. A mid-storm "lightning surge" of 15 s asks for power zone ≥ 5 (bonus salvage if held). Storms are judged on power, not effortZone, because HR lags 30–60 s (see the short-effort rule below). Weathering a storm gives salvage plus a `stormWeathered` event. Expose `hooks.storm` (boolean) in the snapshot for the `storm-ready` script.
- **Resistance:** sim mode. A `swell` effect adds ±1 % as a sine wave with a 3-minute period. Virtual gears are enabled.
- **Summary:** minutesInZone, shipsDocked, shipsLost, buildingsBuilt, stormsWeathered, coin.
- **Scenarios:**
  - `z2`, 30 min → shipsDocked ≥ 15 and minutesInZone ≥ 25
  - `idle`, 10 min → shipsDocked = 0
  - `mash`, 20 min → shipsLost > shipsDocked × 0.3
  - `storm-ready`, 30 min → stormsWeathered ≥ 2
  - `z2`, 30 min (no storm response) → at least one storm failed (the lamp went out)

### §6.3 Agent H — "Dynamo Defense" (tower defense, 2D Canvas) · owns `src/games/towerdefense/`

- **Map:** a base at the bottom center, 3 lanes (left, center, right) converging on it, and a turret on the base. Enemies use a strong/neutral/resisted matrix: Gatling/Tesla vs blue/red/purple = ×1.5/×1/×0.5; Flamer/Mortar = ×0.5/×1.5/×1; Rail/Prism = ×1/×0.5/×1.5. All nine cells are tunable.
  - **Blue swarm minis:** many, low HP, crystalline bioluminescent chitin. Strong: Gatling; resisted: fire.
  - **Red brutes:** fuel-blooded; fire bursts their volatile bladders and can ignite nearby reds in a capped chain. Strong: Flamer; resisted: Rail.
  - **Purple armored:** slow, high HP, sealed plates. Strong: Rail; resisted: Gatling.
  - **Gold boss** every 5 waves: 2–3 HP-gated phases automatically change weapon and trainer mode after an announced countdown. Current phase colour uses the matrix. Telegraphed Exposed windows give ×2 damage, with a further ×1.5 for sprinting. Hold D-pad Up or the touch Sprint boost target during a Rail opening to raise its ERG target for a power sprint, preserving the mode; A stays construction. Keeps the Goliath art.

  The stream of minis is continuous; heavier enemies arrive in waves.
- **Weapons** (follow the announced brood or boss phase automatically; 1.5 s mount; each weapon owns a resistance effect, so all three trainer modes are exercised):
  - **Gatling** (blue): sim mode, effect `weapon` +1 % grade (low, spinny). Fires one bullet per `tuning 'gatlingRevsPerShot'` (default 0.25) crank revs.
  - **Flamethrower** (red): **resistance mode**, `levelPct` 35. A short cone with damage per second ∝ power3s.
  - **Railgun** (purple): **ERG mode**, `ftpFraction` 0.95. Charge accumulates while ftpFraction ≥ 0.75, one charge per ~20 s at 0.95 FTP (tunable). It **stores up to 3 charges** (tunable). **Z fires manually**: one charge per press, a piercing beam. Holding Z for 0.5 s dumps all stored charges in a spread (event `railFired` with `charges`).
- **Aim:** the turret always aims itself (no `aimMode`): the lead alien of the wave's colour on the most threatened lane. Paddles or D-pad left/right nudge it toward a lane for a few seconds (optional). All four shifters are virtual gears. Draw the aim line and a target marker.
- **Construction:** A accepts the lull's quoted build/upgrade work order, otherwise opens the workshop; D-pad Down also opens it. Touch pads/base open the same menu. Left/right chooses pad/base, up/down chooses an option, A confirms and B closes. Build, upgrade, sell, scrap-funded repair and the saved Auto-crew toggle are available to both inputs. Auto-crew defaults on and accepts one order per lull; a successful manual purchase consumes that order.
- **Combat actions:** B Overcharge (tower fire rate ×1.5 for 10 s), Y Slow field (most threatened lane moves 40% slower for 8 s), Z Rail. The two cooldowns refill faster with power-zone effort; a sprint edge finishes them without granting rail stock. All parameters are tunable. Combat actions are disabled in construction, and menu/pause/cancel discards held gestures.
- **Action display:** the shell owns action controls in its HUD band. With the controller legend on, its keys show cooldown/stock fills; with it off, compact blocks flank the ride stats in the same band. No separate game dock is reserved in either layout. The lull card retains the quoted construction cost; touch and controller share purchases and held-action cancellation. A bare renderer without a shell HUD retains the standalone dock.
- **Summary:** wavesSurvived, kills per element, weaponSeconds per weapon, railChargesFired, baseHpLeft.
- **Endless roguelite runs:** no reactor cores. When the base falls, bank every earned part and return to the Garage; `isOver()` remains false. Pause → **Return to Garage · bank parts** bails mid-wave (`runEnded{reason:'bail'|'fell', wave, wavesSurvived, parts}`). The Garage allows the same start-wave choice, starts after 30 pedalling seconds, and gives a 6-second breather before this countdown after returning. Its trainer effect is neutral. A new run resets towers, enemies, scrap, weapon/rail state and effort challenges; ride stats accumulate. Default base HP remains 100; an idle rider falls by wave 2.
- **Save:** v3 at `gameData.towerdefense`, with bank, upgrades, best wave, run count, auto-invest and lifetime totals (including `runsFallen`/`runsBailed`). `readSave` reads legacy and v2 saves without losing progress; core fields are retired. Parts bank as earned, never twice on fall, bail or dispose. `wavesSurvived` in the summary is the best single run; `wavesCleared`, `runs`, outcome counts and `partsEarned` accumulate across the ride.
- **Workout rhythm:** optional spin, grind-at-power and ERG hold calls follow Gatling, Flamer and Rail waves. Calls arrive every 2–3 waves with a countdown, after recovery ends; targets adapt to recent riding. Spin rewards Overclock, grind/hold reward EMP, with scrap bonuses. Bosses use their own Exposed sprint calls.
- **Scenarios** (`Auto-crew` develops towers; combat actions require explicit `actionBot`, independently of `autopilot`):
  - `sprints`, 20 min → wavesSurvived ≥ 8
  - `idle-falls`, 5 min → base falls by wave 2, remains in the Garage, ride stays open
  - `endless-restart`, 45 min Z2 → a fallen run returns to the Garage and auto-starts another run
  - `intervals`, 20 min → all three weapons used ≥ 60 s and mixer commands include all of sim, erg, and resistance
  - a unit test: charges cap at 3 and a hold-Z dump emits `railFired{charges:3}`

### §6.4 "Watershed" (ERG, **3D** Three.js, particle water + erosion) · owns `src/games/watershed/`

- **Fantasy:** you are the river. **ERG** sets the watts, which is *how much* water you are. **Cadence** is the input, and it decides *what kind* of water you are. At fixed power, low cadence is high torque: heavy, slow parcels that dig (gorges). High cadence is light, fast parcels that keep silt suspended and carry it to the sea (delta).
- **Requires ERG:** `GameModule.requires = { erg: true }` and the `erg` tag. The arcade blocks the game (with a toast and a card note) when the connected real trainer reports no ERG; the fake bike always has it.
- **Ride length:** a pre-game menu (`GameSim.inMenu`, shown before the countdown) offers 20/30/45/60 min; ◀▶ or shifters choose, A or a tap starts, it auto-starts after 25 s, and the last choice is saved. `makePlan(minutes)` builds the same story at any length: 1/2/3/4 flood cycles, still pools only from 30 min, blocks scaled to fit (0.5 min steps, at least 1 min). The trainer stays neutral in the menu. Autopilot or `simOpts.length` skip it.
- **Ride:** the 45 min ERG plan (`sim/plan.ts`, 16 blocks), each block tagged with a water-cycle `phase`:
  - **Evaporation** (4 min warm-up): lift vapor off the sea; sunlit patches drift along the coast and double the rate while your column is in one.
  - **Gathering cloud** (4 min): the vapor becomes a cloud that drifts inland up the valley; steer into cloudlets to grow it.
  - **Rain on the peaks** (3 min): the cloud rains real water parcels onto the mountains (`Emit.area`), so streams and lakes form on their own; a bigger cloud rains more. Cadence picks downpour vs drizzle. The **spring rises at the rain-weighted mean x** (`springRises` cue).
  - **River** blocks each carry a **job** (`sim/objectives.ts`, objective card + progress bar + done/missed banner, +250 score):
    - Carve the gorge: turn the **grist mill** (overshot wheel, below ridge 1's shallowest saddle: a routing puzzle; it needs heavy water, so grind).
    - Still pool: **beavers** dam a deep, gentle stretch (real terrain, so water must erode it). Flush to the sea: break the dam (fast water erodes it; spin, A = surge).
    - Flood surges: keep **Millbrook** (a village on a low terrace) dry; steer away and grind a deep channel.
    - Spills: spin the **sawmill** (undershot wheel on the natural route below ridge 2; it needs fast water), then water the **fields** (they grow while water runs beside them, ruin if drowned).
  - The **Salmon run**, and the **Delta** cool-down.
  - `sim/sky.ts` holds the sky phases; steering there is in the cloud's frame like the salmon run. Each block has an ERG FTP fraction (optionally ramped) and an optional cadence band, shown via `GameHud.targetCadence`. Holding the band adds `bandBonus` erosion. `planScale` shortens the plan for testing.
- **Sim** (`sim/terrain.ts`, `sim/water.ts`, deterministic):
  - A 96 × 144 heightfield valley runs from the spring basin, past two rock ridges (lakes pool behind them until they're cut), to the sea. It has an erodibility map, and freshly generated terrain is settled to its talus angles before the ride.
  - Up to 3000 particles. Each substep: splat volume into a depth grid → accelerate down the gradient of the free surface `max(h, sea) + pressure·depth` (a cheap SPH/shallow-water hybrid: water pools, spreads, fills lakes, spills) → drag (shallow water drags more) → Beyer-style erosion and deposition with a round brush. Capacity ∝ vol · speed · slope.
  - Parcel size scales drag, digging (heavy digs harder) and deposition (light keeps silt suspended). Erosion fades toward a bedrock depth. Thermal slumping keeps banks at the talus angle.
  - Near the particle cap, parcels get bigger instead of water being dropped.
- **Input:** cadence (style), power (flow, `power3s / FTP`). Every view looks up the valley, so screen left/right is across the valley in every phase:
  - ◀▶ held / paddles (analog) steer the vapor column, cloud, spring or school.
  - Left hood darts left, right hood darts right (up shifter = big, down = small).
  - Y toggles each phase's overview/follow view. A = the phase's boost on a 10 s cooldown (heat wave, inhale, cloudburst, surge, sprint).
- **Terrain:** a broad U valley with gentle, alternating cross-tilts; two rock ridges with 2–3 saddles of different depths; a lake basin between them; a side basin on the floodplain. Up to three **springs** rise where the rain fell (shares by rain); the largest is steerable.
- **Salmon run** (`sim/salmon.ts`, 6 min block near the end, a reward for the river you built):
  - When the run starts it rains across the head of the valley, and every carved channel head becomes a spring, so all your rivers fill.
  - The school's path is traced up real channels from the mouth (local depth maxima near the previous row); at a fork it takes the branch the rider steers toward ('Fork ahead!'). School size is 9 + up to 12 more for valley carved.
  - Runs get harder (predators more often, less eagle warning, hungrier). Bears charge in from the woods, swipe, and run off. A = sprint.
  - Cadence is swim speed. The rider steers a lane (−1..1) across the channel *in the fish's frame* (it faces upstream): the paddles (analog, `paddleR − paddleL`), ◀▶ or Z/A held, and shifter clicks dart the school (left hood left, right hood right). Followers trail with lag, so dodges need anticipation.
  - **Camera:** a chase cam low behind the lead salmon, facing upstream along the traced channel. Each run opens with an intro during which the sim holds the school still and spawns no predators. Run 1 (`introS` 9 s): a sweep from high above the spring down the river to the sea, then a swing around behind the leader. Later runs (`introNextS` 4 s): a swoop from overhead. The intro ends with a `salmonGo` cue and the controls popup. Between runs (`restartS` 5 s) the camera pulls back up to the overhead view.
  - **Bears** wait on a bank ahead and swipe their half of the channel when the school passes. **Eagles** mark the school's spot 3 s ahead, then dive. Fish in a strike zone are taken with `catchChance`; the leader is never taken.
  - **Falls:** where the water surface rises > `fallsRise` over 2 rows (a ridge you didn't cut down), the school stops until cadence ≥ `leapRpm` (95), then leaps. Carving the ridges makes the run easier.
  - Reaching the spring scores the survivors, and a new school starts from the sea while > 45 s of the block remain. Autopilot dodges for scenarios.
  - Cues: `salmonRun`, `salmonHome`, `salmonLeap`, `salmonStuck`, `predatorStrike` events; `predatorWarn` (renderer only).
- **Cues:** the snapshot carries the last 24 `{id, type, data}` cues; the renderer plays sounds and popups for ids it hasn't seen (and never replays history on mount).
- **Renderer:** a diorama with shadows, neutral tone mapping, a sky gradient, drifting clouds, a swelling sea, and instanced pines, broadleaf trees and boulders (organic noise-displaced shapes, baked colour gradients, shader wind sway). Trees tip over and vanish where the river erodes, floods or buries their ground; boulders get buried by silt.
  - **Terrain** is drawn at 2× the sim grid (Catmull-Rom heights, `render/upsample.ts`) with per-pixel procedural detail (mottling, speckle, strata on steep ground, a little normal noise).
  - **Water is one liquid surface** (`render/waterView.ts`). The particles stay the truth; the view merges them into depth (blur + time EMA), flow (volume-weighted particle velocity per cell) and foam (fast or falling water). A shader adds depth colour, soft alpha shorelines, flow-advected ripples, Fresnel sky, sun sparkles and flow-aligned foam streaks. Drops sink into deep water and the sea, and shrink in slow sheet flow; they only stand proud where water is fast (spring, rapids, falls).
  - **Fauna (cartoonish and colourful, googly eyes):** sockeye salmon in bright spawning colours with fins and a shader swim undulation, a chunky bear with a cream muzzle and pink ears, a bald eagle with a bright yellow beak and feet.
  - **Riverbank life** (`render/riverbank.ts`, render-only): grass tufts, flowers in six colours, reeds and cattails, pebbles and lily pads (some with lotus flowers). They sit on a fixed jittered grid of candidate spots, and each spot's habitat is re-checked ~3×/s from the water fields (near water, depth, flow speed, eroded/silted ground). Plants grow where the habitat is and wilt where it isn't, so the banks follow the river. Frogs sit on lily pads and lush banks, hop between them and croak; butterflies flutter over flowers.
  - **Chase cam** is a rail cam riding the traced channel downstream of the leader, lifted until its line of sight clears canyon walls; it pulls up to the overview between runs and as the school reaches the steep valley head.
  - **The world continues past the valley** (`render/outerLand.ts`): land continues into hills, peaks and forests; the sea runs to the horizon. A faint boundary fence brightens as the focus nears an edge and fades near the camera.
  - **Sky phases:** a living cloud (breathes, bobs, rolls into turns, eyes track cloudlets, blinks), an absorb bubble-up with sparkles and a floating +N, a sunlight shaft over the vapor column.
  - **Jobs** (`render/jobsLayer.ts`): cartoon mills whose wheels turn with the water passing them, Millbrook's houses (wobble when flooded), crop fields (bare → green → gold), the beaver dam and beavers, and a bouncing marker over the current objective. The terrain mesh follows the heightfield (colored for carved earth/canyon, deposited silt, rock strata, snow), a translucent river surface follows the blurred depth grid, and a sea slab sits over the coast. Each parcel is an exaggerated glossy instanced drop, stretched along its velocity and tinted muddy by its silt load. Drops are extrapolated along their velocity between 30 Hz sim ticks; the river surface is a 3×3 blur plus a time EMA of the depth grid; fast drops whiten into foam; drops shrink during the salmon run so the school stands out. The camera breathes slowly and follows the school closely during the run. The DOM HUD shows the block, the ride timeline, a heavy↔light meter with the cadence band (95+ while falls are ahead), gorge/delta stats or school/home/lost, and one-or-two-line instruction popups ("You are the river." at the start, "The salmon are running!" with the steering line, "Falls ahead! Spin past 95 rpm to leap", block changes).
- **Sound:** a filtered-noise river bed that follows cadence (low rumble when grinding, bright hiss when spinning) and flow, a surf bed, and one-shots for block changes, gorge milestones, salmon home, leaps, bear roars, eagle screeches and strikes.
- **Dev tools:** `npm run snap:watershed -- --script grind --minutes 15 --every 5` writes top-down PNGs (terrain + water + particles, plus a carved/deposited change map) to `out/watershed/`. `/dev/watershed.html?script=…&min=…&autopilot=1` runs the renderer on the fake bike without the shell.
- **Score and achievements:** the summary leads with a ride `score` (vapor, cloudlets, rainfall, valley carved, delta, salmon home and time in the cadence band all count). The best score is saved and shown on the arcade card. Achievements: The Water Cycle, Head in the Clouds, Grand Canyon, Delta Builder, Salmon Shepherd, No Fish Left Behind, Cadence Maestro, Miller, Dry Feet, Dam Buster, Breadbasket.
- **Scenarios:** `cadence-follow` 45 min with autopilot finishes all 16 blocks, keeps bandPct ≥ 85, gathers vapor and ≥ 15 cloudlets, rains, raises the spring, carves, builds a delta, reaches the sea, and brings ≥ 40 salmon home. `grind` 26 min → gorge ≥ 8. `spin` 26 min → silt to sea ≥ 100. `idle` → no water.
- **Geological events** (`sim/events.ts`): a seeded deck per ride (from the terrain seed; 25 % none / 50 % one / 25 % two of earthquake, landslide, volcano, plus a ~6 % meteor; `simOpts.events` forces it). Each warns (rumble + popup) a few seconds ahead, then edits the heightfield, applied to `h` and `h0` alike so it never counts as carving:
  - earthquake (beavers' still pool): the saddle the river uses lifts shut and another drops open.
  - landslide (first flood): a wall slumps into the river below ridge 2, damming it.
  - volcano (carve the gorge): a hard lava tongue seals ridge 1's easiest saddle (glows, cools to basalt; smoke column).
  - meteor (rare, a later job-free river block): fireball, flash, shake, and a scorched crater that becomes a lake.
  - Achievements: Extinction Event (see a meteor), Act of Nature (two events in a ride).
- **Later (not built):** generated story-mode levels (the event deck and seeds are the hooks: place events on purpose and validate difficulty headlessly); an ash cloud that shifts the rain. Then generated story-mode levels that mix phases with puzzles, validated headlessly in bulk for difficulty ordering.

### §6.5 "Cadenza" (music racer, **3D** Three.js, Audiosurf × Wipeout HD Zone) · owns `src/games/cadenza/`

*Formerly "Wattsurf" (id `wattsurf`); saves, ride history and tuning migrate via `core/renames.ts`. A cadenza is the soloist's showpiece flourish — and it has your cadence in it.*

- **Signature drop — the Launch:** every drop opens with a block-free 360° corkscrew; the camera punches in, a meter shows your effort against the sprint floor, and the roll is rated perfect / great / good / weak (bonus, streak burst, fireworks on perfect). Builds end in a climbing helix. A track-wall power gauge (fill → white target gate, red ceiling posts), chain flourishes (25/50/every 50: trail tiers, shockwave), and a recap card after every song.

- **Fantasy:** ride the song. The track is built from the music: calm passages roll, **builds climb**, **drops dive**. You steer an anti-grav craft across lanes to collect coloured blocks on the hits. The music sets the speed; your legs keep the shield up.
- **Requires** `media: ['pcm']` (local, Jamendo or synth). Tags `intervals`, `sprint`. Launching it opens the media picker (§5.6), then the game's pre-game menu (`inMenu`): **mode** Mono / Classic and **rhythm difficulty** Casual / Pro / Elite. ◀▶ or shifters choose, A starts, last choice saved. Power difficulty is the existing difficulty knob.
- **Track** (`sim/track.ts`, pure, from `MediaTimeline`):
  - Speed `v(t) = vBase · (1 + zoneStep·zone) · (0.8 + 0.4·intensity)`, smoothed. **Each section is a zone:** zone count +1, palette shift, speed step (Wipeout Zone).
  - Slope by section: `intro/verse` gentle rolling from intensity; `build` a rising climb (steeper with energy rise); `drop` a crest then a long dive; `break` flat; `outro` easing down. Curvature (gentle S-bends) comes from the mid-band trend. Lanes: 3 (Casual/Pro), 5 (Elite).
  - **Blocks** from onsets: kept by strength above a difficulty threshold, with a minimum spacing (Casual 0.35 s, Pro 0.22 s, Elite 0.14 s). Lane comes from band plus a seeded walk (lows centre, highs outer). Colour from strength × intensity on a 5-step ramp. **Greys** are placed in dense passages (Mono), more at higher difficulty. All seeded (`ctx.rng`).
- **Modes** (v1 ships Mono; Classic is roadmap phase 5):
  - **Mono:** collect colours (points scale with colour), dodge greys (shield hit −20 %, multiplier reset). Clean-section bonus.
  - **Classic:** collected blocks drop into a 3-column × 7-row grid; 3+ same-colour connected clusters clear for points (bigger clusters multiply). A full column is an **overfill**: the column dumps, a big penalty, and the craft flickers. No greys. **A = Shift** (recolour the next block to the colour you need). Charges are earned by holding power targets.
- **Effort (sim mode, not ERG):** grade under the wheels = `trackSlope × hillScale` (tunable, default max 7 %, × difficulty), sent as a `track` ResistanceEffect. Virtual gears are on the shifters (`hud.gears: true`) and cadence is free.
  - **Build** = a real climb you push. **Drop** = the grade falls away and a **sprint target** appears (`targetZone { min: 5, max: 5, source: 'power' }`; Casual Z4). Holding it gives **Overdrive** (×2 multiplier, speed streaks, craft glow) and charges.
  - **Break/outro** = recovery (Z1–Z2). No cap on drops for now (revisit with playtests).
- **Shield** (Wipeout): grey hits and overfills drain it; recharge ∝ time at or above the current zone floor. At 0 the craft **drops out** (ghosted, multiplier locked at ×1) until you hold the zone floor for `rebootS` (5 s). The song never stops early.
- **Input:** paddles (analog) or ◀▶ held = lateral position; D-pad taps snap lanes; shifters = gears; A = Shift (Classic) / B = air-brake slide (Mono, small lateral boost). Controls legend via `hud.controls`.
- **Renderer** (`render/`, Three.js, Wipeout HD Zone look; no outrun palette):
  - A black void. The track is a flat ribbon with bright emissive edge rails, lane lines and chevron decals. The world is **two-tone** per zone (base hue plus accent, seeded from the song palette), and the hue shifts on the section's first downbeat.
  - Wireframe arches on phrase boundaries, trackside light pylons pulsing on beats, a horizon skyline of band-energy bars, speed streaks with intensity, and a procedural anti-grav craft (the rider's equipped `ship` cosmetic) with bell nozzles and exhaust beams.
  - Bloom (three/examples `UnrealBloomPass`). Big "ZONE 07 / DROP" callouts (system condensed font stack for now; a self-hosted OFL font is a later polish). Song title card at each song start (with the cover palette).
  - **Reduced flashing** (profile setting): beat pulses limited to ≤ 3 full-screen flashes/s, hue jumps become 1-beat crossfades.
  - HUD insets honoured (`render/layout.ts` tested: craft, Classic grid and callouts above `H − insets.bottom`). The game's own sfx are quiet and ducked under the music.
- **Picker preview** (`mediaPreview`): track side profile (climbs/dives) coloured by block density, sprint markers on drops, and stars from `rateSong(timeline, mode, difficulty, ftp)` (pure: block rate, grey rate, time in Z4+, estimated TSS).
- **Saves:** best score per (song hash, mode, difficulty), and per queue for sets. The card's progress line is the best score and songs played.
- **Scenarios** (synth timelines): autopilot Mono Pro on `edm` 3 songs, automixed → ≥ 85 % blocks, shield never 0, a grade command > 2 % during every build, a power target during every drop. `idle` → drops out, still finishes. Classic autopilot → no overfill. Determinism (same seed → same block list).
- **Achievements:** First Wave, Clean Zone (a section with no misses), Overdrive (hold every drop in a song), Full Set (finish a 5+ song queue), Grid Master (Classic 7-cluster).

### §6.6 "Drive-In" (lobby projector + cinema) · owns `src/shell/drivein/`, plus a biome in `src/games/warmup/`

- **What:** a **lobby mode**. A small glowing projector button (📽) at the right end of the arcade menu's top bar turns it on (while on, the game row is replaced by a single 📽 toggle that turns it off); on/off, the last channel and the sound choice persist per rider (`wattcade.drivein.<profileId>`). The ride blends into a special **Drive-In biome** and a big drive-in screen plays an always-on video channel while you keep riding. It works in the screensaver (menus asleep), which is the point: warm up and watch.
- **v1 content: stream channels via native HLS.** "Infinite Slop by @levelsio + fal.ai" (verified 2026-10-05): it can't be iframed and its JSON endpoints send no CORS headers, but it serves plain HLS that WebKit plays natively in a `<video playsinline>`: live `https://infiniteslop.ai/live/playlist.m3u8`, and rerun channels (VOD playlists) `https://infiniteslop.ai/api/channel?ch=tag&q=<tag>&limit=<n>`. No hls.js (needs CORS). Where native HLS is unsupported (desktop Chrome) the screen shows a "This channel needs Safari / iPad" card. A finished VOD channel reloads its URL for a fresh playlist so it always feels on. Lineup (`channels.ts`): CH 1 LIVE, 2 COMEDY, 3 ANIMALS, 4 SURREAL, 5 COMMERCIAL, 6 GOTH, 7 MEME, 8 LOFI GIRL, 9 KITTENS, 10 PUPPIES. Tags come from the actual Channels menu, not the separate homepage categories. Ads selections migrate to Commercial; retired selections (including Top Rated) fall back to Live. The channel bar always shows the credit and a link. **YouTube:** the three curated streams use the official IFrame API, with inline muted playback, native controls, tap-to-unmute, per-rider sound, ambient ducking, bounded error handling and teardown on channel changes/exit. Autoplay blocking leaves the player available for a tap. The media library remains a later channel kind.
- **Biome:** `DRIVE_IN` look in `games/warmup/render/driveIn.ts`: a desert drive-in at dusk regardless of the real clock: dusk mesas, stars, classic cars on speaker posts, a concession stand, lamp posts, a neon "WATTCADE DRIVE-IN" marquee, and a little projector trailer towed by the rider with a flickering light beam. It isn't in the loop: the shell sends `GameSim.receive({ type: 'driveIn', on })` and the sim blends `driveIn` 0..1 over `warmup.driveInS` (default 8 s, time-based so it works while parked). Road, grades and warm-up credit are unchanged.
- **Screen:** pinned in the backdrop (no parallax). `screenRect(W, H, insetBottom, { menuBox })` (pure, `layout.ts`) gives a 16:9 rect as large as fits above the HUD, below the marquee, above the horizon, and under any awake menu; at least 320×180 when possible (YouTube requires 200px of height). When awake menus leave no room it returns null and the video fades out until they sleep. `DriveInScreen` positions the `<video>` or YouTube iframe exactly there, and the stage hands the same eased rect to the canvas, which draws the frame, poles and marquee.
- **Playback:** muted autoplay with a "🔈 Tap for sound" chip; the first tap unmutes and is remembered (iOS needs a real gesture each page load, so a remembered choice is applied on the next tap/key). While it plays with sound the ambient beds and scenery one-shots are ducked (`duckAmbient('drivein')`). A pure watchdog (`playback.ts`): on error/stall/timeout retry with backoff, after 3 failures mark the channel unavailable and skip to the next.
- **Hotel-TV flipping:** a bar under the screen (`◀ CH 05 · COMEDY ▶` + credit). Controller **Y = next, Z = previous**, also in the screensaver *without waking the menus* (the menu gate lets them through while the Drive-In is on); keyboard `]` / `[`; taps on the bar. A flip plays a click, ~0.4 s of TV static and a green VCR OSD "CH 05 COMEDY" for 2 s. A pure reducer cycles channels (wraps both ways, skips unavailable ones).
- **Not in v1:** crank mode (cadence → `playbackRate`), YouTube search/picker, the LA/Hollywood skin.
- **Later: YouTube search/picker and crank mode** (original design): the IFrame player over the same rect (min 200×200, unmodified, never backgrounded, per YouTube policy); Data API v3 `search.list` picker (`videoEmbeddable=true`, referrer-restricted key, ~100 searches/day); crank mode as API rate steps with hysteresis (75–100 rpm = 1.0×, stopped > 5 s pauses) and a needle gauge; iPad: `playsinline=1`, first play needs a tap.

---

## §7 Wave 2 — integration and QA

- **Orchestrator:** wire everything; resolve CONTRACT-REQUESTs (update `contracts.ts` minimally, then fix call sites); register games in `src/games/registry.ts`; make `npm test`, `npm run typecheck`, `npm run build`, and `npm run sim:all` pass.
- **Agent Q (Sonnet) — QA and balance:** run `npm run sim:all`. For each failing or implausible result, check tunables first, then fix the game logic minimally. Also do a manual Playwright-free sanity pass: run each game for 2 sim-minutes per script and check that the snapshots contain no NaN or Infinity. Report a table of `game × script → key summary numbers` in `docs/QA.md`.
- **Orchestrator:** write `HARDWARE_TEST.md`. Suggested steps:
  1. Deploy.
  2. Open the site in Bluefy.
  3. Connect the trainer and check raw power/cadence in the overlay.
  4. Test sim, ERG, and resistance from a "Trainer test" button in the debug mixer panel (0 %/5 % grade, 150/200 W, 20/50 % level), and note whether each one is felt.
  5. Connect the Ride, press every button, move both paddles, and record their rest values and direction. If anything looks off, capture bytes with `/probe.html`.
  6. Connect HR.
  7. Play each game for 3 minutes.
  8. Check the summary and XP.

  Add that "Trainer test" button (Agent E owns the UI, the orchestrator wires it).
- Write `README.md`: quick start, fake mode keys, iPad/Bluefy setup, Cloudflare deploy (`npx wrangler login`, `npm run deploy`, then add a custom domain like `wattcade.brianb.land` to the Pages project; optionally protect it with Cloudflare Access for two emails, which is free), and a "make a new game" guide (copy a game folder, implement GameModule, add scenarios, register).

## §8 Out of scope for this demo (don't build)

FIT export, Garmin/Strava upload (the watch records the ride for now; `SessionRecord.samples` is kept for later), multiplayer, sound design beyond stubs, art assets, a backend of any kind.

---

## §9 Execution plan (orchestrator)

Keep your own context small: you coordinate; subagents do the building. Use `model: "sonnet"` for every subagent. Maintain `PROGRESS.md` (a checklist of phases and agents with status) so the work can resume in a new session if usage runs out, and commit after every phase.

**Phase 0 — scaffold:** git init; Vite + Preact + TS; deps; scripts (`dev`, `dev:ipad`, `build`, `preview`, `test`, `typecheck`, `sim`, `sim:all`, `deploy`); `src/contracts.ts`; empty owned folders; placeholder game modules + registry; `scripts/sim.ts` placeholder; `CLAUDE.md`; this file at `docs/SPEC.md`. Typecheck + build pass. Commit "phase 0".

**Phase 1 — Wave 1 (parallel):** 8 Sonnet subagents A–H.

**Phase 2 — integrate:** read NOTES.md, resolve CONTRACT-REQUESTs, switch game scenarios to `runHeadless`, get typecheck/test/build/sim:all green. Commit "phase 2".

**Phase 3 — QA and docs:** Agent Q (§7), `HARDWARE_TEST.md`, `README.md`, final checks. Commit "v0 demo".

---

## §10 Music roadmap (one PR per phase)

1. **Media core:** analysis worker plus synth ground-truth tests, local library (IndexedDB, tags, palette), two-deck player (continuous / automix / crossfade), `planMix`, program timeline, clock PLL, picker with preview and queue, contract additions.
2. **Cadenza v1:** Mono, track from timeline, sim-grade builds, drop sprints, shield, Zone renderer, reduced flashing, scenarios.
3. **Jamendo catalogue** (§5.7): search, stream, analyse, attribution.
4. **Drive-In:** device spike, YouTubeSource, desert drive-in biome, crank-to-speed, cinema mode.
5. **Cadenza Classic,** Shift ability, per-song/per-set leaderboards, achievements.
6. **Later:** LA drive-in skin; YouTube FX (deferred); Spotify (deferred, §5.7).
