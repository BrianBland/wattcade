import { describe, expect, it } from 'vitest';
import { createGameSession, testProfile, TimelineInput } from '../../../core';
import { module } from '../index';

const snap = (s: { sim: { snapshot(): unknown } }) => s.sim.snapshot() as any;
function track(opts: Record<string, unknown>, tl: any[], script: string, pick: (q: any) => any, out: Record<string, number>) {
  const s = createGameSession({ game: module, profile: testProfile(), input: new TimelineInput(tl), fake: { script }, seed: 1, simOpts: { start: 'bike', cops: false, cyclists: 0, crime: false, ...opts } } as any);
  let x0 = NaN, z0 = NaN, air = 0, landed = false, last: any, rider: any = null;
  for (let i = 0; i < 30 * 12; i++) {
    s.step(1); const q = snap(s), n = pick(q); if (!n) continue; last = n;
    if (n.airS > 0) { if (isNaN(x0)) { x0 = n.x; z0 = n.z; rider = { ...q.rider }; } air += 1 / 30; }
    else if (!isNaN(x0)) { landed = true; if (n.stunS > 0 && Math.hypot(n.vx, n.vz) < 0.05) break; }
  }
  Object.assign(out, { air, travel: Math.hypot(last.x - x0, last.z - z0), landed: landed ? 1 : 0, lateral: rider ? Math.abs((last.x - x0) * Math.cos(rider.heading) - (last.z - z0) * Math.sin(rider.heading)) : 0, peak: 0 });
  return out;
}
describe('knockback: real shove, short arc, tumble/skid, then lie there', () => {
  it('bike collision knocks the cyclist sideways off your line', () => {
    const r = track({ spawn: { x: 0, z: -100, heading: 0 }, cyclistsAt: [{ x: 0.4, z: -80, kind: 'city', line: 0, dir: 1, cruise: 1 }] }, [], 'sprints', (q) => q.npcs.find((n: any) => n.id === 2000), {});
    expect(r.landed).toBe(1); expect(r.air).toBeGreaterThan(0.25); expect(r.air).toBeLessThan(0.65);
    expect(r.travel).toBeGreaterThan(2); expect(r.travel).toBeLessThan(7); expect(r.lateral).toBeGreaterThan(1.5);
  });
  it('jack yanks the rider sideways', () => {
    const r = track({ npcs: [], spawn: { x: 0, z: -98, heading: 0 }, cyclistsAt: [{ x: 1, z: -97, kind: 'bmx', line: 0, dir: 1, cruise: 3 }] }, [{ t: 0.1, press: 'a' }, { t: 0.15, release: 'a' }], 'idle', (q) => q.npcs.find((n: any) => n.id === 2000), {});
    expect(r.air).toBeGreaterThan(0.29); expect(r.air).toBeLessThan(0.65); expect(r.travel).toBeGreaterThan(2); expect(r.travel).toBeLessThan(7); expect(r.lateral).toBeGreaterThan(1.5);
  });
  it('bazooka blast throws them away from the centre (low, heavy, but far)', () => {
    const r = track({ spawn: { x: 0, z: -100, heading: 0 }, npcs: [{ x: 1.5, z: -85 }], startWeapon: 'bazooka' }, [{ t: 0.5, press: 'b' }, { t: 0.6, release: 'b' }], 'idle', (q) => q.npcs[0], {});
    expect(r.air).toBeGreaterThan(0.3); expect(r.air).toBeLessThan(0.9); expect(r.travel).toBeGreaterThan(2.5); expect(r.travel).toBeLessThan(9);
  });
});
