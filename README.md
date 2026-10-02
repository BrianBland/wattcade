# wattcade

A web "bike arcade" for a **Zwift Ride frame + Wahoo KICKR CORE + Garmin HR broadcast**, played on an iPad in the **Bluefy** browser via Web Bluetooth. It has three games, each tying trainer resistance to gameplay:

| Game | Style | Trainer use |
|---|---|---|
| **Crank Crawler** | 2D dungeon crawler (RotMG-lite) | Cadence moves you and crank revs fire. Swamp, low HP and the boss shield add grade. Sprint to crack the shield. |
| **Keeper's Light** | 3D Zone 2 idle game | Holding Zone 2 clears fog and calms the sea so ships dock. Storms demand Zone 3+. The town persists between sessions. |
| **Dynamo Defense** | 2D tower defense | Gatling = sim grade, Flamethrower = resistance level, Railgun = ERG. Match each weapon to the enemy colour. |

The full spec is in [`docs/SPEC.md`](docs/SPEC.md), QA results are in [`docs/QA.md`](docs/QA.md), and the first-ride checklist is [`HARDWARE_TEST.md`](HARDWARE_TEST.md).

## Quick start

```sh
npm install
npm run dev          # http://localhost:5173 — desktop Chrome
```

With no devices connected, every game runs on the **fake bike**: a scripted or manually controlled power, cadence and HR source driving a simulated trainer.

```sh
npm test             # Vitest
npm run typecheck
npm run build
npm run sim -- --game dungeon --script sprints --minutes 20 --seed 1 --autopilot
npm run sim:all      # every game × scenario headless; exits non-zero on failure
```

## Controls

| Action | Keyboard | Zwift Ride | Gamepad |
|---|---|---|---|
| D-pad | arrows | D-pad | d-pad |
| A / B / Y / Z | K / L / I / J | A / B / Y / Z | face buttons |
| Shift up/down L | Q / A | left shifters | LB / LT |
| Shift up/down R | P / ; | right shifters | RB / RT |
| Left paddle −/+ | N / M | left paddle | left stick x |
| Right paddle −/+ | , / . | right paddle | right stick x |
| Pause | Esc | tap both powerUp | Select+Start tap |
| Debug overlay | `` ` `` | hold both powerUp 1 s | hold Select+Start |
| Panic (flat resistance) | 0 | — (overlay button) | — |

**Fake bike:** W/S = cadence ±5, E/D = power ±10, R/F = HR ±5. The debug overlay also has sliders and a script picker (idle, z2, z2-drift, sprints, intervals, storm-ready, mash) and a timeScale slider from 1× to 100×. timeScale is available in fake mode only.

Touch: triple-tap the top-left corner to toggle the debug overlay. While the overlay is open, the left shifters change difficulty and the right shifters change timeScale.

## iPad / Bluefy setup

1. Install **Bluefy** from the App Store. Web Bluetooth requires **HTTPS**.
2. To test on the iPad from your dev machine, run `npm run dev:ipad` and then, in a second terminal, `cloudflared tunnel --url http://localhost:5173`. Open the printed `https://…trycloudflare.com` URL in Bluefy.
3. Close Zwift first, because only one app can control the trainer. Bluefy can't remember devices, so you pick each device once per session from the Connect screen.
4. On the Garmin, enable **Broadcast Heart Rate**. Recording an Indoor Bike activity on the watch gives you the Garmin/Strava record for now; wattcade does not upload anything.
5. Don't update the Ride controller firmware through Zwift. Firmware 1.3+ is locked to Zwift.
6. To debug Bluetooth, open **`/probe.html`**. It lists every service and characteristic, subscribes to all of them, and logs hex with Copy and Download buttons.

## Deploy (Cloudflare Pages)

```sh
npx wrangler login
npm run deploy        # vite build && wrangler pages deploy dist --project-name wattcade
```

Then, in the Cloudflare dashboard → Pages → **wattcade** → Custom domains, add e.g. `wattcade.brianb.land`. Optionally put it behind **Cloudflare Access** (Zero Trust → Access → Applications → self-hosted, with an email allow-list of two addresses; this is free) so only you can reach it.

Profiles and progress live in the browser's IndexedDB, and there's no backend. Use **Export JSON** in the profile editor to keep a backup.

## Architecture

```
src/contracts.ts        shared types (GameModule, GameContext, BikeState, TrainerCommand, …)
src/devices/            FTMS trainer, HR monitor, Zwift Ride (pure codecs + thin Web Bluetooth glue)
src/input/              InputHub: Ride + keyboard + gamepad + touch + scripts, system combos
src/core/               BikeStateStore, ResistanceMixer (virtual gears, difficulty, clamps, rate limit),
                        GameLoop (fixed 1/30 s), FakeBike/FakeTrainer, scripts, SessionRecorder,
                        TuningRegistry, createGameSession, runHeadless
src/progression/        profiles (IndexedDB), XP/levels, achievements, sessions
src/shell/, src/debug/  Preact screens + debug overlay
src/games/<id>/         index.ts, sim/ (pure), render/ (DOM/Canvas/Three), scenarios.ts, test/
```

Games never talk to devices. They read `ctx.bike()` and `ctx.input()`, and set **resistance effects** (`ctx.resistance.set({ id, mode, gradePct | watts | ftpFraction | levelPct, ttl? })`). The core mixer combines the effects, applies difficulty, virtual gears and safety clamps, rate-limits the result, and drives the trainer.

## Make a new game

1. **Copy a folder:** `cp -r src/games/towerdefense src/games/mygame` (2D Canvas), or start from `lighthouse` for Three.js.
2. **Implement `GameModule`** in `index.ts`: `id`, `title`, `blurb`, `tags`, `createSim(ctx, opts)`, and `loadRenderer()`, which must use dynamic `import()`.
3. **Keep `sim/` pure:**
   - No DOM, `three`, Preact or `Math.random`/`Date.now`.
   - Use `ctx.rng()` and the `dt` passed to `update`.
   - Make every bike↔game number a tunable, e.g. `ctx.tuning.num('myRate', 1, 0, 5)`. Tunables show up as live sliders in the debug overlay.
   - Expose a plain-data `snapshot()` for the renderer and tests.
4. **Resistance:** call `ctx.resistance.set({ id: 'terrain', mode: 'sim', gradePct: 2 })`. Re-setting the same id replaces it, and `ttl` auto-expires it. Use `ctx.resistance.useVirtualGears(true)` to let the shifters change gear.
5. **Events and saves:**
   - `ctx.emit({ type: 'bossDefeated' })` feeds the session log and achievements (see `src/progression`).
   - `ctx.save(data)` / `ctx.load()` persist per-profile game data.
6. **Scenarios:** in `scenarios.ts`, export `scenarios = [{ name, script, minutes, seed, simOpts, assert(summary, stats, run) }]`. Then `npm run sim:all` checks your balance headlessly, and an `autopilot` flag in `simOpts` lets the sim steer itself.
7. **Register** the module in `src/games/registry.ts`.
