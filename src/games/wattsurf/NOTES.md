# wattsurf — Wattsurf (SPEC §6.5)

CONTRACT-REQUEST: none (uses `requires.media`, `ctx.media`, `mediaPreview` from Phase 1).

Audiosurf × Wipeout HD Zone. Music game: the shell opens the media picker first; the sim reads `ctx.media.timeline` and
`positionS()` (heard position; the shell locks the loop to the player). Mono mode only for now (Classic = phase 5).

## Sim (`sim/`, pure)
- `track.ts` `buildTrack(timeline, {difficulty, mode, seed, maxGrade})`: one zone per section (hue from the song palette + 47°/zone,
  effort target: cruise Z2-3 effort, build Z3/4 power, drop Z4/5 power, break/outro recover), speed/distance/visual height/heading
  curves at timeline.hz, trainer grade (builds ramp 2 %→maxGrade, drops crest then 0, breaks 0.5, ~2 s ease), blocks from onsets
  (difficulty: threshold, min gap 0.36/0.22/0.11 s, lanes 3/3/5; colour = strength×intensity; greys in dense passages, never in a
  neighbour block's lane → always dodgeable). `rateTrack` = stars, ~TSS, blocks/min for the picker preview.
- `sim.ts` `createWattsurfSim`: pre-game menu (difficulty, reduced flashing, auto-start 25 s; prefs saved), steering (paddles =
  absolute position, D-pad = lane snap), block judging at the block's program time (hit window `hitWindow` lanes), score × multiplier
  (chain/8 → ×4 max, ×2 Overdrive), shield (greys −20, recharge on target), dropout (×1, reboot after `rebootS` on target), sim grade
  effect `track` (× `hillScale`, mixer applies difficulty + virtual gears), clean zones (+250·n), drops held (≥ 70 % Overdrive), best
  score per queue|mode|difficulty. Autopilot for scenarios. `hooks.powerFtp` for the `target-follow` script (added to core).
- Events: zone, overdrive (cue), cleanZone, dropHeld, dropout, reboot, songDone, setDone, newBest.

## Render (`render/`)
Three.js + UnrealBloom: ribbon track shader (edges, lane lines, chevrons, beat pulse, fog), walls, beat-pulsing pylons, arches on
phrases, instanced blocks (collected zip into the craft, misses sink), craft (profile colour, Overdrive pink, ghost on dropout),
band-energy skyline + speed streaks on the camera, chase cam. Hue crossfades on zone change (slow + no flashes with reduced
flashing). DOM HUD (`hud.ts`): score, zone card + target, shield, now playing + credit, ZONE callouts, dropout banner, menu.
`layout.ts` (tested) keeps everything above `insets.bottom`.

## Dev / tests
`/dev/wattsurf.html?script=target-follow&sec=40&autopilot=1&songs=2` (synth queue, no audio). `npx vitest run src/games/wattsurf`;
scenarios in `scenarios.ts` (automixed EDM set with autopilot; idle dropout; mixed continuous album on casual).
Gaps: Classic mode; air-brake; no particles beyond block pops; tune grades/targets with real rides.
