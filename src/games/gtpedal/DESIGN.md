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
| Paddles (L/R) | tap: switch to the next line left/right at a fork; hold: free steer | tap: cycle candidate target (bikes, path directions); auto-walk to it |
| A | dismount (leave bike parked) | steal / mount the targeted bike |
| B | fire current weapon at lock-on target | same |
| Y | hop (tap on ground); hold in air + paddles = spin | — |
| Z | grind (hold near tram track / rail) | — |
| Shifters | cycle weapon (L down/up = prev/next) | same |
| D-pad | camera nudge / spare | — |
| powerUpL/R pair | reserved (pause) | reserved |

## Movement & physics (pure sim, hand-rolled; no physics library)
- **Drive:** `accel = drive × (power3s/ftp) × bike.power − drag × v² − g × slope × climbMul`. Coasting decay is low.
- **Terrain:** analytic height field `heightAt(x, z, t)` built from features (kickers, berms, bowl, stairs, canal,
  drawbridge leaves whose angle cycles over time). Grounded rider follows height; when the ground falls away faster
  than a ballistic arc, the rider goes airborne keeping vertical speed × `launchMul`. Exaggerated low gravity.
- **Lines:** polylines tagged `path | ramp | rail | tram`. On a line the heading eases to its tangent and a lateral
  spring keeps you centred. Paddle tap switches to the nearest neighbouring line on that side within `snapR`.
  Holding a paddle > `tapS` drops into free steering; you re-snap when a line runs roughly your way.
- **Crash:** hitting a building faster than `crashSpeed` throws you off: ragdoll (ballistic body + spin) for
  `ragdollS`, then you stand up on foot. The bike stays where it fell. Slower hits just bounce/scrub speed.
  Landing badly (large spin remainder) also bails you. Falling in the canal = splash, respawn on the bank.
- **Light tricks only, no score:** hop, spins (180/360…), tram/rail grind. Each landed trick grants a short speed
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

## Weapons (Wile E. Coyote)
Auto-aim: lock-on reticle on the nearest target inside a forward cone (`lockRange`, `lockCone`); it re-picks each
tick (sticky for `lockStickyS`). B fires. Shifters cycle.
- **Bazooka:** rocket → big skyward launch of the target and anyone near.
- **Grenade:** lobbed arc, fuse, radial pop-up of everyone in radius.
- **Oil slick:** dropped behind you; riders spin out.
- **Bottle:** thrown, leaves a glass patch → flat tires (including yours if you're careless).
- **Molotov:** burning patch; pedestrians run through with their butts on fire, bikes get scorched paint.
v1: bazooka only, as a straight launch of the locked target. Others are table entries / stubs.

## Cops & heat
Heat 0–5 stars rises with steals, launches and e-bike use; decays when out of sight of cops for `heatCoolS`.
Cops: Segway (fast, poor jumps), mounted horse (rough terrain, can't climb stairs), later a recumbent SWAT unit.
Lose them (jump the drawbridge!) or roll through the **bike co-op** to repaint your ride (heat → 0).
v1: heat number + one Segway cop that chases; being caught = ragdoll and heat reset.

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
2. **Weapons pass:** all five weapons with projectiles, patches (oil/glass/fire), flat tires, NPC ragdolls.
3. **Cops pass:** Segway + horse AI, heat stars, co-op repaint, drawbridge getaway tuning.
4. **Juice:** proper models, rider cosmetics (`drawRider` look), sfx/music, card clip (`capture-cards`), achievements.
5. Later / maybe: missions, more districts, tandem stoker, cargo passengers.

## Open questions
- Free steer vs line-snap balance: should holding a paddle ever leave a line, or only at forks?
- Should spins be auto (Y in air) or need paddles? (Paddles are also steering.)
- Does the game want an end condition (timed session / "wanted" bust count) or ride-until-quit?
- Grade feel: how much resistance is fun on a 3 m berm vs. annoying? (v1: scale 0.6, cap 8%.)
