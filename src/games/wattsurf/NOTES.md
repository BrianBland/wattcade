# wattsurf — Wattsurf (SPEC §6.5)

CONTRACT-REQUEST: none (uses `requires.media`, `ctx.media`, `mediaPreview` from Phase 1).

Audiosurf × Wipeout HD Zone. Music game: the shell opens the media picker first; the sim reads `ctx.media.timeline` and
`positionS()` (heard position; the shell locks the loop to the player). Mono mode only for now (Classic = phase 5).

## Sim (`sim/`, pure)
- `track.ts` `buildTrack(timeline, {difficulty, mode, seed, maxGrade})`: one zone per section (hue from the song palette +
  47°/zone), speed/distance/height/heading at timeline.hz, trainer grade (builds 2 %→maxGrade, drops crest then 0), hard banks
  (`roll`: every drop ≈ 66° with a turn, some verses softer), tunnels (breaks + some verses, ≤ 45 s), blocks from onsets (min gap
  0.36/0.22/0.11 s, lanes 3/3/5; greys never in a neighbour block's lane). `effortAt(track, p, difficulty)`: power-only phases
  cruise Z2 / climb Z3–4 / sprint Z4–5 capped at 10/15/20 s then hold Z3–4 / recover, with ERG fractions. `rateTrack` for the picker.
- `sim.ts`: menu (difficulty, trainer Grade|ERG, reduced flashing; saved), controls (paddles = absolute position: stronger paddle
  leads, pull depth picks the lane with hysteresis, rest = centre; while both rest D-pad/Z/A step one lane, hold repeats), block
  judging, score/chain/Overdrive (sprint phase only), shield/dropout/reboot, trainer effect `track` (sim grade × `hillScale`, or ERG
  eased toward the phase watts), clean zones, drops held (≥ 70 % of the sprint), best scores. Autopilot; `hooks.powerFtp`.

## Render (`render/`)
Shared uniforms (`look.ts`: zone colours, beat/downbeat/bands, acid, craft metres) drive every shader. `path.ts` (rolled frame),
`trackMesh.ts` (ribbon: edges, lane lines, chevrons, beat waves, tunnel reflections; walls; octagonal tunnel tubes with light
rings; bass-stretched pylons; downbeat arches), `blocks.ts` (neon cubes / red hazard diamonds, absorb-into-ship, shards),
`city.ts` (band-stretched skyscrapers with windows, smoggy sky, horizon ring, searchlights), `craft.ts` (hull, wingtip trails,
absorb flash, grey knockback + red bubble, ghost), `post.ts` (bloom + aberration/vignette/scanlines/grain + red hit edge),
`renderer.ts` (camera rolls with banks), `hud.ts` (phase + watts), `layout.ts` (tested). Reduced flashing scales all pulses.

## Dev / tests
`/dev/wattsurf.html?script=target-follow&sec=40&autopilot=1&songs=2` (synth queue, no audio). `npx vitest run src/games/wattsurf`;
scenarios in `scenarios.ts` (automixed EDM set with autopilot; idle dropout; mixed continuous album on casual).
Gaps: Classic mode; iPad GPU cost of the full look unmeasured (add a low-FX switch if needed); tune with real rides.
