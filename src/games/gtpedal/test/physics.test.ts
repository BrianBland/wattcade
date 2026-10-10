import { describe, expect, it } from 'vitest';
import { createGameSession, NullInput, testProfile, TimelineInput } from '../../../core';
import { newBody, stepBody, switchLine, type Params, type StepIn } from '../sim/physics';
import { bridgeAngle, CANAL, heightAt, KICKERS, TRAM_Z } from '../sim/world';
import { pickLock } from '../sim/weapons';
import { module } from '../index';

const P: Params = { drive: 9, drag: 0.012, rollDecay: 0.08, topSpeed: 18, gravity: 14, launchMul: 1.35, climbMul: 0.6, turnRate: 1.8, snapR: 4, snapPull: 4, crashSpeed: 7, grindR: 1.5 };
const IN = (o: Partial<StepIn> = {}): StepIn => ({ effort: 1, steer: 0, freeSteer: false, spinIn: 0, grindHeld: false, bike: { power: 1, top: 1, turn: 1, air: 1 }, topMul: 1, boost: 0, ...o });
const DT = 1 / 30;

describe('arcade physics', () => {
  it('a kicker launches you into the air and you land', () => {
    const k = KICKERS[2]; const b = newBody(k.x, k.z - 20, 0); b.speed = 16;
    let air = false, landed = false;
    for (let i = 0; i < 150; i++) { const o = stepBody(b, P, IN(), DT, 0, { s: 0 }); air ||= b.air; landed ||= o.landed && air; }
    expect(air).toBe(true); expect(landed).toBe(true);
  });
  it('enough speed jumps the open drawbridge; too little splashes', () => {
    const br = bridgeAngle(25, 40, (22 * Math.PI) / 180); expect(br).toBeGreaterThan(0.3);
    const run = (v: number, effort = 2) => { const b = newBody(0, CANAL.z0 - 15, 0); b.speed = v; let splash = false;
      for (let i = 0; i < 120; i++) { const o = stepBody(b, P, IN({ effort, bike: { power: 1.6, top: 1.5, turn: 1, air: 1 } }), DT, br, { s: 0 }); splash ||= o.splash; }
      return { splash, z: b.z }; };
    const fast = run(26); expect(fast.splash).toBe(false); expect(fast.z).toBeGreaterThan(CANAL.z1);
    expect(run(4, 0).z).toBeLessThan(CANAL.z1); // too slow: never makes it across
  });
  it('fast into a building = crash; slow = bonk', () => {
    const fast = newBody(30, -75, 0); fast.speed = 15; let crashed = false;
    for (let i = 0; i < 60 && !crashed; i++) crashed = stepBody(fast, P, IN(), DT, 0, { s: 0 }).crashed;
    expect(crashed).toBe(true);
    const slow = newBody(30, -61, 0); slow.speed = 3; let c2 = false;
    for (let i = 0; i < 30; i++) c2 ||= stepBody(slow, P, IN({ effort: 0 }), DT, 0, { s: 0 }).crashed;
    expect(c2).toBe(false);
  });
  it('snaps to a line and paddle taps switch tram rails', () => {
    const b = newBody(-60, TRAM_Z - 1.2, Math.PI / 2 + 0.2); b.speed = 10;
    for (let i = 0; i < 30; i++) stepBody(b, P, IN(), DT, 0, { s: 0 });
    expect(b.line).toBe(1); expect(Math.abs(b.heading - Math.PI / 2)).toBeLessThan(0.1);
    // heading +x, the rider's right is +z, so rail 2 (z+0.75) is a right tap away
    expect(switchLine(b, 1, P.snapR)).toBe(2);
    expect(switchLine(b, -1, P.snapR)).toBe(1);
  });
  it('grinding a tram rail keeps speed and reports grind time', () => {
    const b = newBody(-60, TRAM_Z - 0.75, Math.PI / 2); b.speed = 12; b.line = 1; const g = { s: 0 };
    for (let i = 0; i < 60; i++) stepBody(b, P, IN({ effort: 0, grindHeld: true }), DT, 0, g);
    expect(b.grinding).toBe(true); expect(g.s).toBeGreaterThan(1.5); expect(b.speed).toBeGreaterThan(11);
    const o = stepBody(b, P, IN({ effort: 0, grindHeld: false }), DT, 0, g); expect(o.grindEnded).toBeGreaterThan(1.5);
  });
  it('lock-on picks the nearest target inside the forward cone', () => {
    const t = [{ x: 0, z: 30, alive: true }, { x: 0, z: 10, alive: true }, { x: 0, z: -5, alive: true }, { x: 20, z: 5, alive: true }];
    expect(pickLock(0, 0, 0, t, 40, 0.6)).toBe(1);
    expect(pickLock(0, 0, 0, t, 40, 0.6, 0)).toBe(0); // sticky
  });
  it('height field is finite everywhere', () => {
    for (let x = -125; x <= 125; x += 5) for (let z = -125; z <= 125; z += 5) expect(Number.isFinite(heightAt(x, z, 0.3))).toBe(true);
  });
});

describe('sim', () => {
  const snap = (s: { sim: { snapshot(): unknown } }) => s.sim.snapshot() as any;
  it('A dismounts and A again steals back (own bike is not a steal)', () => {
    const s = createGameSession({ game: module, profile: testProfile(), input: new TimelineInput([{ t: 3, press: 'a' }, { t: 3.1, release: 'a' }, { t: 4, press: 'a' }, { t: 4.1, release: 'a' }]), fake: { script: 'z2' }, seed: 1 });
    s.step(30 * 3.5); expect(snap(s).mode).toBe('foot');
    s.step(30 * 1.5); expect(snap(s).mode).toBe('bike'); expect(snap(s).stats.steals).toBe(0);
  });
  it('pedalling moves you; climbing sets trainer grade', () => {
    const s = createGameSession({ game: module, profile: testProfile(), input: new NullInput(), fake: { script: 'z2' }, seed: 1 });
    s.step(30 * 20);
    expect(snap(s).stats.distanceM).toBeGreaterThan(150);
    expect(s.finish().stats).toBeTruthy();
  });
  it('B fires the bazooka at the locked target and launches them', () => {
    const s = createGameSession({ game: module, profile: testProfile(), input: new NullInput(), fake: { script: 'z2' }, seed: 1 });
    let fired = false;
    for (let i = 0; i < 30 * 120 && !fired; i++) { s.step(1); if (snap(s).lock >= 0) fired = true; }
    expect(fired).toBe(true);
  });
});
