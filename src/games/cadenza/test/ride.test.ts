import { describe, expect, it } from 'vitest';
import { DIFF, buildTrack, effortAt, extendTrack } from '../sim/track';
import { planRide } from '../sim/ride';
import { advanceCoaching, freshCoaching } from '../sim/coaching';
import { rideTimeline } from './fixtures';

const options = { difficulty: 'pro' as const, mode: 'mono' as const, seed: 1 };
describe('Cadenza ride pacing', () => {
  it('coalesces rapid music changes into continuous portions of at least 30 seconds', () => {
    const tl = rideTimeline(Array.from({ length: 24 }, (_, i) => [i * 5, (i + 1) * 5, i % 2 ? 'build' : 'verse']));
    const ride = planRide(tl, DIFF.pro);
    expect(ride.length).toBeLessThan(5);
    for (const b of ride) expect(b.t1 - b.t0).toBeGreaterThanOrEqual(30);
    expect(ride[0].t0).toBe(0); expect(ride.at(-1)!.t1).toBe(120);
    for (let i = 1; i < ride.length; i++) expect(ride[i].t0).toBe(ride[i - 1].t1);
  });

  it('lands the 3, 2, 1 countdown on the drop and allows early acceleration without raising the floor', () => {
    const tl = rideTimeline([[0, 50, 'verse'], [50, 100, 'drop'], [100, 150, 'break']]);
    const track = buildTrack(tl, options), before = effortAt(track, 46, 'pro');
    for (const [p, count] of [[47, 3], [48, 2], [49, 1]]) {
      const e = effortAt(track, p, 'pro');
      expect(e.countdown).toBe(count); expect(e.target.max).toBe(5);
      expect(e.target.min).toBe(before.target.min); expect(e.floorFtp).toBe(before.floorFtp);
    }
    expect(effortAt(track, 50, 'pro')).toMatchObject({ countdown: null, phase: 'sprint', instruction: 'Punch It!' });
    const after = effortAt(track, 66, 'pro');
    expect(after).toMatchObject({ phase: 'hold', instruction: 'Ease Off', target: { min: 3, max: 5 } });
    expect(effortAt(track, 71, 'pro').target).toMatchObject({ min: 3, max: 4 });
  });

  it('extends brief breaks and gives more recovery with Longer Breaks', () => {
    const tl = rideTimeline([[0, 60, 'verse'], [60, 65, 'break'], [65, 150, 'build'], [150, 210, 'verse']]);
    const normal = planRide(tl, DIFF.pro), longer = planRide(tl, DIFF.pro, true);
    expect(normal.find((b) => b.phase === 'recover')).toMatchObject({ t0: 60, t1: 90 });
    expect(longer.find((b) => b.phase === 'recover')).toMatchObject({ t0: 60, t1: 105 });
    const recovery = (xs: typeof normal) => xs.filter((b) => b.phase === 'recover').reduce((sum, b) => sum + b.t1 - b.t0, 0);
    expect(recovery(longer)).toBeGreaterThan(recovery(normal));
  });

  it('protects song handovers and skips a drop inside recovery, including its launch', () => {
    const tl = rideTimeline([[0, 80, 'verse'], [80, 110, 'build'], [110, 150, 'drop'], [150, 220, 'verse']], [0, 100]);
    for (const longerBreaks of [false, true]) {
      const track = buildTrack(tl, { ...options, longerBreaks });
      const recovery = track.rideBlocks.find((b) => b.phase === 'recover' && b.t0 <= 100 && b.t1 >= 100)!;
      expect(recovery.t1 - recovery.t0).toBeGreaterThanOrEqual(longerBreaks ? 60 : 45);
      expect(effortAt(track, 110, 'pro')).toMatchObject({ phase: 'recover', countdown: null, floorFtp: 0, ergFtp: 0.5, gradePct: 0.5 });
      expect(track.stunts.some((s) => s.kind === 'launch' && s.t0 === 110)).toBe(false);
    }
  });

  it('limits sprint duration, rejects closely spaced drops and rests in music without detected breaks', () => {
    const tl = rideTimeline([[0, 40, 'verse'], [40, 60, 'drop'], [60, 65, 'verse'], [65, 85, 'drop'], [85, 300, 'verse']]);
    for (const d of Object.values(DIFF)) {
      const ride = planRide(tl, d);
      const sprints = ride.filter((b) => b.phase === 'sprint');
      expect(sprints.map((b) => b.t0)).toEqual([40]);
      expect(sprints[0].t1 - sprints[0].t0).toBeLessThanOrEqual(d.sprintS);
      expect(ride.some((b) => b.phase === 'recover' && b.t1 - b.t0 >= 30)).toBe(true);
    }
  });

  it('still launches a short drop without banking into the following recovery', () => {
    const track = buildTrack(rideTimeline([[0, 40, 'verse'], [40, 44, 'drop'], [44, 100, 'verse']]), options);
    expect(track.rideBlocks.find((b) => b.phase === 'sprint')).toMatchObject({ t0: 40, t1: 44 });
    expect(track.stunts.find((s) => s.kind === 'launch')).toMatchObject({ t0: 40, t1: 42.6 });
    expect(Math.sin(track.roll[Math.round(45 * track.hz)])).toBeCloseTo(0, 5);
  });

  it('keeps the committed recovery and played instructions when streaming analysis changes', () => {
    const old = buildTrack(rideTimeline([[0, 60, 'verse'], [60, 100, 'break'], [100, 180, 'verse']]), options);
    const next = buildTrack(rideTimeline([[0, 40, 'build'], [40, 90, 'drop'], [90, 180, 'build']]), options);
    const extended = extendTrack(old, next, 75);
    for (const p of [1, 40, 61, 74, 80, 99]) expect(effortAt(extended, p, 'pro')).toEqual(effortAt(old, p, 'pro'));
    expect(extended.rideBlocks.every((b, i, xs) => i === 0 || b.t0 === xs[i - 1].t1)).toBe(true);
  });
});

it('coaching ignores brief deviations and boundary chatter, then directs sustained under/over effort', () => {
  let state = freshCoaching();
  state = advanceCoaching(state, 'harder', 0.8);
  expect(state.direction).toBeNull();
  state = advanceCoaching(state, null, 0.1);
  state = advanceCoaching(state, 'harder', 1.6);
  expect(state.direction).toBe('harder');
  state = advanceCoaching(state, null, 0.3);
  expect(state.direction).toBe('harder');
  state = advanceCoaching(state, null, 0.3);
  expect(state.direction).toBeNull();
  expect(advanceCoaching(state, 'easier', 1.6).direction).toBe('easier');
});
