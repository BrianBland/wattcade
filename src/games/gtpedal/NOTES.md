# Grand Theft Pedal (gtpedal)

CONTRACT-REQUEST: add optional `GameSim.settings?(): GameSetting[]` (+ `GameSetting` type) to contracts.ts for per-game
pause-menu settings. Today the shell reads it structurally (`src/shell/gameSettings.ts`) and sends
`receive({ type: 'setting', key, value })`, so no contracts.ts edit was needed; formalising it would type-check it.
Design: `DESIGN.md`. Status: milestone 1 (playground feel). No missions, `isOver()` always false.

## Layout
- `sim/world.ts` (pure): 400 m map (`HALF` 200; the original 240 m `CORE` in the middle) with districts (`GEN_BLOCKS`: rowhouses/shops/stalls/villas, hillside `HILL`, park `HALFPIPE`/`BOWL2`/`MOUNDS`, `FOOTBRIDGES`, `BOATS`, `TRAM_ROUTES`); `buildingAt` uses a 10 m spatial hash. `heightAt(x,z,bridgeRad)` analytic height field: kickers/berms
  (concave face, gentle back, rolled-off sides), sunken bowl, sunken plaza (5 steps down, ramp out north),
  canal with a two-leaf drawbridge (`bridgeAngle(t)` cycles closed/rising/open/falling), 6 m edge walls.
  `BUILDINGS` (AABBs), `LINES` (path/ramp/rail/tram polylines), `PARKED_BIKES`, `nearestOnLine`.
- `sim/physics.ts` (pure): `stepBody` — drive from effort (power3s/FTP) × bike power, drag + rolling decay,
  slope gravity, ground follow, launch when ground drops away faster than a ballistic arc, landings, building
  hits (crash above `crashSpeed`, bonk below), walls (>0.8 m step), grind on tram/rail lines, line snapping.
  Heading: 0 = +z, π/2 = +x; rider's right is (-cos h, sin h). `switchLine` for paddle taps.
- `sim/bikes.ts` bike table. `sim/weapons.ts`: ammo tables, `pickLock`, `lob`, `stepProjectile`, `radialLaunch`, patches.
- `sim/cops.ts`: Segway/horse `stepCop` (sight, pursue via `sim/nav.ts` A* graph, stun/flail/launch, tackle).
  `sim/nav.ts`: nodes (line points + building corners), visibility edges, `findPath`, `visible`.
- `sim/sim.ts`: modes bike / foot / ragdoll. Paddle tap (< `tapS`) = switch line (bike) or cycle target (foot);
  hold = free steer (`lineLeave` hold) or switch at forks (`forks`); in the air paddles spin. A = dismount/steal,
  B = fire (bazooka launch only), Y = hop,
  Z = grind, shifters = cycle weapon. Tricks (spin ≥180, grind ≥0.6 s, big air) give a decaying speed boost.
  Spin landed sideways or wall hit ⇒ ragdoll, then on foot; bike left behind. Canal = splash, bank respawn.
  Weapons/cops/heat/co-op/busts: see DESIGN.md. Test setup opts: spawn, npcs, heat, cops, copSpawn, ammo, startWeapon.
  Trainer grade: `terrain` sim effect = slope × grade scale, capped, quantised to 0.5 %; both from the pause menu
  (`settings()`/`receive`, saved) falling back to tunables `gradeScale`/`gradeMax`.
  Autopilot (`simOpts.autopilot`): waypoint loop with wall probing, brakes for corners / open bridge
  (`daredevil: true` shuttles the avenue and asks target-follow for `sprintFtp`×FTP; emits `bridgeAttempt`), swaps onto other bikes it passes.
- `render/renderer.ts`: three.js blocky world, id-keyed pools for cops/projectiles/patches/blasts/flames/crates,
  3D reticle, co-op pad, DOM HUD + event toasts. `render/camera.ts` pure jump-aware chase cam (tested).
  `render/chars.ts` procedural people (instanced crowd rig), bikes, Segways, horses.
  `render/world3d.ts` cel city (chunked merged facades/props, toon water, `buildTram`), `render/jsr.ts` toon/ink/props/sky/grade (now on everywhere); `snapshot.art` from `artStyle` tunable or `simOpts.artStyle`. `render/layout.ts` pure HUD layout + camera view offset
  for `insets.bottom` (tested).

- `sim/trams.ts`: `stepTram`, `tramAt`, `behindTram`; sim handles roof riding (`onTram`), hitching (Z), knock-offs, NPC/cop launches.
- Steering: paddles = proportional free steer (smoothed), D-pad = locks (`steerLock` line/npc/bike in the snapshot); `stepBody` never auto-acquires lines (root cause of the old snapping). Z grabs a rail for grinds (`Body.grindAuto`).
- On foot speed from power (`runSpeed`, `footFtp`). NPC cyclists are `Npc`s with `bike` set; `jack()` / `dropBike()`; `cyclistsAt` sim opt for tests/captures.
- `dev/capture.ts` accepts `&timeline=[...]` (TimelineInput) for scripted-input clips.

## Not done / next
- Cable car / ferry (optional) not built. Hedges/trees are render-only (ride through them).
- Tandem/cargo special rules; e-bike heat is the only per-bike rule besides handling.
- Held back: achievements, cosmetic titles, card clip (arcade.test accepts `drawCard` art when no clip exists;
  achievements.test lists gtpedal as PENDING). sfx.
- Not tuned on a real trainer yet; all bike↔game numbers are `gtpedal.*` tunables.

## Render perf / fixes
- Drawbridge flicker: the static ground mesh used heightAt(bridge=0), i.e. a closed deck at y=0 coplanar with the leaf
  tops -> z-fighting. Ground now keeps open water under the bridge; only the leaves draw the deck.
- Static batching (`render/bake.ts`): merges a subtree into one vertex-coloured toon mesh + one mesh per extra material
  (ink, shadows). Parked bikes ~2 calls, rider bike ~6 (frame/ink, 2 wheels, crank, bars), Segway 4, horse 22,
  plaza props 3 + floor, co-op 1, nav lines 1. `globalThis.__gtpInfo` exposes renderer.info (calls/tris) for capture scripts.
- Lock-on: `render/reticle.ts` billboarded brackets + chevron, ink outline, muted weapon tint, depthTest off, snap-in.
- r6: traffic recycling near the player (cyclists/peds), cyclist LOD in chars.ts, tram hop (Y alongside), TREES/HEDGES solid (world.ts), new kickers/rails/crates, render/fx.ts VFX, rebalance. See DESIGN "Round 6".

## R8: people + weapons
- `render/textures.ts`: all textures are generated from code at load into `DataTexture`s (no image files, no canvas, so tests can build them): a 256² face atlas (4 face variants × neutral/angry/scared/dazed) and a 64² tileable fabric detail map (folds, seams, stitching, hem, grime) multiplied into clothing colours.
- People (`render/chars.ts`): rebuilt part set: tapered torso/limbs, hands, rounded shoes with soles, face decal (instanced, per-instance atlas cell via `aCell`), hoodie hood, jacket/uniform collar, vest shell, skirt, cargo pockets + belt, beanie / ball cap / helmet / cop cap, backpack / messenger bag; cops get uniform, badge, belt, gloves. Paired limbs share one InstancedMesh (2 instances per person), so the whole crowd is 45 draw calls (was 36) regardless of head count or outfit mix. Expressions: angry (jacked victims, chasing cops, you while attacking), scared (flailing, airborne, stoker), dazed (lying down, groggy).
- Stoker: `flailArms` windmills both arms over the head + scared face.
- Weapons (`render/weapons3d.ts`): bazooka (tube, venturi, optic, sights, grips, sling, warhead), rocket, glass bottle (green/brown), molotov (bottle + rag + flicker flame), pineapple grenade (ridges, spoon, ring pin), oil can. Each is one vertex-coloured merged mesh + ink (2-4 calls). Projectiles use the same models.
- Sim: weapons now have a short wind-up before release (`WINDUP`: bazooka 0.2 s aim, grenade 0.45 s pin pull + throw, molotov 0.4 s light + throw, bottle 0.3 s, oil 0.12 s); snapshot exposes `cast` and `lastShot` for the animations. Combat tests shifted by the wind-up.
- Held: in hand on foot, the bazooka slung on the back / shouldered while aiming (recoil kick), throwables at the hip while riding and in the hand during the throw.
- Dev: `dev/gtpedal-lineup.html?view=people|cops|weapons` (lineup stills).

## R9: underworld (cash, fence, dealer, gang, witnesses) + Razor scooters
- `sim/crime.ts`: locations (FENCE chop shop 100,-36 · DEALER van -108,-104 · TURF Deck Rats 126,18 r26), fence prices (`BIKE_VALUE` × flat 0.45 × hot 1.6), hot list (2 kinds, rotates every 120 s, hash of seed+slot), dealer stock, gang rewards, heckles. Van is a solid obstacle.
- Cash + rep persisted in the save (`GtpSave.cash/rep/sales`), written immediately on sale/buy/gang result.
- Crime layer is on by default, off for the autopilot unless `simOpts.crime` (gang: `simOpts.gang`, default on unless explicit `npcs`). Autopilot world also gets no scooters in traffic.
- Witnesses: a crime (steal, jack, stoker grab, civilian blast) lands only 35% of its heat at once; up to 2 bystanders in sight (22 m) pull out a phone (`callS` 3.2 s) and add the rest +0.4 unless knocked down / you get 45 m away.
- Gang: 4 Razor-scooter riders in mustard helmets/jackets. Enter the turf → provoked: chase, ram (5 s cooldown), lob bottles, ram cops too. Knock all off their scooters → $150 + 3 rep (respawn after 120 s); escape 45 m beyond turf for 4 s → $40 + 1 rep. Scooters are slow on grass/stairs (so is the gang).
- Scooter (`BikeKind 'scooter'`): power 0.85, top 0.6, turn 1.8, hop 0.55; grass ×0.3 top, stairs ×0.22. Model = deck/grip tape/fender/T-bar/tiny wheels; kick-push foot loop driven by the crank phase.
- Render: `render/crime3d.ts` (chop shop canopy + garage, van, turf drums/couches/banners; sign text from an in-code 5×7 pixel font), `render/crimehud.ts` (DOM only: cash/rep/hot list, dealer menu, fence quote, toasts, speech/phone bubbles, edge-of-screen arrows).

## R10: street races
- `sim/race.ts`: 4 routes (Drawbridge Dash / canal, Old Town Loop ×2 laps, Market Grind, Hillside Scramble), gates, `payout`, `rubberBand`, `progress`, `skipping` (missed checkpoint). Pure.
- Sim: stop on a bike at a chalk start line (hooded organizer + flares + edge marker), Ⓐ = enter (buy-in from cash). 3 s countdown holds you on the grid; rivals (ids 600+, `racer`) ride gate→gate (straight cuts = shortcuts), wait at an open drawbridge, brake for trams, rubber-band ±`raceRubber` around you, shove when alongside, lob the odd bottle, remount (dropped bike / jack a cyclist / spare) after getting blasted. Pace `RIVAL_PACE` ≈ what you hold at 0.6/0.75/0.95×FTP (easy/normal/hard, `raceDiff`), so effort relative to FTP decides it. Heat +`raceHeat`/s while racing. Drafting 1.5–7 m behind a rival = +`draftAccel`.
- Quit: get off (on foot 12 s), ride >150 m from the next gate for 5 s, or `receive({type:'quitRace'})` (menu hook; the shell pause menu has no buttons — CONTRACT-REQUEST: an action item in `settings()` would let it surface there).
- Persist: `raceBest[routeId]`, `races`. Autopilot: races off (`simOpts.races`). Test/capture hook `simOpts.autoRace` steers gate-to-gate.
- Render: `render/race3d.ts` (instanced flares/arches/chevron ribbon, ~6 calls), race HUD/countdown/results in `crimehud.ts`; NPC full bike rigs capped to the 4 nearest.
