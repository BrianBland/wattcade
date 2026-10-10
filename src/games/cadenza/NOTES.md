# cadenza — Cadenza (SPEC §6.5)

Music racer (formerly "Wattsurf", id `wattsurf`; `core/renames.ts` migrates saves, history and tuning). The shell opens the
media picker first; the sim reads `ctx.media.timeline` and `positionS()` (heard position). Mono mode only (Classic = later).

## Sim (`sim/`, pure)
- `track.ts` `buildTrack`: one visual zone per music section (hue from the song palette + 47°/zone), speed/distance/height/heading at hz,
  visual grade, banks (`roll`), tunnels (breaks + some verses, ≤ 45 s), blocks from
  onsets (min gap 0.36/0.22/0.11 s, lanes 3/3/5; greys never in a neighbour's lane). `stunts`: builds ≥ 13 s end in a 9 s
  climbing 360° helix (≥ 20 m clear of the coil below, suppressed during recovery); **planned sprints open with a launch**: a 2.6 s 360° corkscrew,
  block-free (`LAUNCH` margins), then the hard bank. Drops skipped for recovery do not launch or bank hard.
- `ride.ts` plans effort separately: coalesces short normal targets into ≥30 s portions, preserves difficulty-capped
  10/15/20 s sprints, suppresses sprints less than 30 s apart (60 s with Longer Breaks). Breaks/outros/later intros
  get ≥30 s recovery (45 s with Longer Breaks); song handovers get 45 s (60 s). Nearby recovery windows merge.
  If analysis has no breaks, recovery follows at most 120 s work (90 s with Longer Breaks). End-of-set windows may be shorter.
  `effortAt` uses these blocks: 3 s countdown widens the upper bound to Z5 without raising the floor; normal transitions
  allow the union of old/new bands for 5 s before settling. `rateTrack` estimates load from the ride plan.
- `sim.ts`: menu (difficulty, trainer Grade|ERG, reduced flashing, persisted Longer Breaks), controls (paddles = absolute position; D-pad/Z/A step),
  judging, score/chain/Overdrive, shield/dropout/reboot, trainer effect `track`, clean zones, drops held, best scores.
  Off target: `effort.under` (eased; after a 6 s start grace) drains the shield after `underGraceS` and drives the grey-out +
  music FX; `effort.over` (above the zone ceiling; never sprints/ERG) overcharges the ship. Launches: avg power ÷ sprint floor
  (rpm ÷ 90 in ERG) over the roll → `rateLaunch` perfect ≥ 1.15 / great ≥ 1 / good ≥ 0.85 / weak; bonus 500 × 3/2/1/0 × zone.
  `recaps` per finished song (score, accuracy, best chain, on-target %, launches, 1 Hz effort strip). Cues `chain` (25, 50,
  then every 50; `isChainMilestone`), `chainBreak`, `launch`. `effort.floorFtp/ceilingFtp/cadence` feed the gauge.
  Trainer grade follows planned effort, eased toward 0.5% in recovery even over a visual climb; ERG recovery is 0.5 FTP.
  `coaching.ts` requires 1.5 s sustained deviation and 0.6 s back in range before clearing the big direction cue.
  Countdown/transition grace prevents conflicting prompts; ERG uses Keep Spinning. Longer Breaks best scores use a separate key.

## Render (`render/`)
Shared uniforms (`look.ts`) drive every shader. `path.ts` (rolled frame), `trackMesh.ts` (ribbon, walls, tunnels, pylons,
arches), `blocks.ts` (neon cubes; mines = black spiked balls with white-hot tips; absorb-into-ship; misses crumble against a
viscous wall and ooze back in the craft's frame; mine-hit shards; `firework`), `city.ts` + `cityPlacement.ts` (grounded towers; horizontal offsets and full road footprint clearance),
`craft.ts` (lofted hull, canopy, pods, wings, fins; flash, knockback + bubble, ghost, overcharge arcs, under sputter; shockwave
`ring`; chain-tier trail gold / rainbow / wide rainbow), `gauge.ts` (power bar on the inside of both walls filling forward,
white wall target posts 16 m ahead, red ceiling posts; `gaugeMarks` tested; rpm vs 55 in ERG), `post.ts` (bloom + lens + `gray`),
`renderer.ts` (camera rolls with banks; launch punch-in + fling-out, streak burst, fireworks on clean zones / perfect launches),
`hud.ts` (persistent big pedal instruction/countdown; target band + effort time, shield, score + chain pops, launch meter + rating, song recap card), `layout.ts` (tested).
Recovery smoothly reduces pulses, bloom, camera shake, streaks, shader band motion and tunnel rings/reflections. Fireworks
are suppressed in recovery. Reduced flashing multiplies this effort-driven intensity.
AV penalty: 3 s grace, 10 s ramp, 3 s attack/1.2 s recovery, quadratic shortfall, capped at 0.75; reduced flashing halves gray.

## Dev / tests
`/dev/cadenza.html?script=target-follow&sec=40&autopilot=1&songs=2` (synth, no audio; `sec=49.4&speed=0` = launch roll,
`script=z2&sec=44` = under, `script=intervals&sec=86` = over, `sec=174.3` = recap). `/dev/craft.html` = ship states + mine.
`node scripts/cadenza-render-smoke.mjs` against Vite checks finite bloom, bounded GPU allocations, smooth audio.
Scenarios: automixed EDM set (launches ≥ great), idle dropout (no launch bonus), mixed continuous album on casual.
Gaps: Classic mode; iPad GPU cost unmeasured (low-FX switch if needed); tune launch thresholds with real rides.
Rolling analysis: timeline revisions extend future road; `extendTrack` preserves ridden geometry/block indexes and committed
recovery/sprints, retaining at least 30 s of steady instructions. Newly detected sprints require a complete countdown.
Nearby road/city/blocks only (≤140 s), dispose replaced GPU resources. Clamp shader light before bloom; safe pow/vignette math.
Bloom strength is scaled to 85% (including peak drop/beat/Overdrive).
