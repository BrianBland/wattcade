import { expect, it } from 'vitest';
import { createGameSession, NullInput, testProfile } from '../../../core';
import type { Button } from '../../../contracts';
import { module } from '..';
import { FINISH, type RaceView } from '../sim/race';
import { playBounds } from '../render/renderer';

function race(ftp = 200) {
  const profile = { ...testProfile(), ftp };
  const base = new NullInput().state();
  let input = { ...base };
  const session = createGameSession({
    game: module,
    profile,
    seed: 3,
    fake: { script: 'z2' },
    input: { beginTick() {}, state: () => input },
  });
  const snap = () => session.sim.snapshot() as RaceView;
  function press(b: Button) {
    input = { ...base, pressed: new Set([b]) };
    session.step(1);
    input = { ...base };
  }
  return {
    session,
    snap,
    press,
    paddle: (r: number, ticks = 10) => {
      input = { ...base, paddleR: Math.max(0, r), paddleL: Math.max(0, -r) };
      session.step(ticks);
    },
  };
}
it('supports small corrections, sustained steering, release and track bounds', () => {
  const r = race();
  r.paddle(0.8, 150);
  expect(r.snap()).toMatchObject({ at: 0, tier: 2 });
  r.press('a');
  r.paddle(1, 4);
  const trim = r.snap().x;
  expect(trim).toBeGreaterThan(0);
  expect(trim).toBeLessThan(0.2);
  r.paddle(0.1, 30);
  expect(r.snap().x).toBe(trim);
  r.paddle(1, 90);
  expect(r.snap().x).toBe(1.18);
  r.paddle(-1, 90);
  expect(r.snap().x).toBe(-1.18);
});
it('raises opponent pace across all three classes', () => {
  const distances = (['left', null, 'right'] as const).map((button) => {
    const r = race();
    if (button) r.press(button);
    r.press('a');
    r.session.step(150);
    return r.snap().rivals[0].at;
  });
  expect(distances[0]).toBeLessThan(distances[1]);
  expect(distances[1]).toBeLessThan(distances[2]);
});
it('awards pickups across the track, lobs goo and completes three laps', () => {
  const r = race();
  r.press('right');
  r.press('a');
  r.paddle(-1, 20);
  r.paddle(0);
  while (r.snap().next === 0 && r.snap().time < 30) r.session.step(1);
  expect(r.snap().boosts).toBe(1);
  r.paddle(1, 36);
  r.paddle(0);
  while (r.snap().next === 1 && r.snap().time < 60) r.session.step(1);
  expect(r.snap().item).toBe(true);
  r.press('a');
  expect(r.snap().lobs).toBe(1);
  const target = r.snap().shot!.target;
  expect(r.snap().rivals[target].slow).toBe(0);
  r.session.step(25);
  expect(r.snap().shot).toBeNull();
  expect(r.snap().rivals[target].slow).toBeGreaterThan(3);
  r.session.step(30 * 360);
  expect(r.snap().at).toBe(FINISH);
  expect(r.session.sim.summary()).toMatchObject({ Laps: 3, Class: 'Outlaw' });
});
it('telegraphs a patch of road and applies a temporary grade only on a hit', () => {
  for (const dodge of [false, true]) {
    const r = race();
    r.press('a');
    while (!r.snap().slick && r.snap().time < 20) r.session.step(1);
    expect(r.snap().slick!.at - r.snap().at).toBeGreaterThan(60);
    if (dodge) r.paddle(-1, 20);
    while (r.snap().slick && r.snap().time < 30) r.session.step(1);
    expect(r.snap().hits).toBe(dodge ? 0 : 1);
    const pulse = () => r.session.mixer.debug().activeEffects.find((e) => e.id === 'slick');
    if (dodge) expect(pulse()).toBeUndefined();
    else expect(pulse()).toMatchObject({ mode: 'sim', gradePct: 2.5 });
    expect(r.snap().slow > 0).toBe(!dodge);
    r.session.step(245);
    expect(r.snap().slow).toBe(0);
    expect(pulse()).toBeUndefined();
  }
});
it('keeps the race viewport above the HUD', () => {
  const b = playBounds(1024, 768, { top: 12, left: 10, right: 14, bottom: 144 });
  expect(b.y + b.h).toBe(624);
  expect(b.x + b.w).toBe(1010);
});

it('gives two riders at the same FTP fraction the same pace', () => {
  const distance = (ftp: number) => {
    const rider = race(ftp);
    rider.press('a');
    rider.session.step(150);
    return rider.snap().at;
  };
  expect(distance(150)).toBeCloseTo(distance(300), 0);
});

it('purges the sticky load early after a sustained FTP-scaled sprint', () => {
  const r = race(160);
  r.press('a');
  while (!r.snap().hits && r.snap().time < 25) r.session.step(1);
  expect(r.snap().slow).toBeGreaterThan(7);
  const start = r.snap().time;
  const bike = r.session.fakeBike!;
  bike.useScript(null);
  bike.manual = { cadence: 100, power: 220, hr: null };
  while (r.snap().purge === 0 && r.snap().time - start < 7) r.session.step(1);
  expect(r.snap().purge).toBeGreaterThan(0);
  r.session.step(61);
  expect(r.snap().slow).toBe(0);
  expect(r.snap().time - start).toBeLessThan(7);
  expect(r.session.mixer.debug().activeEffects.find((e) => e.id === 'slick')).toBeUndefined();
});
