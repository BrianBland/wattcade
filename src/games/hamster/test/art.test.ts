import { describe, expect, it } from 'vitest';
import { ferret, gerbil, guineaPig, treadmill } from '../render/critters';
import { gymStation, type GymKind } from '../render/gym';
import { ferretRun, ferretRunIcon } from '../render/turbine';
import { inventoryArt } from '../render/art';

/** A 2D context stand-in that fails on any non-finite numeric argument. */
function fakeCtx() {
  const bad: string[] = [];
  const grad = { addColorStop() {} };
  const target: Record<string, unknown> = { measureText: () => ({ width: 10 }), createLinearGradient: () => grad, createRadialGradient: () => grad };
  const ctx = new Proxy(target, {
    get(t, k: string) {
      if (k in t) return t[k];
      return (...args: unknown[]) => { if (args.some((a) => typeof a === 'number' && !Number.isFinite(a))) bad.push(k); };
    },
    set(t, k: string, v) { t[k] = v; return true; },
  });
  return { g: ctx as unknown as CanvasRenderingContext2D, bad };
}

describe('workforce art', () => {
  it('draws every critter, gym station and turbine with finite geometry, riding and stopped', () => {
    const { g, bad } = fakeCtx();
    for (const stopped of [false, true]) for (const t of [0, 1.7, 33.3]) {
      gerbil(g, 50, 50, 30, t * 5, { sleep: stopped, hardhat: true, vest: true, sign: 'STRIKE!' }, t);
      guineaPig(g, 50, 50, 30, t * 5, { sleep: stopped, sweatband: true, sign: 'STRIKE!' }, t, 3);
      ferret(g, 50, 50, 30, t * 9, { sleep: stopped }, t);
      treadmill(g, 50, 50, 60, t, stopped);
      for (const k of ['press', 'squat', 'deadlift', 'curl'] as GymKind[]) gymStation(g, 50, 80, 30, k, t, { stopped, phase: 1 });
      for (let k = 0; k < 4; k++) ferretRun(g, -10, 660, 400, 17, t, stopped ? 0 : 1, stopped, k);
      ferretRunIcon(g, t);
    }
    for (let i = 0; i < 6; i++) inventoryArt(g, `gen:${i}`, 0, 0, 56);
    expect(bad).toEqual([]);
  });
});
