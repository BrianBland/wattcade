import { describe, expect, it } from 'vitest';
import { runHeadless } from '../../../core';
import { module } from '../index';
import { PLAN, PLAN_MINUTES, planAt } from '../sim/plan';
import { makeTerrain, NX, NY, SEA } from '../sim/terrain';
import { DEFAULT_WATER, Water, type Emit } from '../sim/water';
import { makeRng } from '../../../core';

const emit = (o: Partial<Emit> = {}): Emit => ({ flow: 12, dropVol: 0.35, speed: 4, sourceX: NX / 2, spread: 2, erodeMul: 1, ...o });
const sum = (a: Float32Array) => a.reduce((s, v) => s + v, 0);

describe('watershed plan', () => {
  it('is a 45 minute ride', () => { expect(PLAN_MINUTES).toBe(45); });
  it('planAt walks the blocks and ramps ERG', () => {
    expect(planAt(0).ftp).toBeCloseTo(PLAN[0].ftpFrom);
    expect(planAt(3 * 60).ftp).toBeCloseTo((PLAN[0].ftpFrom + PLAN[0].ftpTo) / 2);
    expect(planAt(6 * 60 + 1).block.name).toBe(PLAN[1].name);
    expect(planAt(46 * 60).done).toBe(true);
    for (const b of PLAN) { expect(b.ftpFrom).toBeLessThanOrEqual(1); expect(b.ftpTo).toBeGreaterThanOrEqual(0.4); }
  });
});

describe('watershed terrain', () => {
  it('falls from the spring to the sea and is deterministic', () => {
    const a = makeTerrain(5), b = makeTerrain(5);
    expect(a.h).toEqual(b.h);
    expect(a.h[2 * NX + NX / 2]).toBeGreaterThan(15);
    expect(a.h[(NY - 2) * NX + NX / 2]).toBeLessThan(SEA);
  });
});

describe('watershed water', () => {
  it('conserves soil: eroded = deposited + suspended + carried to sea (thermal moves soil but conserves it)', () => {
    const t = makeTerrain(3), w = new Water(t, makeRng(1));
    const before = sum(t.h);
    for (let i = 0; i < 30 * 60; i++) w.step(1 / 30, emit(), DEFAULT_WATER);
    const after = sum(t.h);
    expect(w.stats.eroded).toBeGreaterThan(10);
    expect(after - before).toBeCloseTo(-(w.suspended() + w.stats.toSea), 0);
  }, 60_000);
  it('water runs downhill to the sea', () => {
    const t = makeTerrain(3), w = new Water(t, makeRng(1));
    for (let i = 0; i < 30 * 100; i++) w.step(1 / 30, emit(), DEFAULT_WATER);
    let maxY = 0; for (let q = 0; q < w.n; q++) maxY = Math.max(maxY, w.y[q]);
    expect(maxY).toBeGreaterThan(t.coastY);
  }, 60_000);
  it('heavy parcels dig deeper near the spring than light ones (same flow)', () => {
    const cut = (dropVol: number, speed: number) => {
      const t = makeTerrain(3), w = new Water(t, makeRng(1));
      for (let i = 0; i < 30 * 60; i++) w.step(1 / 30, emit({ dropVol, speed }), DEFAULT_WATER);
      let d = 0; for (let k = 0; k < t.h.length; k++) d = Math.max(d, t.h0[k] - t.h[k]);
      return d;
    };
    expect(cut(0.6, 2)).toBeGreaterThan(cut(0.2, 9));
  }, 60_000);
  it('never exceeds the particle cap and never cuts below bedrock floor', () => {
    const t = makeTerrain(3), w = new Water(t, makeRng(1), 500);
    for (let i = 0; i < 30 * 60; i++) w.step(1 / 30, emit({ flow: 40, dropVol: 0.1 }), DEFAULT_WATER);
    expect(w.n).toBeLessThanOrEqual(500);
    expect(Math.min(...t.h)).toBeGreaterThanOrEqual(-8.5);
  });
});

describe('watershed sim', () => {
  it('is deterministic and sends ERG', () => {
    const a = runHeadless({ game: module, script: 'cadence-follow', minutes: 1, seed: 4 });
    const b = runHeadless({ game: module, script: 'cadence-follow', minutes: 1, seed: 4 });
    expect(a.summary).toEqual(b.summary);
    expect(a.mixerCommands.some((c) => c.mode === 'erg')).toBe(true);
    expect(a.mixerCommands.every((c) => c.mode !== 'sim' || c.gradePct === 0)).toBe(true);
  }, 60_000);
  it('idle makes no water', () => {
    const r = runHeadless({ game: module, script: 'idle', minutes: 2, seed: 1 });
    expect(r.summary.parcels).toBe(0);
  });
});
