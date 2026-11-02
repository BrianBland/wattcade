import { describe, it, expect } from 'vitest';
import { synthTimeline } from '../../../media/synth/queue';
import { analysed, createDrive, DRIVE, rawLevel, spanDistance, timeAtDistance, type Drive } from '../sim/drive';

const tl = () => synthTimeline({ style: 'mixed', songs: 8, seed: 4 });
/** Level per 0.1 s over the whole timeline, stepping like the sim. */
function walk(t = tl(), calmFrom?: (p: number) => number) {
  const d = createDrive(t, calmFrom), out: Array<{ p: number; level: Drive }> = [];
  for (let p = 0; p < t.durationS; p += 0.1) out.push({ p, level: d.step(p).level });
  return out;
}
const runs = (xs: Array<{ p: number; level: Drive }>) => {
  const r: Array<{ t0: number; t1: number; level: Drive }> = [];
  for (const x of xs) { const last = r[r.length - 1]; if (last && last.level === x.level) last.t1 = x.p; else r.push({ t0: x.p, t1: x.p, level: x.level }); }
  return r;
};
describe('music drive', () => {
  it('calm sections cruise, builds push, and the loudest drops burn', () => {
    const t = tl();
    for (const s of t.sections) {
      const a = s.t0 + 0.5, b = Math.min(s.t1, s.t0 + 12), lvl = rawLevel(t, a, b);
      if (s.kind === 'intro' || s.kind === 'break' || s.kind === 'outro') expect(lvl).toBe('cruise');
      if (s.kind === 'build') expect(lvl).toBe('push');
    }
    expect(t.sections.some(s => s.kind === 'drop' && rawLevel(t, s.t0, Math.min(s.t1, s.t0 + 12)) === 'burn')).toBe(true);
  });
  it('changes only on phrase lines; burns are bounded and rested', () => {
    const t = tl(), r = runs(walk(t));
    expect(new Set(r.map(x => x.level)).size).toBe(3);
    for (const x of r.slice(1)) expect(t.phrases.some(ph => Math.abs(ph - x.t0) < 0.15)).toBe(true);
    const burns = r.filter(x => x.level === 'burn');
    for (const b of burns) expect(b.t1 - b.t0).toBeLessThanOrEqual(DRIVE.maxBurnS + 0.2);
    for (let i = 1; i < burns.length; i++) expect(burns[i].t0 - burns[i - 1].t1).toBeGreaterThanOrEqual(DRIVE.burnRestS - 0.2);
  });
  it('the breather always cruises, and no burn runs into it', () => {
    const calm = (p: number) => p < 200 ? 186 : Infinity;
    for (const x of walk(tl(), calm)) if (x.p >= 186 && x.p < 200) expect(x.level).toBe('cruise');
  });
  it('announced levels are never revised when the timeline changes', () => {
    const t = tl(), d = createDrive(t), seen = new Map<number, Drive>();
    for (let p = 0; p < 120; p += 0.1) d.step(p);
    const committed = d.forecast(120, 128);
    // A rolling revision flattens everything ahead: the announced window keeps its levels.
    t.intensity.fill(0.2, Math.floor(121 * t.hz));
    for (let p = 120; p < 128; p += 0.1) { const lvl = d.step(p).level; const span = committed.find(s => s.t0 <= p && s.t1 > p); if (span) expect(lvl).toBe(span.level); seen.set(Math.round(p), lvl); }
    expect(seen.size).toBeGreaterThan(0);
  });
  it('forecasts agree with what is then committed', () => {
    const t = tl(), d = createDrive(t); d.step(30);
    const f = d.forecast(30, 300), live = createDrive(t);
    for (let p = 0; p < 300; p += 0.1) { const lvl = live.step(p).level; if (p > 31) { const s = f.find(x => x.t0 <= p && x.t1 > p); if (s) expect(lvl).toBe(s.level); } }
  });
  it('only follows full analysis', () => {
    const t = tl(); expect(analysed(t, 10, 20)).toBe(true);
    expect(analysed({ ...t, confidence: 'metadata' }, 10, 20)).toBe(false);
    expect(analysed({ ...t, coverage: [{ t0: 0, t1: 15, rhythm: 1, structure: 1 }] }, 10, 20)).toBe(false);
    expect(analysed({ ...t, coverage: [{ t0: 0, t1: 15, rhythm: 1, structure: 1 }, { t0: 15, t1: 40, rhythm: 1, structure: 0.9 }] }, 10, 20)).toBe(true);
    expect(walk({ ...tl(), confidence: 'metadata' }).every(x => x.level === 'cruise')).toBe(true);
  });
  it('distance and time along spans invert each other', () => {
    const spans = [{ t0: 0, t1: 10, level: 'cruise' as Drive }, { t0: 10, t1: 20, level: 'burn' as Drive }];
    const v = (d: Drive) => d === 'burn' ? 40 : 20;
    expect(spanDistance(spans, v)).toBe(600);
    expect(timeAtDistance(spans, v, 300)).toBeCloseTo(12.5);
  });
});
