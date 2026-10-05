import { describe, expect, it } from 'vitest';
import { progTime, songTime } from '../mix/plan';
import { integrateRate, scheduleDeck } from '../player/schedule';
import { synthQueue } from '../synth/queue';

/** Pretend the program starts at context time 100 s. */
const toCtx = (p: number) => 100 + p;

describe('deck schedules (sample-accurate playback from buffers)', () => {
  for (const mix of ['automix', 'continuous', 'crossfade'] as const) {
    it(`${mix}: the scheduled tempo lands every song exactly where the plan says`, () => {
      const { plan } = synthQueue({ style: 'mixed', songs: 3, seed: 1, mix });
      for (const e of plan.entries) {
        const sch = scheduleDeck(e, e.startP, toCtx);
        expect(sch.when).toBeCloseTo(toCtx(e.startP), 9);
        expect(sch.offset).toBeCloseTo(songTime(e.segs, e.startP), 9);
        for (let k = 0; k <= 20; k++) {
          const p = e.startP + ((e.endP - e.startP) * k) / 20;
          expect(integrateRate(sch.offset, sch.when, sch.rate, toCtx(p))).toBeCloseTo(songTime(e.segs, p), 6);
        }
      }
    });
  }

  it('beat-matched decks put the same beat at the same instant', () => {
    const { plan, items } = synthQueue({ style: 'edm', songs: 2, seed: 1, mix: 'automix' });
    const [a, b] = plan.entries, t = plan.transitions[0];
    expect(t.kind).toBe('beatmix');
    const sa = scheduleDeck(a, 0, toCtx), sb = scheduleDeck(b, b.startP, toCtx);
    // context time at which each deck reaches a given song time, by bisection on the integrated rate
    const ctxAt = (sch: typeof sa, s: number) => { let lo = sch.when, hi = sch.when + 2000; for (let i = 0; i < 80; i++) { const m = (lo + hi) / 2; if (integrateRate(sch.offset, sch.when, sch.rate, m) < s) lo = m; else hi = m; } return lo; };
    const beatsA = items[0].analysis.beats.filter((x) => { const p = progTime(a.segs, x); return p > t.p0 && p < t.p1; }).map((x) => ctxAt(sa, x));
    const beatsB = items[1].analysis.beats.filter((x) => { const p = progTime(b.segs, x); return p > t.p0 + 0.25 && p < t.p1 - 0.25; }).map((x) => ctxAt(sb, x));
    expect(beatsB.length).toBeGreaterThan(16);
    for (const tb of beatsB) expect(Math.min(...beatsA.map((ta) => Math.abs(ta - tb)))).toBeLessThan(0.002);
  });

  it('starting mid-song (seek / late decode) offsets everything consistently', () => {
    const { plan } = synthQueue({ style: 'edm', songs: 2, seed: 1, mix: 'automix' });
    const e = plan.entries[1], from = e.startP + 7.3, sch = scheduleDeck(e, from, toCtx);
    expect(sch.when).toBeCloseTo(toCtx(from), 9);
    expect(sch.offset).toBeCloseTo(songTime(e.segs, from), 9);
    expect(integrateRate(sch.offset, sch.when, sch.rate, toCtx(from + 40))).toBeCloseTo(songTime(e.segs, from + 40), 6);
    expect(sch.gain[0].t).toBeCloseTo(toCtx(from), 9);
    expect(sch.gain.every((g, i) => i === 0 || g.t > sch.gain[0].t)).toBe(true);
  });

  it('schedules the echo-out of a fallback transition', () => {
    const { plan } = synthQueue({ style: 'mixed', songs: 3, seed: 1, mix: 'automix' });
    const echo = plan.transitions.find((t) => t.kind === 'echo')!;
    expect(scheduleDeck(plan.entries[echo.from], plan.entries[echo.from].startP, toCtx).echoAt).toBeCloseTo(toCtx(echo.p0), 9);
  });
});
