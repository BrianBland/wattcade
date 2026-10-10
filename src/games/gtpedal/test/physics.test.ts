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
  it('a ~FTP rider clears the open drawbridge at every phase; Z2 mostly does not', () => {
    const MAX = (15 * Math.PI) / 180, PP = { ...P, effortTop: 0.5 };
    const clearRate = (effort: number) => {
      let ok = 0, tot = 0;
      for (let t0 = 16; t0 < 40; t0 += 0.5) {
        if (bridgeAngle(t0, 40, MAX) < 0.02) continue;
        const b = newBody(0, CANAL.z0 - 60, 0); b.speed = 18 * (0.5 + 0.5 * effort); let t = t0 - 60 / b.speed, bad = false;
        for (let i = 0; i < 300 && b.z < CANAL.z1 + 3 && !bad; i++) { t += DT; const o = stepBody(b, PP, IN({ effort }), DT, bridgeAngle(t, 40, MAX), { s: 0 }); bad = o.splash || o.crashed; }
        tot++; if (!bad && b.z > CANAL.z1) ok++;
      }
      return ok / tot;
    };
    expect(clearRate(1.0)).toBe(1); expect(clearRate(1.2)).toBe(1);
    expect(clearRate(0.65)).toBeLessThan(0.4);
    // too slow and not pedalling: never makes it across
    const b = newBody(0, CANAL.z0 - 15, 0); b.speed = 4;
    for (let i = 0; i < 120; i++) stepBody(b, PP, IN({ effort: 0 }), DT, MAX, { s: 0 });
    expect(b.z).toBeLessThan(CANAL.z1);
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
    const s = createGameSession({ game: module, profile: testProfile(), input: new NullInput(), fake: { script: 'z2' }, seed: 1, simOpts: { npcs: [{ x: 0.5, z: -80 }] } } as any);
    let fired = false;
    for (let i = 0; i < 30 * 120 && !fired; i++) { s.step(1); if (snap(s).lock >= 0) fired = true; }
    expect(fired).toBe(true);
  });
});

describe('pause settings, spins, line-leave modes', () => {
  const snap = (s: { sim: { snapshot(): unknown } }) => s.sim.snapshot() as any;
  it('grade settings come from the save, apply via receive and persist', () => {
    const p = testProfile(); (p.gameData as Record<string, unknown>).gtpedal = { gradeScale: 1.2, gradeMax: 5 };
    let saved: any = null;
    const s = createGameSession({ game: module, profile: p, input: new NullInput(), fake: { script: 'z2' }, seed: 1, onSave: (d) => { saved = d; } });
    const sim = s.sim as any;
    expect(sim.settings().map((x: any) => [x.key, x.value])).toEqual([['gradeScale', 1.2], ['gradeMax', 5]]);
    sim.receive({ type: 'setting', key: 'gradeScale', value: 0.4 });
    expect(sim.settings()[0].value).toBe(0.4);
    expect(saved.gradeScale).toBe(0.4); expect(saved.gradeMax).toBe(5);
    sim.receive({ type: 'setting', key: 'gradeMax', value: 99 }); expect(sim.settings()[1].value).toBe(15);
  });
  it('holding a paddle in the air spins; Y alone just hops', () => {
    const hop = createGameSession({ game: module, profile: testProfile(), input: new TimelineInput([{ t: 4, press: 'y' }, { t: 4.6, release: 'y' }]), fake: { script: 'z2' }, seed: 1 });
    hop.step(30 * 4); const h0 = snap(hop).rider.heading; hop.step(8); expect(snap(hop).rider.air).toBe(true);
    expect(Math.abs(snap(hop).rider.spin)).toBe(0); void h0;
    const spin = createGameSession({ game: module, profile: testProfile(), input: new TimelineInput([{ t: 4, press: 'y' }, { t: 4.05, release: 'y', paddleL: 1 }, { t: 4.5, paddleL: 0 }]), fake: { script: 'z2' }, seed: 1 });
    spin.step(30 * 4.4); expect(Math.abs(snap(spin).rider.spin)).toBeGreaterThan(1);
  });
  it("'forks' mode: holding a paddle on a line never free-steers off it", () => {
    const mk = (mode: string) => {
      const s = createGameSession({ game: module, profile: testProfile(), input: new TimelineInput([{ t: 2, paddleR: 1 }, { t: 5, paddleR: 0 }]), fake: { script: 'z2' }, seed: 1 });
      s.tuning.set('gtpedal.lineLeave', mode); s.step(30 * 5); return snap(s).rider;
    };
    expect(Math.abs(mk('forks').x)).toBeLessThan(3);   // stayed on the avenue
    expect(Math.abs(mk('hold').x)).toBeGreaterThan(5);  // steered off
  });
});
