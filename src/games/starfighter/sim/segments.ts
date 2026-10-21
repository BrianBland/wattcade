import type { MediaTimeline } from '../../../contracts';
import { after } from './director';
/**
 * A segment is one "place" in the ride: normally a song, but long tracks (DJ mixes) split at natural seams and very
 * short songs merge. Each segment has its own biome, at most one flagship, and ends with a breather + scorecard.
 */
export interface Segment { index: number; t0: number; t1: number; title: string; seed: number; biome: number; bossAt: number | null }
export const SEGMENT = { minS: 120, maxS: 420, targetS: 330, seamWindowS: 90, minBossSegS: 150, bossLeadS: 80, firstBossS: 120, biomes: 4 };
const hash = (text: string) => { let h = 2166136261; for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 16777619); return h >>> 0; };

/** Song spans, with very short songs merged into the next one. */
function spans(tl: MediaTimeline): Array<{ t0: number; t1: number; title: string; key: string }> {
  const songs = tl.songs.length ? tl.songs.map(s => ({ t0: s.t0, t1: s.t1, title: s.title, key: s.id || s.title })) : [{ t0: 0, t1: tl.durationS, title: '', key: 'set' }];
  const out: typeof songs = [];
  for (const s of songs) {
    const last = out[out.length - 1];
    if (last && last.t1 - last.t0 < SEGMENT.minS) { last.t1 = s.t1; last.title = last.title || s.title; continue; }
    out.push({ ...s });
  }
  const last = out[out.length - 1], prev = out[out.length - 2];
  if (last && prev && last.t1 - last.t0 < SEGMENT.minS) { prev.t1 = last.t1; out.pop(); }
  return out;
}
/** Seam near `target`: prefer a break or build start, then a phrase, else the target itself. */
function seam(tl: MediaTimeline, target: number, lo: number, hi: number): number {
  const w = SEGMENT.seamWindowS, inRange = (t: number) => t > lo && t < hi && Math.abs(t - target) <= w;
  const calm = tl.sections.filter(s => (s.kind === 'break' || s.kind === 'build') && inRange(s.t0)).sort((a, b) => Math.abs(a.t0 - target) - Math.abs(b.t0 - target))[0];
  if (calm) return calm.t0;
  const i = after(tl.phrases, target);
  const near = [tl.phrases[i - 1], tl.phrases[i]].filter((t): t is number => t !== undefined && inRange(t)).sort((a, b) => Math.abs(a - target) - Math.abs(b - target))[0];
  return near ?? target;
}
/** Boss arrival: the strongest drop in the back half that leaves time to fight before the scorecard. */
function bossFor(tl: MediaTimeline | undefined, t0: number, t1: number, first: boolean): number | null {
  const len = t1 - t0; if (len < SEGMENT.minBossSegS) return null;
  const lo = Math.max(t0 + len * 0.4, first ? SEGMENT.firstBossS : 0), hi = t1 - SEGMENT.bossLeadS;
  if (hi <= lo) return null;
  const drop = tl?.sections.filter(s => s.kind === 'drop' && s.t0 >= lo && s.t0 <= hi).sort((a, b) => b.energy - a.energy || a.t0 - b.t0)[0];
  if (drop) return drop.t0;
  const target = lo + (hi - lo) * 0.4, phrases = tl?.phrases ?? [];
  const p = phrases[after(phrases, target - 0.001)];
  return p !== undefined && p <= hi ? p : target;
}
export function planSegments(tl: MediaTimeline): Segment[] {
  const out: Segment[] = [];
  for (const span of spans(tl)) {
    // Split long spans (mixes) roughly every targetS at a seam, keeping every piece at least minS long.
    const cuts = [span.t0];
    while (span.t1 - cuts[cuts.length - 1] > SEGMENT.maxS) {
      const from = cuts[cuts.length - 1], cut = seam(tl, from + SEGMENT.targetS, from + SEGMENT.minS, span.t1 - SEGMENT.minS);
      if (cut <= from + SEGMENT.minS * 0.5) break;
      cuts.push(cut);
    }
    cuts.push(span.t1);
    for (let k = 0; k < cuts.length - 1; k++) {
      const seed = hash(`${span.key}#${k}`), index = out.length, prev = out[index - 1];
      let biome = seed % SEGMENT.biomes; if (prev && biome === prev.biome) biome = (biome + 1) % SEGMENT.biomes;
      out.push({ index, t0: cuts[k], t1: cuts[k + 1], title: span.title, seed, biome, bossAt: bossFor(tl, cuts[k], cuts[k + 1], index === 0) });
    }
  }
  return out;
}
/** Without a timeline (harness/endless): fixed windows with one boss each, matching the old cadence. */
export function fallbackSegment(index: number, every: number, firstBoss: number): Segment {
  const t0 = index * every, seed = hash(`endless#${index}`);
  return { index, t0, t1: t0 + every, title: '', seed, biome: (seed % SEGMENT.biomes + index) % SEGMENT.biomes, bossAt: t0 + (index === 0 ? Math.min(firstBoss, every * 0.5) : every * 0.42) };
}
/**
 * Commits one segment at a time: the current segment never shifts when the timeline is revised (streamed songs,
 * rolling analysis); the next one is planned from the latest timeline when the current one ends.
 */
export function createSegmenter(tl: MediaTimeline | undefined, every: () => number, firstBoss: () => number) {
  let current: Segment | null = null;
  const pick = (p: number, index: number): Segment => {
    if (!tl || !tl.durationS) return fallbackSegment(Math.max(index, Math.floor(p / every())), every(), firstBoss());
    const plan = planSegments(tl);
    const found = plan.find(s => p >= s.t0 - 1e-6 && p < s.t1) ?? plan.find(s => s.t0 >= p) ?? plan[plan.length - 1];
    return found ? { ...found, index } : fallbackSegment(index, every(), firstBoss());
  };
  return {
    at(p: number): { segment: Segment; changed: boolean } {
      if (!current) { current = pick(p, 0); return { segment: current, changed: true }; }
      if (p < current.t1) return { segment: current, changed: false };
      const prev: Segment = current, next = pick(Math.max(p, prev.t1), prev.index + 1);
      if (next.biome === prev.biome) next.biome = (next.biome + 1) % SEGMENT.biomes;
      // A revised timeline never moves the start backwards; a boss time already passed is dropped.
      next.t0 = Math.max(next.t0, prev.t1); if (next.t1 < next.t0 + 30) next.t1 = next.t0 + Math.max(30, every());
      if (next.bossAt !== null && next.bossAt < next.t0 + 20) next.bossAt = null;
      current = next; return { segment: next, changed: true };
    },
    /** Upcoming segment (for terrain transitions), planned from the current timeline; may still change. */
    peek(): Segment | null { if (!current) return null; const n = pick(current.t1, current.index + 1); if (n.biome === current.biome) n.biome = (n.biome + 1) % SEGMENT.biomes; return n; },
  };
}
export type Grade = 'S' | 'A' | 'B' | 'C' | 'D';
export interface SegmentStats { onTargetFrac: number; clearRate: number; perfectFrac: number; eliteFrac: number | null; boss: 'defeated' | 'escaped' | null }
/**
 * Segment grade: steady riding (45), clear rate (30), flair (15: perfect formations, elites), flagship (10).
 * Effort is time on target, never extra watts; a rider who never touches the paddles can still reach A.
 */
export function gradeSegment(x: SegmentStats): { score: number; grade: Grade } {
  const c = (v: number) => Math.max(0, Math.min(1, v));
  const effort = c(x.onTargetFrac / 0.9) * 45, clear = c(x.clearRate) * 30;
  // Flair rewards attention: half perfect formations, half elite wings (when any crossed). S needs both.
  const flair = c(x.perfectFrac * 0.5 + (x.eliteFrac ?? x.perfectFrac) * 0.5) * 15;
  const boss = x.boss === 'defeated' ? 10 : x.boss === 'escaped' ? 4 : c(x.clearRate) * 10;
  const score = Math.round(effort + clear + flair + boss);
  return { score, grade: score >= 93 ? 'S' : score >= 78 ? 'A' : score >= 62 ? 'B' : score >= 48 ? 'C' : 'D' };
}
