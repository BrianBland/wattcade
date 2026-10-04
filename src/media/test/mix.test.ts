import { describe, expect, it } from 'vitest';
import { autoAt, KILL_DB, matchRate, planMix, progTime, rateAt, songTime, type Seg } from '../mix/plan';
import { buildTimeline } from '../mix/timeline';
import { synthQueue, synthScores, synthItem } from '../synth/queue';
import { ProgramSync, SmoothedPosition } from '../clock';

describe('program↔song mapping', () => {
  const segs: Seg[] = [
    { p0: 10, s0: 2, r0: 1.04, r1: 1.04, dur: 20 },
    { p0: 30, s0: 2 + 1.04 * 20, r0: 1.04, r1: 1, dur: 10 },
    { p0: 40, s0: 2 + 1.04 * 20 + 10.2, r0: 1, r1: 1, dur: 100 },
  ];
  it('is continuous and invertible', () => {
    for (const p of [10, 15, 29.999, 30, 35, 40, 41, 120]) expect(progTime(segs, songTime(segs, p))).toBeCloseTo(p, 4);
    expect(songTime(segs, 30 - 1e-9)).toBeCloseTo(songTime(segs, 30), 6);
    expect(songTime(segs, 40 - 1e-9)).toBeCloseTo(songTime(segs, 40), 6);
    expect(rateAt(segs, 35)).toBeCloseTo(1.02, 6);
  });
  it('automation interpolates and holds', () => {
    const a: Array<[number, number]> = [[0, 0], [10, 1]];
    expect(autoAt(a, -5)).toBe(0); expect(autoAt(a, 5)).toBe(0.5); expect(autoAt(a, 50)).toBe(1);
  });
  it('matches tempo, also at half/double time', () => {
    expect(matchRate(124, 120)).toBeCloseTo(124 / 120);
    expect(matchRate(140, 70)).toBeCloseTo(1);
    expect(matchRate(87, 174)).toBeCloseTo(1);
  });
});

describe('planMix', () => {
  it('continuous: back to back, no overlap, no gap', () => {
    const { plan, items } = synthQueue({ style: 'mixed', songs: 3, mix: 'continuous' });
    expect(plan.transitions.every((t) => t.kind === 'gapless')).toBe(true);
    const total = items.reduce((s, i) => s + i.analysis.durationS, 0);
    expect(plan.durationS).toBeCloseTo(total, 3);
    for (let i = 1; i < plan.entries.length; i++) expect(plan.entries[i].startP).toBeCloseTo(plan.entries[i - 1].endP, 6);
  });

  it('automix: beat-matched, phrase-aligned, bass swapped, tempo eased back', () => {
    const { plan, items } = synthQueue({ style: 'edm', songs: 3, seed: 1, mix: 'automix' });
    expect(plan.transitions.map((t) => t.kind)).toEqual(['beatmix', 'beatmix']);
    for (const t of plan.transitions) {
      const out = plan.entries[t.from], inn = plan.entries[t.to], a = items[t.from].analysis, b = items[t.to].analysis;
      // the incoming tempo matches the outgoing one during the overlap
      expect((b.bpm * rateAt(inn.segs, t.p0 + 1)) / a.bpm).toBeCloseTo(1, 3);
      // the mix starts on one of the outgoing song's phrase starts, and on the incoming song's first downbeat
      expect(a.phrases.some((ph) => Math.abs(progTime(out.segs, ph) - t.p0) < 1e-3)).toBe(true);
      expect(songTime(inn.segs, t.p0)).toBeCloseTo(b.downbeats[0], 3);
      // beats coincide through the overlap (within 10 ms)
      const outBeats = a.beats.map((x) => progTime(out.segs, x)).filter((p) => p >= t.p0 && p <= t.p1);
      const inBeats = b.beats.map((x) => progTime(inn.segs, x)).filter((p) => p >= t.p0 && p <= t.p1);
      for (const p of inBeats.slice(0, -1)) expect(Math.min(...outBeats.map((q) => Math.abs(q - p)))).toBeLessThan(0.01);
      // bass swap: outgoing low is killed by the end, incoming low is open after
      expect(autoAt(out.low, t.p1)).toBe(KILL_DB);
      expect(autoAt(inn.low, t.p1)).toBe(0);
      expect(autoAt(out.gain, t.p1)).toBe(0);
      expect(autoAt(inn.gain, t.p1)).toBe(1);
      // rate eases back to native
      expect(rateAt(inn.segs, inn.endP - 1)).toBe(1);
    }
  });

  it('automix falls back to an echo-out when tempos are too far apart', () => {
    const { plan } = synthQueue({ style: 'mixed', songs: 3, seed: 1, mix: 'automix' });
    expect(plan.transitions.map((t) => t.kind)).toContain('echo');
    const echo = plan.transitions.find((t) => t.kind === 'echo')!;
    expect(plan.entries[echo.from].echoAtP).toBeCloseTo(echo.p0, 6);
  });

  it('automix crossfades songs without a beat grid', () => {
    const items = synthScores({ style: 'edm', songs: 2 }).map(synthItem);
    items[1] = { ...items[1], analysis: { ...items[1].analysis, beats: [], downbeats: [] } };
    expect(planMix(items, 'automix').transitions[0].kind).toBe('crossfade');
  });

  it('crossfade: equal-power overlap of the set length', () => {
    const { plan } = synthQueue({ style: 'edm', songs: 2, mix: 'crossfade' });
    const t = plan.transitions[0];
    expect(t.p1 - t.p0).toBeCloseTo(6, 6);
    const mid = (t.p0 + t.p1) / 2, g1 = autoAt(plan.entries[0].gain, mid), g2 = autoAt(plan.entries[1].gain, mid);
    expect(g1 * g1 + g2 * g2).toBeCloseTo(1, 1);
  });
});

describe('buildTimeline', () => {
  for (const mix of ['continuous', 'automix', 'crossfade'] as const) {
    it(`${mix}: one tidy program clock`, () => {
      const { timeline: tl } = synthQueue({ style: 'mixed', songs: 3, seed: 2, mix });
      expect(tl.songs.length).toBe(3);
      for (let i = 1; i < tl.songs.length; i++) expect(tl.songs[i].t0).toBeCloseTo(tl.songs[i - 1].t1, 3);
      expect(tl.songs[tl.songs.length - 1].t1).toBeCloseTo(tl.durationS, 3);
      for (const xs of [tl.beats, tl.downbeats, tl.phrases]) for (let i = 1; i < xs.length; i++) expect(xs[i]).toBeGreaterThan(xs[i - 1]);
      for (let i = 1; i < tl.sections.length; i++) expect(tl.sections[i].t0).toBeGreaterThanOrEqual(tl.sections[i - 1].t0);
      expect(tl.intensity.length).toBe(Math.ceil(tl.durationS * 10));
      expect(tl.intensity.every((v) => v >= 0 && v <= 1)).toBe(true);
      // no beat gaps inside a song (only at continuous/echo boundaries, where silence is real)
      const minBeat = 60 / Math.max(...tl.songs.map((s) => s.bpm));
      const iv = tl.beats.slice(1).map((t, i) => t - tl.beats[i]);
      expect(Math.min(...iv)).toBeGreaterThan(minBeat * 0.9);
    });
  }
  it('is deterministic', () => {
    const a = synthQueue({ style: 'mixed', songs: 3, seed: 3 }).timeline, b = synthQueue({ style: 'mixed', songs: 3, seed: 3 }).timeline;
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });
  it('a single song maps 1:1', () => {
    const items = synthScores({ style: 'rock', songs: 1 }).map(synthItem);
    const tl = buildTimeline(planMix(items, 'automix'), items);
    expect(tl.beats).toEqual(items[0].analysis.beats);
    expect(tl.sections.map((s) => s.kind)).toEqual(items[0].analysis.sections.map((s) => s.kind));
  });
});

describe('ProgramSync', () => {
  it('nudges gently, holds when ahead, catches up when far behind', () => {
    const s = new ProgramSync();
    expect(s.update(10.02, 10, true)).toBeCloseTo(1.01, 6);
    expect(s.update(10, 10.1, true)).toBeCloseTo(0.98, 6);
    expect(s.update(10, 10.5, true)).toBe(0);
    expect(s.update(14, 10, true)).toBe(4);
    expect(s.update(null, 10, true)).toBe(0);
    expect(s.update(10, 10, false)).toBe(0);
  });
  it('converges from an offset in a simulated loop', () => {
    const s = new ProgramSync(); let audio = 0, sim = -0.3;
    for (let i = 0; i < 60 * 60; i++) { const dt = 1 / 60; audio += dt; sim += dt * s.update(audio, sim, true); }
    expect(Math.abs(s.errS)).toBeLessThan(0.01);
  });
});

describe('SmoothedPosition', () => {
  it('turns a steppy clock into a smooth one', () => {
    const sp = new SmoothedPosition();
    let worst = 0;
    for (let i = 0; i < 600; i++) {
      const fine = i / 120, coarse = Math.floor(fine / 0.25) * 0.25; // 250 ms steps
      const v = sp.update(coarse, fine, 1, true);
      if (i > 60) worst = Math.max(worst, Math.abs(v - fine));
    }
    expect(worst).toBeLessThan(0.3);
  });
});
