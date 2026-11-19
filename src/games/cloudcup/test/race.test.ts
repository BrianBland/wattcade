import { expect, it } from 'vitest';
import { createGameSession, NullInput, testProfile } from '../../../core';
import type { Button } from '../../../contracts';
import { module } from '..';
import { FINISH, swingConnects, type RaceView } from '../sim/race';
import { LAP, track, world } from '../sim/track';
import { playBounds } from '../render/renderer';
function race(ftp = 200) {
  const profile = { ...testProfile(), ftp },
    base = new NullInput().state();
  const pressed = new Set<Button>();
  let paddleR = 0;
  const session = createGameSession({
    profile,
    game: module,
    seed: 3,
    fake: { script: 'z2' },
    input: { beginTick() {}, state: () => ({ ...base, pressed, paddleR }) },
  });
  const snap = () => session.sim.snapshot() as RaceView;
  const press = (b: Button) => {
    pressed.add(b);
    session.step(1);
    pressed.clear();
  };
  const until = (pred: (s: RaceView) => boolean, max = 900) => {
    for (let i = 0; i < max && !pred(snap()); i++) session.step(1);
    expect(pred(snap())).toBe(true);
  };
  return {
    session,
    snap,
    press,
    until,
    paddle: (value: number) => {
      paddleR = value;
    },
  };
}
it('takes a partial line, banks under held input, and eases out on release', () => {
  const r = race();
  r.press('a');
  r.paddle(0.8);
  r.session.step(5);
  const trim = r.snap();
  expect(trim.x).toBeGreaterThan(0.03);
  expect(trim.x).toBeLessThan(0.3);
  expect(trim.lean).toBeLessThan(0);
  r.paddle(0);
  r.session.step(1);
  expect(r.snap().lateralSpeed).toBeGreaterThan(0);
  r.paddle(0.8);
  r.session.step(75);
  expect(r.snap().x).toBe(1.19);
});
it('keeps the mesh and handling coordinates continuous at lap boundaries', () => {
  expect(track(LAP)).toEqual(track(0));
  expect(world(-3, 0.7)).toEqual(world(LAP - 3, 0.7));
  expect(Math.abs(world(LAP - 0.01, 0.5).x - world(0.01, 0.5).x)).toBeLessThan(0.1);
  const b = playBounds(1024, 768, { top: 12, left: 10, right: 14, bottom: 144 });
  expect(b.y + b.h).toBe(624);
});
it('only sweeps the chosen side, inside its physical arc', () => {
  expect(swingConnects(0, 0.65, 1, 0.5)).toBe(true);
  expect(swingConnects(0, 0.65, -1, 0.5)).toBe(false);
  expect(swingConnects(5, 0.6, 1, 0.5)).toBe(false);
  expect(swingConnects(3, 0.7, 1, 0.85)).toBe(false);
});
it('a timed counter staggers the attacker and opens a passing opportunity', () => {
  const r = race();
  r.press('a');
  r.until((s) => s.rivals.some((p) => p.windup > 0.35 && p.windup < 0.7));
  const attacker = r.snap().rivals.findIndex((p) => p.windup > 0);
  r.press(r.snap().rivals[attacker].x < r.snap().x ? 'a' : 'b');
  r.until((s) => s.counters === 1, 15);
  expect(r.snap().rivals[attacker].stun).toBeGreaterThan(2);
  expect(r.snap().hits).toBe(0);
  r.session.step(45);
  expect(r.snap().at).toBeGreaterThan(r.snap().rivals[attacker].at);
});
it('a missed wind-up gives a bounded load that a sprint can clear early', () => {
  const r = race(160);
  r.press('a');
  r.until((s) => s.rivals.some((p) => p.windup > 0));
  r.until((s) => s.hits === 1);
  const effects = () => r.session.mixer.debug().activeEffects;
  expect(effects()).toContainEqual(expect.objectContaining({ id: 'overload', gradePct: 2.5 }));
  const start = r.snap().time;
  r.session.fakeBike!.useScript(null);
  r.session.fakeBike!.manual = { cadence: 100, power: 220, hr: null };
  r.until((s) => s.purge > 0);
  r.until((s) => s.slow === 0);
  expect(r.snap().time - start).toBeLessThan(7);
  expect(effects().some((e) => e.id === 'overload')).toBe(false);
});
it('rewards the wake, finishes three laps, and varies rival pace across FTP classes', () => {
  const pace = (tier: Button | null) => {
    const r = race();
    if (tier) r.press(tier);
    r.press('a');
    r.session.step(90);
    return r.snap().rivals[1].at;
  };
  expect(pace('left')).toBeLessThan(pace(null));
  expect(pace(null)).toBeLessThan(pace('right'));
  const r = race();
  r.press('a');
  r.until((s) => s.draft > 0.6);
  r.session.step(30 * 360);
  expect(r.snap().at).toBe(FINISH);
  expect(r.session.sim.summary().Laps).toBe(3);
});
it('matches pace at the same relative effort across rider FTPs', () => {
  const distance = (ftp: number) => {
    const r = race(ftp);
    r.press('a');
    r.session.step(90);
    return r.snap().at;
  };
  expect(distance(150)).toBeCloseTo(distance(300), 0);
});

it('can leave a telegraphed strike by steering out of its arc', () => {
  const r = race();
  r.press('a');
  r.until((s) => s.rivals.some((p) => p.windup > 0));
  expect(r.snap().rivals.find((p) => p.windup > 0)!.x).toBeLessThan(r.snap().x);
  r.paddle(1);
  r.session.step(50);
  expect(r.snap().hits).toBe(0);
});
it('lets the trainer load expire at ordinary effort', () => {
  const r = race();
  r.press('a');
  r.until((s) => s.slow > 0);
  r.session.step(211);
  expect(r.snap().slow).toBe(0);
  expect(r.session.mixer.debug().activeEffects.some((e) => e.id === 'overload')).toBe(false);
});
