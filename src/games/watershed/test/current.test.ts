import { describe, expect, it } from 'vitest';
import { DEFAULT_WATER, Water } from '../sim/water';
import { makeTerrain, NX } from '../sim/terrain';

function rng(seed: number) { let s = seed >>> 0; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; }

/** Columns at row `row` holding water, grouped into runs. */
function wetRuns(w: Float32Array, row: number): Array<[number, number]> {
  const out: Array<[number, number]> = [];
  for (let i = 0; i < NX; i++) if (w[row * NX + i] > 0.15) { const last = out[out.length - 1]; if (last && i <= last[1] + 2) last[1] = i; else out.push([i, i]); }
  return out;
}

describe('watershed current marker', () => {
  // seed 1's first ridge has saddles at x ≈ 23, 51, 72; a spring in the middle crosses at the middle one
  it('pulling at the first ridge steers a centred spring through the far-left saddle', () => {
    const t = makeTerrain(7919), w = new Water(t, rng(1));
    w.settle(DEFAULT_WATER);
    const left = t.saddles.filter((s) => s.ridge === t.ridges[0]).reduce((a, s) => (s.x < a.x ? s : a));
    for (let k = 0; k < 100 * 30; k++) {
      w.step(1 / 30, { flow: 13, dropVol: 0.6, speed: 2, sourceX: NX / 2, spread: 1, erodeMul: 1.6,
        pull: { x: left.x, y: t.ridges[0] - 4, r: 8, reach: 30, k: 3, max: 10 } }, DEFAULT_WATER);
    }
    const runs = wetRuns(w.w, t.ridges[0] + 3);
    expect(runs.some(([a, b]) => a <= left.x + 3 && b >= left.x - 3)).toBe(true);
    expect(runs.every(([a]) => a < left.x + 10)).toBe(true);   // and only there
  }, 60000);
});
