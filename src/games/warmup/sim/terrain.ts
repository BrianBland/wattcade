// Pure, seeded road profile + biome sequence. Shared by the sim (trainer grade) and the renderer (what you see),
// so the hill on screen is exactly the hill under the wheels (just drawn taller).

export const BIOMES = ['countryside', 'seaside', 'moon'] as const;
export type BiomeId = (typeof BIOMES)[number];
export const BIOME_NAMES: Record<BiomeId, string> = { countryside: 'Countryside', seaside: 'Seaside', moon: 'The Moon' };

/** Metres over which one biome blends into the next (sky, props, ground). */
export const TRANSITION_M = 140;

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

export interface BiomeAt { cur: BiomeId; next: BiomeId; /** 0 = fully cur, 1 = fully next (only near the boundary) */ mix: number; toNextM: number; index: number }

/** Which biome a distance is in. Biomes run in a fixed loop, starting at `start`, each `biomeM` long. */
export function biomeAt(d: number, biomeM: number, start: number): BiomeAt {
  const n = BIOMES.length;
  const seg = Math.floor(d / biomeM);
  const into = d - seg * biomeM;
  const toNextM = biomeM - into;
  const idx = (((start + seg) % n) + n) % n;
  const mix = toNextM < TRANSITION_M ? 1 - toNextM / TRANSITION_M : 0;
  return { cur: BIOMES[idx], next: BIOMES[(idx + 1) % n], mix, toNextM, index: seg };
}

/** Biome for a single point (props are picked per point, so the boundary is crisp per object but blends visually). */
export function biomeIdAt(d: number, biomeM: number, start: number): BiomeId {
  const b = biomeAt(d, biomeM, start);
  // Inside the transition, objects switch at a seeded point so the two biomes interleave instead of a hard line.
  return b.mix > 0 && hash01(Math.floor(d / 3)) < b.mix ? b.next : b.cur;
}
