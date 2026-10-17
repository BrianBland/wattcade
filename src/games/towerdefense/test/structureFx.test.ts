import { describe, it, expect } from 'vitest';
import { DROP_HEIGHT, FALL_S, HEAD_DELAY_S, SQUASH_S, damageState, dropDone, dropPose, dropsFor, pipFlash } from '../render/structureFx';

describe('tower drops', () => {
  it('a part falls from above, lands at FALL_S (with the boltOn clank), squashes and settles', () => {
    expect(dropPose(0).lift).toBe(DROP_HEIGHT);
    expect(dropPose(FALL_S / 2).lift).toBeGreaterThan(0);
    expect(dropPose(FALL_S).lift).toBe(0);
    expect(dropPose(FALL_S + SQUASH_S / 2).sy).toBeLessThan(0.95);
    expect(dropPose(FALL_S + SQUASH_S).sy).toBeCloseTo(1, 2);
    expect(dropPose(-0.1).visible).toBe(false);
    expect(dropDone(FALL_S + SQUASH_S)).toBe(true);
  });
  it('a build drops everything but the pad (base first, then the head); an upgrade drops only the new level', () => {
    expect(dropsFor({ name: 'pad' }, 1, true).drops).toBe(false);
    expect(dropsFor({ name: 'base' }, 1, true)).toEqual({ drops: true, delay: 0 });
    expect(dropsFor({ name: 'head' }, 1, true)).toEqual({ drops: true, delay: HEAD_DELAY_S });
    expect(dropsFor({ name: 'upgrade_l3', minLevel: 3 }, 3, false).drops).toBe(true);
    expect(dropsFor({ name: 'upgrade_l2', minLevel: 2 }, 3, false).drops).toBe(false);
    expect(dropsFor({ name: 'head' }, 3, false).drops).toBe(false);
    expect(dropsFor({ name: 'upgrade_l2', minLevel: 2 }, 3, false, 1).drops).toBe(true); // two levels in one tick
  });
  it('the new pip flashes briefly', () => {
    expect(pipFlash(0)).toBe(1); expect(pipFlash(0.45)).toBeCloseTo(0.5); expect(pipFlash(1)).toBe(0);
  });
});

describe('base damage states', () => {
  it('escalate with lost HP, matching the outpost decal stages', () => {
    expect(damageState(1)).toEqual({ sparks: false, steam: false, lights: false, stage: 0 });
    expect(damageState(0.7)).toMatchObject({ sparks: true, steam: false, stage: 0 });
    expect(damageState(0.4)).toMatchObject({ sparks: true, steam: true, lights: false, stage: 1 });
    expect(damageState(0.2)).toMatchObject({ sparks: true, steam: true, lights: true, stage: 2 });
  });
});
