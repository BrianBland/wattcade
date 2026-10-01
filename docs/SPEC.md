# wattcade — Build Spec (v0 demo)

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

**Target runtime:** Bluefy on iPadOS. It supports `navigator.bluetooth.requestDevice` and requires HTTPS. It has **no** `getDevices()`/`watchAdvertisements()`, so the user picks each device once per session, and each `requestDevice` call needs its own user tap. Desktop Chrome must also work (used for development). Assume three BLE devices are connected at the same time.

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
  - For the debug overlay, the mixer exposes `activeEffects`, `chosenMode`, `lastCommand`, and `lastResult`.
- **System input combos** (input layer; they are *not* passed to games):
  - Both powerUp buttons tapped together → `pause`
  - Both powerUp buttons held for 1 s → `toggleDebug`
  - Keyboard: `Esc` → pause, `` ` `` → toggleDebug, `0` → panic
  - Touch: triple-tap the top-left 60×60 px corner → toggleDebug
  - While the debug overlay is open, the left shifters change difficulty ±0.05 and the right shifters change timeScale (fake mode only).
- **Keyboard mapping:** arrows = D-pad; `K`=A, `L`=B, `I`=Y, `J`=Z; `Q`/`A` = shiftUpL/shiftDnL; `P`/`;` = shiftUpR/shiftDnR; `1`/`2` = powerUpL/powerUpR; `N`/`M` = left paddle −/+; `,`/`.` = right paddle −/+. Fake bike: `W`/`S` = cadence ±5, `E`/`D` = power ±10, `R`/`F` = HR ±5.
- **Gamepad API** (standard mapping): d-pad buttons 12–15; face buttons 0/1/3/2 → A/B/Y/Z; LB/RB → shiftUp L/R; LT/RT → shiftDn L/R; Select/Start → powerUp L/R; left and right stick x → paddleL/paddleR.

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
  - Level L requires cumulative `floor(100 × (L−1)^1.6)` XP.
  - Also updates `lifetime` and `lastPlayed`.
- **Achievements** (id, name, rule, bonus XP):
  - `first_ride`: any session (25)
  - `triple_threat`: played all three games (50)
  - `balanced_week`: all three games within 7 days (100)
  - `keeper_20`: ≥ 20 min in effort zone 2 in one lighthouse session (50)
  - `storm_chaser`: 3 storms weathered, lifetime (50)
  - `sprinter_10`: 10 sprints in one session (50)
  - `triple_rail`: tower defense event `railFired` with `charges=3` (40)
  - `dungeon_clear`: dungeon event `bossDefeated` (75)
  - `kilojoule_1000`: lifetime kJ ≥ 1000 (100)
  - Rules read `record.events`, `gameSummary`, and lifetime/lastPlayed, so games only need to emit events.
- Tests use fake-indexeddb.

### §5.5 Agent E — Shell + debug overlay · owns `src/shell/`, `src/debug/`, `index.html`, `src/main.tsx`, `src/styles/`

- **Style:** an arcade-cabinet look (dark, neon accents, big type readable from the saddle about 1 m from an iPad). Everything navigable by Ride D-pad + A (select) / B (back), keyboard, and touch.
- **Screens:**
  - **Profile picker:** cards, "+ New", edit.
  - **Profile editor:** name, color swatches, FTP, max HR, weight, zone source, aim mode, paddle deadzone/invert, max grade; plus Backup export/import.
  - **Connect:** three big buttons (Trainer / Controller / Heart rate), each with a status, a "Fake bike" toggle, notes ("Close Zwift on this iPad first", "Enable Broadcast Heart Rate on your Garmin", "Record an Indoor Bike activity on your watch; it's your Garmin/Strava record for now"), and a firmware warning display.
  - **Arcade menu:** three game cards with tags and the profile's level/XP bar.
  - **Game host:** full-screen container. Mounts the renderer from `loadRenderer()`, runs `GameLoop`, and keeps the screen awake with `navigator.wakeLock` if available.
  - **Pause:** Resume / Difficulty / Quit → summary. Pausing triggers mixer panic.
  - **Session summary:** duration, avg/max power, kJ, avg HR, a time-in-zone bar, sprints, game summary, XP gained with a level-up animation, new achievements.
  - **Achievements & stats:** a simple list.
- **Debug overlay** (toggle via system action; remembered in localStorage; transparent; `pointer-events: none` except on its panels):
  - **Top-left, device panel:** raw power/cadence/speed/HR/resistance level, packets per second, last packet age, connection dots, controller firmware/battery.
  - **Top-right, derived panel:** power3s/10s, zones, ftpFraction, crankRevs, sprinting/sprintCount, gear, kJ.
  - **Bottom-left, controller panel:** live **paddle L/R bars** (raw −100..100 and processed −1..1), plus a lit **button grid** laid out like the Ride hoods.
  - **Bottom-right, mixer panel:** active effects, chosen mode, last command, last result code; **difficulty slider**; **panic** button; **timeScale** slider (fake only); fake-bike sliders and script picker; a "game" section with `ctx.debug` values.
  - **Collapsible tuning panel:** sliders/toggles generated from the `TuningRegistry`, with "reset to defaults".
  - All panels are small (monospace, 11–12 px) and readable over the game.
- Build the `GameContext` from core, progression, and input. On quit, save the SessionRecord and apply `awardSession`.
- Deploy scaffolding: add `wrangler` as a dev dependency. The `deploy` script is `vite build && wrangler pages deploy dist --project-name wattcade`. `dev:ipad` runs `vite --host` and prints a hint to use `cloudflared tunnel --url http://localhost:5173` for an HTTPS URL that Bluefy can open.

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
- **Survival:** HP regen only while effortZone == 2 (×2 out of combat). A (or `z` in buttons mode) = dash (2 s cooldown). B = potion (3 per run).
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
- **Build:** D-pad cycles the plots/buildings; A builds. Buildings:
  - cottage: +passive coin
  - pier: +docking tolerance
  - market: coin ×1.25
  - fog bell: fog rises slower
  - second lamp: needs 5 cottages; lamp is stronger

  **The town persists** via `ctx.save/load` and keeps growing across sessions.
- **Storms** (the Z3+ spikes): every 8–12 min (tunable). A 20 s warning (dark clouds, horn), then 60–90 s of storm. During a storm the requirement flips to **effortZone ≥ 3** to keep the lamp alive, and a `storm` effect adds +3 % grade. A mid-storm "lightning surge" of 15 s asks for effortZone ≥ 5 (bonus salvage if held). Weathering a storm gives salvage plus a `stormWeathered` event. Expose `hooks.storm` (boolean) in the snapshot for the `storm-ready` script.
- **Resistance:** sim mode. A `swell` effect adds ±1 % as a sine wave with a 3-minute period. Virtual gears are enabled.
- **Summary:** minutesInZone, shipsDocked, shipsLost, buildingsBuilt, stormsWeathered, coin.
- **Scenarios:**
  - `z2`, 30 min → shipsDocked ≥ 15 and minutesInZone ≥ 25
  - `idle`, 10 min → shipsDocked = 0
  - `mash`, 20 min → shipsLost > shipsDocked × 0.3
  - `storm-ready`, 30 min → stormsWeathered ≥ 2
  - `z2`, 30 min (no storm response) → at least one storm failed (the lamp went out)

### §6.3 Agent H — "Dynamo Defense" (tower defense, 2D Canvas) · owns `src/games/towerdefense/`

- **Map:** a base at the bottom center, 3 lanes (left, center, right) converging on it, and a turret on the base. Enemies are **color-coded by weakness**. The right element does ×1.5 damage; the wrong one ×0.25.
  - **Blue swarm minis:** many, low HP. Weak to Gatling.
  - **Red brutes.** Weak to Flame.
  - **Purple armored:** slow, high HP. Weak to Rail.
  - **Gold boss** every 5 waves: its shield color cycles, so you must switch weapons.

  The stream of minis is continuous; heavier enemies arrive in waves.
- **Weapons** (switch: A = Gatling, B = Flame, Y = Rail; 1.5 s swap; each weapon owns a resistance effect, so all three trainer modes are exercised):
  - **Gatling** (blue): sim mode, effect `weapon` +1 % grade (low, spinny). Fires one bullet per `tuning 'gatlingRevsPerShot'` (default 0.25) crank revs.
  - **Flamethrower** (red): **resistance mode**, `levelPct` 35. A short cone with damage per second ∝ power3s.
  - **Railgun** (purple): **ERG mode**, `ftpFraction` 0.95. Charge accumulates while ftpFraction ≥ 0.75, one charge per ~20 s at 0.95 FTP (tunable). It **stores up to 3 charges** (tunable). **Z fires manually**: one charge per press, a piercing beam. Holding Z for 0.5 s dumps all stored charges in a spread (event `railFired` with `charges`).
- **Aim:** paddles rotate the aim (per `aimMode`). When paddles are idle for > 1.5 s, auto-aim picks the nearest enemy in the **priority lane** (D-pad left/right picks the lane) that the current weapon beats. Draw the aim line.
- **Summary:** wavesSurvived, kills per element, weaponSeconds per weapon, railChargesFired, baseHpLeft.
- **Scenarios** (autopilot opt: picks the correct weapon for the nearest threat and fires rail at 3 charges):
  - `sprints`, 20 min → wavesSurvived ≥ 8
  - `idle`, 5 min → base destroyed (isOver) with wavesSurvived ≤ 2
  - `intervals`, 20 min → all three weapons used ≥ 60 s and mixer commands include all of sim, erg, and resistance
  - a unit test: charges cap at 3 and a hold-Z dump emits `railFired{charges:3}`

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

FIT export, Garmin/Strava upload (the watch records the ride for now; `SessionRecord.samples` is kept for later), character picker/skins, multiplayer, sound design beyond stubs, art assets, a backend of any kind.

---

## §9 Execution plan (orchestrator)

Keep your own context small: you coordinate; subagents do the building. Use `model: "sonnet"` for every subagent. Maintain `PROGRESS.md` (a checklist of phases and agents with status) so the work can resume in a new session if usage runs out, and commit after every phase.

**Phase 0 — scaffold:** git init; Vite + Preact + TS; deps; scripts (`dev`, `dev:ipad`, `build`, `preview`, `test`, `typecheck`, `sim`, `sim:all`, `deploy`); `src/contracts.ts`; empty owned folders; placeholder game modules + registry; `scripts/sim.ts` placeholder; `CLAUDE.md`; this file at `docs/SPEC.md`. Typecheck + build pass. Commit "phase 0".

**Phase 1 — Wave 1 (parallel):** 8 Sonnet subagents A–H.

**Phase 2 — integrate:** read NOTES.md, resolve CONTRACT-REQUESTs, switch game scenarios to `runHeadless`, get typecheck/test/build/sim:all green. Commit "phase 2".

**Phase 3 — QA and docs:** Agent Q (§7), `HARDWARE_TEST.md`, `README.md`, final checks. Commit "v0 demo".
