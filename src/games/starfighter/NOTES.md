# Sprocket Squadron (id `starfighter`)
CONTRACT-REQUESTs: none. Root added optional `ctx.trainerCapabilities()` for capability-aware craft selection.

## Design / integration
- Spec: docs/SPROCKET_SQUADRON.md. Shared media work: GitHub #64, #65, #66.
- Requires shared music picker/PCM, not ERG globally; generated soundtracks are already available.
- Automatic movement/aim/fire/defense. Cruiser: 56–75% FTP, left-side SIM gears. Escort: unlocked ERG endurance, 56–70% FTP section targets, wingmen; disabled if trainer lacks ERG.
- A/Y/right-up or touch Nova: blast + 20s recovery cover, no charge earned during cover.
- Power/cadence smoothed; startup, under-target and ERG settling grace; stopped pedals receive no settling exemption after startup.
- Sustained shortfall weakens firing/interception/evasion. Over target withholds groove time/salvage/charge and prompts ease off; it grants no extra damage.
- Hull loss regroups for 8s; retains arsenal and music. Set ends on program clock; `endless` only for harnesses.
- director.ts freezes announced sections for an 8s lookahead; consumes beat/onset/phrase timestamps once through revisions.
- Section/intensity drive enemies; beats/downbeats/onsets drive entrances/firing/visual pulses. Uncertain analysis uses steady fallback encounters.
- Optional cadence bonuses only for full-confidence regular grids, comfortable BPM subdivisions, broad RPM bands; never crank-phase judging.
- Flagship every ~6min, announced 8s ahead, phrase alignment or bounded fallback; timeout continues flight. Bosses do not raise effort.
- Salvage from groove time upgrades guns automatically; tier4 missiles/tier5 wingmen. No permanent damage spending.
- save.ts v3: old record retained in `legacy`, old score in `legacyBest`; investment converted once into unlock credit. Escort unlocks at 10 groove minutes or 1000 credit. New score starts separately.
- Snapshot is plain data; sim deterministic. UI actions queued by `receive`, never applied by renderer.

## Graphics / checks
- Three.js angled orthographic camera, modeled craft/flagships, instanced projectiles/effects, procedural nebula/planet shaders.
- render/layout.ts honors all shell insets. Menu supports touch/controller and pedal auto-launch; footer Nova button remains stable while frames update.
- `npm run typecheck`; `npx vitest run src/games/starfighter src/core/media.test.ts src/progression/scenarios.test.ts src/games/insets.test.ts`.
- `node scripts/squadron-render-smoke.mjs` with Vite on :5199 and system Chromium checks landscape/portrait/touch and bounded allocations.
- `/dev/squadron.html?sec=375&craft=escort` silent ground-truth timeline; `menu=1`, `unlocked=1`, `script=idle`, `inset=150`, `manual=1`.
- Card: `CHROMIUM_PATH=/usr/bin/chromium node --import tsx scripts/capture-cards.ts --only starfighter --base http://127.0.0.1:5199`.
- Validation: 706 repository tests + 46 focused checks, typecheck/build, portrait/landscape controls/resources pass; updated card encodes as a 6s H.264 clip.
- Real trainer feel, iPad GPU cost, nuanced craft balance and reduced-flash preferences still need real rides. No required rapid flashing or punitive audio FX.
- Future: additional riding contracts, optional manual dodges, shared confidence/commit API, improved selection and playlists. Existing media analysis/mixer reused.
