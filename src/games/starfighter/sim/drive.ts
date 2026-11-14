import type { MediaTimeline, SectionKind } from '../../../contracts';
import { after } from './director';
/**
 * Drive: the ride swells with the music. Each phrase gets a level (cruise / push / burn) from the song's local energy:
 * builds push, the loudest drops burn, calm sections cruise. Levels change only on phrase lines, are decided (and
 * announced) `announceS` ahead and never revised after that. Burns are bounded and rested so the ride stays
 * conversational. Pure planning over the timeline; the sim commits one phrase at a time.
 */
export type Drive = 'cruise' | 'push' | 'burn';
export const DRIVES: readonly Drive[] = ['cruise', 'push', 'burn'];
export const rank = (d: Drive) => DRIVES.indexOf(d);
export const DRIVE = {
  announceS: 8, minHoldS: 20, maxBurnS: 90, burnRestS: 45,
  /** Local reference window around a phrase (s before / after) and its spread floor. */
  refBefore: 90, refAfter: 60, spreadFloor: 0.06,
  /** z-score thresholds (drop phrases get `dropBias` added). */
  pushZ: 0.15, burnZ: 0.85, dropBias: 0.4,
  /** Without phrase analysis, a fixed grid (only used with full confidence, which normally brings phrases). */
  fallbackPhraseS: 16,
};
export interface DriveSpan { t0: number; t1: number; level: Drive }
interface State { level: Drive; since: number; burnSince: number; lastBurnEnd: number }
const sectionAt = (tl: MediaTimeline, p: number): SectionKind => {
  let k: SectionKind = tl.sections[0]?.kind ?? 'verse';
  for (const s of tl.sections) { if (s.t0 <= p + 1e-6) k = s.kind; else break; }
  return k;
};
function stats(tl: MediaTimeline, a: number, b: number) {
  const i0 = Math.max(0, Math.floor(a * tl.hz)), i1 = Math.min(tl.intensity.length, Math.ceil(b * tl.hz));
  let s = 0, q = 0, n = 0;
  for (let i = i0; i < i1; i++) { const v = tl.intensity[i]; s += v; q += v * v; n++; }
  const mean = n ? s / n : 0;
  return { mean, std: n ? Math.sqrt(Math.max(0, q / n - mean * mean)) : 0, n };
}
/** True when [a, b) is fully analysed: drive never follows estimates. */
export function analysed(tl: MediaTimeline | undefined, a: number, b: number): boolean {
  if (!tl || tl.confidence !== 'full' || !tl.intensity.length || b > tl.durationS + 1e-6) return false;
  if (!tl.coverage) return true;
  let at = a;
  for (const c of [...tl.coverage].sort((x, y) => x.t0 - y.t0)) if (c.t0 <= at + 1e-6 && c.t1 > at && c.structure >= 0.5) at = c.t1;
  return at >= b - 1e-6;
}
/** The level the music asks for over one phrase, before hold/rest rules. */
export function rawLevel(tl: MediaTimeline, a: number, b: number): Drive {
  const kind = sectionAt(tl, (a + b) / 2);
  if (kind === 'intro' || kind === 'break' || kind === 'outro') return 'cruise';
  const song = tl.songs.find(s => s.t0 <= a + 1e-6 && s.t1 > a);
  const lo = Math.max(song?.t0 ?? 0, a - DRIVE.refBefore), hi = Math.min(song?.t1 ?? tl.durationS, b + DRIVE.refAfter);
  const ref = stats(tl, lo, hi), cur = stats(tl, a, b);
  const z = (cur.mean - ref.mean) / Math.max(DRIVE.spreadFloor, ref.std) + (kind === 'drop' ? DRIVE.dropBias : 0);
  // Builds push (tension), never burn: the burn is the drop's payoff.
  if (kind === 'build') return 'push';
  return z >= DRIVE.burnZ ? 'burn' : z >= DRIVE.pushZ ? 'push' : 'cruise';
}
/** Apply hold, burn-length and rest rules for the phrase starting at `a`. */
function decide(st: State, want: Drive, a: number, startsSection: boolean): Drive {
  let next = want;
  if (rank(next) > rank(st.level) && a - st.since < DRIVE.minHoldS && !startsSection) next = st.level;
  if (next === 'burn' && st.level !== 'burn' && a - st.lastBurnEnd < DRIVE.burnRestS) next = 'push';
  if (next === 'burn' && st.level === 'burn' && a - st.burnSince >= DRIVE.maxBurnS) next = 'push';
  return next;
}
function apply(st: State, level: Drive, a: number): void {
  if (level === st.level) return;
  if (level === 'burn') st.burnSince = a;
  if (st.level === 'burn') st.lastBurnEnd = a;
  st.level = level; st.since = a;
}
/**
 * Commits drive levels phrase by phrase. `calmFrom(p)` returns the program time from which the ride must cruise
 * (the segment's breather), so planning and forecasts agree with the sim.
 */
export function createDrive(tl: MediaTimeline | undefined, calmFrom: (p: number) => number = () => Infinity) {
  const st: State = { level: 'cruise', since: -1e9, burnSince: -1e9, lastBurnEnd: -1e9 };
  const committed: DriveSpan[] = [];
  /** Phrase lines in [a, b], with a fixed grid as fallback. */
  const phraseAfter = (p: number): number => {
    const ph = tl?.phrases ?? [];
    const i = after(ph, p);
    if (ph[i] !== undefined) return ph[i];
    return (Math.floor(p / DRIVE.fallbackPhraseS + 1e-9) + 1) * DRIVE.fallbackPhraseS;
  };
  const startsSection = (a: number) => !!tl?.sections.some(s => Math.abs(s.t0 - a) < 0.6 && (s.kind === 'drop' || s.kind === 'build'));
  const plan = (s: State, a: number, b: number): Drive => {
    const calm = calmFrom(a);
    if (!tl || !analysed(tl, a, b) || a >= calm - 1e-6) return 'cruise';
    let lvl = decide(s, rawLevel(tl, a, b), a, startsSection(a));
    // A phrase that runs into the breather can push at most: no burn cut short by the scorecard.
    if (b > calm && lvl === 'burn') lvl = 'push';
    return lvl;
  };
  const end = () => committed.length ? committed[committed.length - 1].t1 : -Infinity;
  /** Commit spans until `horizon`, starting from program time `p` if nothing is committed yet. */
  const commitTo = (p: number, horizon: number) => {
    if (!committed.length) {
      const b = phraseAfter(p);
      committed.push({ t0: p, t1: b, level: 'cruise' });
    }
    while (end() <= horizon) {
      const a = end(), b = Math.max(a + 1, phraseAfter(a)), calm = calmFrom(a);
      // Spans split at the breather so it starts on time.
      const cut = calm > a + 1e-6 && calm < b ? calm : b;
      const level = plan(st, a, cut); apply(st, level, a);
      committed.push({ t0: a, t1: cut, level });
    }
    while (committed.length > 2 && committed[1].t1 < p - 1) committed.shift();
  };
  const spanAt = (p: number) => committed.find(s => s.t0 <= p + 1e-6 && s.t1 > p) ?? committed[committed.length - 1];
  return {
    /** Advance to program time p; returns the current level and the next change (if one is committed). */
    step(p: number): { level: Drive; next: { at: number; level: Drive } | null; changed: boolean; span: DriveSpan } {
      const before = committed.length ? spanAt(p).level : null;
      commitTo(p, p + DRIVE.announceS);
      const span = spanAt(p);
      const nxt = committed.find(s => s.t0 > p + 1e-6 && s.level !== span.level);
      return { level: span.level, next: nxt ? { at: nxt.t0, level: nxt.level } : null, changed: before !== null && before !== span.level, span };
    },
    /**
     * Expected levels from p to `until` (committed spans, then planned from the current state without committing).
     * Used for distance forecasts (turns, biome switches); may change as the timeline is revised.
     */
    forecast(p: number, until: number): DriveSpan[] {
      commitTo(p, p + DRIVE.announceS);
      const out = committed.filter(s => s.t1 > p && s.t0 < until).map(s => ({ ...s, t0: Math.max(s.t0, p) }));
      const s: State = { ...st };
      let a = end();
      while (a < until) {
        const b = Math.max(a + 1, phraseAfter(a)), calm = calmFrom(a), cut = calm > a + 1e-6 && calm < b ? calm : b;
        const level = plan(s, a, cut); apply(s, level, a);
        out.push({ t0: a, t1: Math.min(cut, until), level }); a = cut;
      }
      if (out.length) out[out.length - 1].t1 = Math.min(out[out.length - 1].t1, until);
      return out;
    },
  };
}
/** Distance covered over the spans at the given speed per level. */
export function spanDistance(spans: readonly DriveSpan[], speed: (d: Drive) => number): number {
  return spans.reduce((d, s) => d + Math.max(0, s.t1 - s.t0) * speed(s.level), 0);
}
/** Program time at which `dist` has been covered from spans[0].t0 (clamped to the last span's end). */
export function timeAtDistance(spans: readonly DriveSpan[], speed: (d: Drive) => number, dist: number): number {
  let left = dist;
  for (const s of spans) {
    const v = speed(s.level), len = (s.t1 - s.t0) * v;
    if (left <= len) return s.t0 + left / Math.max(1e-6, v);
    left -= len;
  }
  const last = spans[spans.length - 1];
  return last ? last.t1 + left / Math.max(1e-6, speed(last.level)) : dist;
}
