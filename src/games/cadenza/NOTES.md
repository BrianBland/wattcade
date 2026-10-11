# cadenza — Cadenza (SPEC §6.5)

Music racer (formerly "Wattsurf", id `wattsurf`; `core/renames.ts` migrates saves, history and tuning). The shell opens the
media picker first; the sim reads `ctx.media.timeline` and `positionS()` (heard position). Mono mode only (Classic = later).

## Sim (`sim/`, pure)
- `track.ts` `buildTrack`: one visual zone per section (hue from the song palette + 47°/zone), speed/distance/height/heading,
  visual grade, banks, tunnels (breaks + some verses, ≤ 45 s), blocks from onsets (min gap 0.36/0.22/0.11 s, lanes 3/3/5).
  `stunts`: builds ≥ 13 s end in a 9 s helix (not during recovery); **sprints open with a launch** (2.6 s corkscrew,
  block-free, then the hard bank); drops without a sprint stay calm.
- `ride.ts` plans effort separately: smooths brief normal fluctuations toward ≥30 s portions while preserving meaningful
  builds/post-drop holds ≥12 s. `DIFF` sets intensity *and* rest (casual/pro/elite): sprints 10/15/20 s, ≤ 1 per 150/120/75 s
  (other drops ride as a hold); breaks ≥25/15/12 s, handovers 36/24/20 s, 40/30/25 s rest after 150/180/210 s of work. Rests
  are trimmed around sprints, so the 3-2-1 runs at the end of a rest; rests < 8 s / work slivers < 6 s fold away.
  `effortAt`: countdown opens the ceiling to Z5 (floor unchanged); transitions judge old ∪ new band for 5 s, `band` = shown.
- `sim.ts`: menu (difficulty, trainer Grade|ERG, reduced flashing), controls (paddles = absolute position; D-pad/Z/A step),
  judging, score/chain/Overdrive, shield/dropout/reboot, trainer effect `track`, clean zones, drops held, best scores.
  Off target: `effort.under` (eased; after a 6 s start grace) drains the shield after `underGraceS` and drives the grey-out +
  music FX; `effort.over` (above the zone ceiling; never sprints/ERG) overcharges the ship. Launches: avg power ÷ sprint floor
  (rpm ÷ 90 in ERG) over the roll → `rateLaunch` perfect ≥ 1.15 / great ≥ 1 / good ≥ 0.85 / weak; bonus 500 × 3/2/1/0 × zone.
  `recaps` per song (score, accuracy, chain, on-target %, launches, 1 Hz strip). Cues `chain` (`isChainMilestone`), `effort`, `launch`.
  Trainer grade follows the plan (0.5% in recovery); ERG recovery 0.5 FTP. `coaching.ts`: 1.5 s off target to cue, 0.6 s to clear.

## Render (`render/`)
Shared uniforms (`look.ts`) drive every shader. `path.ts` (rolled frame), `trackMesh.ts` (ribbon, walls, tunnels, pylons,
arches), `blocks.ts` (glass cubes in the live track accent, value → brighter / hotter (`blockTier`, `blockColor`); mines = black spiked balls with white-hot tips; absorb-into-ship; misses crumble against a
viscous wall and ooze back in the craft's frame; mine-hit shards; `firework`), `city.ts` + `cityPlacement.ts` (grounded towers; horizontal offsets and full road footprint clearance),
`craft.ts` (hulls = `ship` cosmetic: triad/lancer/manta, < ¾ lane; bells, beams; flash, knockback, ghost, arcs, sputter; shockwave
`ring`; chain-tier trail gold / rainbow / wide rainbow), `gauge.ts` (power bar on the inside of both walls filling forward,
white wall target posts 16 m ahead, red ceiling posts; `gaugeMarks` tested; rpm vs 55 in ERG), `post.ts` (bloom + lens + `gray`),
`renderer.ts` (camera rolls with banks; launch punch-in + fling-out, streak burst, fireworks on clean zones / perfect launches),
`hud.ts` (callout: big instruction 3 s per effort change / 4 s Break, + a smaller line in the same style — band · watts,
`Sprint incoming`, `Easy pedaling · Z1–2`; countdown digits pop (no sfx over the music), coaching/dropout stay up; accent text `--acc-t`), `layout.ts`.
Recovery calms pulses, bloom, shake, streaks, rings (`uMotion`), no fireworks. AV penalty: 3 s grace, 10 s ramp, capped 0.75.

## Dev / tests
`/dev/cadenza.html?script=target-follow&sec=40&autopilot=1&songs=2` (synth, no audio; `sec=49.4&speed=0` = launch roll,
`script=z2&sec=44` = under, `script=intervals&sec=86` = over, `sec=174.3` = recap). `/dev/craft.html?ship=lancer` = ship states + mine.
`node scripts/cadenza-render-smoke.mjs` against Vite checks finite bloom, bounded GPU allocations, smooth audio.
Scenarios: EDM set (3–5 spaced launches ≥ great), idle dropout, continuous album on casual. Gaps: Classic; iPad GPU cost; real-ride tuning.
Rolling analysis: `extendTrack` keeps ridden geometry/blocks and the committed ride block (≥ 30 s); new sprints need a full countdown.
Nearby road/city/blocks only (≤140 s); dispose replaced GPU resources; clamp shader light before bloom (× 0.85).
