// Levels as workouts (docs/towerdefense/LEVELS-DESIGN.md §1–3): a level = a seeded map + a fixed wave list
// (warm-up → sets of work waves and a boss, easy recovery waves between sets → done). Pure: no rng but the seed's.
import { makeRng } from '../../../core/rng';
import { GROUND_STYLES, ROAD_STYLES, padsFor, type GroundStyle, type RoadStyle } from './generator';
import type { WaveRole } from './waves';

export type Intensity = 'easy' | 'steady' | 'hard';
export const INTENSITIES: readonly Intensity[] = ['easy', 'steady', 'hard'];
export const INTENSITY_NAME: Record<Intensity, string> = { easy: 'Easy', steady: 'Steady', hard: 'Hard' };
export const QUICK_MINUTES = [15, 20, 30, 40] as const;

/** What to play: a seeded map, its length and difficulty depth. The same spec always gives the same level. */
export interface LevelSpec {
  id: string;
  name: string;
  seed: number;
  minutes: number;
  roadStyle: RoadStyle;
  ground: GroundStyle;
  /** Tower pads asked for (the road style may hold fewer or need more: generator padsFor). */
  pads: number;
  /** Later levels peak deeper: the last wave fights like endless wave `levelPeakWave` + depth. */
  depth: number;
  kind: 'campaign' | 'quick';
  /** Campaign index (0-based) when kind = campaign. */
  index?: number;
}

/** Rough minutes per wave including its lull (lull 45 s + a 90–150 s work wave; bosses run longer). */
export const WAVE_MIN = { work: 2.75, boss: 3.25, easy: 2.75 } as const;
export interface LevelWave { role: WaveRole; warmup?: boolean; set: number; pos: number; of: number }

/** Bosses for a level length: 0–1 at 15 min, 1 at 20–25, 2 at 30–40, 3 at 60 (the seed picks within a band). */
export function bossCount(minutes: number, seed: number): number {
  if (minutes < 18) return makeRng(seed ^ 0x5bd1)() < 0.5 ? 0 : 1;
  if (minutes < 28) return 1;
  if (minutes < 50) return 2;
  return 3;
}

/**
 * The fixed wave list for a level: a warm-up wave, then sets of 2–3 work waves (the last `bosses` sets end with a
 * boss), with an easy recovery wave between sets. Sized so the estimated length (WAVE_MIN) is close to `minutes`.
 */
export function levelWaves(minutes: number, bosses: number): LevelWave[] {
  // the set count whose estimate lands closest to `minutes` (2–3 work waves a set; fewer sets on a tie)
  const left = minutes - WAVE_MIN.easy - bosses * WAVE_MIN.boss;
  let sets = 1, work = 2, best = Infinity;
  for (let n = Math.max(bosses, 1); n <= 12; n++) {
    const w = Math.max(2 * n, Math.min(3 * n, Math.round((left - (n - 1) * WAVE_MIN.easy) / WAVE_MIN.work)));
    const err = Math.abs(left - (n - 1) * WAVE_MIN.easy - w * WAVE_MIN.work);
    if (err < best - 1e-9) { best = err; sets = n; work = w; }
  }
  const out: LevelWave[] = [{ role: 'easy', warmup: true, set: 0, pos: 1, of: 1 }];
  for (let s = 0; s < sets; s++) {
    if (s > 0) out.push({ role: 'easy', set: s, pos: 1, of: 1 });
    const n = Math.floor(work / sets) + (s < work % sets ? 1 : 0), boss = s >= sets - bosses;
    for (let i = 0; i < n; i++) out.push({ role: 'work', set: s + 1, pos: i + 1, of: n });
    if (boss) out.push({ role: 'boss', set: s + 1, pos: n + 1, of: n });
  }
  return out;
}
/** Estimated minutes for a wave list. */
export const estimateMinutes = (waves: readonly LevelWave[]) => waves.reduce((m, w) => m + WAVE_MIN[w.role], 0);

const ROMAN = ['I', 'II', 'III', 'IV', 'V'];
const STYLE_NAME: Record<GroundStyle, string> = { outpost: 'Outpost', scrapyard: 'Scrapyard', badlands: 'Badlands', volcanic: 'Volcanic', overgrown: 'Overgrown', blight: 'Blight' };
/** Minutes per campaign level within a style: mostly short enough to chain two in one ride. */
const CAMPAIGN_MINUTES = [15, 20, 25, 20, 40];
/** Pads per campaign level within a style: a roomy start, then a lean level and a crowded one before the long finale. */
const CAMPAIGN_PADS = [12, 10, 14, 8, 12];
export const LEVELS_PER_STYLE = CAMPAIGN_MINUTES.length;

/** The campaign: five levels per ground style, in style order; each unlocks the next. */
export const CAMPAIGN: readonly LevelSpec[] = GROUND_STYLES.flatMap((ground, gi) => CAMPAIGN_MINUTES.map((minutes, n): LevelSpec => {
  const index = gi * LEVELS_PER_STYLE + n;
  const roadStyle = ROAD_STYLES[(n + gi) % ROAD_STYLES.length]; // each ground rotates the road styles by one
  return { id: `c${index + 1}`, name: `${STYLE_NAME[ground]} ${ROMAN[n]}`, seed: 1000 + index * 37, minutes, ground,
    roadStyle, pads: padsFor(roadStyle, CAMPAIGN_PADS[n]), depth: gi + Math.floor(n / 2), kind: 'campaign', index };
}));

/** A Quick Ride: any seed at a chosen length; road, ground and pads (8–14) come from the seed. */
export function quickRide(seed: number, minutes: number): LevelSpec {
  const r = makeRng(seed ^ 0x9e37);
  const ground = GROUND_STYLES[Math.floor(r() * GROUND_STYLES.length)], roadStyle = ROAD_STYLES[Math.floor(r() * ROAD_STYLES.length)];
  const pads = padsFor(roadStyle, 8 + Math.floor(r() * 7));
  return { id: `q${seed}-${minutes}`, name: `Quick ${minutes}′ · ${STYLE_NAME[ground]}`, seed, minutes, ground, roadStyle, pads, depth: 4, kind: 'quick' };
}

/** Stars from the base HP left when the last wave clears (a fall is no stars). */
export function starsFor(hpFrac: number, two = 0.5, three = 0.9): 1 | 2 | 3 {
  return hpFrac >= three ? 3 : hpFrac >= two ? 2 : 1;
}
/** The campaign levels open to play: the first, and each one after a cleared level. */
export function campaignOpen(stars: Readonly<Record<string, number>>): number {
  let i = 0;
  while (i < CAMPAIGN.length - 1 && (stars[CAMPAIGN[i].id] ?? 0) > 0) i++;
  return i;
}
