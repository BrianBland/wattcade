import { describe, it, expect } from 'vitest';
import { createGameSession, testProfile } from '../../../core';
import type { Button, InputState } from '../../../contracts';
import { module } from '../index';
import { chooseTarget, stepTarget, targetQueue, threatOf, type TargetCand, type TargetOpts } from '../sim/targeting';
import type { TdSnapshot } from '../sim/types';

const snap = (s: { sim: { snapshot(): unknown } }) => s.sim.snapshot() as TdSnapshot;
const cand = (id: number, eta: number, element: TargetCand['element'] = 'blue', o: Partial<TargetCand> = {}): TargetCand =>
  ({ id, element, eta, dist: 4 * eta + 8, angle: 0.2, dmg: 4, flying: false, ...o });
const opts = (o: Partial<TargetOpts> = {}): TargetOpts => ({ element: 'blue', reach: 999, groundOnly: false, lock: null, current: 0, stickS: 3, ...o });

describe('turret targeting (pure)', () => {
  it('takes the soonest-arriving alien of the brood colour', () => {
    const cs = [cand(1, 30), cand(2, 12), cand(3, 5, 'red', { dmg: 10 }), cand(4, 40)];
    expect(threatOf(cs[2])).toBeGreaterThan(threatOf(cs[0]));
    expect(chooseTarget(cs, opts())).toBe(2); // the red one arrives first but the Gatling doesn't beat it
  });
  it('falls back to any colour rather than idling, and returns 0 with nothing in reach', () => {
    expect(chooseTarget([cand(1, 10, 'red')], opts())).toBe(1);
    expect(chooseTarget([cand(1, 30)], opts({ reach: 20 }))).toBe(0);
    expect(chooseTarget([], opts())).toBe(0);
  });
  it('lobbed fireballs ignore Gliders', () => {
    const cs = [cand(1, 3, 'red', { flying: true }), cand(2, 9, 'red')];
    expect(chooseTarget(cs, opts({ element: 'red' }))).toBe(1);
    expect(chooseTarget(cs, opts({ element: 'red', groundOnly: true }))).toBe(2);
    expect(targetQueue(cs, { reach: 999, groundOnly: true }).map((c) => c.id)).toEqual([2]);
  });
  it('a lock overrides the choice while its alien is in reach; stepping walks the queue', () => {
    const cs = [cand(1, 5), cand(2, 10), cand(3, 20)];
    expect(chooseTarget(cs, opts({ lock: { id: 3, k: 1 } }))).toBe(3);
    expect(chooseTarget(cs, opts({ lock: { id: 9, k: 1 } }))).toBe(1); // a dead lock changes nothing
    const q = { reach: 999, groundOnly: false };
    expect(stepTarget(cs, q, 1, 1)).toBe(2);
    expect(stepTarget(cs, q, 2, 1)).toBe(3);
    expect(stepTarget(cs, q, 3, 1)).toBe(3); // the ends stay put
    expect(stepTarget(cs, q, 2, -1)).toBe(1);
    expect(stepTarget(cs, q, 1, -1)).toBe(1);
    expect(stepTarget([], q, 1, 1)).toBe(0);
  });
  it('sticks with its target unless a better one arrives clearly sooner', () => {
    const cs = [cand(1, 12), cand(2, 10)];
    expect(chooseTarget(cs, opts())).toBe(2);
    expect(chooseTarget(cs, opts({ current: 1 }))).toBe(1);
    expect(chooseTarget([cand(1, 20), cand(2, 10)], opts({ current: 1 }))).toBe(2);
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
    expect(a.lock).toBe(b.lock); expect(a.workshop).toBe(null); expect(a.railCharges).toBe(b.railCharges); expect(a.weapon).toBe(b.weapon);
    const hud = s.sim.hud!();
    expect(hud.gears).toBe(true);
    const hints = new Map(hud.controls!.map((c) => [c.button, c.label]));
    expect(hints.get('shiftersL')).toBe('Gear'); expect(hints.get('shiftersR')).toBe('Gear');
    expect(hints.get('paddles')).toBe('Step target');
    expect(hints.get('a')).toBe('Construction');
    expect(hints.get('b')).toBe('Overcharge'); expect(hints.get('y')).toBe('Slow field');
  });
  it('A opens construction and B closes without firing a combat action', () => {
    const pad = new Pad(), ref = session(new Pad()), s = session(pad);
    s.step(30 * 50); ref.step(30 * 50); // past the 45 s lull, where A accepts the work order instead
    pad.press('a'); s.step(1); ref.step(1); expect(snap(s).workshop).not.toBeNull();
    pad.press('b'); s.step(1); ref.step(1);
    s.step(30 * 20); ref.step(30 * 20);
    const a = snap(s), b = snap(ref);
    expect(a.workshop).toBe(null);
    expect([a.scrap, a.railCharges, a.towers.length, a.targetId]).toEqual([b.scrap, b.railCharges, b.towers.length, b.targetId]);
  });
  it('D-pad left/right and the paddles step a target lock along the queue; it decays and up releases it', () => {
    const pad = new Pad(), s = session(pad);
    let n = 0; // wait for a few aliens on the field, with one in the turret's reach
    while (!(snap(s).enemies.length >= 3 && snap(s).targetId > 0) && n++ < 30 * 240) s.step(1);
    pad.press('right'); s.step(1);
    const first = snap(s).lock;
    expect(first?.id).toBeGreaterThan(0);
    expect(snap(s).targetId).toBe(first!.id);
    pad.press('left'); s.step(1);
    expect(snap(s).lock?.id).toBeGreaterThan(0);
    const k0 = snap(s).lock!.k;
    s.step(30 * 2);
    if (snap(s).lock) expect(snap(s).lock!.k).toBeLessThan(k0);
    s.step(30 * 5);
    expect(snap(s).lock).toBe(null);
    while (!(snap(s).enemies.length >= 2 && snap(s).targetId > 0) && n++ < 30 * 480) s.step(1);
    pad.paddleR = 1; s.step(1);
    const held = snap(s).lock;
    expect(held?.id).toBeGreaterThan(0);
    s.step(30 * 2);
    if (snap(s).enemies.some((e) => e.id === held!.id)) expect(snap(s).lock?.k).toBeCloseTo(1, 1); // a held paddle keeps it fresh
    pad.paddleR = 0; s.step(1);
    if (snap(s).lock) { pad.press('up'); s.step(1); expect(snap(s).lock).toBe(null); }
  });
  it('with no input but pedalling, the turret engages every wave', () => {
    const s = session({ beginTick() {}, state: () => ({ held: new Set(), pressed: new Set(), released: new Set(), paddleL: 0, paddleR: 0, paddleIdleS: 99, source: 'script' }) });
    const engaged = new Map<number, boolean>();
    for (let i = 0; i < 30 * 60 * 20; i += 10) {
      s.step(10);
      const v = snap(s);
      if (v.lull > 0 || !v.enemies.length) continue;
      engaged.set(v.wave, (engaged.get(v.wave) ?? false) || v.targetId > 0);
    }
    expect(engaged.size).toBeGreaterThanOrEqual(7);
    expect([...engaged].filter(([, e]) => !e)).toEqual([]);
    expect(Number(s.sim.summary().turretKills)).toBeGreaterThan(100);
  });
});
