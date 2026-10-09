# cadenza — Cadenza (SPEC §6.5)


Music racer (formerly "Wattsurf", id `wattsurf`; `core/renames.ts` migrates saves, history and tuning). The shell opens the
media picker first; the sim reads `ctx.media.timeline` and `positionS()` (heard position). Mono mode only (Classic = later).

## Sim (`sim/`, pure)
- `track.ts` `buildTrack`: one zone per section (hue from the song palette + 47°/zone), speed/distance/height/heading at hz,
  trainer grade (builds 2 %→maxGrade, drops crest then 0), banks (`roll`), tunnels (breaks + some verses, ≤ 45 s), blocks from
  onsets (min gap 0.36/0.22/0.11 s, lanes 3/3/5; greys never in a neighbour's lane). `stunts`: builds ≥ 13 s end in a 9 s
  climbing 360° helix (≥ 20 m clear of the coil below); **every drop opens with a launch**: a 2.6 s 360° corkscrew on the drop,
  block-free (`LAUNCH` margins), then the hard bank. `effortAt`: cruise Z2 / climb Z3–4 / sprint Z4–5 capped 10/15/20 s then
  hold / recover, with ERG fractions. `rateTrack` for the picker.
- `sim.ts`: menu (difficulty, trainer Grade|ERG, reduced flashing), controls (paddles = continuous absolute position; D-pad/Z/A step; nearest lane judges pickups/mines),
  judging, score/chain/Overdrive, shield/dropout/reboot, trainer effect `track`, clean zones, drops held, best scores.
  Off target: `effort.under` (eased; after a 6 s start grace) drains the shield after `underGraceS` and drives the grey-out +
  music FX; `effort.over` (above the zone ceiling; never sprints/ERG) overcharges the ship. Launches: avg power ÷ sprint floor
  (rpm ÷ 90 in ERG) over the roll → `rateLaunch` perfect ≥ 1.15 / great ≥ 1 / good ≥ 0.85 / weak; bonus 500 × 3/2/1/0 × zone.
  `recaps` per finished song (score, accuracy, best chain, on-target %, launches, 1 Hz effort strip). Cues `chain` (25, 50,
  then every 50; `isChainMilestone`), `chainBreak`, `launch`. `effort.floorFtp/ceilingFtp/cadence` feed the gauge.

## Render (`render/`)
Shared uniforms (`look.ts`) drive every shader. `path.ts` (rolled frame), `trackMesh.ts` (ribbon, walls, tunnels, pylons,
arches), `blocks.ts` (neon cubes; mines = black spiked balls with white-hot tips; absorb-into-ship; misses crumble against a
viscous wall and ooze back in the craft's frame; mine-hit shards; `firework`), `city.ts` (towers, none near a helix),
`craft.ts` (lofted hull, canopy, pods, wings, fins; flash, knockback + bubble, ghost, overcharge arcs, under sputter; shockwave
`ring`; chain-tier trail gold / rainbow / wide rainbow), `gauge.ts` (power bar on the inside of both walls filling forward,
white target gate 16 m ahead, red ceiling posts; `gaugeMarks` tested; rpm vs 55 in ERG), `post.ts` (bloom + lens + `gray`),
`renderer.ts` + `steering.ts` (ship, bank and camera interpolate 30 Hz steering at display refresh; camera rolls with banks; launch punch-in + fling-out, streak burst, fireworks on clean zones / perfect launches),
`hud.ts` (score + chain pops, zone/target, shield, prompts low, launch meter + rating, song recap card), `layout.ts` (tested).
AV penalty: 3 s grace, 12 s ramp, eased attack/recovery, quadratic shortfall, capped at 0.6; reduced flashing halves gray.

## Dev / tests
`/dev/cadenza.html?script=target-follow&sec=40&autopilot=1&songs=2` (synth, no audio; `sec=49.4&speed=0` = launch roll,
`script=z2&sec=44` = under, `script=intervals&sec=86` = over, `sec=174.3` = recap). `/dev/craft.html` = ship states + mine.
`node scripts/cadenza-render-smoke.mjs` against Vite checks finite bloom, bounded GPU allocations, smooth audio.
Scenarios: automixed EDM set (launches ≥ great), idle dropout (no launch bonus), mixed continuous album on casual.
Gaps: Classic mode; iPad GPU cost unmeasured (low-FX switch if needed); tune launch thresholds with real rides.
Rolling analysis: timeline revisions extend future road; `extendTrack` preserves ridden geometry/block indexes.
Nearby road/city/blocks only (≤140 s), dispose replaced GPU resources. Clamp shader light before bloom; safe pow/vignette math.
