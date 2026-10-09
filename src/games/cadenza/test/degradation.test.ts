import { expect, it } from 'vitest';
import { advanceDegradation, type Degradation } from '../render/degradation';
const run = (seconds: number, under: number, state: Degradation = { belowS: 0, level: 0 }) => {
  for (let i = 0; i < seconds * 60; i++) state = advanceDegradation(state, under, 1 / 60);
  return state;
};
it('ignores brief dips, builds gradually during sustained underpower, and caps the effect', () => {
  expect(run(3, 1).level).toBe(0);
  const five = run(5, 1), ten = run(10, 1), thirty = run(30, 1);
  expect(five.level).toBeLessThan(0.05);
  expect(ten.level).toBeGreaterThan(five.level); expect(ten.level).toBeLessThan(0.35);
  expect(thirty.level).toBeGreaterThan(0.7); expect(thirty.level).toBeLessThanOrEqual(0.75);
  expect(run(30, 0.2).level).toBeLessThan(0.031);
});
it('fades out promptly on recovery without cutting off abruptly', () => {
  const full = run(30, 1), first = advanceDegradation(full, 0, 1 / 60);
  expect(first.level).toBeLessThan(full.level); expect(first.level).toBeGreaterThan(full.level * 0.985);
  expect(run(3, 0, full).level).toBeLessThan(0.065);
  expect(run(3, 0, full).belowS).toBe(0);
});
