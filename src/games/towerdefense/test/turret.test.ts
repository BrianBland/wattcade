import { describe, it, expect } from 'vitest';
import { createGameSession, testProfile } from '../../../core';
import type { Button, InputState } from '../../../contracts';
import { module } from '../index';
import { chooseTarget, laneThreats, type TargetCand, type TargetOpts } from '../sim/targeting';
import type { TdSnapshot } from '../sim/types';

const snap = (s: { sim: { snapshot(): unknown } }) => s.sim.snapshot() as TdSnapshot;
const cand = (id: number, lane: number, progress: number, element: TargetCand['element'] = 'blue', dmg = 4): TargetCand =>
  ({ id, lane, element, progress, dist: 90 * (1 - progress) + 6, angle: (lane - 1) * 0.5, dmg });
const opts = (o: Partial<TargetOpts> = {}): TargetOpts => ({ element: 'blue', reach: 999, nudge: null, nudgeBias: 4, current: 0, stick: 0.6, ...o });

describe('turret targeting (pure)', () => {
  it('takes the lead brood-colour alien on the most threatened lane', () => {
    const cs = [cand(1, 0, 0.3), cand(2, 1, 0.5), cand(3, 1, 0.8), cand(4, 1, 0.9, 'red', 10), cand(5, 2, 0.2)];
    expect(laneThreats(cs)[1]).toBeGreaterThan(laneThreats(cs)[0]);
    expect(chooseTarget(cs, opts())).toBe(3); // the red one leads lane 1 but the Gatling doesn't beat it
  });
  it('falls back to any colour rather than idling, and returns 0 with nothing in reach', () => {
    expect(chooseTarget([cand(1, 0, 0.5, 'red')], opts())).toBe(1);
    expect(chooseTarget([cand(1, 0, 0.1)], opts({ reach: 20 }))).toBe(0);
    expect(chooseTarget([], opts())).toBe(0);
  });
  it('a nudge biases the choice toward the nudged lane, and the bias fades as the nudge decays', () => {
    const cs = [cand(1, 0, 0.5), cand(2, 2, 0.7), cand(3, 2, 0.4)];
    expect(chooseTarget(cs, opts())).toBe(2);
    expect(chooseTarget(cs, opts({ nudge: { lane: 0, k: 1 } }))).toBe(1);
    expect(chooseTarget(cs, opts({ nudge: { lane: 0, k: 0.05 } }))).toBe(2);
    // an empty nudged lane changes nothing
    expect(chooseTarget(cs, opts({ nudge: { lane: 1, k: 1 } }))).toBe(2);
  });
  it('sticks with its target unless another lane is clearly worse off', () => {
    const cs = [cand(1, 0, 0.6), cand(2, 2, 0.65)];
    expect(chooseTarget(cs, opts())).toBe(2);
    expect(chooseTarget(cs, opts({ current: 1 }))).toBe(1);
    expect(chooseTarget([cand(1, 0, 0.2), cand(2, 2, 0.9)], opts({ current: 1 }))).toBe(2);
  });
});

/** Input whose presses/paddles the test sets per tick. */
class Pad {
  private next = new Set<Button>();
  paddleL = 0; paddleR = 0;
  private st: InputState = { held: new Set(), pressed: new Set(), released: new Set(), paddleL: 0, paddleR: 0, paddleIdleS: 99, source: 'script' };
  press(b: Button) { this.next.add(b); }
  beginTick() { this.st = { ...this.st, pressed: this.next, paddleL: this.paddleL, paddleR: this.paddleR }; this.next = new Set(); }
  state() { return this.st; }
}
const session = (input: Pad | { beginTick(): void; state(): InputState }, script = 'z2') =>
  createGameSession({ game: module, profile: testProfile(), input, fake: { script }, seed: 2, simOpts: { skipGarage: true } });
/** Steps until the turret mounts the Gatling (sim mode, where gears change the trainer). */
function toGatlingWave(s: ReturnType<typeof session>) {
  s.step(1);
  for (let i = 0; i < 30 * 60 * 10 && !(snap(s).weapon === 'gatling' && snap(s).lull === 0); i++) s.step(1);
  expect(snap(s).weapon).toBe('gatling');
}

describe('input map (#120)', () => {
  it('all four shifters change gear on both hoods and trigger no game action', () => {
    const pad = new Pad(), ref = session(new Pad()), s = session(pad);
    toGatlingWave(s); toGatlingWave(ref);
    const g0 = s.mixer.gear;
    for (const b of ['shiftUpL', 'shiftUpR', 'shiftUpR', 'shiftDnL'] as Button[]) { pad.press(b); s.step(1); ref.step(1); }
    expect(s.mixer.gear).toBe(g0 + 2);
    const a = snap(s), b = snap(ref);
    expect(a.nudge).toBe(b.nudge); expect(a.workshop).toBe(null); expect(a.railCharges).toBe(b.railCharges); expect(a.weapon).toBe(b.weapon);
    const hud = s.sim.hud!();
    expect(hud.gears).toBe(true);
    const hints = new Map(hud.controls!.map((c) => [c.button, c.label]));
    expect(hints.get('shiftersL')).toBe('Gear'); expect(hints.get('shiftersR')).toBe('Gear');
    expect(hints.get('paddles')).toBe('Nudge lane');
    expect(hints.get('a')).toBe('Construction');
    expect(hints.get('b')).toBe('Overcharge'); expect(hints.get('y')).toBe('Slow field');
  });
  it('A opens construction and B closes without firing a combat action', () => {
    const pad = new Pad(), ref = session(new Pad()), s = session(pad);
    s.step(30 * 30); ref.step(30 * 30);
    pad.press('a'); s.step(1); ref.step(1); expect(snap(s).workshop).not.toBeNull();
    pad.press('b'); s.step(1); ref.step(1);
    s.step(30 * 20); ref.step(30 * 20);
    const a = snap(s), b = snap(ref);
    expect(a.workshop).toBe(null);
    expect([a.scrap, a.railCharges, a.towers.length, a.targetId]).toEqual([b.scrap, b.railCharges, b.towers.length, b.targetId]);
  });
  it('D-pad left/right and the paddles nudge a lane; the nudge decays and up cancels it', () => {
    const pad = new Pad(), s = session(pad);
    s.step(30);
    pad.press('left'); s.step(1);
    expect(snap(s).nudge?.lane).toBe(0);
    pad.press('right'); s.step(1);
    expect(snap(s).nudge?.lane).toBe(1);
    const k0 = snap(s).nudge!.k;
    s.step(30 * 3);
    expect(snap(s).nudge!.k).toBeLessThan(k0);
    s.step(30 * 4);
    expect(snap(s).nudge).toBe(null);
    pad.paddleR = 1; s.step(30 * 8);
    expect(snap(s).nudge).toEqual({ lane: 2, k: 1 }); // held paddle keeps it fresh
    pad.paddleR = 0; pad.press('up'); s.step(1);
    expect(snap(s).nudge).toBe(null);
  });
  it('with no input but pedalling, the turret engages every wave', () => {
    const s = session({ beginTick() {}, state: () => ({ held: new Set(), pressed: new Set(), released: new Set(), paddleL: 0, paddleR: 0, paddleIdleS: 99, source: 'script' }) });
    const engaged = new Map<number, boolean>();
    for (let i = 0; i < 30 * 60 * 12; i += 10) {
      s.step(10);
      const v = snap(s);
      if (v.lull > 0 || !v.enemies.length) continue;
      engaged.set(v.wave, (engaged.get(v.wave) ?? false) || v.targetId > 0);
    }
    expect(engaged.size).toBeGreaterThanOrEqual(8);
    expect([...engaged].filter(([, e]) => !e)).toEqual([]);
    expect(Number(s.sim.summary().turretKills)).toBeGreaterThan(100);
  });
});
