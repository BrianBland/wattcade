# media — music core (SPEC §5.6)

CONTRACT-REQUEST: none (MediaCaps/MediaNeed/MediaTimeline/MediaContext, `GameModule.requires.media`, `mediaPreview` and `GameContext.media` are in contracts.ts).

## Pure (Node + browser, tested)
- `analysis/`: `analyzePcm(pcm, sr)` → `SongAnalysis` (types.ts). Own FFT (2048/512 Hann) → per-frame band energy, log-flux, mel, peak chroma
  (`features.ts`); onsets (moving median + MAD + floor), tempo (autocorr comb + 120 bpm prior, then fine comb), Ellis DP beats with
  anchor regularisation over quiet parts (`rhythm.ts`); downbeats (low flux + harmonic change), key (Krumhansl), intensity/band curves,
  sections (bar SSM Foote + energy novelty, prominence peaks ≥ 8 bars apart, labelled by energy tiers), phrases, preview spectrogram (`structure.ts`).
  Bump `ANALYSIS_VERSION` when output changes (cached analyses are recomputed).
- `synth/`: `makeScore(style, seed)` (edm/rock/ambient), `renderScore` (PCM), `scoreAnalysis` (exact truth), `synthQueue/synthTimeline(spec)`.
- `mix/plan.ts`: `planMix(items, 'continuous'|'automix'|'crossfade')` → entries (program→song segments, gain/EQ automation, echo) +
  transitions. Automix: out at a phrase in the last 25–90 s (outro preferred), in on the next song's first downbeat, tempo matched
  (≤ ±8 %, half/double allowed), bass swap at the midpoint, rate eased back over 16 bars; falls back to echo-out (tempo too far /
  no out point) or crossfade (no beat grid). `mix/timeline.ts`: `buildTimeline(plan, items)` → `MediaTimeline` (ownership switch at
  the bass swap / crossfade midpoint; curves gain-blended; near-duplicate beats merged).
- `clock.ts`: `ProgramSync` (trim: 1 ± 2 %, 0 = hold when the sim is ahead / audio stalled, 4 = catch up), `SmoothedPosition`.
- `library/tags.ts` (ID3v2.2–2.4, MP4 ilst, FLAC), `library/palette.ts` (k-means art palette, key fallback), `rating.ts` (`rateQueue`).

## Browser
- `library/library.ts` `MediaLibrary`: import (sha256 dedupe, tags, art) → background analysis queue (decode → worker) → IndexedDB
  (`library/store.ts`: meta / analysis / blobs DBs; `MemoryStorage` for tests). Demo set: 6 synth songs, always ready.
- `analysis/worker.ts` + `client.ts`: analysis and synth→WAV rendering off the main thread. `player/decode.ts`: OfflineAudioContext decode
  at 22.05 kHz mono.
- `player/engine.ts` `MixEngine`: 3 decks (<audio> → MediaElementSource → low/mid/high EQ → gain; echo send). Program clock on the
  AudioContext; decks slaved to it (hard seek > 150 ms, else ±4 % rate nudge); owner deck buffering freezes the clock.
  `positionS()` subtracts output latency + `wattcade.media.latencyMs`. Call `unlock()` from a gesture (iOS).

## Integration
- Core: `createGameSession({ media: { timeline } })` → `ctx.media` (position runs once the sim leaves `inMenu`); `session.media.setTrim()`.
  `runHeadless({ media: { synth: {...} } | { timeline } })`; media games default to one synth EDM song. Scenarios may set `media`.
- Shell: launching a game with `requires.media` opens `shell/media/MediaPicker` (queue persisted per profile); GameHost loads the plan,
  starts the music at GO, and locks the sim with ProgramSync (idles the session while music buffers). `/media-lab.html` = Music Lab.

## Tests
`npx vitest run src/media src/core/media.test.ts src/shell/media`. Gaps: engine/decks are browser-only (checked with Playwright in the
Music Lab, not unit-tested); continuous mode is near-gapless (deck start latency), not sample-exact; no OPFS (IndexedDB blobs).
