import { describe, it, expect } from 'vitest';
import { chassis, crossDeck, recover, RESCUE } from '../sim/deck';
import { firingLine, firingRuns, firingGear, kilnWidth, rideSeam } from '../sim/kiln';
import { LAP, courses } from '../sim/track';

describe('Kiln Switchbacks', () => {
  it('keeps a solid road through the first-course gap and rescues onto the banked flume', () => {
    const bike = { ...chassis(), at: 0, x: 0.6 };
    for (let at = 0; at < LAP; at++) {
      bike.at = at;
      crossDeck(bike, at - 1, 20, 0.05, kilnWidth(at));
      expect(bike.fall || bike.flight || bike.jumps).toBe(0);
    }
    bike.at = 500;
    bike.x = kilnWidth(bike.at) + 0.1;
    crossDeck(bike, 499, 20, 0.05, kilnWidth(500));
    expect(bike.fall).toBe(RESCUE);
    for (let i = 0; i < 70; i++) recover(bike, 1 / 30, false);
    expect(bike.x).toBe(0);
    expect(bike.fall).toBe(0);
  });
  it('releases once per exit only after covering the seam under power', () => {
    const run = firingRuns[0];
    for (const [powered, align, expected] of [
      [true, true, 1],
      [false, true, 0],
      [true, false, 0],
    ] as const) {
      const gear = firingGear();
      for (let lap = 0; lap < 2; lap++)
        for (let d = run.entry - 1; d < run.exit + 3; d++) {
          const x = align ? firingLine(run, d + 0.5) : 1.36;
          rideSeam(gear, lap * LAP + d, lap * LAP + d + 1, x, powered);
        }
      expect(gear.releases).toBe(expected * 2);
    }
    const gear = firingGear();
    for (let i = 0; i < 300; i++) rideSeam(gear, run.entry + 4, run.entry + 4, run.from, true);
    expect(gear.coverage).toBe(0);
  });
  it('keeps the copper ribbon inside the deck and both deck edges running forward through the switchbacks', () => {
    const course = courses[1];
    for (let d = 0; d < LAP; d++) {
      const h = course.track(d + 0.5).yaw;
      for (const side of [-1, 1]) {
        const a = course.world(d, kilnWidth(d) * side),
          b = course.world(d + 1, kilnWidth(d + 1) * side);
        expect((b.x - a.x) * Math.sin(h) - (b.z - a.z) * Math.cos(h)).toBeGreaterThan(0.1);
      }
    }
    for (const run of firingRuns)
      for (let d = run.entry; d <= run.exit; d++)
        expect(Math.abs(firingLine(run, d)) + 0.42).toBeLessThan(kilnWidth(d));
  });
});

it('teaches a fixed seam first, crosses the second drum, and gives the descent room for a paddle correction', () => {
  const [first, second] = firingRuns;
  expect(firingLine(first, first.entry)).toBe(firingLine(first, first.exit));
  expect(firingLine(second, second.entry) * firingLine(second, second.exit)).toBeLessThan(0);
  const angle = (courses[1].track(467).bank * 180) / Math.PI;
  expect(angle).toBeGreaterThan(20);
  expect(angle).toBeLessThan(25);
  expect(kilnWidth(467)).toBeGreaterThan(1.3);
});
