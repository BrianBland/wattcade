import { describe, expect, it } from 'vitest';
import { createGameSession, testProfile, TuningRegistry } from '../../../core';
import { InputHub } from '../../../input';
import { synthTimeline } from '../../../media/synth/queue';
import { module } from '../index';
import type { CadenzaSnapshot } from '../sim/sim';

function ride(difficulty = 'pro', tuning = new TuningRegistry({ storage: null }), hub = new InputHub()) {
  const s = createGameSession({ game: module, profile: testProfile(), input: hub, tuningRegistry: tuning,
    media: { timeline: synthTimeline({ style: 'edm', songs: 1, short: true }) }, fake: { script: 'z2' }, simOpts: { difficulty } });
  const pull = (right: number, left = 0) => {
    hub.setControllerState({ buttons: new Set(), paddleL: left, paddleR: right }); s.step(30);
    return (s.sim.snapshot() as CadenzaSnapshot).x;
  };
  return { s, hub, tuning, pull };
}

describe('Cadenza paddle tuning through the hardware input path', () => {
  it('defaults to continuous, linear movement and changes curve/deadzone live', () => {
    const { pull, tuning } = ride();
    expect(pull(50)).toBeCloseTo(35 / 85);
    tuning.set('cadenza.paddleCurve', 'quadratic');
    expect(pull(50)).toBeCloseTo((35 / 85) ** 2);
    tuning.set('cadenza.paddleDeadzone', 50);
    expect(pull(50)).toBe(0);
    tuning.set('cadenza.paddleDeadzone', 0);
    expect(pull(50)).toBeCloseTo(0.25);
    tuning.set('cadenza.paddleCurve', 'linear');
    expect(pull(50)).toBeCloseTo(0.5);
  });

  it('reproduces the old 62% threshold, then responds to a lower switch threshold', () => {
    const { pull, tuning } = ride();
    tuning.set('cadenza.paddleMode', 'stepped'); tuning.set('cadenza.paddleCurve', 'quadratic');
    expect(pull(61)).toBe(0); expect(pull(62)).toBe(1);
    tuning.set('cadenza.paddleSwitchThreshold', 50);
    expect(pull(62)).toBe(0);
    tuning.set('cadenza.paddleSwitchThreshold', 10);
    expect(pull(50)).toBe(1);
    tuning.set('cadenza.paddleMode', 'continuous');
    expect(pull(50)).toBeCloseTo((35 / 85) ** 2);
    tuning.set('cadenza.paddleSwitchThreshold', 90);
    expect(pull(50)).toBeCloseTo((35 / 85) ** 2);
  });

  it('keeps stepped lanes stable near a boundary, requires a fresh threshold on reversal, and centres on release', () => {
    const { pull, tuning } = ride();
    tuning.set('cadenza.paddleDeadzone', 0); tuning.set('cadenza.paddleMode', 'stepped');
    expect(pull(31)).toBe(1); expect(pull(25)).toBe(1);
    expect(pull(0, 25)).toBe(0); expect(pull(0, 31)).toBe(-1);
    expect(pull(0)).toBe(0);
    // Very low thresholds still release before the physical deadzone.
    tuning.set('cadenza.paddleSwitchThreshold', 5);
    expect(pull(6)).toBe(1); expect(pull(1)).toBe(0);
  });

  it('supports all five lanes and preserves stronger-paddle selection', () => {
    const { pull, tuning } = ride('elite');
    tuning.set('cadenza.paddleDeadzone', 0);
    expect(pull(50)).toBe(1); expect(pull(75, 90)).toBeCloseTo(-1.8);
    tuning.set('cadenza.paddleMode', 'stepped');
    expect(pull(64)).toBe(1); expect(pull(66)).toBe(2);
    expect(pull(0)).toBe(0);
  });

  it('persists across sessions per rider without affecting other games or the profile setting', () => {
    const data = new Map<string, string>();
    const storage = { getItem: (k: string) => data.get(k) ?? null, setItem: (k: string, v: string) => { data.set(k, v); }, removeItem: (k: string) => { data.delete(k); } };
    const registry = (profileId: string) => new TuningRegistry({ profileId, storage });
    const a = ride('pro', registry('a'));
    a.tuning.set('cadenza.paddleMode', 'stepped'); a.tuning.set('cadenza.paddleCurve', 'quadratic');
    a.tuning.set('cadenza.paddleDeadzone', 0); a.tuning.set('cadenza.paddleSwitchThreshold', 20);
    const resumed = ride('pro', registry('a'));
    expect(resumed.pull(50)).toBe(1);
    expect(resumed.tuning.get('cadenza.paddleCurve')).toBe('quadratic');
    expect(resumed.tuning.get('cadenza.paddleDeadzone')).toBe(0);
    expect(resumed.tuning.get('cadenza.paddleSwitchThreshold')).toBe(20);
    expect(ride('pro', registry('b')).pull(50)).toBeCloseTo(35 / 85);
    resumed.hub.bindTuning(resumed.tuning, 'hamster');
    resumed.hub.beginTick(1 / 30);
    expect(resumed.hub.state().paddleR).toBeCloseTo((35 / 85) ** 2);
    resumed.hub.bindTuning(resumed.tuning, 'cadenza');
    resumed.hub.applySettings(testProfile().settings); resumed.hub.beginTick(1 / 30);
    expect(resumed.hub.state().paddleR).toBeCloseTo((35 / 85) ** 2);
    expect(testProfile().settings.paddleDeadzone).toBe(15);
  });

  it('applies the same live curve and deadzone to gamepad sticks', () => {
    const { hub, s, tuning } = ride();
    hub.attachGamepad(() => [{ buttons: [], axes: [0, 0, 0.5] }]);
    s.step(30); expect((s.sim.snapshot() as CadenzaSnapshot).x).toBeCloseTo(35 / 85);
    tuning.set('cadenza.paddleCurve', 'quadratic');
    s.step(30); expect((s.sim.snapshot() as CadenzaSnapshot).x).toBeCloseTo((35 / 85) ** 2);
    tuning.set('cadenza.paddleDeadzone', 60);
    s.step(30); expect((s.sim.snapshot() as CadenzaSnapshot).x).toBe(0);
  });
});
