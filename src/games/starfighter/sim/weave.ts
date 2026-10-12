import type { MediaTimeline, SectionKind } from '../../../contracts';
import { after, clamp } from './director';
/**
 * Music-locked weave: the ship moves around its planned lane in a pattern chosen per phrase, with swing peaks on beats.
 * Pure function of program time (beats, phrases, sections and intensity are known ahead), so choreographed fire can
 * still be authored to miss it. `lift` is a visual height offset (figure-eights, beat dips); it never affects combat.
 */
export type WeavePattern = 'sway' | 'figure8' | 'dip' | 'sweep';
export const WEAVE = {
  amp: { intro: 3, verse: 4.5, build: 5.5, drop: 6.5, break: 3.5, outro: 3 } as Record<SectionKind, number>,
  beatsPerSwing: { intro: 2, verse: 2, build: 2, drop: 1, break: 4, outro: 4 } as Record<SectionKind, number>,
  patterns: { intro: ['sweep', 'figure8'], verse: ['sway', 'figure8', 'dip'], build: ['sway', 'dip'], drop: ['sway', 'figure8', 'dip'],
    break: ['sweep', 'figure8'], outro: ['sweep', 'figure8'] } as Record<SectionKind, WeavePattern[]>,
  maxSpeed: 30, lift: 1.8,
};
const hash = (n: number) => { let h = Math.imul(n ^ 0x9e3779b9, 0x85ebca6b); h ^= h >>> 13; h = Math.imul(h, 0xc2b2ae35); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };
export function createWeave(tl: MediaTimeline | undefined) {
  const beats = tl?.beats ?? [], fallback = 0.5, phrases = tl?.phrases ?? [];
  const sectionAt = (p: number): SectionKind => { const s = tl?.sections; if (!s?.length) return 'verse'; let k: SectionKind = s[0].kind; for (const x of s) { if (x.t0 <= p) k = x.kind; else break; } return k; };
  const intensityAt = (p: number) => { if (!tl?.intensity.length) return 0.6; let a = 0, n = 0; for (let d = -2; d <= 2; d += 0.5) { const i = Math.round((p + d) * tl.hz); if (i >= 0 && i < tl.intensity.length) { a += tl.intensity[i]; n++; } } return n ? a / n : 0.6; };
  const beatPos = (p: number) => {
    if (beats.length < 2) return p / fallback;
    const i = after(beats, p) - 1;
    if (i < 0) return (p - beats[0]) / (beats[1] - beats[0]);
    const b0 = beats[i], b1 = beats[i + 1] ?? b0 + (b0 - beats[i - 1]);
    return i + clamp((p - b0) / Math.max(1e-3, b1 - b0), 0, 1);
  };
  const rawLen = (p: number) => { if (beats.length < 2) return fallback; const i = clamp(after(beats, p) - 1, 0, beats.length - 2); return beats[i + 1] - beats[i]; };
  /** Beat length averaged over ±1.5 s so the amplitude cap glides across tempo changes between songs. */
  const beatLen = (p: number) => { let a = 0; for (let k = -10; k <= 10; k++) a += rawLen(p + k * 0.15); return a / 21; };
  /** Phrase index and start at p (16 s grid without analysis). */
  const phraseAt = (p: number) => { if (!phrases.length) { const i = Math.floor(p / 16); return { i, t0: i * 16, t1: i * 16 + 16 }; } const i = after(phrases, p) - 1; return { i, t0: phrases[i] ?? 0, t1: phrases[i + 1] ?? (phrases[i] ?? 0) + 16 }; };
  /** Pattern for a phrase: drawn from the section's set, never the same as the previous phrase's. */
  const memo = new Map<number, WeavePattern>();
  const startOf = (i: number) => phrases.length ? phrases[i] ?? 0 : i * 16;
  const patternOf = (i: number, t0 = startOf(i)): WeavePattern => {
    const hit = memo.get(i); if (hit) return hit;
    const set = WEAVE.patterns[sectionAt(t0 + 0.01)], prev = i > 0 ? (memo.get(i - 1) ?? patternOf(i - 1)) : null;
    let pat = set[Math.floor(hash(i) * set.length)];
    if (pat === prev && set.length > 1) pat = set[(set.indexOf(pat) + 1) % set.length];
    if (memo.size > 4096) memo.clear();
    memo.set(i, pat); return pat;
  };
  const shape = (pat: WeavePattern, k: SectionKind, p: number, b: number, inten: number) => {
    const base = WEAVE.amp[k] * (0.55 + 0.6 * inten), bps = WEAVE.beatsPerSwing[k], len = beatLen(p);
    const cap = (n: number) => WEAVE.maxSpeed * len * n / Math.PI;
    switch (pat) {
      case 'figure8': { const a = Math.min(base, cap(bps)); return { x: a * Math.cos(Math.PI * b / bps), lift: WEAVE.lift * Math.sin(2 * Math.PI * b / bps) }; }
      case 'dip': { const n = bps * 2, a = Math.min(base * 0.7, cap(n)), f = b - Math.floor(b); return { x: a * Math.cos(Math.PI * b / n), lift: -WEAVE.lift * Math.exp(-f * 5) * Math.min(1, f * 25) }; }
      case 'sweep': { const a = Math.min(base * 1.5, cap(4)); return { x: a * Math.cos(Math.PI * b / 4), lift: 0 }; }
      default: { const a = Math.min(base, cap(bps)); return { x: a * Math.cos(Math.PI * b / bps), lift: 0 }; }
    }
  };
  /** Section shape at p, cross-faded over ±1 s at section boundaries. */
  const sectioned = (pat: WeavePattern, p: number, b: number, inten: number) => {
    const k = sectionAt(p);
    for (const sec of tl?.sections ?? []) if (sec.t0 > 0 && Math.abs(sec.t0 - p) < 1) {
      const u = clamp((p - (sec.t0 - 1)) / 2, 0, 1), e = u * u * (3 - 2 * u), A = shape(pat, sectionAt(sec.t0 - 0.01), p, b, inten), B = shape(pat, sec.kind, p, b, inten);
      return { x: A.x * (1 - e) + B.x * e, lift: A.lift * (1 - e) + B.lift * e };
    }
    return shape(pat, k, p, b, inten);
  };
  /** Full weave at p: the phrase's pattern, cross-faded into the next over the last two beats of a phrase. */
  const full = (p: number) => {
    const b = beatPos(p), inten = clamp(intensityAt(p), 0, 1), ph = phraseAt(p), cur = sectioned(patternOf(ph.i, ph.t0), p, b, inten);
    const fade = beatLen(p) * 2, into = ph.t1 - p;
    if (into < fade && into > 0) {
      const nxt = sectioned(patternOf(ph.i + 1, ph.t1), p, b, inten), u = 1 - into / fade, e = u * u * (3 - 2 * u);
      return { x: cur.x * (1 - e) + nxt.x * e, lift: cur.lift * (1 - e) + nxt.lift * e };
    }
    return cur;
  };
  /** Next swing peak (a beat where the sway is momentarily still) at or after p; lane changes start and end there. */
  const peakAfter = (p: number): number => {
    if (beats.length < 2) { const step = fallback * 2; return Math.ceil(p / step - 1e-9) * step; }
    for (let i = after(beats, p - 1e-6); i < beats.length && beats[i] < p + 4; i++) if (i % WEAVE.beatsPerSwing[sectionAt(beats[i])] === 0) return beats[i];
    return p;
  };
  // Lane changes take over completely while they run (`moving` 0..1); they start and end on swing peaks.
  const at = (p: number, moving = 0) => full(p).x * (1 - clamp(moving, 0, 1));
  const lift = (p: number, moving = 0) => full(p).lift * (1 - clamp(moving, 0, 1));
  return { at, lift, peakAfter, pattern: (p: number) => { const ph = phraseAt(p); return patternOf(ph.i, ph.t0); }, beatLen };
}
