import { describe, expect, it } from 'vitest';
import { advanceBands, bandCatch, bandGain, bandMine, bandMiss, bandTimes, BAND_DEFAULTS, drainPerBlock, F_STAR, freshBands, windowRate, type BandParams, type BandState } from '../sim/bands';
import type { Band, Block } from '../sim/track';

const P: BandParams = { ...BAND_DEFAULTS };
const DT = 1 / 30;
/** Evenly spaced blocks of one band at `rate` per second over [t0, t1). */
const stream = (band: Band, rate: number, t0: number, t1: number): Block[] => {
  const out: Block[] = [];
  for (let i = 0; t0 + i / rate < t1; i++) out.push({ t: Math.round((t0 + i / rate) * 1000) / 1000, lane: 0, color: 1, zone: 0, band });
  return out;
};
const sorted = (xs: Block[]) => xs.sort((a, b) => a.t - b.t);
/**
 * Ride the blocks: every block reaching p is caught when `catches(block, i)` says so; the bars advance each step.
 * Returns the state and the flow events.
 */
function ride(blocks: Block[], seconds: number, catches: (b: Block, i: number) => boolean, opts: { chain?: number; blocked?: (p: number) => boolean; s?: BandState; params?: BandParams; mines?: number[] } = {}) {
  const s = opts.s ?? freshBands(), params = opts.params ?? P, times = bandTimes(blocks), events: Array<[number, string]> = [];
  let next = 0, nCatch = [0, 0, 0], mineIx = 0;
  const mines = opts.mines ?? [];
  for (let p = 0; p < seconds; p += DT) {
    while (next < blocks.length && blocks[next].t <= p) {
      const b = blocks[next], band = b.band ?? 1;
      if (catches(b, nCatch[band]++)) bandCatch(s, band, params); else bandMiss(s, band, params);
      next++;
    }
    while (mineIx < mines.length && mines[mineIx] <= p) { const ev = bandMine(s, params); if (ev) events.push([p, ev]); mineIx++; }
    const ev = advanceBands(s, times, p, DT, { chain: opts.chain ?? 0, blocked: opts.blocked?.(p) ?? false }, params);
    if (ev) events.push([p, ev]);
  }
  return { s, events };
}
/** Catch a fraction f of each band's blocks, spread evenly (Bresenham). */
const fraction = (f: number) => (_: Block, i: number) => Math.floor((i + 1) * f) > Math.floor(i * f);

describe('Lancer band bars', () => {
  it('derives the per-block drain from the break-even catch rate', () => {
    expect(drainPerBlock({ ...P, fStar: F_STAR.pro })).toBeCloseTo(0.042, 6);
    expect(F_STAR).toEqual({ casual: 0.7, pro: 0.8, elite: 0.88 });
  });

  it('does not drain a band with no blocks around (a 60 s gap holds the bar)', () => {
    const blocks = [...stream(0, 2, 0, 10), ...stream(0, 2, 80, 90)];
    const { s } = ride(blocks, 10.01, () => false);
    const at10 = s.level[0];
    // continue through the gap: from 15 s (window cleared) to 75 s nothing moves
    const times = bandTimes(blocks);
    for (let p = 10.01; p < 15; p += DT) advanceBands(s, times, p, DT, { chain: 0, blocked: false }, P);
    const before = s.level[0];
    for (let p = 15; p < 75; p += DT) advanceBands(s, times, p, DT, { chain: 0, blocked: false }, P);
    expect(at10).toBeLessThan(0.6);
    expect(s.level[0]).toBeCloseTo(before, 3);
    expect(s.rate[0]).toBeLessThan(1e-3);
    // the untouched bands never moved
    expect(s.level[1]).toBe(0.6); expect(s.level[2]).toBe(0.6);
  });

  for (const rate of [3, 0.2]) {
    it(`holds steady at the break-even catch rate (${rate} blocks/s)`, () => {
      const seconds = rate >= 1 ? 120 : 600, blocks = stream(1, rate, 0, seconds + 10);
      // The ride's first seconds (the window's look-ahead before p = 0, and the eased rate's ~1 s lag) leave the bar a small
      // cushion that grows with density; after that it doesn't drift.
      const early = ride(blocks, seconds / 3, fraction(P.fStar)).s.level[1], late = ride(blocks, seconds, fraction(P.fStar)).s.level[1];
      expect(Math.abs(late - early)).toBeLessThan(rate >= 1 ? 0.02 : 0.07); // sparse: one block's swing
      expect(late).toBeGreaterThan(0.5); expect(late).toBeLessThan(0.9);
    });
  }

  it('moves a bar by the same amount per block whatever the density (fair across genres)', () => {
    const perBlock = (rate: number) => {
      const n = 40, s = freshBands(); s.level[2] = 0.5;
      ride(stream(2, rate, 5, 5 + n / rate), 5 + n / rate + 9, fraction(0.85), { s }); // past the trailing window
      return (s.level[2] - 0.5) / n;
    };
    // a little over break-even (+0.0045 per block): the same net change per block at 3/s and 0.5/s, never clamped
    const dense = perBlock(3), sparse = perBlock(0.5), want = 0.85 * P.gain - 0.15 * P.miss - drainPerBlock(P);
    expect(dense).toBeCloseTo(want, 3); expect(sparse).toBeCloseTo(want, 3);
  });

  it('a mine knocks every bar down and clamps at zero', () => {
    const s = freshBands(); s.level = [0.15, 0.5, 1];
    bandMine(s, P);
    expect(s.level[0]).toBe(0); expect(s.level[1]).toBeCloseTo(0.3); expect(s.level[2]).toBeCloseTo(0.8);
    expect(s.low).toEqual([true, true, false]);
    for (let i = 0; i < 40; i++) bandCatch(s, 2, P);
    expect(s.level[2]).toBe(1);
  });

  it('low flag uses hysteresis and does not flip-flop around one threshold', () => {
    const s = freshBands(); s.level[0] = 0.36;
    const flips: boolean[] = [];
    // jitter around 0.35 / 0.40: enters low once, stays low until it clears 0.45
    for (const d of [-0.02, 0.03, -0.03, 0.03, -0.03, 0.03]) { if (d < 0) bandMiss(s, 0, { ...P, miss: -d }); else bandCatch(s, 0, { ...P, gain: d }); flips.push(s.low[0]); }
    expect(flips).toEqual([true, true, true, true, true, true]);
    bandCatch(s, 0, { ...P, gain: 0.1 });
    expect(s.level[0]).toBeGreaterThan(0.45); expect(s.low[0]).toBe(false);
    bandMiss(s, 0, { ...P, miss: 0.08 });
    expect(s.level[0]).toBeGreaterThan(0.35); expect(s.low[0]).toBe(false);
  });

  it('ducks a band smoothly from full at lowOn to duckDb when empty', () => {
    expect(bandGain(0.8, P)).toBe(1); expect(bandGain(0.35, P)).toBe(1);
    expect(bandGain(0, P)).toBeCloseTo(10 ** (-15 / 20));
    const mid = bandGain(0.175, P); expect(mid).toBeLessThan(1); expect(mid).toBeGreaterThan(10 ** (-15 / 20));
  });

  it('enters flow after every active bar holds ≥ flowOn for flowHoldS with a long enough chain, then eases the wet amount in', () => {
    const blocks = sorted([...stream(0, 2, 0, 60), ...stream(1, 2, 0.25, 60)]);
    const s = freshBands(); s.level = [0.95, 0.95, 0.2]; // the high band has no blocks: inactive, so its low bar doesn't block flow
    const { events } = ride(blocks, 20, () => true, { chain: 40, s });
    expect(events[0][1]).toBe('flowOn');
    expect(events[0][0]).toBeGreaterThanOrEqual(P.flowHoldS);
    expect(events[0][0]).toBeLessThan(P.flowHoldS + 4.5); // rates ramp in over the first second or so
    expect(s.flowOn).toBe(true); expect(s.flow).toBeGreaterThan(0.9); expect(s.flowS).toBeGreaterThan(5);
  });

  it('needs the chain, at least two active bands, and no dropout / recovery to enter flow', () => {
    const two = sorted([...stream(0, 2, 0, 60), ...stream(1, 2, 0.25, 60)]);
    const high = (s: BandState) => { s.level = [0.95, 0.95, 0.95]; return s; };
    expect(ride(two, 20, () => true, { chain: 10, s: high(freshBands()) }).events).toEqual([]);
    expect(ride(stream(0, 2, 0, 60), 20, () => true, { chain: 40, s: high(freshBands()) }).events).toEqual([]);
    expect(ride(two, 20, () => true, { chain: 40, s: high(freshBands()), blocked: () => true }).events).toEqual([]);
  });

  it('leaves flow when an active bar stays under flowOff for flowOffS, on a mine, or when blocked', () => {
    const blocks = sorted([...stream(0, 3, 0, 120), ...stream(1, 3, 0.15, 120)]);
    const start = () => { const s = freshBands(); s.level = [0.95, 0.95, 0.95]; return s; };
    // misses after 20 s drag the low bar under 0.7; flow ends once it has stayed under for a second
    const r = ride(blocks, 60, (b) => b.t < 20 || (b.band ?? 1) !== 0, { chain: 40, s: start() });
    expect(r.events.map((e) => e[1])).toEqual(['flowOn', 'flowOff']);
    expect(r.s.level[0]).toBeLessThan(0.7);
    // a mine ends it at once
    const m = ride(blocks, 15, () => true, { chain: 40, s: start(), mines: [12] });
    expect(m.events.map((e) => e[1])).toEqual(['flowOn', 'flowOff']); expect(m.events[1][0]).toBeCloseTo(12, 1);
    // a dropout / recovery ends it
    const d = ride(blocks, 15, () => true, { chain: 40, s: start(), blocked: (p) => p > 12 });
    expect(d.events.map((e) => e[1])).toEqual(['flowOn', 'flowOff']);
  });

  it('a short dip under flowOff does not end flow', () => {
    const blocks = sorted([...stream(0, 3, 0, 60), ...stream(1, 3, 0.15, 60)]);
    const s = freshBands(); s.level = [0.95, 0.95, 0.95];
    const r = ride(blocks, 10, () => true, { chain: 40, s });
    expect(r.s.flowOn).toBe(true);
    s.level[0] = 0.69; // a brief dip (0.5 s) that catches pull back up
    const times = bandTimes(blocks);
    for (let p = 10; p < 10.5; p += DT) advanceBands(s, times, p, DT, { chain: 40, blocked: false }, P);
    s.level[0] = 0.9;
    for (let p = 10.5; p < 12; p += DT) advanceBands(s, times, p, DT, { chain: 40, blocked: false }, P);
    expect(s.flowOn).toBe(true);
  });

  it('counts only coloured blocks of a band in the ± window', () => {
    const blocks: Block[] = [{ t: 1, lane: 0, color: 0, zone: 0, band: 0 }, { t: 2, lane: 0, color: -1, zone: 0, band: 0 }, { t: 9, lane: 0, color: 0, zone: 0, band: 0 }, { t: 3, lane: 0, color: 0, zone: 0 }];
    const times = bandTimes(blocks);
    expect(windowRate(times[0], 2, 4)).toBeCloseTo(1 / 8);
    expect(windowRate(times[1], 2, 4)).toBeCloseTo(1 / 8); // no band → mid
    expect(windowRate(times[0], 5, 4)).toBeCloseTo(2 / 8);
    expect(windowRate(times[0], 6, 4)).toBeCloseTo(1 / 8);
  });
});
