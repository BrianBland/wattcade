import type { SongAnalysis, QueueMode } from '../types';

/**
 * Mix planning (pure). A plan says, for every song in the queue, when its deck plays in *program* time,
 * which song time it is at (piecewise, rate linear in program time), and its gain/EQ automation.
 * The player follows it; buildTimeline() turns it into the games' MediaTimeline.
 */

export interface MixItem {
  id: string; analysis: SongAnalysis;
  title: string; artist: string; palette?: string[]; credit?: { text: string; url: string };
}

/** One piece of the program→song map: song time s(p) = s0 + r0·(p−p0) + ½·(r1−r0)/dur·(p−p0)². */
export interface Seg { p0: number; s0: number; r0: number; r1: number; dur: number }
/** Automation: (program time, value) points, linear between them, held outside. */
export type Auto = Array<[number, number]>;

export interface PlanEntry {
  index: number; id: string;
  startP: number; endP: number;
  segs: Seg[];
  gain: Auto;               // 0..1
  low: Auto; mid: Auto; high: Auto;  // dB (0 flat, −24 ≈ kill)
  echoAtP?: number;         // echo-out starts here (fallback transition)
  own: [number, number];    // program span this song owns in the timeline
}
export type TransitionKind = 'gapless' | 'beatmix' | 'echo' | 'crossfade';
export interface Transition { kind: TransitionKind; from: number; to: number; p0: number; p1: number; rate: number; why?: string }
export interface MixPlan { mode: QueueMode; entries: PlanEntry[]; transitions: Transition[]; durationS: number }

export interface PlanOpts {
  crossfadeS?: number;   // crossfade length (default 6)
  mixBars?: number;      // automix overlap in bars (default 16)
  maxStretch?: number;   // max tempo change for beat matching (default 0.08)
  rampBars?: number;     // bars to ease the incoming tempo back to native (default 16)
}

export const KILL_DB = -24;

export function segAt(segs: Seg[], p: number): Seg {
  for (let i = segs.length - 1; i >= 0; i--) if (p >= segs[i].p0) return segs[i];
  return segs[0];
}
/** Song time at program time p. */
export function songTime(segs: Seg[], p: number): number {
  if (p < segs[0].p0) return segs[0].s0 + segs[0].r0 * (p - segs[0].p0); // before the deck starts: extrapolate
  const g = segAt(segs, p), x = Math.min(Math.max(0, p - g.p0), g.dur);
  const extra = Math.max(0, p - g.p0 - g.dur); // past the last piece: continue at the end rate
  return g.s0 + g.r0 * x + (0.5 * (g.r1 - g.r0) * x * x) / (g.dur || 1) + g.r1 * extra;
}
/** Playback rate at program time p. */
export function rateAt(segs: Seg[], p: number): number {
  const g = segAt(segs, p), x = Math.min(Math.max(0, p - g.p0), g.dur);
  return g.r0 + ((g.r1 - g.r0) * x) / (g.dur || 1);
}
/** Program time at which the song reaches song time s (monotonic inverse; binary search). */
export function progTime(segs: Seg[], s: number): number {
  let lo = segs[0].p0 - 1e3, hi = segs[segs.length - 1].p0 + segs[segs.length - 1].dur + 1e4;
  for (let i = 0; i < 60; i++) { const m = (lo + hi) / 2; if (songTime(segs, m) < s) lo = m; else hi = m; }
  return (lo + hi) / 2;
}
export function autoAt(a: Auto, p: number): number {
  if (!a.length) return 0;
  if (p <= a[0][0]) return a[0][1];
  for (let i = 1; i < a.length; i++) if (p <= a[i][0]) {
    const [p0, v0] = a[i - 1], [p1, v1] = a[i];
    return p1 === p0 ? v1 : v0 + ((v1 - v0) * (p - p0)) / (p1 - p0);
  }
  return a[a.length - 1][1];
}

const barOf = (a: SongAnalysis) => 240 / (a.bpm || 120);
const lastBeat = (a: SongAnalysis) => a.beats[a.beats.length - 1] ?? a.durationS;
const firstDownbeat = (a: SongAnalysis) => a.downbeats[0] ?? a.beats[0] ?? 0;

/** Tempo ratio to apply to the incoming song so its beats line up (also tries half/double time). */
export function matchRate(bpmOut: number, bpmIn: number): number {
  const r = bpmOut / bpmIn;
  return [r, r * 2, r / 2].reduce((best, x) => (Math.abs(x - 1) < Math.abs(best - 1) ? x : best));
}

/** Bars of intro before the incoming song's first non-intro section (from its first downbeat). */
function introBars(a: SongAnalysis): number {
  const first = a.sections.find((s) => s.kind !== 'intro');
  const end = first ? first.t0 : a.durationS;
  return Math.floor((end - firstDownbeat(a)) / barOf(a) + 0.01);
}

/** Pick where the outgoing song starts mixing out: a phrase start in its last 25–90 s, quiet and outro-ish preferred. */
export function pickOutPoint(a: SongAnalysis, bars: number): number | null {
  const bar = barOf(a), need = bars * bar, end = lastBeat(a);
  const cands = (a.phrases.length ? a.phrases : a.downbeats.filter((_, i) => i % 8 === 0))
    .filter((t) => t >= a.durationS - 90 && t >= a.durationS * 0.4 && t + need <= end + bar * 0.5 && a.durationS - t >= 25);
  if (!cands.length) return null;
  const energy = (t0: number, t1: number) => {
    const s = a.intensity, hz = s.length / a.durationS;
    const i0 = Math.floor(t0 * hz), i1 = Math.max(i0 + 1, Math.floor(t1 * hz));
    let x = 0; for (let i = i0; i < i1 && i < s.length; i++) x += s[i];
    return x / Math.max(1, i1 - i0);
  };
  let best = cands[0], bestS = -Infinity;
  for (const t of cands) {
    const sec = a.sections.find((s) => t >= s.t0 - 0.05 && t < s.t1);
    let sc = -energy(t, t + need);
    if (sec?.kind === 'outro') sc += Math.abs(sec.t0 - t) < bar ? 2 : 1;
    if (sec?.kind === 'break') sc += 0.5;
    sc += 0.002 * t; // tie-break: later
    if (sc > bestS) { bestS = sc; best = t; }
  }
  return best;
}

export function planMix(items: MixItem[], mode: QueueMode, o: PlanOpts = {}): MixPlan {
  const crossfadeS = o.crossfadeS ?? 6, mixBars = o.mixBars ?? 16, maxStretch = o.maxStretch ?? 0.08, rampBars = o.rampBars ?? 16;
  const entries: PlanEntry[] = [], transitions: Transition[] = [];
  const flat = (p: number): Auto => [[p, 0]];
  items.forEach((it, i) => {
    const a = it.analysis;
    if (i === 0) {
      entries.push({ index: 0, id: it.id, startP: 0, endP: a.durationS, segs: [{ p0: 0, s0: 0, r0: 1, r1: 1, dur: a.durationS }],
        gain: [[0, 1]], low: flat(0), mid: flat(0), high: flat(0), own: [0, a.durationS] });
      return;
    }
    const prev = entries[i - 1], pa = items[i - 1].analysis;
    const prevEndP = progTime(prev.segs, pa.durationS);
    const add = (e: Omit<PlanEntry, 'index' | 'id'>, t: Transition) => { entries.push({ index: i, id: it.id, ...e }); transitions.push(t); };

    if (mode === 'continuous') {
      prev.endP = prevEndP; prev.own[1] = prevEndP;
      add({ startP: prevEndP, endP: prevEndP + a.durationS, segs: [{ p0: prevEndP, s0: 0, r0: 1, r1: 1, dur: a.durationS }],
        gain: [[prevEndP, 1]], low: flat(prevEndP), mid: flat(prevEndP), high: flat(prevEndP), own: [prevEndP, prevEndP + a.durationS] },
      { kind: 'gapless', from: i - 1, to: i, p0: prevEndP, p1: prevEndP, rate: 1 });
      return;
    }

    const crossfade = (why?: string) => {
      const x = Math.min(crossfadeS, 0.25 * pa.durationS, 0.25 * a.durationS);
      const p0 = prevEndP - x, p1 = prevEndP;
      const steps = 8, out: Auto = [], inn: Auto = [];
      for (let k = 0; k <= steps; k++) { const f = k / steps, p = p0 + f * x; out.push([p, Math.cos((f * Math.PI) / 2)]); inn.push([p, Math.sin((f * Math.PI) / 2)]); }
      prev.gain = [...prev.gain.filter(([p]) => p < p0), ...out]; prev.endP = p1; prev.own[1] = p0 + x / 2;
      add({ startP: p0, endP: p0 + a.durationS, segs: [{ p0, s0: 0, r0: 1, r1: 1, dur: a.durationS }], gain: inn,
        low: flat(p0), mid: flat(p0), high: flat(p0), own: [p0 + x / 2, p0 + a.durationS] },
      { kind: 'crossfade', from: i - 1, to: i, p0, p1, rate: 1, why });
    };
    if (mode === 'crossfade') return crossfade();

    // automix
    const rate = matchRate(pa.bpm, a.bpm);
    const gridOk = pa.beats.length >= 32 && a.beats.length >= 32 && pa.confidence === 'full' && a.confidence === 'full';
    let bars = mixBars;
    const ib = introBars(a);
    if (ib >= 4 && ib < bars) bars = Math.max(4, ib - (ib % 4));
    let tOut: number | null = null;
    for (const b of [bars, 8, 4]) { if (b > bars) continue; tOut = pickOutPoint(pa, b); if (tOut !== null) { bars = b; break; } }
    if (!gridOk) return crossfade('no beat grid');
    if (Math.abs(rate - 1) > maxStretch || tOut === null) {
      // fallback: echo-out the last phrase/bar, bring the next song in on its first downbeat
      const barA = barOf(pa);
      const tEcho = tOut ?? Math.max(0, lastBeat(pa) - 2 * barA);
      const pEcho = progTime(prev.segs, tEcho), pIn = pEcho + barA;
      const d0 = firstDownbeat(a);
      prev.gain = [...prev.gain.filter(([p]) => p < pEcho), [pEcho, 1], [pEcho + 2 * barA, 0]];
      prev.echoAtP = pEcho; prev.endP = pEcho + 3 * barA; prev.own[1] = pIn;
      add({ startP: pIn, endP: pIn + (a.durationS - d0), segs: [{ p0: pIn, s0: d0, r0: 1, r1: 1, dur: a.durationS - d0 }],
        gain: [[pIn, 0.2], [pIn + barA, 1]], low: flat(pIn), mid: flat(pIn), high: flat(pIn), own: [pIn, pIn + (a.durationS - d0)] },
      { kind: 'echo', from: i - 1, to: i, p0: pEcho, p1: pIn + barA, rate: 1, why: Math.abs(rate - 1) > maxStretch ? `tempo ${pa.bpm}→${a.bpm}` : 'no out point' });
      return;
    }
    const barA = barOf(pa), L = bars * barA, beat = barA / 4;
    const pIn = progTime(prev.segs, tOut), pSwap = pIn + Math.round(bars / 2) * barA, pEnd = pIn + L;
    const d0 = firstDownbeat(a);
    const ramp = rampBars * barA;
    const s1 = d0 + rate * L, s2 = s1 + ((rate + 1) / 2) * ramp;
    const segs: Seg[] = [
      { p0: pIn, s0: d0, r0: rate, r1: rate, dur: L },
      { p0: pEnd, s0: s1, r0: rate, r1: 1, dur: ramp },
      { p0: pEnd + ramp, s0: s2, r0: 1, r1: 1, dur: Math.max(0, a.durationS - s2) },
    ];
    prev.gain = [...prev.gain.filter(([p]) => p < pIn), [pIn + 0.75 * L, 1], [pEnd, 0]];
    prev.low = [...prev.low.filter(([p]) => p < pIn), [pSwap - beat, 0], [pSwap, KILL_DB]];
    prev.high = [...prev.high.filter(([p]) => p < pIn), [pSwap, 0], [pEnd, -6]];
    prev.endP = pEnd; prev.own[1] = pSwap;
    const endP = progTime(segs, a.durationS);
    add({ startP: pIn, endP, segs, gain: [[pIn, 0], [pIn + 0.25 * L, 1]], low: [[pSwap - beat, KILL_DB], [pSwap, 0]], mid: flat(pIn), high: flat(pIn), own: [pSwap, endP] },
      { kind: 'beatmix', from: i - 1, to: i, p0: pIn, p1: pEnd, rate: Math.round(rate * 10000) / 10000 });
  });
  const last = entries[entries.length - 1];
  return { mode, entries, transitions, durationS: last ? last.endP : 0 };
}
