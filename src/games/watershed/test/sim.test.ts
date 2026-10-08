import { describe, expect, it } from 'vitest';
import { runHeadless } from '../../../core';
import { module } from '../index';
import { makePlan, PLAN, PLAN_MINUTES, planAt, RIDE_LENGTHS } from '../sim/plan';
import { makeTerrain, NX, NY, SEA } from '../sim/terrain';
import { DEFAULT_WATER, Water, type Emit } from '../sim/water';
import { makeRng } from '../../../core';

const emit = (o: Partial<Emit> = {}): Emit => ({ flow: 12, dropVol: 0.35, speed: 4, sourceX: NX / 2, spread: 2, erodeMul: 1, ...o });
const sum = (a: Float32Array) => a.reduce((s, v) => s + v, 0);

describe('watershed plan', () => {
  it('is a 45 minute ride', () => { expect(PLAN_MINUTES).toBe(45); });
  it('planAt walks the blocks and ramps ERG', () => {
    expect(planAt(0).ftp).toBeCloseTo(PLAN[0].ftpFrom);
    expect(planAt(PLAN[0].minutes * 30).ftp).toBeCloseTo((PLAN[0].ftpFrom + PLAN[0].ftpTo) / 2);
    expect(planAt(PLAN[0].minutes * 60 + 1).block.name).toBe(PLAN[1].name);
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

describe('watershed sky phases + achievements', () => {
  it('a full autopilot ride earns the Watershed achievements it should', async () => {
    const { ACHIEVEMENTS } = await import('../../../progression');
    const { testProfile } = await import('../../../core');
    const r = runHeadless({ game: module, script: 'cadence-follow', minutes: 46, seed: 1, simOpts: { autopilot: true } });
    const record = { id: 'x', profileId: 'p', gameId: 'watershed', startedAt: 0, durationS: 2760, samples: [], events: r.events, stats: r.stats, gameSummary: r.summary };
    const got = ACHIEVEMENTS.filter((a) => a.id.startsWith('ws_') && a.check?.(testProfile(), record as never, [])).map((a) => a.id);
    expect(got).toEqual(expect.arrayContaining(['ws_cycle', 'ws_salmon', 'ws_maestro', 'ws_miller', 'ws_breadbasket'])); // ws_cloud, ws_dam_buster: lifetime tallies
    expect(Number(r.summary.vapor)).toBeGreaterThan(0);
    expect(Number(r.summary.rainfall)).toBeGreaterThan(0);
    expect(r.events.some((e) => e.type === 'springRises')).toBe(true);
  }, 180_000);
});

describe('watershed ride length', () => {
  it('makePlan fits every offered length, keeps the story, and 45 is the original plan', () => {
    for (const L of RIDE_LENGTHS) {
      const p = makePlan(L);
      expect(p.reduce((a, b) => a + b.minutes, 0)).toBeCloseTo(L);
      expect(p.map((b) => b.phase).filter((x, i, a) => a.indexOf(x) === i)).toEqual(['evaporate', 'cloud', 'rain', 'river', 'salmon']);
      expect(p.every((b) => b.minutes >= 1)).toBe(true);
      expect(p.filter((b) => b.job === 'village').length).toBe(L <= 20 ? 1 : L <= 30 ? 2 : L <= 45 ? 3 : 4);
    }
    expect(makePlan(45)).toEqual(PLAN);
  });
  it('waits in the pre-game menu until A (or a tap), then rides the chosen length', async () => {
    const { createGameSession, TimelineInput, testProfile } = await import('../../../core');
    const s = createGameSession({ game: module, profile: testProfile(), input: new TimelineInput([{ t: 1, press: 'right' }, { t: 1.2, release: 'right' }]), fake: { script: 'z2' }, seed: 3 });
    s.step(30);
    expect(s.sim.inMenu?.()).toBe(true);
    s.sim.receive?.({ type: 'length', minutes: 20 });
    s.sim.receive?.({ type: 'start' });
    s.step(2);
    expect(s.sim.inMenu?.()).toBe(false);
    expect((s.sim.snapshot() as { rideS: number }).rideS).toBe(20 * 60);
    expect(s.sim.isOver()).toBe(false);
  });
  it('auto-starts after 25 s in the menu', async () => {
    const { createGameSession, NullInput, testProfile } = await import('../../../core');
    const s = createGameSession({ game: module, profile: testProfile(), input: new NullInput(), fake: { script: 'z2' }, seed: 3 });
    s.step(24 * 30); expect(s.sim.inMenu?.()).toBe(true);
    s.step(2 * 30); expect(s.sim.inMenu?.()).toBe(false);
  });
});
