# wattcade

A web "bike arcade" for a **Zwift Ride frame + Wahoo KICKR CORE + Garmin HR broadcast**, played on an iPad in the **Bluefy** browser via Web Bluetooth. It has six games plus a warm-up ride, each tying trainer resistance to gameplay:

| Game | Style | Trainer use |
|---|---|---|
| **Crank Crawler** | 2D endless dungeon crawler (RotMG-lite) with loot, levels and roguelite upgrades | Crank revs fire; Zone 2 heals. Terrain, swamp, low HP, curses and boss shields add grade. Sprint to crack boss shields; shrines ask for Z3+, Z2 holds, sprints or 95 rpm spins. |
| **Keeper's Light** | 3D Zone 2 idle game | Holding Zone 2 clears fog and calms the sea so ships dock. A gentle swell rolls the grade. Storms add grade and demand Zone 3+, with Z5 lightning surges. The island town persists and grows between sessions. |
| **Dynamo Defense** | 2D tower defense with towers, a workshop, waves, bosses and garage upgrades | Your pedalling powers the base: towers fire faster at higher FTP fraction, and sprinting triggers Overdrive. Gatling = sim grade, Flamethrower = resistance level, Railgun = ERG (charges at ≥ 0.75 FTP). Match each weapon to the enemy colour. Power Surges (Z4+) fire an EMP; Spin-ups (95 rpm) overclock the Gatling. |
| **Sprocket Squadron** | 2D shoot-'em-up with sectors, bosses, power-ups and hangar upgrades | Shifters fire the left/right guns, cadence reloads, power thrusts, and sprints fire the overdrive beam. Attack runs add grade and ask for Zone 4. |
| **HAMSTERGRID** | Idle/clicker empire, from one hamster to a Dyson swarm | Hamsters run only while you pedal; steady Zone 2 builds a Mind-Numbing multiplier. Each era adds a little grade; strikes add +3 % until a Z3+ push breaks them; spin classes want 95 rpm; clinical trials are 3 min of ERG at 0.8 FTP. |
| **Watershed** | 3D ERG game: you are the whole water cycle, with particle water and real-time erosion | **Needs ERG.** A fixed 45 min ERG workout. Start as vapor rising off the sea (spin, chase the sunlight), gather into a cloud drifting inland, then rain on the peaks: your spring rises where you rained most. As the river, ERG sets how much water you are and your **cadence** sets what kind: grind (60–72 rpm) for heavy water that carves gorges, spin (98+) for light water that carries silt out to a growing delta. The banks come alive with grass, flowers, reeds, lily pads, frogs and butterflies wherever your river runs. Late in the ride, a salmon run swims up the river you carved, in a chase cam behind the lead salmon: steer with the paddles (analog), ◀▶ or the shifters (left hood left, right hood right) past bears and eagles, and spin past 95 rpm to leap uncut falls. |

Behind the menus runs the **Warm-up Ride**, a free ride through rolling countryside, coast and the Moon where the hills on screen are the grade on the trainer (toggle *Road: Hills/Flat* in the arcade).

**ERG safety:** in ERG mode the trainer holds the watts whatever your cadence, so slowing down means more torque. If cadence drops below 55 rpm, the mixer eases the ERG target to 60 % until you spin back up, then ramps it back in over 8 s (tunable `core.ergRelief*`).

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
npm run snap:watershed -- --script grind --minutes 15 --every 5   # top-down PNGs of the river sim in out/watershed/
```

Dev pages (with `npm run dev`): `/probe.html` (Bluetooth probe), `/dev/watershed.html?script=spin&min=20&autopilot=1` (Watershed on the fake bike, fast-forwarded, without the shell).

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

**Fake bike:** W/S = cadence ±5, E/D = power ±10, R/F = HR ±5. The debug overlay also has sliders and a script picker (idle, z2, z2-drift, sprints, intervals, storm-ready, grind, spin, cadence-follow, mash) and a timeScale slider from 1× to 100×. timeScale is available in fake mode only.

Touch: triple-tap the top-left corner to toggle the debug overlay. While the overlay is open, the left shifters change difficulty and the right shifters change timeScale.

## iPad / Bluefy setup

1. Install **Bluefy** from the App Store. Web Bluetooth requires **HTTPS**.
2. To test on the iPad from your dev machine, run `npm run dev:ipad` and then, in a second terminal, `cloudflared tunnel --url http://localhost:5173`. Open the printed `https://…trycloudflare.com` URL in Bluefy.
3. Close Zwift first, because only one app can control the trainer. Bluefy can't remember devices, so you pick each device once per session from the Connect screen.
4. On the Garmin, enable **Broadcast Heart Rate**. Recording an Indoor Bike activity on the watch gives you the Garmin/Strava record for now; wattcade does not upload anything.
5. Don't update the Ride controller firmware through Zwift. Firmware 1.3+ is locked to Zwift.
6. To debug Bluetooth, open **`/probe.html`**. It lists every service and characteristic, subscribes to all of them, and logs hex with Copy and Download buttons.

## Deploy (Cloudflare Workers, static assets)

The site is static, so it ships as a Worker with no script: `wrangler.jsonc` points `assets` at `dist/`.

**One-time setup**
1. `npx wrangler login`, then `npm run deploy` for the first deploy. It lands at `https://wattcade.<your-subdomain>.workers.dev`, which is HTTPS and works in Bluefy.
2. The custom domain `wattcade.brianb.land` is declared in `routes` in `wrangler.jsonc` (the zone must be on your Cloudflare account). Edit it there rather than in the dashboard, since deploys treat the file as the source of truth.
3. Optional gate: Zero Trust → Access → self-hosted application on that hostname, with an email allow-list (free).

**CI/CD (GitHub Actions)**
- `ci.yml`: typecheck, tests, `sim:all`, build on every PR and push to main.
- `deploy.yml`: deploys to production after CI passes on main (also manually via *Run workflow*).
- `preview.yml`: each same-repo PR gets a `pr-<n>` preview URL, posted as a PR comment.
- Secrets (repo Settings → Secrets → Actions): `CLOUDFLARE_ACCOUNT_ID` and `CLOUDFLARE_API_TOKEN`. Create the token from the **Edit Cloudflare Workers** template. Create a GitHub environment named `production` (optionally with required reviewers). Without the secrets, deploy and preview steps skip with a notice.

Profiles and progress live in the browser's IndexedDB, and there's no backend. Use **Export JSON** in the profile editor to keep a backup. When persistence moves server-side, add a Worker `main` plus a D1 binding in `wrangler.jsonc`, and put auth (Cloudflare Access, or Google OAuth) in front of the API routes.

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
2. **Implement `GameModule`** in `index.ts`: `id`, `title`, `blurb`, `tags`, `createSim(ctx, opts)`, and `loadRenderer()`, which must use dynamic `import()`. Optional: `requires: { erg: true }` if the game can't run without ERG (the arcade then blocks it on a trainer that lacks ERG), `progressLine` and `drawCard` for the arcade card.
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
