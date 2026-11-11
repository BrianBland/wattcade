# fullsend — Full Send (rocket-bike sprint workout), 2D mockup
CONTRACT-REQUEST: none.
Design doc: the "Rocket bike sprint game: design brainstorm" Claude Doc. Dev game (`devGames`), so it shows in the picker with `?dev=1`.
## Sim (`sim/`)
- `tour.ts`: fixed tours (`quick` ~19 min, `classic` ~27 min). Each set = a set piece in a chosen biome with an effort length and a recovery. Titles, chaser per biome (volcano/jungle/desert = T. rex, snow = avalanche, sea = wave, moon/sky = boulder), default medal thresholds (FTP fractions).
- `physics.ts` (pure, tested): speed is linear in power/FTP (`kmhPerFtp`, 200) with a spool lag, so the same canyon works at any FTP. Leap gap = ballistic range at bronze speed; loop radius = v²/5g at bronze speed; `loopExit` says where a slow rider comes off; `smashCount`; `medalFor`.
- `sim.ts`: phases warmup → (approach → effort → payoff → recovery)×N → cooldown → done. Leap/Smash/Loop sit at the END of the sprint: their x is re-anchored each tick to `x + v × timeLeft`, so the sprint is exactly `effortS` long whatever your speed. Dive/Outrun span the sprint. Medals come from the built-up speed (leap/smash/loop) or the mean FTP fraction (dive/outrun). Misses are gags (geyser/rescue, foam pit, turtle tow, wall topples) and the tour always continues. Recovery power above `cruiseCap` adds no speed.
- Trainer: sim mode + virtual gears. Cruising grade = the warm-up terrain stretched `hillStretch`× (hills fade flat for set pieces). Overrides: run-up `runupGrade` 1 %, the loop climbs to `loopGrade` 5 % at the top and eases to the airtime grade on the way down (`loopGravity`/`loopSlowMo` stretch it to ~4–5 s), airborne `airGrade` −2 %, smash `smashGrade` 3 % (+2 % as hay piles on; the hay stuck to you keeps dragging for `smashHoldS` after), dive `diveGrade` 2 %.
- Biome changes happen in the recovery before a set (`blendS` cross-dissolve). `hooks.shielded` is true during each sprint, so the `hook-responsive` script sprints them.
- Controls: none required. A = mid-air trick (style points). Shifters = virtual gears.
- Tunables: `fullsend.*` (speed, spool, cruise cap, approach, gravity, launch angle, slow-mo, smash count, chase gaps, air margin, hills, grades, and `<kind>Bronze/Silver/Gold`). `tourScale` shortens warm-up/recovery/cool-down for testing.
## Render (`render/`)
- Canvas 2D in the warm-up style (low-res buffer, crisp upscale, full-res text). **Borrows the warm-up's biome art read-only** (`LOOKS`, terrain, blend helpers) for the mockup; if Full Send graduates, move the shared biome art to a common module.
- World scale `PPM` 4.5 px/m both ways (the bike reads ~6 m long, so 80+ mph scrolls ~500 CSS px/s). Loops are drawn round and the camera rises to fit them. `layout.ts` (tested) keeps the banner, sprint meter, speed, status and medal stamp above `insets.bottom`.
- `props.ts`: canyon (lava / glacier / river), flooded tunnel, loop ribbon with A-frame supports (vines / lacquer + lanterns / steel), stacked square hay bales that burst into straw (and straw stuck on the rider), other smash obstacles, chasers (an animated T. rex, avalanche, wave, boulder), and the rocket on a rack over the back wheel (stays to the rear axle and seat post, nose under the saddle; flame scales with power).
- Preview: `dev/fullsend.html?script=hook-responsive&tour=classic&sec=300` (`manual=1` exposes `window.__fs.until(pred)` for captures).
## Tests
`npx vitest run src/games/fullsend` (scenarios via runHeadless, determinism, physics, tour lengths, layout).
