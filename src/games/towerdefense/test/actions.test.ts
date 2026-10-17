import { describe, expect, it } from 'vitest';
import { createGameSession, runHeadless, testProfile } from '../../../core';
import type { Button, InputState } from '../../../contracts';
import { module } from '../index';
import type { ActionId, TdSnapshot } from '../sim/types';

class Pad {
  held = new Set<Button>(); private pressed = new Set<Button>(); private released = new Set<Button>();
  private st: InputState = { held: this.held, pressed: new Set(), released: new Set(), paddleL: 0, paddleR: 0, paddleIdleS: 99, source: 'script' };
  down(b: Button) { this.held.add(b); this.pressed.add(b); }
  up(b: Button) { this.held.delete(b); this.released.add(b); }
  tap(b: Button) { this.down(b); this.up(b); }
  beginTick() { this.st = { ...this.st, pressed: this.pressed, released: this.released }; this.pressed = new Set(); this.released = new Set(); }
  state() { return this.st; }
}
const snap = (s: ReturnType<typeof createGameSession>) => s.sim.snapshot() as TdSnapshot;
const action = (s: ReturnType<typeof createGameSession>, id: ActionId) => snap(s).actions.find(a => a.id === id)!;
function rig() {
  const pad = new Pad(), s = createGameSession({ game: module, profile: testProfile(), input: pad, fake: { script: 'z2' }, seed: 1,
    simOpts: { skipGarage: true, autoCrew: false } });
  s.tuning.set('towerdefense.startScrap', 1000);
  s.tuning.set('towerdefense.baseHp', 1000); // isolate input behavior from falling mid-gesture
  s.tuning.set('towerdefense.gatlingDamage', 0.5); s.tuning.set('towerdefense.flameDpsPerWatt', 0.02); s.tuning.set('towerdefense.railLaserDps', 0);
  s.tuning.set('towerdefense.towerDamageMult', 0.1);
  s.step(1); s.sim.receive!({ type: 'pad', pad: 1 }); s.step(1); s.sim.receive!({ type: 'row', row: 0 }); s.step(1);
  s.sim.receive!({ type: 'close' }); s.step(30 * 32);
  const originalBike = s.ctx.bike;
  let zone = 2, sprint = false;
  s.ctx.bike = () => ({ ...originalBike(), ftpFraction: 0.95, powerZone: zone as 1 | 2 | 3 | 4 | 5, sprinting: sprint });
  return { s, pad, effort: (z: number, sp = false) => { zone = z; sprint = sp; } };
}

describe('three combat actions and input contexts', () => {
  it('B / Y and action taps dispatch identically; a mixed press dispatches only once', () => {
    const a = rig(), b = rig();
    expect(snap(a.s).enemies.length).toBeGreaterThan(0);
    a.pad.tap('b'); a.pad.tap('y');
    b.s.sim.receive!({ type: 'action', id: 'overcharge' }); b.s.sim.receive!({ type: 'action', id: 'slow' });
    b.pad.tap('b'); b.pad.tap('y'); a.s.step(1); b.s.step(1);
    expect(snap(a.s).actions).toEqual(snap(b.s).actions); expect(snap(a.s).slowLane).toBe(snap(b.s).slowLane);
    expect(action(a.s, 'overcharge').activeS).toBe(10); expect(action(a.s, 'slow').activeS).toBe(8);
    expect(b.s.finish().events.filter(e => e.type === 'action')).toHaveLength(2);
  });
  it('Slow affects only the most threatened lane, at 60% movement speed', () => {
    const a = rig(), ref = rig(), before = snap(a.s);
    const threat = [0, 0, 0]; for (const e of before.enemies) threat[e.lane] += ({ mini: 1, dart: 1, brute: 5, charger: 6, armor: 8, carrier: 10, prism: 6, boss: 30 }[e.kind]) * (0.3 + e.progress) ** 2;
    a.s.sim.receive!({ type: 'action', id: 'slow' }); a.s.step(1); ref.s.step(1);
    const lane = snap(a.s).slowLane; expect(lane).toBe(threat.indexOf(Math.max(...threat)));
    let checked = 0;
    for (const e of before.enemies) {
      const slowed = snap(a.s).enemies.find(q => q.id === e.id), normal = snap(ref.s).enemies.find(q => q.id === e.id);
      if (!slowed || !normal) continue;
      expect((slowed.progress - e.progress) / (normal.progress - e.progress)).toBeCloseTo(e.lane === lane ? 0.6 : 1, 5); checked++;
    }
    expect(checked).toBeGreaterThan(0);
  });
  it('Overcharge speeds tower firing while preserving the trainer mode', () => {
    const a = rig(), ref = rig();
    a.s.sim.receive!({ type: 'action', id: 'overcharge' });
    const before = snap(a.s).weapon;
    a.s.step(30 * 7); ref.s.step(30 * 7);
    expect(Number(a.s.sim.summary().towerDamage)).toBeGreaterThan(Number(ref.s.sim.summary().towerDamage));
    expect(snap(a.s).weapon).toBe(before); expect(a.s.mixer.command?.mode).toBe(ref.s.mixer.command?.mode);
  });
  it('refills faster at higher effort, and a sprint edge completes cooldowns once without creating Rail stock', () => {
    const a = rig(), fast = rig();
    for (const r of [a, fast]) { r.s.sim.receive!({ type: 'action', id: 'slow' }); r.s.step(1); }
    a.effort(1); fast.effort(5); a.s.step(30 * 5); fast.s.step(30 * 5);
    expect(action(fast.s, 'slow').fill).toBeGreaterThan(action(a.s, 'slow').fill);
    const charges = snap(a.s).railCharges;
    a.effort(5, true); a.s.step(1); expect(action(a.s, 'slow').ready).toBe(true); expect(snap(a.s).railCharges).toBe(charges);
    a.pad.tap('y'); a.s.step(1); expect(action(a.s, 'slow').ready).toBe(false);
    a.s.step(1); expect(action(a.s, 'slow').ready).toBe(false); // a sustained sprint cannot repeatedly reset it
    a.effort(2); a.s.step(1); a.effort(5, true); a.s.step(1); expect(action(a.s, 'slow').ready).toBe(true);
  });
  it('workshop B closes without activating Overcharge; Y and Z are consumed in the menu', () => {
    const r = rig(); r.pad.tap('a'); r.s.step(1); expect(snap(r.s).workshop).not.toBeNull();
    const epoch = snap(r.s).inputEpoch, charges = snap(r.s).railCharges;
    r.pad.tap('y'); r.pad.tap('z'); r.s.sim.receive!({ type: 'action', id: 'overcharge', epoch }); r.s.step(1);
    expect(action(r.s, 'slow').activeS).toBe(0); expect(snap(r.s).railCharges).toBe(charges);
    r.pad.tap('b'); r.s.step(1); expect(snap(r.s).workshop).toBeNull(); expect(action(r.s, 'overcharge').activeS).toBe(0);
    r.s.sim.receive!({ type: 'action', id: 'slow', epoch }); r.s.step(1); expect(action(r.s, 'slow').activeS).toBe(0);
  });
  it('touch Rail tap fires one, hold fires all, and simultaneous controller/touch input shares one gesture', () => {
    const r = rig(); r.s.step(30 * 120); expect(snap(r.s).railCharges).toBe(3);
    r.s.sim.receive!({ type: 'railDown', pointer: 7 }); r.s.sim.receive!({ type: 'railUp', pointer: 7 }); r.pad.tap('z'); r.s.step(1);
    expect(snap(r.s).railCharges).toBe(2);
    r.s.step(30 * 60); expect(snap(r.s).railCharges).toBe(3);
    r.s.sim.receive!({ type: 'railDown', pointer: 8 }); r.pad.down('z'); r.s.step(30);
    expect(snap(r.s).railCharges).toBe(0);
    r.s.sim.receive!({ type: 'railUp', pointer: 8 }); r.pad.up('z'); r.s.step(1);
    const fires = r.s.finish().events.filter(e => e.type === 'railFired'); expect(fires.map(e => e.data?.charges)).toEqual([1, 3]);
  });
  it('cancel, pause, and menu transitions discard holds without firing on their eventual release', () => {
    for (const boundary of ['railCancel', 'inputCancel', 'pad']) {
      const r = rig(); r.s.step(30 * 120);
      r.s.sim.receive!({ type: 'railDown', pointer: 9 }); r.pad.down('z'); r.s.step(2);
      r.s.sim.receive!({ type: boundary, pad: 1 }); r.s.step(1);
      if (boundary === 'pad') { r.pad.tap('b'); r.s.step(1); }
      r.pad.up('z'); r.s.sim.receive!({ type: 'railUp', pointer: 9 }); r.s.step(1);
      expect(snap(r.s).railCharges).toBe(3); expect(snap(r.s).zHold).toBe(0);
      expect(r.s.finish().events.filter(e => e.type === 'railFired')).toHaveLength(0);
    }
  });
  it('unusable actions do not consume their cooldowns', () => {
    const pad = new Pad(), s = createGameSession({ game: module, profile: testProfile(), input: pad, fake: { script: 'z2' }, seed: 1, simOpts: { skipGarage: true, autoCrew: false } });
    pad.tap('b'); pad.tap('y'); s.step(1);
    expect(action(s, 'overcharge').ready).toBe(true); expect(action(s, 'slow').ready).toBe(true);
    expect(action(s, 'rail').ready).toBe(false);
  });
  it('pause discards queued taps and the button that resumes play', () => {
    const r = rig();
    r.s.sim.receive!({ type: 'action', id: 'slow' }); r.s.sim.receive!({ type: 'inputCancel' });
    r.pad.tap('b'); r.s.step(1);
    expect(action(r.s, 'slow').activeS).toBe(0); expect(action(r.s, 'overcharge').activeS).toBe(0);
    r.pad.tap('b'); r.s.step(1); expect(action(r.s, 'overcharge').activeS).toBe(10);
  });
});

describe('passive versus active riders', () => {
  it('Auto-crew develops every pad without combat actions; actions extend survival across four seeds', () => {
    let passiveWaves = 0, activeWaves = 0, passiveMinutes = 0, activeMinutes = 0;
    for (const seed of [1, 2, 3, 4]) {
      // Compare the first run; later runs keep the ride open and bank more towers and upgrades.
      const run = (actionBot: boolean) => runHeadless({ game: module, script: 'z2', minutes: 60, seed, simOpts: { autopilot: true, actionBot } });
      const passive = run(false), active = run(true);
      const firstEnd = (r: typeof passive) => r.events.find(e => e.type === 'runEnded' && e.data?.reason === 'fell')!;
      const passiveEnd = firstEnd(passive), activeEnd = firstEnd(active);
      expect(passiveEnd).toBeDefined(); expect(activeEnd).toBeDefined();
      expect(passive.events.filter(e => e.type === 'towerBuilt' && e.t < passiveEnd.t)).toHaveLength(6);
      expect(Number(passive.summary.towerUpgrades)).toBeGreaterThanOrEqual(24);
      expect(passive.summary.railChargesFired).toBe(0); expect(passive.events.some(e => e.type === 'action')).toBe(false);
      expect(Number(passive.summary.wavesSurvived)).toBeGreaterThanOrEqual(22);
      expect(passive.isOver).toBe(false); expect(active.isOver).toBe(false);
      expect(Number(activeEnd.data?.wavesSurvived)).toBeGreaterThanOrEqual(Number(passiveEnd.data?.wavesSurvived) - 4);
      expect(active.events.some(e => e.type === 'action')).toBe(true);
      passiveWaves += Number(passiveEnd.data?.wavesSurvived); activeWaves += Number(activeEnd.data?.wavesSurvived);
      passiveMinutes += passiveEnd.t / 60; activeMinutes += activeEnd.t / 60;
    }
    expect(activeWaves).toBeGreaterThan(passiveWaves);
    expect(activeMinutes).toBeGreaterThan(passiveMinutes + 2);
  }, 30_000);
});
