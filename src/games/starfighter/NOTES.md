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
- progression.ts: craft levels from per-craft groove minutes (L10 ≈ 10.5h). Perks = companions, arsenal ceiling 5→8, faster locks, Escort beam/intercept; never raw damage. In-ride tier from on-target minutes. Escort unlocks at Cruiser L3. Tunables `testerUnlockAll`, `arsenalPace`, `tierLockScale`; dev `?tester=1`.
- save.ts v3: old record retained in `legacy`, old score in `legacyBest`; investment converted once into unlock credit (≥1000 also unlocks the Escort). `craftS`/`unlocked` added; early v3 saves seed the Cruiser. New score starts separately.
- Snapshot is plain data; sim deterministic. UI actions queued by `receive`, never applied by renderer.

## Graphics / checks
- Three.js perspective camera, modeled craft/flagships, streamed carrier/city/canyon terrain and instanced buildings/rocks, fixed-size laser/reticle/debris/shadow/smoke pools, route banking/ghosts. R paddles cycle priority targets; L paddles remain Cruiser gears. First flagship ~150s, then six-minute spacing; lockable batteries protect the reactor.
- sim/route.ts (tested): `WorldRoute` arcs, `planTurns` per segment (city/ocean only, phrase-snapped). Snapshot `world`, `frames`, `routeAhead`; space.ts maps virtual frame coords → world → local in `add()` and gates by the next frame's line. sim/rng.ts `mulberry`.
- render/terrain.ts (pure, tested): seeded `biomeParams`, `riverX`, `cityRoads` shared with the ground shader. space.ts gets `BiomeEnv` (b0/b1/seeds/switchTravel snapped to a tile edge). `GROUND_SPEED` (encounters.ts) couples sim ground units and render/space.ts scroll; vehicles/boats/wisps are world-placed and biome-gated (`biomeAt`).
- models.ts: player parts named `tier-N` (2..8), `trim-3`, `stripe-5`; livery materials in `userData` (trim/engineGlow/white/plume) recoloured by craft level in renderer. `heavyModel` for the L7 escort. Dev `?level=N&pace=N`.
- segments.ts: `planSegments`/`createSegmenter` (songs, mix splits at seams, committed current segment), `gradeSegment`. Breather is the last 14 s, scorecard the last 6. Amp = intensity relative to the ~60 s mean. Controls: both shifters = gears; paddles/arrows retarget; B release; Z snap.
- render/post.ts: half-res bloom, threshold above scenery, self-disables after ~90 slow frames. render/hud.ts: DOM HUD on shared main.css classes; scene is full-bleed and `camera.setViewOffset` frames the play field above the insets. render/layout.ts honors all shell insets. Menu supports touch/controller and pedal auto-launch; standalone footer Nova remains stable; shared HUD hides duplicated target/Nova buttons and publishes charge plus Cover/Rejoin status.
- `npm run typecheck`; `npx vitest run src/games/starfighter src/core/media.test.ts src/progression/scenarios.test.ts src/games/insets.test.ts`.
- `node scripts/squadron-render-smoke.mjs` with Vite on :5199 and system Chromium checks landscape/portrait/touch and bounded allocations.
- `/dev/squadron.html?sec=375&craft=escort` silent ground-truth timeline; `menu=1`, `unlocked=1`, `script=idle`, `inset=150`, `manual=1`.
- Card: `CHROMIUM_PATH=/usr/bin/chromium node --import tsx scripts/capture-cards.ts --only starfighter --base http://127.0.0.1:5199`.
- Real trainer feel, iPad GPU cost, nuanced craft balance and reduced-flash preferences still need real rides. Shared sound graph/mute controls; quiet lock ticks and volley whooshes. No required rapid flashing or punitive audio FX.

## Spectacle pass
- flight.ts: ship route is a pure schedule of holds + eased moves (start and end on beats, phrase sweeps, 8s ahead, ≤~34 u/s). `choreograph` re-aims/drops on-target shots so all miss the route by ≥5.5; under target the ship lags the route and fire is raw. Summary: `grazes`, `absorbed` (on-target hits; must stay 0).
- Targeting by formation (`groupOf`): paddles cycle groups by centroid x; locks fill the selected group then spill to non-elite enemies. Elites (every 8th air formation, `eliteEntry`) are only targeted when selected; `smartTarget` simOpt = attentive harness bot. Locks quantized to sixteenths (director `sixteenth`), volleys on bar lines, `LaserView.hitAt` on the next beat. Snapshot `bar` pulse drives scenery/camera/bloom.
- Formations carry an id; clear rate = killed/resolved over finished formations (kill or pass the ship). Air formations ≥5 all killed = PERFECT (+score, callout). Walls: build/drop downbeat, ≥7s apart, gated by `choreograph(..., gate=true)`.
- encounters.ts supplies continuous top/side entrances, combat eligibility, gunner designation, fire intervals, and readable aimed/fan/petal patterns. No offscreen acquisition or firing; flagship mounts follow its entering hull.
- Up to 60 aircraft plus ground groups; 160-projectile budget (~60 live on average). Ground turrets/tanks have separate models, aiming barrels, and ground laser impacts; passing a ground unit does not ram the ship.
- Scenery is regenerated per frame from (segment seed, tile) into fixed-size instance pools; no geometry/material allocation on biome changes.
- Flagship batteries group with the flagship for targeting; auto-select prefers the flagship group during a fight.

## Achievement curve
Depth rewards now use the defeated flagship's sector (5 / 10), stored under a new
`bestDefeatedSector` counter; sector advances caused by escapes do not qualify.
Combo Breaker requires 1,500; Full Spectrum requires tier six (beyond the starter
craft ceiling); Flawless requires three rides with six flagship victories and no
ship losses. Existing achievement IDs and earned rewards are preserved.
