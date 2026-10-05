// Media core (SPEC §5.6). Pure parts run anywhere; library/player/decode are browser-only (nothing runs on import).
export * from './types';
export { analyzePcm } from './analysis/analyze';
export { planMix, songTime, progTime, rateAt, autoAt, type MixItem, type MixPlan, type PlanEntry, type Transition } from './mix/plan';
export { buildTimeline } from './mix/timeline';
export { ProgramSync, SmoothedPosition } from './clock';
export { makeScore, SYNTH_STYLES, type SynthScore, type SynthStyle } from './synth/score';
export { scoreAnalysis } from './synth/truth';
export { synthQueue, synthTimeline, synthItem, type SynthSpec } from './synth/queue';
export { MediaLibrary, matchesQuery, sha256Hex, DEMO_SONGS, paletteFromImageBlob, type SongMeta, type LibraryOpts } from './library/library';
export { IdbStorage, MemoryStorage, type MediaStorage } from './library/store';
export { readTags, type Tags } from './library/tags';
export { SAMPLE_TRACKS, sampleUrl, samplePage, sampleId, type SampleTrack } from './library/samples';
export { paletteFromPixels, paletteFromKey } from './library/palette';
export { MixEngine, type EngineOpts, type EngineState } from './player/engine';
export { decodeMono } from './player/decode';
export { encodeWav } from './player/wav';
export { analyzeInWorker, renderSynthWav } from './analysis/client';
export { rateQueue, type QueueRating } from './rating';
