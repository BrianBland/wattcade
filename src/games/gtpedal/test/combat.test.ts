import { describe, expect, it } from 'vitest';
import { createGameSession, NullInput, testProfile, TimelineInput } from '../../../core';
import type { Button } from '../../../contracts';
import { module } from '../index';
import { copTopSpeed, newCop, type CopParams } from '../sim/cops';
import { findPath, visible } from '../sim/nav';
import { KICKERS, PLAZA } from '../sim/world';
import { BASE_FOV, pitchOffsetDeg, stepCam } from '../render/camera';

const snap = (s: { sim: { snapshot(): unknown } }) => s.sim.snapshot() as any;
const taps = (...seq: Array<[number, Button]>) => new TimelineInput(seq.flatMap(([t, b]) => [{ t, press: b }, { t: t + 0.1, release: b }]));
const evs: Array<{ type: string; data?: any }> = [];
function run(opts: Record<string, unknown>, input: any = new NullInput(), script = 'idle') {
  evs.length = 0;
  return createGameSession({ game: module, profile: testProfile(), input, fake: { script }, seed: 1, simOpts: opts, onEmit: (e: any) => evs.push(e) } as any);
}
const S = (s: { step(n: number): void }, sec: number) => s.step(Math.round(sec * 30));
const base = { spawn: { x: 0, z: -100, heading: 0 }, cops: false };

describe('weapons', () => {
  it('bazooka: rocket to the locked bystander, boom launches them skyward, costs ammo, adds heat', () => {
    const s = run({ ...base, npcs: [{ x: 0, z: -85 }], startWeapon: 'bazooka' }, taps([0.5, 'b']));
    S(s, 0.4); expect(snap(s).lockAt).not.toBeNull();
    S(s, 1.0);
    const n = snap(s).npcs[0];
    expect(n.airS > 0 || n.y > 1).toBe(true);
    expect(snap(s).ammo.bazooka).toBe(2); expect(snap(s).heat).toBeGreaterThan(0);
    expect(evs.some((e) => e.type === 'launch' && e.data.weapon === 'bazooka')).toBe(true);
  });
  it('grenade: lobbed, sits on its fuse, then pops everyone in radius', () => {
    const s = run({ ...base, npcs: [{ x: 0, z: -88 }, { x: 3, z: -88 }], startWeapon: 'grenade' }, taps([0.5, 'b']));
    S(s, 1.6); // in flight / fusing
    expect(snap(s).projectiles.some((p: any) => p.kind === 'grenade' && p.landed)).toBe(true);
    expect(snap(s).npcs.every((n: any) => n.airS === 0)).toBe(true);
    S(s, 1.2);
    expect(snap(s).stats.launches).toBe(2);
    expect(snap(s).blasts.length + evs.filter((e) => e.type === 'launch').length).toBeGreaterThan(0);
  });
  it('oil: dropped behind you; a chasing Segway cop spins out on it', () => {
    const s = run({ spawn: { x: 0, z: -100, heading: 0 }, heat: 1, copSpawn: [{ kind: 'segway', x: 0, z: -117 }], startWeapon: 'oil' }, taps([0.2, 'b']));
    S(s, 0.3);
    const p = snap(s).patches[0]; expect(p.kind).toBe('oil'); expect(p.z).toBeLessThan(-100);
    S(s, 3);
    expect(evs.some((e) => e.type === 'copSpinOut')).toBe(true);
  });
  it('bottle: glass patch where it lands; riding over it gives a flat (slower, wobbly) until you swap bikes', () => {
    const s = run({ ...base, npcs: [{ x: 0, z: -92 }], startWeapon: 'bottle' }, taps([0.2, 'b']), 'z2');
    S(s, 1);
    expect(snap(s).patches.some((p: any) => p.kind === 'glass')).toBe(true);
    S(s, 4);
    expect(snap(s).rider.flat).toBe(true); expect(evs.some((e) => e.type === 'flat')).toBe(true);
    S(s, 6); const vFlat = snap(s).rider.speed;
    const ref = run({ ...base }, new NullInput(), 'z2'); S(ref, 11);
    expect(vFlat).toBeLessThan(snap(ref).rider.speed * 0.75);
  });
  it('molotov: burning patch sets bystanders running around on fire', () => {
    const s = run({ ...base, npcs: [{ x: 0, z: -88 }], startWeapon: 'molotov' }, taps([0.5, 'b']));
    S(s, 1.5);
    expect(snap(s).patches.some((p: any) => p.kind === 'fire')).toBe(true);
    expect(snap(s).npcs[0].flailS).toBeGreaterThan(0);
    expect(evs.some((e) => e.type === 'onFire')).toBe(true);
  });
  it('shifters cycle weapons; empty weapons do nothing; crates refill', () => {
    const s = run({ ...base, ammo: { bazooka: 0 }, npcs: [{ x: 0, z: -85 }] }, taps([0.2, 'shiftUpR'], [0.5, 'shiftDnL'], [0.8, 'b']));
    S(s, 0.4); expect(snap(s).weapon).toBe('grenade');
    S(s, 1); expect(snap(s).weapon).toBe('bazooka'); expect(snap(s).projectiles.length).toBe(0);
    const c = run({ spawn: { x: 0, z: -62, heading: 0 }, cops: false, ammo: { bottle: 0 } }); S(c, 0.2);
    expect(snap(c).ammo.bottle).toBeGreaterThan(0); // crate at (0,-60)
  });
});

describe('cops', () => {
  const CP: CopParams = { segwaySpeed: 15, horseSpeed: 12, segwayRampMul: 0.3, stairsMul: 0.2, sightR: 70, tackleR: 1.8, gravity: 14 };
  it('Segways crawl on ramps and stairs; horses keep going', () => {
    const k = KICKERS[2];
    const flat = newCop(1, 'segway', 0, -80), ramp = newCop(2, 'segway', k.x, k.z + 3), stairs = newCop(3, 'segway', 50, PLAZA.stairsZ + 1);
    stairs.heading = 0;
    expect(copTopSpeed(flat, CP, 0)).toBe(15);
    expect(copTopSpeed(ramp, CP, 0)).toBeLessThan(6);
    expect(copTopSpeed(stairs, CP, 0)).toBeLessThan(5);
    const horse = newCop(4, 'horse', k.x, k.z + 3);
    expect(copTopSpeed(horse, CP, 0)).toBe(12);
  });
  it('nav graph routes around buildings', () => {
    expect(visible(-72, -80, -72, -30)).toBe(false);
    const p = findPath(-72, -80, -72, -30);
    expect(p.length).toBeGreaterThan(1);
    let x = -72, z = -80; for (const w of p) { expect(visible(x, z, w.x, w.z)).toBe(true); x = w.x; z = w.z; }
  });
  it('a cop tackles you: busted, bike confiscated, heat reset, back on foot nearby', () => {
    const s = run({ spawn: { x: 0, z: -100, heading: 0 }, heat: 2, copSpawn: [{ kind: 'segway', x: 0, z: -80 }] });
    const bikes0 = snap(s).bikes.length;
    S(s, 6);
    expect(evs.some((e) => e.type === 'busted')).toBe(true);
    expect(snap(s).heat).toBe(0); expect(snap(s).stats.busts).toBe(1);
    expect(snap(s).bikes.length).toBe(bikes0); // no bike left behind: confiscated
    S(s, 3); expect(snap(s).mode).toBe('foot');
    const r = snap(s).rider; expect(Math.hypot(r.x, r.z + 100)).toBeLessThan(40);
  });
  it('break line of sight long enough and you lose them', () => {
    const s = run({ spawn: { x: -72, z: -30, heading: 0 }, heat: 1, copSpawn: [{ kind: 'segway', x: -72, z: -80 }] });
    s.tuning.set('gtpedal.loseS', 2);
    S(s, 3);
    expect(evs.some((e) => e.type === 'lostCops')).toBe(true); expect(snap(s).heat).toBe(0);
  });
  it('repaint at the bike co-op clears heat', () => {
    const s = run({ spawn: { x: -60, z: 8, heading: 0 }, heat: 3, cops: false }); S(s, 0.2);
    expect(evs.some((e) => e.type === 'repaint')).toBe(true); expect(snap(s).heat).toBe(0); expect(snap(s).paint).toBe(1);
  });
  it('heat brings Segways, and horses at 3+ stars', () => {
    const s = run({ spawn: { x: 0, z: -100, heading: 0 }, heat: 3.5 }); S(s, 12);
    const kinds = evs.filter((e) => e.type === 'copSpawn').map((e) => e.data.kind);
    expect(kinds).toContain('segway'); expect(kinds).toContain('horse');
  });
  it('cops get launched by weapons (and that makes things worse)', () => {
    const s = run({ spawn: { x: 0, z: -100, heading: 0 }, heat: 1, npcs: [], copSpawn: [{ kind: 'horse', x: 0, z: -84 }], startWeapon: 'bazooka' }, taps([0.3, 'b']));
    S(s, 0.8);
    expect(snap(s).stats.copsLaunched).toBe(1);
    expect(snap(s).cops[0].airS > 0 || snap(s).cops[0].stunS > 0).toBe(true);
    expect(snap(s).heat).toBeGreaterThanOrEqual(2);
  });
});

describe('jump camera', () => {
  it('lags vertically in the air, pulls back, and keeps rider and ground in frame', () => {
    const tun = { airLag: 1.6, groundLag: 6, airPull: 7, airRise: 2.5, airFov: 10, lookMix: 0.5 };
    const st = { y: 0, air: 0 };
    let maxCamRise = 0, maxRider = 0;
    for (let i = 0; i <= 60; i++) {
      const tt = i / 30, ry = 9 * Math.sin((Math.PI * tt) / 2); // 2 s arc up to 9 m and back
      const c = stepCam(st, { x: 0, y: ry, z: tt * 18, heading: 0, air: true, airS: tt, groundY: 0, onBike: true }, tun, 1 / 30);
      const half = c.fov / 2;
      expect(Math.abs(pitchOffsetDeg(c, [0, ry + 1, tt * 18]))).toBeLessThan(half);
      expect(Math.abs(pitchOffsetDeg(c, [0, 0, tt * 18]))).toBeLessThan(half);
      maxCamRise = Math.max(maxCamRise, c.pos[1] - 4.5 - 2.5 * st.air); maxRider = Math.max(maxRider, ry);
      if (i === 30) { expect(c.fov).toBeGreaterThan(BASE_FOV + 5); expect(c.pos[2]).toBeLessThan(tt * 18 - 12); }
    }
    expect(maxCamRise).toBeLessThan(maxRider * 0.7);
  });
});
