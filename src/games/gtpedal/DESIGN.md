# Grand Theft Pedal — design (v1: playground)

A 3D **arcade** open-world bike game. Your watts are the engine: power becomes momentum, momentum becomes stunts,
jumps and getaways. Tone: Looney Tunes / Wile E. Coyote. Everyone gets launched, soot-faced, and is fine a second later.

## Setting
An absurd urbanist utopia: no cars, everyone bikes or walks. Every green space is secretly a skatepark: berms are
quarter pipes, sunken lawns are bowls, green roofs are kickers. Tram lines run down the main street (grindable).
A canal with a drawbridge that keeps cycling partly open, so you can try to jump the gap. Blocky, bright, low-poly.

## Feel pillars
1. **Arcade momentum, not realism.** Speed comes from `power3s / ftp`, so a 150 W rider and a 350 W rider both
   clear the drawbridge at the same *relative* effort. Generous coasting: easing off never kills the fun at once.
2. **Your legs feel the terrain.** On climbs (berm faces, bridge leaves) the sim sets `ctx.resistance`
   `{ id: 'terrain', mode: 'sim', gradePct }`, scaled and clamped (profile `maxGradePct` still caps it).
3. **Steering assist everywhere.** No analog sticks, so the game snaps you to sensible things.
4. **Chaos is cheap.** Steal a bike in one button. Crash into a wall and ragdoll off. Blow people into the sky.

## Controls (Zwift Ride)
| Input | On bike | On foot |
|---|---|---|
| Paddles (L/R) | tap: switch to the next line left/right; hold: free steer (`lineLeave: hold`, default) or switch at forks only (`lineLeave: forks`); **in the air: hold to spin** | tap: cycle candidate target (bikes, path directions); auto-walk to it |
| A | dismount (leave bike parked) | steal / mount the targeted bike |
| B | fire current weapon at lock-on target | same |
| Y | hop | — |
| Z | grind (hold near tram track / rail) | — |
| Shifters | cycle weapon (L down/up = prev/next) | same |
| D-pad | camera nudge / spare | — |
| powerUpL/R pair | reserved (pause) | reserved |

## Movement & physics (pure sim, hand-rolled; no physics library)
- **Drive:** `accel = drive × (power3s/ftp) × bike.power − drag × v² − g × slope × climbMul`. Coasting decay is low.
  Top speed also scales with effort (`effortTop` 0.5: 0.65 FTP → 82 %, 1.0 → 100 %, 1.2 → 110 %), so a sprint matters.
- **Drawbridge:** leaves cycle to 15°; the gap grows with the angle. Tuned so ~1.0–1.2 FTP clears it at every
  phase of the opening and Z2 mostly doesn't (unit test + `daredevil-*` scenarios).
- **Terrain:** analytic height field `heightAt(x, z, t)` built from features (kickers, berms, bowl, stairs, canal,
  drawbridge leaves whose angle cycles over time). Grounded rider follows height; when the ground falls away faster
  than a ballistic arc, the rider goes airborne keeping vertical speed × `launchMul`. Exaggerated low gravity.
- **Lines:** polylines tagged `path | ramp | rail | tram`. On a line the heading eases to its tangent and a lateral
  spring keeps you centred. Paddle tap switches to the nearest neighbouring line on that side within `snapR`.
  Leaving a line is a tunable, `lineLeave`: `hold` (default; holding a paddle > `tapS` free-steers off the line,
  re-snapping when a line runs your way) or `forks` (on a line a hold only switches to the neighbouring line on
  that side; free steering only once you're off a line). Default `hold`: more control, and the 'forks' feel can
  be tried from the debug overlay.
- **Crash:** hitting a building faster than `crashSpeed` throws you off: ragdoll (ballistic body + spin) for
  `ragdollS`, then you stand up on foot. The bike stays where it fell. Slower hits just bounce/scrub speed.
  Landing badly (large spin remainder) also bails you. Falling in the canal = splash, respawn on the bank.
- **Light tricks only, no score:** hop (Y), spins (hold a paddle while airborne; 180/360…), tram/rail grind. Each landed trick grants a short speed
  boost (`trickBoost`, stacking up to `boostCap`). No combo meter.

## Bikes (stolen, never owned)
| Bike | Power | Top | Turn | Air | Notes |
|---|---|---|---|---|---|
| city (default) | 1.0 | 1.0 | 1.0 | 1.0 | baseline |
| fixie | 1.15 | 1.2 | 1.3 (twitchy) | 0.9 | no coasting brake |
| BMX | 0.95 | 0.8 | 1.2 | 1.5 | easiest tricks |
| cargo | 0.8 | 0.8 | 0.7 | 0.6 | plows NPCs aside, can carry a passenger |
| tandem | 1.3 | 1.1 | 0.6 | 0.7 | needs a yanked-off pedestrian as stoker |
| e-bike | 1.6 | 1.3 | 1.0 | 1.0 | raises heat while ridden |
- **Flat tire** (glass): top speed × `flatTopMul`, wobble. Best fix: steal another bike.

## Weapons (Wile E. Coyote) — implemented
Auto-aim: a spinning 3D reticle (coloured by weapon) over the nearest person (bystander or cop) inside a forward cone
(`lockRange`, `lockCone`), sticky while valid. B fires; shifters (either hood) cycle. Ammo per weapon (start
3/4/3/6/3, cap 9); ammo crates around the playground refill one weapon and respawn after `pickupS`.
- **Bazooka:** rocket flies straight at the lock (or ahead); explodes on contact/ground/wall: radial launch
  (`bazookaR`, `bazookaV`). Fireball + smoke ring.
- **Grenade:** lobbed arc onto the target, sits blinking for `grenadeFuse`, then a bigger radial launch (`grenadeR`, `grenadeV`).
- **Oil slick:** dropped behind you (`oilS` lifetime). Cops spin out (stunned), pedestrians slip and flip, and you
  spin out too if you ride through it.
- **Bottle:** lobbed, shatters into a glass patch (`glassS`). Ride over it: flat tyre (top speed × `flatTopMul`,
  `flatWobble`) until you steal another bike. Segway cops get flats too.
- **Molotov:** lobbed, leaves a burning patch (`fireS`); bystanders and cops in it flail around with their butts on
  fire for `flailS` (cops stop chasing while burning).
Heat from hits: +0.5 per bystander (max +1.5 per blast), +1 per cop, +0.5 per molotov.

## Cops & heat — implemented
- Heat 0–5: steals +0.5, weapon hits (above), e-bike riding. Sub-1 heat cools off after `heatCoolS`.
- Quota by heat: Segways = ceil(heat) up to 3; horses at 3+ stars (2 at 4.5+). Spawn every `copSpawnS` on a nav node
  ~55 m away, preferring ones out of your sight.
- **Segway:** `segwaySpeed` on flats, × `segwayRampMul` on slopes, × `stairsMul` on the plaza stairs.
  **Horse:** `horseSpeed` everywhere (slower on stairs). Both pursue on a nav graph (line points + building
  corners, visibility edges, A*) toward you while they can see you (`sightR`, LOS blocked by buildings), else to
  where they last saw you.
- **Tackle** within `tackleR` while you're grounded: BUSTED. You ragdoll, the bike is confiscated, heat → 0, all cops
  stand down, you get back up on foot on the nearest path ~15 m away.
- **Lose them:** out of every cop's sight for `loseS` and farther than `loseDist` from the nearest → heat 0.
- **Bike co-op** (yellow pad with paint posts, west of the bridge): ride through with heat → repaint (new colour), heat 0.
- Cops are launched/oiled/set on fire like everyone else; hurting cops raises heat.

## Camera
Chase cam (`render/camera.ts`, pure, tested): vertical follow lags in the air (`camAirLag` vs `camGroundLag`) and
aims between ground and rider (`camLookMix`); with airtime it pulls back (`camAirPull`), rises (`camAirRise`) and
widens FOV (`camAirFov`) so the ground and the rider are both in shot.

## v1 scope: the playground (NO missions)
One compact neighbourhood (~240 × 240 m):
- Park with berms, kickers and a sunken bowl.
- Plaza with stairs and a handrail.
- Main street with a tram line (grindable rails).
- Canal with a cycling drawbridge on the central avenue.
- NPC pedestrians and riders, parked bikes to steal, a basic cop chase.

## Architecture (per CLAUDE.md / SPEC)
- `index.ts` — `GameModule` (`id: 'gtpedal'`), lazy `loadRenderer()` via dynamic `import()`.
- `sim/` — pure + deterministic (`ctx.rng`, fixed `dt`), no DOM/three.
  - `world.ts` neighbourhood data, `heightAt`, buildings, lines, spawn spots.
  - `physics.ts` rider integration (drive, terrain follow, air, crash/ragdoll), line snapping.
  - `bikes.ts` bike type table. `weapons.ts` weapon table + lock-on. `sim.ts` glue, NPCs, cops, autopilot, snapshot.
- `render/` — Three.js renderer: blocky buildings, height-field ground mesh from `heightAt`, chase camera, DOM HUD.
  `layout.ts` pure HUD layout honoring `insets.bottom` (tested). Camera view offset keeps the rider above the HUD.
- `scenarios.ts` headless balance checks; `autopilot` steers along lines and steals bikes.

## Tunables (`gtpedal.*`, live in debug overlay)
`drive`, `drag`, `rollDecay`, `topSpeed`, `gravity`, `launchMul`, `climbMul`, `gradeScale`, `gradeMax`,
`turnRate`, `snapR`, `snapPull`, `tapS`, `walkSpeed`, `crashSpeed`, `ragdollS`, `trickBoost`, `boostCap`,
`boostS`, `hopV`, `grindR`, `stealR`, `lockRange`, `lockCone`, `lockStickyS`, `bazookaV`, `flatTopMul`,
`heatCoolS`, `copSpeed`, `bridgePeriodS`, `bridgeMaxDeg`.

## Milestones
1. **Playground feel** (this branch): scaffold, world + height field, momentum/jumps, line snapping, crash→ragdoll,
   steal/dismount, bike types, hop/spin/grind boosts, grade resistance, bazooka stub, heat stub, blocky renderer.
   Ride never ends until you quit (no timer, no bust limit).
2. ✅ **Weapons pass:** all five weapons with projectiles, patches (oil/glass/fire), flat tires, NPC ragdolls.
3. ✅ **Cops pass:** Segway + horse AI, heat stars, co-op repaint. (Recumbent SWAT unit: later.)
4. **Juice:** proper models, rider cosmetics (`drawRider` look), sfx/music. Held back on purpose until the game is
   more polished: achievements (+ cosmetic titles) and the arcade card clip (the card uses `drawCard` art for now).
5. Later / maybe: missions, more districts, tandem stoker, cargo passengers.

## Pause menu
"Hill feel" (grade scale, default 0.6×) and "Max grade" (default 8 %) steppers in the shell pause menu, persisted per
rider via `ctx.save`. Mechanism: the sim exposes `settings()`, the shell reads it structurally
(`src/shell/gameSettings.ts`) and sends `receive({ type: 'setting', key, value })`.

## Decisions (from review)
- Line-leaving: both modes behind `lineLeave`, default `hold`. Spins: paddles in the air. Ride-until-quit.
- Grade 0.6× / cap 8 % kept, adjustable in pause. Drawbridge tuned for ~FTP sprints.

## Open questions
- Should busts cost anything beyond the bike (ammo, a timer)? Should cops ever ram you off mid-air?
- Ammo: keep crates, or regenerate slowly while riding hard (watts → ammo)?
- Should `forks` become the default after play-testing?
- Should weapons/cops raise grade too (e.g. dragging a tandem stoker)?
