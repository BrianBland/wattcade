import { describe, expect, it } from 'vitest';
import { createGameSession, NullInput, testProfile } from '../../../core';
import { riderLook } from '../../../cosmetics/unlocks';
import { module } from '../index';
import type { WarmupSnapshot } from '../sim/sim';
import { cruisingSpeed, rideSpeed } from '../sim/physics';
import { RIDER_LIFETIME_S, WarmupTraffic, type LocalRider } from '../sim/traffic';

const physics = { mass: 84, cda: 0.32, crr: 0.005 };
const flat = () => 0;
const peer = (id: string): LocalRider => ({ id, name: id, look: riderLook(testProfile({ color: '#ff8844' })) });
const playerV = cruisingSpeed(140, 0, physics);

describe('local warm-up riders', () => {
  it('excludes the current player, deduplicates profiles, and stays empty without peers', () => {
    const t = new WarmupTraffic(2, 'self');
    t.setRiders([peer('self'), peer('self')]);
    for (let i = 0; i < 180; i++) t.update(1, i * playerV, playerV, 110, physics, flat);
    expect(t.snapshot()).toEqual([]);
    t.setRiders([peer('self'), peer('other'), peer('other')]);
    let encountered = false;
    for (let i = 0; i < 360; i++) {
      t.update(1, i * playerV, playerV, 110, physics, flat);
      expect(t.snapshot().map(r => r.id)).toEqual(expect.not.arrayContaining(['self']));
      expect(t.snapshot().length).toBeLessThanOrEqual(1);
      encountered ||= t.snapshot().length > 0;
    }
    expect(encountered).toBe(true);
  });

  it('waits five minutes before the first encounter and between later encounters', () => {
    const t = new WarmupTraffic(2, 'self'); t.setRiders([peer('other')]);
    for (let encounter = 0; encounter < 3; encounter++) {
      // A stopped player is passed quickly, so the previous rider is long gone.
      for (let second = 1; second < 300; second++) {
        t.update(1, 0, 0, 110, physics, flat);
        if (encounter === 0 || second > 120) expect(t.snapshot()).toEqual([]);
      }
      expect(t.snapshot()).toEqual([]);
      t.update(1, 0, 0, 110, physics, flat);
      expect(t.snapshot().map(r => r.id)).toEqual(['other']);
    }
  });

  it('enters ahead at an easy pace and can be passed in Z2', () => {
    const t = new WarmupTraffic(2, 'self'); t.setRiders([peer('other')]);
    t.view = { behindM: 12, aheadM: 28 };
    t.update(299, 0, playerV, 110, physics, flat);
    let d = 0, entered = false, passed = false;
    for (let i = 0; i < 90 * 30; i++) {
      d += playerV / 30; t.update(1 / 30, d, playerV, 110, physics, flat);
      const r = t.snapshot()[0]; if (!r) continue;
      if (!entered) {
        expect(r.d - d).toBeCloseTo(32, 5);
        expect(r.v).toBeCloseTo(cruisingSpeed(110, 0, physics), 5);
        entered = true;
      }
      expect(r.v).toBeLessThan(playerV);
      if (r.d < d) passed = true;
    }
    expect(entered).toBe(true); expect(passed).toBe(true);
  });

  it('rides past a stopped player from behind while always moving forward', () => {
    const t = new WarmupTraffic(4, 'self'); t.setRiders([peer('other')]);
    t.update(299, 100, 0, 110, physics, flat);
    let firstD: number | undefined, passed = false;
    for (let i = 0; i < 30 * 30; i++) {
      t.update(1 / 30, 100, 0, 110, physics, flat);
      const r = t.snapshot()[0]; if (!r) continue;
      firstD ??= r.d;
      expect(r.v).toBeGreaterThan(0);
      if (r.d > 100) passed = true;
    }
    expect(firstD).toBeLessThan(80); expect(passed).toBe(true);
  });

  it('updates cosmetics and removes deleted riders without resetting the ride', () => {
    const t = new WarmupTraffic(2, 'self'); t.setRiders([peer('other')]);
    t.update(300, 0, 0, 110, physics, flat);
    const before = t.snapshot()[0]; expect(before).toBeDefined();
    const changed = { ...peer('other'), name: 'Renamed', look: riderLook(testProfile({ color: '#ff00ff' })) };
    t.setRiders([changed]);
    expect(t.snapshot()[0]).toEqual({ ...before, ...changed });
    t.setRiders([]); expect(t.snapshot()).toEqual([]);
  });

  it('keeps traffic bounded and retires a speed-matched rider instead of leaving them forever', () => {
    const t = new WarmupTraffic(7, 'self');
    t.setRiders(['a', 'b', 'c', 'd'].map(peer));
    const v = cruisingSpeed(110, 0, physics);
    let lastSpawn = 0, spawns = 0;
    for (let i = 0; i < 1321 * 30; i++) {
      t.update(1 / 30, i * v / 30, v, 110, physics, flat);
      const riders = t.snapshot();
      expect(riders.length).toBeLessThanOrEqual(1);
      expect(new Set(riders.map(r => r.id)).size).toBe(riders.length);
      expect(riders.every(r => r.age < RIDER_LIFETIME_S)).toBe(true);
      if (riders.some(r => r.age === 0)) { lastSpawn = i / 30; spawns++; }
    }
    expect(spawns).toBe(4); expect(lastSpawn).toBeGreaterThan(1199);
    expect(t.snapshot()).toEqual([]);
  });

  it('uses the same power/drag/grade physics on climbs and descents', () => {
    const t = new WarmupTraffic(2, 'self'); t.setRiders([peer('other')]);
    t.update(300, 0, 0, 110, physics, flat);
    const before = t.snapshot()[0];
    t.update(1 / 30, 0, 0, 110, physics, () => 3);
    const uphill = t.snapshot()[0];
    expect(uphill.v).toBeCloseTo(rideSpeed(before.v, 110, 3, physics, 1 / 30), 8);
    expect(uphill.v).toBeLessThan(before.v);
    t.update(1 / 30, 0, 0, 110, physics, () => -3);
    expect(t.snapshot()[0].v).toBeGreaterThan(uphill.v);
    expect(uphill.crankRevs).toBeGreaterThan(before.crankRevs);
    expect(before.age).toBeLessThan(uphill.age); // snapshots stay stable after the next tick
  });
});

describe('warm-up traffic integration', () => {
  function session(ftp: number, riders: LocalRider[] = [peer('other')]) {
    const s = createGameSession({ game: module, profile: testProfile({ ftp }), input: new NullInput(),
      fake: { script: 'z2' }, seed: 2, simOpts: { riders, terrainSeed: 123 } });
    s.tuning.set('warmup.hills', false);
    return { s, snap: () => s.sim.snapshot() as WarmupSnapshot };
  }

  it('paces peers from the active player FTP and deterministically leaves player physics and trainer commands unchanged', () => {
    const a = session(200), b = session(200), empty = session(200, []), high = session(300);
    for (const { s } of [a, b, empty, high]) s.step(30 * 301);
    expect(a.snap()).toEqual(b.snap());
    const r = a.snap().riders[0]; expect(r).toBeDefined();
    expect(r.v).toBeCloseTo(cruisingSpeed(200 * 0.55, 0, physics), 5);
    expect(high.snap().riders[0].v).toBeGreaterThan(r.v);
    expect(a.snap().d).toBe(empty.snap().d);
    expect(a.snap().grade).toBe(empty.snap().grade);
    expect(a.s.commands).toEqual(empty.s.commands);
    expect(a.s.sim.summary()).toEqual(empty.s.sim.summary());
  });

  it('accepts refreshed rosters and viewport sizes, including after a restarted session', () => {
    const { s, snap } = session(200, []);
    s.sim.receive!({ type: 'riderView', view: { behindM: 50, aheadM: 120 } });
    s.sim.receive!({ type: 'riders', riders: [peer('test'), peer('other')] });
    s.step(30 * 301);
    expect(snap().riderView).toEqual({ behindM: 50, aheadM: 120 });
    expect(snap().riders.map(r => r.id)).toEqual(['other']);
    s.sim.receive!({ type: 'riders', riders: [] });
    expect(snap().riders).toEqual([]);
  });
});
