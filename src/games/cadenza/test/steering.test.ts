import { describe, expect, it } from 'vitest';
import { FIXED_DT } from '../../../contracts';
import { createGameSession, testProfile, TimelineInput } from '../../../core';
import { synthTimeline } from '../../../media/synth/queue';
import { module } from '../index';
import type { CadenzaSnapshot } from '../sim/sim';
import { SteeringInterpolation } from '../render/steering';

const session = () => createGameSession({ game: module, profile: testProfile(), input: new TimelineInput([{ t: 0, paddleR: 1 }]), media: { timeline: synthTimeline({ style: 'edm', songs: 1, short: true }) }, fake: { script: 'z2' }, simOpts: { difficulty: 'pro' } });

describe('steering presentation', () => {
  for (const fps of [60, 120]) it(`fills the frames between real 30 Hz simulation steps at ${fps} Hz`, () => {
    const s = session(), view = new SteeringInterpolation();
    view.sample(s.sim.snapshot() as CadenzaSnapshot, 0);
    const positions: number[] = [];
    for (let frame = 0; frame < fps / 10; frame++) {
      if (frame % (fps / 30) === 0) s.step(1);
      const snapshot = s.sim.snapshot() as CadenzaSnapshot;
      positions.push(view.sample(snapshot, frame / fps));
      expect(snapshot.x).toBeGreaterThanOrEqual(positions.at(-1)!);
    }
    // Before interpolation this alternated between a hold and a jump of 0.3 lanes.
    for (let i = 1; i < positions.length; i++) expect(positions[i] - positions[i - 1]).toBeCloseTo(9 / fps, 6);
  });
  it('settles exactly at partial positions and reverses without overshooting or changing the simulation', () => {
    const view = new SteeringInterpolation();
    const zero = { x: 0, previousX: 0, steeringTick: 0 }; view.sample(zero, 0);
    const right = { x: 0.4, previousX: 0, steeringTick: 1 };
    expect(view.sample(right, 1)).toBe(0);
    expect(view.sample(right, 1 + FIXED_DT / 2)).toBeCloseTo(0.2);
    expect(view.sample(right, 2)).toBe(0.4);
    const left = { x: -0.2, previousX: 0.4, steeringTick: 2 };
    expect(view.sample(left, 2)).toBe(0.4);
    expect(view.sample(left, 2 + FIXED_DT / 2)).toBeCloseTo(0.1);
    expect(view.sample(left, 3)).toBeCloseTo(-0.2);
    expect(left.x).toBe(-0.2);
  });
  it('snaps on mount or seek and holds the snapshot position when time is stopped', () => {
    const view = new SteeringInterpolation(), s = { x: 0.7, previousX: 0.4, steeringTick: 8 };
    expect(view.sample(s, 1)).toBe(0.7);
    expect(view.sample(s, 1)).toBe(0.7);
    const seek = { x: -1, previousX: 0.7, steeringTick: 9 };
    expect(view.sample(seek, 10, true)).toBe(-1);
    expect(view.sample(seek, 10.01)).toBe(-1);
  });
});
