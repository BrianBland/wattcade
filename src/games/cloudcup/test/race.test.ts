import { expect, it } from 'vitest';
import { createGameSession, NullInput, testProfile } from '../../../core';
import type { Button } from '../../../contracts';
import { module } from '..';
import { FINISH, swingConnects, type RaceView } from '../sim/race';
import {
  chassis,
  crossDeck,
  recover,
  RESCUE,
  LAUNCH_SPEED,
  LIP,
  LAND,
  safeLine,
  forkWidth,
  supported,
  packPace,
  prize,
} from '../sim/deck';
import { LAP, track, world } from '../sim/track';
import { playBounds } from '../render/renderer';
function race(ftp = 200) {
  const profile = { ...testProfile(), ftp },
    base = new NullInput().state();
  const pressed = new Set<Button>();
  let paddleR = 0,
    paddleL = 0;
  const session = createGameSession({
    profile,
    game: module,
    seed: 3,
    fake: { script: 'z2' },
    input: { beginTick() {}, state: () => ({ ...base, pressed, paddleR, paddleL }) },
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
      paddleR = Math.max(0, value);
      paddleL = Math.max(0, -value);
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
  expect(r.snap().falls).toBe(1);
  expect(r.snap().fall).toBeGreaterThan(0);
  const progress = r.snap().at;
  r.paddle(0);
  r.until((s) => s.fall === 0);
  expect(r.snap().at).toBe(progress);
  expect(supported(r.snap().at, r.snap().x)).toBe(true);
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

it('shares one fork, ramp threshold and recovery rule for bikes across all laps', () => {
  for (const origin of [0, LAP, 2 * LAP]) {
    for (const [x, speed, clear] of [
      [0.94, LAUNCH_SPEED + 0.01, true],
      [0.94, LAUNCH_SPEED, true],
      [0.94, LAUNCH_SPEED - 0.1, false],
      [-1.1, 12, true],
    ] as const) {
      const bike = { ...chassis(), at: origin + LIP - 0.2, x };
      while (bike.at < origin + LAND + 2 && !bike.fall) {
        const prev = bike.at;
        bike.at += speed / 30;
        crossDeck(bike, prev, speed, 1 / 30);
      }
      expect(!bike.fall).toBe(clear);
      expect(bike.jumps).toBe(clear && x > 0 ? 1 : 0);
      if (bike.fall) {
        const where = bike.at;
        recover(bike, RESCUE);
        expect(bike.at).toBe(where);
        expect(supported(where, bike.x)).toBe(true);
      }
    }
  }
  expect(supported(695, 0.7)).toBe(false);
  expect(supported(695, 0.5)).toBe(true);
  expect(supported(250, 0)).toBe(false);
});
it('weights salvage toward trailers and caps both directions of crew pace adjustment', () => {
  expect(prize(50, 0.5)).toBe('tow');
  expect(prize(-50, 0.5)).toBe('shield');
  expect(packPace(500)).toBe(0.8);
  expect(packPace(-500)).toBe(1.2);
  expect(packPace(0)).toBe(1);
});

function balanceRide(counter = true) {
  const r = race();
  r.press('a');
  const fake = r.session.fakeBike!;
  fake.useScript(null);
  function ride(seconds: number, ftpFraction: number) {
    fake.manual = { cadence: ftpFraction ? 90 : 0, power: 200 * ftpFraction, hr: null };
    for (let i = 0; i < seconds * 30; i++) {
      const s = r.snap(),
        x = forkWidth(s.at + 10) || forkWidth(s.at) ? safeLine(s.at + 10) : 0;
      const error = x - s.x - s.lateralSpeed * 0.13;
      r.paddle(Math.abs(error) > 0.045 ? Math.sign(error) : 0);
      const attacker = s.rivals.find((p) => p.windup > 0.18 && p.windup < 0.65);
      if (counter && attacker && !s.reload) r.press(attacker.x < s.x ? 'a' : 'b');
      else r.session.step(1);
    }
    return r.snap();
  }
  return ride;
}
it('gives the rider a draftable exit and time at class effort after a missed counter', () => {
  const ride = balanceRide(false);
  let s = ride(0, 0.78);
  for (let i = 0; i < 15 && !s.hits; i++) s = ride(1, 0.78);
  expect(s.hits).toBe(1);
  let sawWake = false;
  for (let i = 0; i < 21; i++) {
    s = ride(1, 0.78);
    expect(s.hits).toBe(1);
    expect(s.rivals.every((r) => !r.windup && !r.strike)).toBe(true);
    sawWake ||= s.draft > 0.5;
  }
  expect(sawWake).toBe(true);
  expect(s.slow).toBe(0);
  expect(ride(55, 0.78).hits).toBeGreaterThan(1);
});
it('brings back a strong early leader who stops pedaling', () => {
  const ride = balanceRide(),
    lead = ride(24, 1.7);
  expect(lead.place).toBe(1);
  const coast = ride(18, 0);
  expect(coast.place).toBe(4);
  expect(coast.speed).toBeLessThan(1);
});
it('allows an eight-second late start to reach the pack again at class effort', () => {
  const ride = balanceRide(),
    late = ride(8, 0);
  expect(Math.max(...late.rivals.map((r) => r.at)) - late.at).toBeGreaterThan(70);
  const resumed = ride(46, 0.78);

  expect(Math.min(...resumed.rivals.map((r) => Math.abs(r.at - resumed.at)))).toBeLessThan(25);
});

it('can shove a rival over the edge or get knocked off by the crew', () => {
  for (const attack of [false, true]) {
    const r = race();
    r.press('a');
    // Hold a rideable line near the outside shoulder. One pass contests it,
    // the other leaves the flanker free to complete its attack.
    for (let i = 0; i < 300; i++) {
      const s = r.snap(),
        error = (attack ? 0.75 : 0.95) - s.x - s.lateralSpeed * 0.15;
      r.paddle(Math.abs(error) > 0.04 ? Math.sign(error) : 0);
      if (attack && !s.reload && s.rivals.some((p) => p.x > s.x && Math.abs(p.at - s.at) < 2.9 && !p.stun))
        r.press('b');
      else r.session.step(1);
      if (r.snap().ringOuts || r.snap().fall) break;
    }
    if (attack) {
      expect(r.snap().ringOuts).toBe(1);
      expect(r.snap().rivals.some((p) => p.fall > 0)).toBe(true);
    } else {
      expect(r.snap().fall).toBeGreaterThan(0);
      expect(r.snap().hits).toBe(1);
    }
  }
});
