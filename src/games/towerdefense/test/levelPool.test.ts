import { describe, expect, it } from 'vitest';
import { generateLevel, planLevel, runAttempt } from '../sim/generator';
import { generateParallel, type AttemptRunner, type MapSpec } from '../render/levelPool';
import { quickRide } from '../sim/campaign';
import { knownLevel, levelFor, primeLevel } from '../sim/levelCache';

/** Runs attempts inline but finishes them out of order, like workers of different speeds. */
const shuffledRunner = (delays: number[]): AttemptRunner => (spec, attempt) => new Promise(resolve => {
  const opts = { style: spec.roadStyle, ground: spec.ground, pads: spec.pads };
  const o = runAttempt(planLevel(spec.seed, opts), attempt, opts);
  setTimeout(() => resolve(o), delays[(attempt - 1) % delays.length]);
});

describe('parallel level generation', () => {
  const specs: MapSpec[] = [quickRide(3, 20), quickRide(25, 20), quickRide(11, 30), { seed: 4242, roadStyle: 'merge', ground: 'blight', pads: 10 }];
  // 3 and 25 settle on attempts 5 and 10, so later attempts finish first and must be held back
  it("gives exactly the sequential generator's map, whatever order attempts finish in", async () => {
    for (const spec of specs) {
      const want = generateLevel(spec.seed, { style: spec.roadStyle, ground: spec.ground, pads: spec.pads });
      for (const [slots, delays] of [[1, [0]], [4, [9, 1, 5, 0]], [3, [0, 7, 2]]] as const) {
        const got = await generateParallel(spec, shuffledRunner([...delays]), slots);
        expect(got.attempts).toBe(want.attempts);
        expect(got.level).toEqual(want.level);
      }
    }
  }, 60_000);

  it('a primed map is the one the sim uses, named by the spec', () => {
    const spec = quickRide(77, 15), level = generateLevel(spec.seed, { style: spec.roadStyle, ground: spec.ground, pads: spec.pads }).level;
    expect(knownLevel(spec)).toBeNull();
    primeLevel(spec, level);
    expect(knownLevel(spec)).toBe(level);
    const used = levelFor({ ...spec, name: 'Quick 15′' });
    expect(used.name).toBe('Quick 15′');
    expect({ ...used, name: level.name }).toEqual(level);
    expect(levelFor({ ...spec, name: 'Quick 40′' }).name).toBe('Quick 40′');
  }, 30_000);
});
