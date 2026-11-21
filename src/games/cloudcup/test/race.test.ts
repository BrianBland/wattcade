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
import { LAP, courses, track, world } from '../sim/track';
import { valley, saddle, passPoint, passRate } from '../sim/pass';
import { firebox, firingLine } from '../sim/kiln';
import { displayRace } from '../render/motion';
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
        error = (attack ? 0.75 : -0.95) - s.x - s.lateralSpeed * 0.15;
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

it('winches an underspeed bike over the deck before traversing, releases it and preserves race distance', () => {
  for (const [at, x] of [
    [250, 0.95],
    [695, -1.0],
    [1250, 1.8],
  ]) {
    const b = { ...chassis(), at, x };
    crossDeck(b, at - 0.4, 13, 1 / 30);
    expect(b.fall).toBe(RESCUE);
    let low = 0,
      high = 0,
      previousX = b.x,
      previousHeight = b.lift;
    for (let i = 0; i < 129; i++) {
      recover(b, 1 / 60);
      low = Math.min(low, b.lift);
      high = Math.max(high, b.lift);
      expect(Math.abs(b.lift - previousHeight)).toBeLessThan(0.22);
      if (Math.abs(b.x - previousX) > 0.001) expect(b.lift).toBeGreaterThan(1.7);
      previousX = b.x;
      previousHeight = b.lift;
    }
    expect(low).toBeLessThan(-1);
    expect(high).toBeGreaterThan(2.5);
    expect(b.fall).toBeCloseTo(0, 8);
    expect(b.at).toBe(at);
    expect(supported(b.at, b.x)).toBe(true);
    expect(b.lift).toBeCloseTo(0, 6);
  }
});
it('runs a full endurance race on the selected course and keeps the field racing after lap three', () => {
  const r = race();
  r.press('b');
  r.press('up');
  r.press('a');
  expect(r.snap()).toMatchObject({ course: 1, laps: 12, finishAt: 12 * LAP });
  r.until((s) => s.at > FINISH, 30 * 400);
  expect(r.session.sim.isOver()).toBe(false);
  expect(r.snap().rivals.some((p) => p.finish === null)).toBe(true);
  r.until((s) => s.at === s.finishAt, 30 * 1500);
  expect(r.session.sim.summary()).toMatchObject({ Laps: 12, Course: 'Kiln Switchbacks' });
});
it('cycles the grid distances and lets Switch clear the ramp at Hotshot pace', () => {
  const r = race();
  r.press('up');
  r.press('up');
  expect(r.snap().laps).toBe(24);
  r.press('up');
  expect(r.snap().laps).toBe(3);
  r.press('a');
  r.until((s) => s.rivals[2].jumps > 0, 30 * 90);
});

it('trims the line with a light paddle squeeze and reaches full steering before the end of paddle travel', () => {
  function trim(p: number) {
    const r = race();
    r.press('a');
    r.paddle(p);
    r.session.step(6);
    return r.snap().x;
  }
  expect(trim(0.32)).toBeGreaterThan(0);
  expect(trim(0.32)).toBeLessThan(trim(0.8));
  expect(trim(0.8)).toBeCloseTo(trim(1), 6);
});

it('pays the firing line at class effort and lets the center and low-power rider finish without charging', () => {
  function crossDrum(fraction: number, follow: boolean, ftp: number) {
    const r = race(ftp);
    r.press('b');
    r.press('a');
    const bike = r.session.fakeBike!;
    bike.useScript(null);
    bike.manual = { cadence: 85, power: ftp * fraction, hr: null };
    for (let tick = 0; tick < 30 * 50 && r.snap().at < 345; tick++) {
      const s = r.snap(),
        d = s.at + 4,
        run = firebox(d);
      const target = follow ? (run ? firingLine(run, d) : d > 52 && d < 88 ? -0.74 : 0) : 0;
      const error = target - s.x - s.lateralSpeed * 0.13;
      r.paddle(Math.abs(error) > 0.045 ? Math.sign(error) : 0);
      r.session.step(1);
    }
    return r.snap();
  }
  for (const ftp of [145, 285]) {
    const ride = crossDrum(0.78, true, ftp);
    expect(ride.at).toBeGreaterThan(332);
    expect(ride.firing.releases).toBe(1);
    expect(ride.boost).toBeGreaterThan(0);
    expect(ride.rivals[2].firing.releases).toBe(1);
  }
  expect(crossDrum(0.78, false, 200).firing.releases).toBe(0);
  const easy = crossDrum(0.45, true, 200);
  expect(easy.at).toBeGreaterThan(332);
  expect(easy.firing.releases).toBe(0);
});

it.each([60, 120])('draws the bank, chassis and chase camera between physics ticks at %i Hz', (refresh) => {
  const r = race();
  r.press('a');
  r.paddle(1);
  r.session.step(4);
  let last = displayRace(r.snap(), 0);
  for (let i = 0; i < refresh / 5; i++) {
    r.session.frame(1 / refresh);
    const sim = r.snap();
    const view = displayRace(sim, r.session.loop.frameFraction);
    expect(view.x).toBeGreaterThan(last.x);
    expect(view.at).toBeGreaterThan(last.at);
    expect(view.cameraX).toBeGreaterThan(last.cameraX);
    expect(view.lean).toBeLessThan(last.lean);
    expect(view.rivals[0].at).toBeGreaterThan(last.rivals[0].at);
    expect(sim.x).toBeGreaterThanOrEqual(view.x);
    last = view;
  }
  r.session.frame(0.093);
  const s = r.snap(),
    fraction = r.session.loop.frameFraction;
  expect(fraction).toBeGreaterThan(0);
  expect(fraction).toBeLessThan(1);
  expect(displayRace(s, fraction).time).toBeCloseTo(s.time - (1 - fraction) / 30, 9);
  r.session.pause();
  r.session.frame(1);
  expect(displayRace(r.snap(), r.session.loop.frameFraction)).toEqual(displayRace(s, fraction));
});

it('absorbs alternating paddle trims while a held reversal crosses upright once', () => {
  const r = race();
  r.press('a');
  let maxChange = 0;
  for (let i = 0; i < 20; i++) {
    const lean = r.snap().lean;
    r.paddle(i % 2 ? -1 : 1);
    r.session.step(1);
    maxChange = Math.max(maxChange, Math.abs(r.snap().lean - lean));
  }
  expect((maxChange * 180) / Math.PI).toBeLessThan(1.1);
  r.paddle(1);
  r.session.step(11);
  expect(r.snap().lean).toBeLessThan(-0.16);
  r.paddle(-1);
  let crossings = 0;
  for (let i = 0; i < 17; i++) {
    const sign = Math.sign(r.snap().lean);
    r.session.step(1);
    if (sign !== Math.sign(r.snap().lean)) crossings++;
  }
  expect(crossings).toBe(1);
  expect(r.snap().lean).toBeGreaterThan(0.16);
  expect(r.snap().falls).toBe(0);
});

it.each(courses)('$name eases into the bank across survey joints and the lap line', (course) => {
  let previous = course.track(-0.25).bank;
  for (let d = 0; d <= LAP; d += 0.25) {
    const bank = course.track(d).bank;
    expect((Math.abs(bank - previous) * 180) / Math.PI).toBeLessThan(0.25);
    previous = bank;
  }
});

it('runs a full Stormglass race on the centre line or contesting both edge strips at the same FTP', () => {
  function ride(contest: boolean) {
    const r = race(200);
    r.press('b');
    r.press('b');
    r.press('a');
    r.session.fakeBike!.useScript(null);
    r.session.fakeBike!.manual = { cadence: 85, power: 156, hr: null };
    for (let tick = 0; tick < 30 * 240 && r.snap().at < FINISH; tick++) {
      const s = r.snap(),
        d = s.at % LAP;
      const target = contest ? (d > 205 && d < 294 ? 0.98 : d > 706 && d < 798 ? -0.98 : 0) : 0;
      const error = target - s.x - s.lateralSpeed * 0.16;
      r.paddle(Math.abs(error) > 0.045 ? Math.sign(error) : 0);
      r.session.step(1);
    }
    const result = r.snap();
    expect(result.at).toBe(FINISH);
    expect(result.course).toBe(2);
    expect(result.rivals[2].collector.clears).toBeGreaterThan(0);
    return result.collector;
  }
  expect(ride(false)).toMatchObject({ hits: 0, clears: 0 });
  const edges = ride(true);
  expect(edges.clears + edges.hits).toBe(6);
  expect(edges.clears).toBeGreaterThan(0);
});

it('lets a Hotshot carry class effort over the slag gap by lining up the approach pad', () => {
  const ride = (route: 'pad' | 'miss' | 'bridge') => {
    const r = race();
    r.press('a');
    const bike = r.session.fakeBike!;
    bike.useScript(null);
    bike.manual = { cadence: 86, power: 156, hr: null };
    for (let i = 0; i < 30 * 30 && r.snap().at < 293 && !r.snap().falls; i++) {
      const s = r.snap(),
        d = s.at;
      let x = 0;
      if (d > 135) x = route === 'bridge' ? -1.05 : route === 'miss' && d < 207 ? 0.48 : 0.98;
      const error = x - s.x - s.lateralSpeed * 0.16;
      r.paddle(Math.abs(error) > 0.045 ? Math.sign(error) : 0);
      const rival = s.rivals.find((p) => p.windup > 0.22 && p.windup < 0.76);
      if (rival && !s.reload) r.press(rival.x < s.x ? 'a' : 'b');
      else r.session.step(1);
    }
    return r.snap();
  };
  expect(ride('pad')).toMatchObject({ jumps: 1, falls: 0 });
  expect(ride('miss')).toMatchObject({ jumps: 0, falls: 1 });
  expect(ride('bridge')).toMatchObject({ jumps: 0, falls: 0 });
});

it('advances the chain between consecutive physics poses at 60 Hz', () => {
  const r = race();
  r.press('a');
  r.press('b');
  r.session.step(3);
  const s = r.snap(),
    start = displayRace(s, 0),
    half = displayRace(s, 0.5);
  expect(start.swing - s.swing).toBeCloseTo(1 / 30);
  expect(start.swing - half.swing).toBeCloseTo(1 / 60);
  expect(half.swing - s.swing).toBeCloseTo(1 / 60);
});

it('measures both roads between the same Cablehead timing lines', () => {
  for (const cut of [true, false]) {
    let metres = 0;
    for (let d = valley; d < saddle; d += 0.25) {
      const a = passPoint(d, cut),
        b = passPoint(d + 0.25, cut);
      metres += Math.hypot(a.x - b.x, a.z - b.z);
    }
    expect(metres).toBeCloseTo(cut ? 375 : 600, 0);
    expect(metres * passRate(valley + 5, cut)).toBeCloseTo(saddle - valley, 0);
    expect(passPoint(saddle, cut).y - passPoint(valley, cut).y).toBe(15);
  }
  for (const d of [valley, saddle]) expect(passPoint(d, true)).toEqual(passPoint(d, false));
});
it('lets a rider ride the Bowl apron without a crane rescue', () => {
  const r = race();
  for (let i = 0; i < 3; i++) r.press('b');
  r.press('a');
  r.paddle(1);
  r.session.step(900);
  expect(r.snap().x).toBeGreaterThan(1.65);
  expect(r.snap().falls).toBe(0);
});
it('scores all four pilots through five heats in a single workout', () => {
  const r = race();
  r.press('down');
  r.press('down');
  expect(r.snap().cupStage).toBe(-1);
  r.press('down');
  r.press('left');
  for (const [index, course] of [3, 0, 1, 2, 4].entries()) {
    expect(r.snap()).toMatchObject({ course, tier: 0, menu: true, cupStage: index, laps: 3 });
    expect(r.snap().cupPoints.reduce((a, b) => a + b, 0)).toBe(12 * index);
    r.press('a');
    for (let t = 0; t < 1800 && !r.session.sim.isOver() && !r.snap().menu; t++) r.session.step(10);
  }
  expect(r.session.sim.isOver()).toBe(true);
  expect(r.snap().cupPoints.reduce((a, b) => a + b, 0)).toBe(60);
  expect(r.session.sim.summary()['Cup heats']).toBe(5);
  expect(r.session.mixer.debug().activeEffects).toHaveLength(0);
});
