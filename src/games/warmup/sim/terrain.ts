// Pure, seeded road profile + biome sequence. Shared by the sim (trainer grade) and the renderer (what you see),
// so the hill on screen is exactly the hill under the wheels (just drawn taller).

/** Loop order tells a little story: down to the beach, under the waves, up through jungle and desert to the volcano, the peaks, and off to the Moon. */
// Append new IDs: existing numeric start indices and lifetime achievement bits
// continue to name the original eight destinations.
export const BIOMES = ['countryside', 'seaside', 'underwater', 'jungle', 'desert', 'volcano', 'snow', 'moon', 'autumn', 'marsh', 'market', 'sky'] as const;
export type BiomeId = (typeof BIOMES)[number];
export const BIOME_NAMES: Record<BiomeId, string> = {
  countryside: 'Countryside', seaside: 'Seaside', underwater: 'Under the Sea', jungle: 'Jungle', desert: 'Desert Canyon',
  volcano: 'Volcano', snow: 'Snowy Pass', moon: 'The Moon',
  autumn: 'Autumn Woodland', marsh: 'Marsh Boardwalk', market: 'Night Market', sky: 'Sky Islands',
};

/** Default metres over which one biome dissolves into the next, centred on the boundary (tunable `warmup.blendM`). */
export const TRANSITION_M = 300;

export interface Terrain {
  /** Road grade in % at distance d (before the hills on/off fade). In [-1, 1] × maxGrade. */
  grade(d: number): number;
  /** Road height in metres at distance d, consistent with grade(): elev'(d) = grade(d) / 100. */
  elev(d: number): number;
}

/** Small integer hash -> [0,1). Deterministic; used only for terrain layout. */
export function hash01(n: number): number {
  let x = Math.imul((n | 0) ^ 0x9e3779b9, 0x85ebca6b);
  x ^= x >>> 13; x = Math.imul(x, 0xc2b2ae35); x ^= x >>> 16;
  return (x >>> 0) / 4294967296;
}

/** Rolling hills: three interfering waves give long calm stretches and the odd proper climb. */
export function makeTerrain(seed: number, maxGrade: number): Terrain {
  const waves = [
    { len: 620, w: 0.55 }, { len: 290, w: 0.3 }, { len: 1500, w: 0.35 },
  ].map((wv, i) => ({ k: (2 * Math.PI) / wv.len, w: wv.w, ph: hash01(seed * 7 + i) * 2 * Math.PI }));
  const W = waves.reduce((a, wv) => a + wv.w, 0);
  return {
    grade: (d) => (maxGrade * waves.reduce((a, wv) => a + wv.w * Math.cos(wv.k * d + wv.ph), 0)) / W,
    elev: (d) => (maxGrade / 100) * waves.reduce((a, wv) => a + (wv.w * Math.sin(wv.k * d + wv.ph)) / wv.k, 0) / W,
  };
}

/**
 * Where a distance sits in the biome loop. Biomes run in a fixed order starting at `start`, each `biomeM` long, and
 * dissolve over a window of `blendM` centred on each boundary (the gateway landmark stands at the centre).
 * `cur -> next` is the pair being blended (`mix` 0..1); `dom` is the biome you are "in" (flips exactly at the boundary).
 */
export interface BiomeAt { cur: BiomeId; next: BiomeId; mix: number; dom: BiomeId; toNextM: number; index: number }

/** Biome of loop segment `seg` (segment 0 = `start`). */
export function biomeOfSeg(seg: number, start: number): BiomeId {
  const n = BIOMES.length;
  return BIOMES[(((start + seg) % n) + n) % n];
}

export function biomeAt(d: number, biomeM: number, start: number, blendM = TRANSITION_M): BiomeAt {
  const full = Math.max(1, Math.min(blendM, biomeM * 0.9)), half = full / 2;
  const seg = Math.floor(d / biomeM), into = d - seg * biomeM;
  const dom = biomeOfSeg(seg, start);
  let cur = dom, next = biomeOfSeg(seg + 1, start), mix = 0;
  if (into > biomeM - half) mix = (into - (biomeM - half)) / full;                      // approaching the boundary
  else if (into < half && seg > 0) { cur = biomeOfSeg(seg - 1, start); next = dom; mix = 0.5 + into / full; } // just past it
  return { cur, next, mix, dom, toNextM: biomeM - into, index: seg };
}

/** Each biome's share of the scene at this point (sums to 1). Layers, sky, particles and sounds all blend with these. */
export function biomeWeights(b: Pick<BiomeAt, 'cur' | 'next' | 'mix'>): Array<[BiomeId, number]> {
  return b.mix <= 0 ? [[b.cur, 1]] : b.mix >= 1 ? [[b.next, 1]] : [[b.cur, 1 - b.mix], [b.next, b.mix]];
}
