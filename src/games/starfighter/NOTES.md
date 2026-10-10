# Sprocket Squadron (id `starfighter`)
CONTRACT-REQUESTs: none. Root added optional `ctx.trainerCapabilities()` for capability-aware craft selection.

## Design / integration
- Spec: docs/SPROCKET_SQUADRON.md. Shared media work: GitHub #64, #65, #66.
- Requires shared music picker/PCM, not ERG globally; generated soundtracks are already available.
- Automatic movement/aim/fire/defense. Cruiser: 56–75% FTP, left-side SIM gears. Escort: unlocked ERG endurance, 56–70% FTP section targets, wingmen; disabled if trainer lacks ERG.
- A/Y/right auxiliary or touch Nova: blast + 20s recovery cover, no charge earned during cover.
- Power/cadence smoothed; startup, under-target and ERG settling grace; stopped pedals receive no settling exemption after startup.
- Sustained shortfall weakens firing/interception/evasion. Over target withholds groove time/salvage/charge and prompts ease off; it grants no extra damage.
- Hull loss regroups for 8s; retains arsenal and music. Set ends on program clock; `endless` only for harnesses.
- director.ts freezes announced sections for an 8s lookahead; consumes beat/onset/phrase timestamps once through revisions.
- Section/intensity drive enemies; beats/downbeats/onsets drive entrances/firing/visual pulses. Uncertain analysis uses steady fallback encounters.
- Optional cadence bonuses only for full-confidence regular grids, comfortable BPM subdivisions, broad RPM bands; never crank-phase judging.
- Flagship every ~6min, announced 8s ahead, phrase alignment or bounded fallback; timeout continues flight. Bosses do not raise effort.
- Salvage from groove time upgrades guns automatically; 4–8 lock slots and unfolding pods/tier5 wingmen. No permanent damage spending.
- save.ts v3: old record retained in `legacy`, old score in `legacyBest`; investment converted once into unlock credit. Escort unlocks at 10 groove minutes or 1000 credit. New score starts separately.
- Snapshot is plain data; sim deterministic. UI actions queued by `receive`, never applied by renderer.

## Graphics / checks
- Three.js perspective camera, modeled craft/flagships, streamed carrier/city/canyon terrain and instanced buildings/rocks, fixed-size laser/reticle/debris/shadow/smoke pools, auto-dodge banking/ghosts. R paddles cycle priority targets; L paddles remain Cruiser gears. First flagship ~150s, then six-minute spacing; lockable batteries protect the reactor.
- render/layout.ts honors all shell insets. Menu supports touch/controller and pedal auto-launch; footer Nova button remains stable while frames update.
- `npm run typecheck`; `npx vitest run src/games/starfighter src/core/media.test.ts src/progression/scenarios.test.ts src/games/insets.test.ts`.
- `node scripts/squadron-render-smoke.mjs` with Vite on :5199 and system Chromium checks landscape/portrait/touch and bounded allocations.
- `/dev/squadron.html?sec=375&craft=escort` silent ground-truth timeline; `menu=1`, `unlocked=1`, `script=idle`, `inset=150`, `manual=1`.
- Card: `CHROMIUM_PATH=/usr/bin/chromium node --import tsx scripts/capture-cards.ts --only starfighter --base http://127.0.0.1:5199`.
- Validation: Repository tests and focused checks, typecheck/build, portrait/landscape controls/resources pass; updated card encodes as a 6s H.264 clip.
- Real trainer feel, iPad GPU cost, nuanced craft balance and reduced-flash preferences still need real rides. Shared sound graph/mute controls; quiet lock ticks and volley whooshes. No required rapid flashing or punitive audio FX.
- Future: additional riding contracts, optional manual dodges, shared confidence/commit API, improved selection and playlists. Existing media analysis/mixer reused.

## Spectacle pass
- encounters.ts supplies continuous top/side entrances, combat eligibility, and aimed/fan/petal bullet patterns. No offscreen acquisition or firing; flagship mounts follow its entering hull.
- Up to 60 aircraft plus ground groups; 640-projectile budget. Ground turrets/tanks have separate models, aiming barrels, and ground laser impacts; passing a ground unit does not ram the ship.
- Scenery tiles recycle behind/beyond the camera across carrier, neon city, and canyon stretches. No new geometry/material allocation on terrain transitions.
- Boss weak points get spare automatic lock slots so denser escorts do not starve the flagship fight. The rider-selected priority still acquires first.
