import { autoAt, rateAt, songTime, type Auto, type PlanEntry } from '../mix/plan';

/**
 * Turns one plan entry into sample-accurate Web Audio events (pure; tested). The engine plays decoded buffers
 * with AudioBufferSourceNode, so a deck's song position is exactly the integral of its playbackRate. Our plan's
 * segments are linear rate ramps in program time — exactly what linearRampToValueAtTime does.
 */
export interface ParamEvent { t: number; v: number; ramp: boolean }
export interface DeckSchedule {
  when: number;        // context time to start the source
  offset: number;      // song time to start from
  stopAt: number;      // context time to stop it
  rate: ParamEvent[];
  gain: ParamEvent[]; low: ParamEvent[]; mid: ParamEvent[]; high: ParamEvent[];
  echoAt?: number;     // context time the echo send opens (for one beat)
}

function autoEvents(a: Auto, fromP: number, toCtx: (p: number) => number): ParamEvent[] {
  const out: ParamEvent[] = [{ t: toCtx(fromP), v: autoAt(a, fromP), ramp: false }];
  for (const [p, v] of a) if (p > fromP) out.push({ t: toCtx(p), v, ramp: true });
  return out;
}

/** Schedule entry `e` starting at program time `fromP` (≥ e.startP), given the program→context clock mapping. */
export function scheduleDeck(e: PlanEntry, fromP: number, toCtx: (p: number) => number): DeckSchedule {
  const p0 = Math.max(e.startP, fromP);
  const rate: ParamEvent[] = [{ t: toCtx(p0), v: rateAt(e.segs, p0), ramp: false }];
  for (const g of e.segs) {
    const end = g.p0 + g.dur;
    if (end <= p0 || g.r0 === g.r1) continue;
    if (g.p0 > p0) rate.push({ t: toCtx(g.p0), v: g.r0, ramp: false });
    rate.push({ t: toCtx(end), v: g.r1, ramp: true });
  }
  return {
    when: toCtx(p0), offset: Math.max(0, songTime(e.segs, p0)), stopAt: toCtx(e.endP) + 0.05, rate,
    gain: autoEvents(e.gain, p0, toCtx), low: autoEvents(e.low, p0, toCtx), mid: autoEvents(e.mid, p0, toCtx), high: autoEvents(e.high, p0, toCtx),
    ...(e.echoAtP !== undefined && e.echoAtP >= p0 ? { echoAt: toCtx(e.echoAtP) } : {}),
  };
}

/** Song time reached after playing from `offset` with these rate events until context time `t` (to check a schedule). */
export function integrateRate(offset: number, when: number, rate: ParamEvent[], t: number): number {
  let s = offset, curT = when, curV = rate[0]?.v ?? 1;
  for (const ev of rate.slice(1)) {
    if (ev.t <= curT) { curV = ev.v; continue; }
    const end = Math.min(t, ev.t);
    if (ev.ramp) {
      const slope = (ev.v - curV) / (ev.t - curT), vEnd = curV + slope * (end - curT);
      s += ((curV + vEnd) / 2) * (end - curT); curV = vEnd;
    } else { s += curV * (end - curT); }
    curT = end;
    if (end >= t) return s;
    curV = ev.v;
  }
  return s + curV * Math.max(0, t - curT);
}
