import { describe, expect, it } from 'vitest';
import { DIFF, buildTrack, effortAt, extendTrack } from '../sim/track';
import { planRide } from '../sim/ride';
import { advanceCoaching, freshCoaching } from '../sim/coaching';
import { rideTimeline } from './fixtures';
import { synthTimeline } from '../../../media/synth/queue';

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
    expect(effortAt(track, 50, 'pro')).toMatchObject({ countdown: null, phase: 'sprint', instruction: 'Sprint!' });
    const after = effortAt(track, 66, 'pro');
    expect(after).toMatchObject({ phase: 'hold', instruction: 'Ease Off', target: { min: 3, max: 5 } });
    expect(effortAt(track, 71, 'pro').target).toMatchObject({ min: 3, max: 4 });
  });

  it('extends brief breaks, longer on casual', () => {
    const tl = rideTimeline([[0, 60, 'verse'], [60, 65, 'break'], [65, 150, 'build'], [150, 210, 'verse']]);
    expect(planRide(tl, DIFF.pro).find((b) => b.phase === 'recover')).toMatchObject({ t0: 60, t1: 75 });
    expect(planRide(tl, DIFF.casual).find((b) => b.phase === 'recover')).toMatchObject({ t0: 60, t1: 85 });
  });

  it('rests around song handovers but never skips the drop: recovery ends where its countdown lands', () => {
    const tl = rideTimeline([[0, 80, 'verse'], [80, 110, 'build'], [110, 150, 'drop'], [150, 220, 'verse']], [0, 100]);
    for (const difficulty of ['casual', 'pro', 'elite'] as const) {
      const track = buildTrack(tl, { ...options, difficulty });
      const recovery = track.rideBlocks.find((b) => b.phase === 'recover' && b.t0 <= 100 && b.t1 >= 100)!;
      expect(recovery.t1).toBe(110);
      expect(recovery.t1 - recovery.t0).toBeGreaterThanOrEqual(DIFF[difficulty].mixRestS / 2);
      expect(effortAt(track, 108, 'pro')).toMatchObject({ phase: 'recover', countdown: 2, floorFtp: 0, ergFtp: 0.5, gradePct: 0.5 });
      expect(effortAt(track, 110, 'pro')).toMatchObject({ phase: 'sprint', countdown: null });
      expect(track.stunts.some((s) => s.kind === 'launch' && s.t0 === 110)).toBe(true);
    }
  });

  it('casual rests more and sprints less often than elite, but every difficulty keeps sprinting', () => {
    const tl = synthTimeline({ style: 'edm', songs: 3, seed: 1 });
    const rest = (xs: ReturnType<typeof planRide>) => xs.filter((b) => b.phase === 'recover').reduce((t, b) => t + b.t1 - b.t0, 0);
    const casual = planRide(tl, DIFF.casual), elite = planRide(tl, DIFF.elite);
    expect(rest(casual)).toBeGreaterThan(rest(elite));
    const count = (xs: typeof casual) => xs.filter((b) => b.phase === 'sprint').length;
    expect(count(casual)).toBeGreaterThanOrEqual(2);
    expect(count(elite)).toBeGreaterThan(count(casual));
    for (const d of Object.values(DIFF)) expect(planRide(tl, d).every((b) => b.t1 - b.t0 >= 6 || b.phase === 'sprint')).toBe(true);
  });

  it('caps sprint density by difficulty, riding skipped drops as a hold', () => {
    const tl = rideTimeline(Array.from({ length: 12 }, (_, i) => [[i * 50, i * 50 + 30, 'verse'], [i * 50 + 30, i * 50 + 50, 'drop']] as const).flat().map(([a, b, k]) => [a, b, k]));
    for (const d of Object.values(DIFF)) {
      const ride = planRide(tl, d), sprints = ride.filter((b) => b.phase === 'sprint');
      expect(sprints.length).toBeLessThanOrEqual(Math.ceil(600 / d.sprintEveryS));
      expect(ride.some((b) => b.phase === 'hold')).toBe(true);
    }
  });

  it('shows the new band during a transition while still accepting the old one', () => {
    const track = buildTrack(rideTimeline([[0, 60, 'verse'], [60, 100, 'build'], [100, 160, 'verse']]), options);
    const e = effortAt(track, 61, 'pro');
    expect(e).toMatchObject({ phase: 'climb', transition: true, instruction: 'Harder', band: { min: 4, max: 5 }, target: { min: 2, max: 5 } });
  });

  it('retains builds and drops throughout a music set instead of turning most of the ride into rest', () => {
    const tl = synthTimeline({ style: 'edm', songs: 3, seed: 1 });
    const ride = planRide(tl, DIFF.pro);
    const recoveryS = ride.filter((b) => b.phase === 'recover').reduce((t, b) => t + b.t1 - b.t0, 0);
    expect(recoveryS / tl.durationS).toBeLessThan(0.45);
    expect(ride.filter((b) => b.phase === 'climb').length).toBeGreaterThanOrEqual(5);
    const sprints = ride.filter((b) => b.phase === 'sprint');
    expect(sprints.length).toBeGreaterThanOrEqual(3);
    for (let i = 1; i < sprints.length; i++) expect(sprints[i].t0 - sprints[i - 1].t0).toBeGreaterThanOrEqual(DIFF.pro.sprintEveryS);
    expect(ride.filter((b) => b.phase === 'hold').length).toBeGreaterThanOrEqual(5);
  });

  it('keeps a build between breaks and lets a standard ride count down into the next musical drop', () => {
    const tl = rideTimeline([[0, 30, 'verse'], [30, 45, 'break'], [45, 60, 'build'], [60, 75, 'break'], [75, 105, 'drop'], [105, 150, 'verse']]);
    const track = buildTrack(tl, options);
    expect(effortAt(track, 50, 'pro').phase).toBe('climb');
    expect(effortAt(track, 72, 'pro')).toMatchObject({ phase: 'recover', countdown: 3, target: { min: 1, max: 5 } });
    expect(effortAt(track, 75, 'pro').phase).toBe('sprint');
  });

  it('limits sprint duration, rejects closely spaced drops and rests in music without detected breaks', () => {
    const tl = rideTimeline([[0, 40, 'verse'], [40, 60, 'drop'], [60, 65, 'verse'], [65, 85, 'drop'], [85, 300, 'verse']]);
    for (const d of Object.values(DIFF)) {
      const ride = planRide(tl, d);
      const sprints = ride.filter((b) => b.phase === 'sprint');
      expect(sprints.map((b) => b.t0)).toEqual([40]);
      expect(sprints[0].t1 - sprints[0].t0).toBeLessThanOrEqual(d.sprintS);
      expect(ride.some((b) => b.phase === 'recover' && b.t1 - b.t0 >= d.periodicRestS)).toBe(true);
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
