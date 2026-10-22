# wattcade

A web "bike arcade" for a **Zwift Ride frame + Wahoo KICKR CORE + Garmin HR broadcast**, played on an iPad in the **Bluefy** browser via Web Bluetooth. It has seven games plus a warm-up ride, each tying trainer resistance to gameplay (listed in the arcade's tie-break order, most polished first):

| Game | Style | Trainer use |
|---|---|---|
| **Cadenza** | 3D music racer (Wipeout-style) built from your own songs: pick a queue, then ride the track the music makes | **Needs music** (local files, YouTube, SoundCloud, CC samples or the synth demo songs). Builds are real climbs; every drop dives into a sprint target, opening with a block-free corkscrew Launch rated on your effort. Steer across lanes to catch blocks on the hits, dodge mines; holding the target zone keeps your shield up and fires Overdrive. Shifters are virtual gears. |
| **HAMSTERGRID** | Idle/clicker empire, from one hamster to a Dyson swarm | Hamsters run only while you pedal; steady Zone 2 builds a Mind-Numbing multiplier. Each era adds a little grade; strikes add +3 % until a Z3+ push breaks them; spin classes want 95 rpm; clinical trials are 3 min of ERG at 0.8 FTP. |
| **Watershed** | 3D ERG game: you are the whole water cycle, with particle water and real-time erosion | **Needs ERG.** Pick a 20, 30, 45 or 60 min ERG workout before you start. Rise as vapor off the sea (spin, chase the sunlight), gather into a cartoon cloud, rain on the peaks: springs rise where you rained. As the river your **cadence** shapes the water (grind = heavy, carves; spin = light, fast, carries) and each block gives you a job: turn the grist mill, break the beavers' dam, keep Millbrook dry in the floods, spin the sawmill, water the fields. Earthquakes, landslides, volcanoes (and, very rarely, a meteor) can reshape the valley mid-ride. Then a salmon run up every channel you carved, dodging bears and eagles. Steer with the paddles, ◀▶ or the shifters (left hood left, right hood right); A = boost, Y = view. |
| **Crank Crawler** | 2D endless dungeon crawler (RotMG-lite) with loot, levels and roguelite upgrades | Crank revs fire; Zone 2 heals. Terrain, swamp, low HP, curses and boss shields add grade. Sprint to crack boss shields; shrines ask for Z3+, Z2 holds, sprints or 95 rpm spins. |
| **Keeper's Light** | 3D Zone 2 idle game | Holding Zone 2 clears fog and calms the sea so ships dock. Calm riding is flat, with virtual gears to find a comfortable effort. Storms add grade and demand Zone 3+, with Z5 lightning surges. The island town persists and grows between sessions. |
| **Dynamo Defense** | 2D tower defense with towers, a workshop, waves, bosses and garage upgrades | Your pedalling powers the base: towers fire faster at higher FTP fraction, and sprinting triggers Overdrive. Gatling = sim grade, Flamethrower = resistance level, Railgun = ERG (charges at ≥ 0.75 FTP). Match each weapon to the enemy colour. Power Surges (Z4+) fire an EMP; Spin-ups (95 rpm) overclock the Gatling. |
| **Sprocket Squadron** | Bright carrier shooter with paddle targeting, curved laser volleys and automatic dodging | **Needs music.** Cadence Cruiser holds Zone 2 with left-side virtual gears; unlocked Resonance Escort holds ERG endurance with wingmen. On-target riding powers guns and protection. Right paddles select targets; A/Y = Nova and 20 seconds of easy cover. [Game spec](docs/SPROCKET_SQUADRON.md). |

Behind the menus runs the **Warm-up Ride**, a free ride through rolling countryside, coast and the Moon where the hills on screen are the grade on the trainer (toggle *Road: Hills/Flat* in the arcade). Other players saved on this device occasionally ride by in their equipped looks, cruising at your Z1–Z2 boundary effort so they're easy to pass. Rides over 2 minutes on real devices count toward XP, and the menus fade out on their own after 25 s so it works as a screensaver.

**Arcade picker:** one looping row of games that rolls past a centred, enlarged selection (◀▶, swipe, or tap a side card; it wraps around from the last game to the first). The selection plays a short clip of the real game and shows its tags, blurb, your progress line, time and kJ ridden in it, and when you last played; the others shrink to a title and a still. Games are sorted by what this rider played most recently, then by the order above.

**Drive-In:** the 📽 button in the arcade's top bar turns the lobby into a desert drive-in cinema with a big screen playing Infinite Slop channels (native HLS on iPad/Safari) and YouTube streams (Lofi Girl, Kittens and Puppies) while you keep riding. While it's on, the game row is replaced by a single 📽 toggle to bring the games back; Y/Z flip channels, even with the menus asleep.

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
npm run capture:cards -- [--only hamster]   # re-record the arcade clips (needs `npm run dev -- --port 5199`, ffmpeg, Playwright's Chromium)
```

Dev pages (with `npm run dev`): `/probe.html` (Bluetooth probe), `/media-lab.html` (Music Lab), `/dev/watershed.html?script=spin&min=20&autopilot=1` (Watershed on the fake bike, fast-forwarded, without the shell), `/dev/cadenza.html?autopilot=1` (Cadenza on a synth set), `/dev/squadron.html?sec=375&craft=escort` (Squadron on a silent synth timeline; `menu=1` opens craft selection), `/dev/capture.html?game=<id>&sec=600&opts={"autopilot":true}` (any game's renderer, fast-forwarded, no HUD; what `capture:cards` records).

## Controls

**Native shifting hardware test:** `/shift-probe.html` is an opt-in KICKR CORE
protocol experiment with 24 ratio selections and FTMS hill controls. See
[test instructions](docs/NATIVE_SHIFTING_TEST.md). Arcade gearing is unchanged.

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
3. Close Zwift first, because only one app can control the trainer. Device setup opens before player selection. Pick each device once; Wattcade saves the setup locally and automatically connects authorized devices on later launches using `getDevices()`. HR supports multiple saved watches shared by all players: automatic connection tries the last-used watch first, then other saved watches. Use the saved-watch buttons when both are broadcasting, and **Add watch** to authorize another without forgetting existing watches. If Bluefy does not retain permission, or a device is unavailable, select it manually. Use the same HTTPS hostname for subsequent rides (temporary tunnel URLs have different permissions).
4. On the Garmin, enable **Broadcast Heart Rate**. Recording an Indoor Bike activity on the watch gives you the Garmin/Strava record for now; wattcade does not upload anything.
5. Don't update the Ride controller firmware through Zwift. Firmware 1.3+ is locked to Zwift.
6. To debug Bluetooth, open **`/probe.html`**. It lists every service and characteristic, subscribes to all of them, and logs hex with Copy and Download buttons.

### Testing saved connections in desktop Chrome

Basic Bluetooth connection and `getDevices()` have different availability. If saved connection reports `getDevices()` is missing, enable **Use the new permissions backend for Web Bluetooth** at `chrome://flags/#enable-web-bluetooth-new-permissions-backend` and relaunch Chrome. Google's [getDevices sample](https://googlechrome.github.io/samples/web-bluetooth/get-devices.html) documents this flag. If the method is still absent in your Chrome version, the [implementation status](https://github.com/whatwg/bluetooth/blob/main/implementation-status.md) also lists `chrome://flags/#enable-experimental-web-platform-features` for exposing it. After changing flags, select devices again on the same origin, then reload to test restoration.

Bluefy does not use Chrome flags. Its App Store release notes advertise `getDevices()`, but installed-version support and permission persistence need iPad verification. On `/probe.html`, inspect the CAPABILITIES line and use **Check saved devices** before/after reload and Bluefy relaunch. `getDevices=function` verifies exposure; retaining the same IDs across those steps verifies permission persistence. The returned list can include offline devices, so actual reconnection is a separate test. Saved connections wait up to 10 seconds for an advertisement when `device.watchAdvertisements()` is available, then stop scanning and connect GATT; browsers without that method try GATT directly. An iPad/Bluefy fēnix 6 Pro probe test needed this discovery step after page reload and connected successfully with it. Wattcade startup, Bluefy app restart, trainer, and Ride restoration still need hardware verification. Keep BLE advertisements enabled in Bluefy settings.

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
src/media/              music core: song analysis (beats, sections, key), library (IndexedDB), mix planner
                        (continuous / automix / crossfade), program timeline, two-deck player, synth demo songs
src/shell/, src/debug/  Preact screens (arcade carousel, Drive-In, HUD, warm-up stage) + debug overlay
public/cards/           arcade clips + posters per game (recorded by scripts/capture-cards.ts)
src/games/<id>/         index.ts, sim/ (pure), render/ (DOM/Canvas/Three), scenarios.ts, test/
```

Music games (`requires.media`) open the song picker first and read `ctx.media.timeline` (beats, onsets, sections, intensity on one program clock); the shell plays the mix and keeps the sim locked to it. `/media-lab.html` (Music Lab) tries the library and player on a device without a game, including tap-along latency calibration.

Games never talk to devices. They read `ctx.bike()` and `ctx.input()`, and set **resistance effects** (`ctx.resistance.set({ id, mode, gradePct | watts | ftpFraction | levelPct, ttl? })`). The core mixer combines the effects, applies difficulty, virtual gears and safety clamps, rate-limits the result, and drives the trainer.

## Make a new game

1. **Copy a folder:** `cp -r src/games/towerdefense src/games/mygame` (2D Canvas), or start from `lighthouse` for Three.js.
2. **Implement `GameModule`** in `index.ts`: `id`, `title`, `blurb`, `tags`, `createSim(ctx, opts)`, and `loadRenderer()`, which must use dynamic `import()`. Optional: `requires: { erg: true }` if the game can't run without ERG (the arcade then blocks it on a trainer that lacks ERG), `progressLine` for the arcade card, and `drawCard` (Canvas 2D art the card falls back to until the game has a recorded clip).
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
7. **Register** the module in `src/games/registry.ts` (its position there is the picker's tie-break order).
8. **Card clip:** add a shot to `SHOTS` in `scripts/capture-cards.ts` (script, how far to fast-forward, crop) and run `npm run capture:cards -- --only mygame`. `src/shell/arcade.test.ts` checks every game has `public/cards/<id>.mp4` + `.webp`.

## Cadenza online music

Enable **Connect → Media server**, then search YouTube/SoundCloud or paste a track URL in
**Online music**. A Linux yt-dlp/ffmpeg daemon behind Cloudflare Tunnel supplies short audio
windows for buffered playback and JIT analysis (180s ahead by default, adjustable from 120–240s).
Online automix uses estimated crossfades.
See [setup and deployment instructions](docs/CADENZA_STREAMING.md).
