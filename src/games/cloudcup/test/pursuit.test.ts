import { expect, it } from 'vitest';
import { pursuitClock, scorePursuit, targetBand } from '../sim/pursuit';
import { crossTiming, timingSheet } from '../sim/timing';
import { LAP } from '../sim/track';

it('starts a fresh split at every bell and requires both controlled effort and a gain', () => {
  const p = pursuitClock(),
    rivals = [{ at: 240 }, { at: 600 }, { at: 840 }];
  const tick = (seconds: number, ratio: number, at: number) =>
    scorePursuit(p, seconds, Math.round(200 * ratio), at, rivals, 1, 200);
  tick(240, 0.5, 100);
  tick(120, 1.3, 220);
  expect([p.phase, p.flags, p.lastSeconds]).toEqual([2, 0, 0]);
  tick(120, 0.55, 400);
  tick(90, 0.87, 430);
  tick(30, 0.6, 410);
  expect([p.phase, p.flags, p.lastSplit, p.lastSeconds]).toEqual([4, 1, 10, 90]);
  tick(120, 0.55, 700);
  rivals[2].at += 30;
  tick(120, 0.87, 701);
  expect(p.flags).toBe(1);
  tick(240, 0.5, 900);
  expect(p).toMatchObject({ complete: true, totalWork: 360, workSeconds: 210 });
  tick(1, 0.87, 910);
  expect(p.workSeconds).toBe(210);
});

it('steps the warm-up up, the cool-down down and scales the three work prescriptions', () => {
  expect(targetBand(0, 0, 2)[0]).toBeLessThan(targetBand(0, 235, 2)[0]);
  expect(targetBand(6, 235, 0)[0]).toBeLessThan(targetBand(6, 0, 0)[0]);
  expect([0, 1, 2].map((tier) => targetBand(1, 70, tier).map((v) => Math.round(v * 200)))).toEqual([
    [130, 150],
    [164, 184],
    [190, 210],
  ]);
});

it('times interpolated sector crossings against a single complete reference lap', () => {
  const sheet = timingSheet(),
    record = { time: 145, lap: 48, splits: [15, 31, 48] };
  for (const [sector, t] of [
    [1, 14],
    [2, 33],
    [3, 47],
  ]) {
    const line = (sector * LAP) / 3;
    crossTiming(sheet, record, line - 1, line + 1, t + 0.5, 1);
  }
  expect(sheet).toMatchObject({ fastest: 47, fastestSplits: [14, 33, 47], delta: -1 });
  crossTiming(sheet, record, (LAP * 4) / 3 - 1, (LAP * 4) / 3 + 1, 62.5, 1);
  expect(sheet.delta).toBe(1);
});
