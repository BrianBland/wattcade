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
| Paddles (L/R) | **free steering, always**: proportional (half press = half lock), smoothed like handlebars (`steerSmoothS`); never snaps you to a line; cancels any D-pad lock; **in the air: spin** | walking direction (turn) |
| D-pad ◀ ▶ / arrow keys | **lock steering**: tap cycles locks left→right among lines ahead (within `lockR`) and NPC cyclists ahead; while locked the bike rides the line hands-off (or chases the cyclist, pulling up alongside on their left = jack range). The lock ends at the line's end. If there is nothing to lock onto, a held arrow is plain ramped steering (`dpadRampS`) — so keyboard-only play always works | tap cycles target locks (parked bikes, cyclists, people) by bearing; locked = auto-walk there along the nav graph |
| A | **jack** the cyclist next to you (`jackR`), else dismount | jack a cyclist next to you, else steal/mount the nearest (or locked) bike |
| B | fire current weapon at lock-on target | same |
| Y | hop | — |
| Z | grind: grabs the rail/tram track you're riding along while held; hitch a moving tram from behind | — |
| Shifters | cycle weapon | same |
| Pedals | speed | **walk/jog/run: speed = `runSpeed` × (power / (`footFtp` × FTP))^0.8, capped 1.3×; zero power = stand still** |
| Desktop | no trainer needed: the repo's fake-bike keys (W/S cadence, E/D power) drive power; arrows = D-pad | |
Indicator: cream chevrons stream down the locked line ahead; a pulsing ring + bobbing chevron mark a locked target; HUD shows `🔒 path line · ◀ ▶ next · paddle = free`; "Ⓐ JACK THAT BIKE!" when a cyclist is in reach.

### Why steering used to "randomly snap back and forth" (root cause, fixed)
`stepBody` re-acquired the NEAREST line every tick whenever no paddle was being held long enough to count as a hold
(< `tapS` = 0.35 s counted as "not steering"), within `snapR` and ±0.5 rad, in either direction. Lines were dropped at 2.5×`snapR`
or at their ends and immediately re-grabbed — at crossings the nearest line changes, so you'd get yanked onto the cross street;
releasing a paddle after a turn snapped you back onto whatever line was near; the first 0.35 s of every paddle press did nothing
(tap window) and then free-steered, then snapped again on release. No hysteresis anywhere. Now there is **no automatic acquisition
at all**: only an explicit D-pad lock (or holding Z for a grind) attaches you to a line, and paddles detach immediately.
The `lineLeave` / `tapS` tunables are gone. Optional `rampAssist` (0 = off, default) gently aligns you with a ramp/rail you're already
riding along within 0.35 rad.

## Bike-jacking + NPC cyclists
`cyclists` (default 16) NPC cyclists ride the path network on varied bikes (city/fixie/bmx/cargo/e-bike/tandem), keep right,
ease off behind same-direction traffic, pull over for a faster rider coming up behind, and turn back at walls/line ends.
Ride or run up alongside and press A: you yank them off (comedic sideways launch), ride away on their bike, +1 heat (counts as a
steal); the victim tumbles, then chases you shaking a fist for ~9 s. Weapons, oil, fire, trams or ploughing into them knock
cyclists off and their bike drops where they fell (stealable). Only 4 parked bikes remain.

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

## Art direction: calm cel city (render-only)
`gtpedal.artStyle` = `cel` (default, everywhere) | `classic` (plain blocks, debug fallback). The JSR sliver gating is retired:
toon ramp shading (3-step `MeshToonMaterial`), thin warm-brown ink hulls, calm grounded palette (brick/terracotta, sandstone,
sage + deep greens, weathered wood, slate, cream), sky gradient, warm low golden sun + warm haze fog, one gentle grade pass.
`render/world3d.ts` builds the city procedurally (deterministic hash): rowhouses subdivided into 6-9 m houses with varied
height/colour, framed windows with mullions, doors with stoops, balconies with railings, flower boxes, shopfronts with
striped awnings, gable roofs with chimneys and dormers or flat roofs with parapets + rooftop gardens; towers dressed on all four
faces; market stalls with striped canopies and crates; hillside villas; quay walls + coping, footbridges, moored boats; tram
stops (platform, shelter, sign), overhead wire poles; toon trees, grass tufts, hedges, lamps, benches, bike racks, planters.
Canal water is a toon shader (hard-edged ripple bands, animated foam at the quay walls). Ground is vertex-coloured per district.

### Districts (map 400 × 400 m, ~2.8× the old 240 m core which is unchanged in the middle)
- **Old town** (north): three rows of brick rowhouse blocks, cross streets every ~64 m, tram line 2 on `TRAM2_Z`.
- **Canal quarter**: the canal now runs from the foot of the hillside to the east edge; drawbridge + two fixed footbridges; boats.
- **Park** (east): half-pipe channel with decks, second bowl, grassy mounds.
- **Market** (south): shop rows around a square full of stalls.
- **Hillside** (west): smooth 16 m climb (real trainer grade), switchback path, villas.

### Perf
Static world merged per 100 m chunk into one vertex-coloured toon mesh + one ink mesh (+ one baked props batch); three.js
frustum-culls whole chunks. Measured (`renderer.info`, 960×540): street views 57-116 draw calls, ride/tram clips max 126,
full-map aerial 168 — all under the 200 target. Triangles 0.2-0.45 M per street view.

## Public transit (sim: `sim/trams.ts`, pure)
Two tram routes (`TRAM_ROUTES`) shuttle end to end, easing into each stop (dwell 4 s, 6 s at termini) and turning back.
- Grind the rails alongside (existing tram lines).
- **Tram surfing**: land on the roof from a jump and ride along; paddles/D-pad turn you round; Y hops off with the tram's speed.
- **Hitch**: hold Z just behind the rear bumper of a moving tram to be towed; released when you let go or it stops.
- Moving tram + you on the ground = knocked off (cartoon launch). A stopped tram is a wall you bounce off.
- Pedestrians and cops in its way get launched. Autopilot waits for trams at crossings.
Optional cable car / ferry: not built (the hillside tram route already climbs the hill).

## Characters & bikes (render-only, `render/chars.ts`)
Procedural, cel-shaded with warm-brown ink (normal-pushed back-face hulls that work on merged + instanced geometry).
- People: rounded capsule limbs/torso, sphere head, hair cap/bun/bald/helmet/cop cap; varied skin/clothing from a
  calm palette (seeded by id). One template rig posed per person: pedalling (2-bone IK to the real pedals, hands on the
  grips, torso lean from reach), walk cycle by distance, flail on fire, ragdoll when launched/crashed/stunned, Segway
  stance, mounted seat. The whole crowd (pedestrians + cops + rider) is one InstancedMesh per part (+ ink): 36 calls.
- Bikes: merged tube frames per type (city step-through + basket, fixie drops, BMX small wheels + risers, cargo long
  low frame + box, tandem two seats/cranks, e-bike battery), spoked wheels spinning with speed, cranks/pedals with
  cadence (fallback: speed), bars steer and the bike leans with yaw rate. Segways and trotting horses for cops.
- `artStyle: classic` falls back to the old boxes.

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

## Round 6: lively streets, tram surfing, solid scenery, juice

- **Traffic**: 40 NPC cyclists + 30 extra strollers (tunables `cyclists`, `peds`) on top of the 14 rng pedestrians. Every 0.5 s anything farther than `recycleR` (95 m) respawns on a path near you: behind the camera (22-80 m) or out in the haze ahead (70-95 m), so nothing pops in view. Placement is world-hash based (no rng draws), so the sim stays deterministic. Render LOD: cyclists inside 28 m get the full animated bike rig; 28-120 m get one instanced silhouette per bike kind (2 draw calls for all of them) with the instanced rider.
- **Tram surfing**: ride right alongside a tram (within its length, 0.35-2.6 m off its side) and the Y button shows **TRAM HOP!**. That hop is boosted to clear the roof by `tramHopV` and drifts you sideways onto the car, where the normal roof landing takes over (`onTram`, a `tram surf` trick).
- **Solid scenery**: `TREES` (trunk hitbox about 0.9 m, 6 m tall) and `HEDGES` (3 × 1.1 × 1.3 m) live in the sim and are drawn from the same list. `buildingAt` covers them and `boxTop` uses the base height (`y0`), so hillside villas and trees are solid on slopes too. Walking slides along obstacles, nav visibility avoids trunks, and the autopilot probes in a 3-wide fan.
- **More lines**: 9 district kickers (old town ×3, market ×2, hillside ×3, park), quay copings along both canal banks, stoop ledges on the old-town rows, a market handrail, and a hillside terrace rail. They render as slatted wooden wedges with a steel lip and as steel rails on posts. There are now 14 ammo crates across the districts.
- **VFX** (`render/fx.ts`, 3-4 draw calls; tunables `fxSpeedLines`, `fxSpeedLineMin`, `fxDust`, `fxShake`, `fxSquash`, `fxSmoke`): speed-line streaks above 11 m/s, dust puffs on landings and crashes, cartoon smoke puffs that grow then shrink (no transparency) on booms and molotovs, screen shake on blasts, crashes and tram hits, and a squash-and-stretch bounce on landing.
- **Rebalance**: `bazookaV` 18→12.5 (peak about 5-6 m, stays in shot), `grenadeV` 14→11, `heatCoolS` 20→14, cops spawn about `copSpawnD` = 75 m away (was 55). Ploughing through a cyclist only costs 7% speed.
- **Jacked victim**: flung ahead and to the side of you, so the tumble happens in front of the camera, which rises and pulls back for 3 s. The victim then chases at 4.2 m/s, and once you've left them more than 16 m behind they stand and shake a fist.

## Round 7: heavy knockdowns, start on foot, tandem stoker, grit

- **Knockdowns**: tumbling bodies (the player's ragdoll, NPCs, cops) use `ragGravity` = 36 m/s², while bike jumps keep the arcade 14. Launch speeds are low: knock-offs are 2.5-3.2 m/s (ground-level tumbles), trams 6 m/s (~0.5 m), and explosions peak around 1.7-2.2 m (`bazookaV` 12.5, `grenadeV` 11). When a body lands it thuds (dust, small shake), keeps 55 % of its horizontal speed as a slide (`slideFric` 9 m/s²), then lies there: NPCs and cops for `npcDownS` = 3.2 s, the player for `ragdollS` = 1.7 s. After that, `groggyS` = 1.4 s of slow, wobbly walking.
- **Start on foot**: a ride now begins on foot with no bike (sim opt `start`, default `'foot'`; tests and scenes pass `start: 'bike'`). The toast shows "Grab a bike: jack a passing cyclist (Ⓐ) · ◀ ▶ to lock one", and two pool cyclists are routed past the spawn so the first jack happens within a few seconds.
- **Walking like a bike**: paddles turn you proportionally (`footTurn`) and power sets your forward speed. There's no auto-walk: a D-pad lock only nudges your heading toward the target while you aren't steering. Only the autopilot still pathfinds.
- **Tandem**: alone it's sluggish (power 0.45, top 0.62, turn 0.45). Ride up to a bystander and Ⓐ snatches them onto the back seat (Ⓐ priority: jack a cyclist, then grab a stoker, then dismount); with them it becomes power 1.8, top 1.3. A bouncing arrow marks the nearest eligible bystander within 30 m, and the toast says "Tandem needs a stoker! Grab a bystander (Ⓐ)". The stoker squirms and screams ("AAAAAAH!"), and a crash throws them off. Grabbing one adds heat, and `stats.stokers` counts them.
- **Grit pass** (visual only): the grade pulls saturation down about 30 %, adds a dusty warm-grey lift, crushes the toe, and adds fine film grain and a heavier vignette (tunable `grit`). Lighting moods (`mood`): 0 hazy late afternoon, 1 overcast, 2 late dusk. Baked vertex grime (blotches, speckle, soot near each storey's foot) on buildings and ground; ~1400 pieces of litter (flyers, cans, bin bags, bottles) near paths and walls. The heat stars moved to a wanted-poster HUD that shakes at 3+ stars. Cops now have harsh double-flash red/blue light bars with glare sprites, and knocked-down cops lie flat.

## Round 8: people and weapons
- People have faces (eyes, brows, mouths, four expressions), hands, tapered silhouettes, and varied outfits (tees, hoodies, jackets, vests, tanks; pants, cargos, shorts, skirts; beanies, caps, helmets; backpacks, messenger bags), with painted-on fabric folds, seams and grime. Cops wear navy uniforms with a badge, belt, gloves and cap (or a white helmet on horseback).
- Weapons are real held models with wind-up animations: shoulder the bazooka and feel the recoil; pull the grenade pin; light the molotov rag, wind up and throw; pour the oil. What you throw is the same model you held.

## Round 9: the underworld
- Cash (HUD, saved). Spokey Joe's Chop Shop buys stolen rides (by type, flats pay less, rotating hot list pays ×1.6). Van Guy sells ammo from his van: Ⓐ talk, ◀ ▶ / paddle tap browse, Ⓐ buy, Ⓑ leave.
- The Deck Rats, a Razor-scooter gang, own a turf in the park: ride in and they chase, ram and lob bottles (and pick on cops). Wreck them or outrun them for cash + rep. Tip: lure them onto grass, where scooters crawl.
- Witnesses phone it in: most of a crime's heat only lands if a bystander's call goes through. Knock the caller over or leave.
- The crowd talks back: dodges, shouts, middle fingers, heckles.
- Razor scooters are stealable too: kick-push speed from your power, low top speed, very tight turns, small hops, grinds; bad on grass and stairs.
- Arrows at the screen edge point to the chop shop, the van and the turf.

## Street races (R10)
Underground races from chalk start lines (see NOTES R10): buy-in, 3-2-1-GO, flare-and-chalk-arch gates with a chevron ribbon, position/lap/time HUD, missed-checkpoint warning, results panel with payout by place (winner: prize + 60% of pot; 2nd 25%; 3rd 15%), best times per profile. Rivals are FTP-relative paced and rubber-banded; on hard you need ~FTP+ to win. Cops get drawn in, trams and the drawbridge cycle get in the way.
