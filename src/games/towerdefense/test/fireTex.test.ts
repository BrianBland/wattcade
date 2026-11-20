import { describe, expect, it } from 'vitest';
import { FLAME_FRAMES, FLAME_H, FLAME_W, GROUND_S, cells, crustTex, fbm, flameFrame, heatColor, noise, veinTex } from '../render/fireTex';

const alphaAt = (px: Uint8ClampedArray, w: number, x: number, y: number) => px[(y * w + x) * 4 + 3];

describe('painted fire textures', () => {
  it('noise is deterministic and bounded', () => {
    for (let i = 0; i < 200; i++) {
      const x = i * 0.37, y = i * 0.71;
      expect(noise(x, y, 3)).toBe(noise(x, y, 3));
      expect(noise(x, y)).toBeGreaterThanOrEqual(0); expect(noise(x, y)).toBeLessThanOrEqual(1);
      expect(fbm(x, y)).toBeGreaterThanOrEqual(0); expect(fbm(x, y)).toBeLessThanOrEqual(1);
      const [f1, f2] = cells(x, y); expect(f2).toBeGreaterThanOrEqual(f1);
    }
  });
  it('heat ramps from transparent ox-blood to an opaque near-white core', () => {
    expect(heatColor(0)[3]).toBe(0);
    expect(heatColor(1)[3]).toBe(1);
    expect(heatColor(1)[2]).toBeGreaterThan(heatColor(0.5)[2]);
    expect(heatColor(0.3)[0]).toBeGreaterThan(heatColor(0.3)[2]);
  });
  it('a flame frame burns from its base and stays clear of its frame edges', () => {
    const f = flameFrame(0.3, 3);
    expect(f.length).toBe(FLAME_W * FLAME_H * 4);
    expect(alphaAt(f, FLAME_W, FLAME_W / 2, FLAME_H - 6)).toBeGreaterThan(200); // hot foot
    for (let y = 0; y < FLAME_H; y++) { expect(alphaAt(f, FLAME_W, 0, y)).toBe(0); expect(alphaAt(f, FLAME_W, FLAME_W - 1, y)).toBe(0); }
  });
  it('the flame loop is seamless', () => {
    const a = flameFrame(0, 3), b = flameFrame(1 - 1e-9, 3);
    let diff = 0;
    for (let i = 3; i < a.length; i += 4) diff = Math.max(diff, Math.abs(a[i] - b[i]));
    expect(diff).toBeLessThanOrEqual(2);
    expect(FLAME_FRAMES).toBeGreaterThanOrEqual(12);
  });
  it('ground textures are centred blobs with clear corners; veins only glow inside the crust', () => {
    const c = crustTex(7), v = veinTex(7), m = GROUND_S / 2;
    for (const t of [c, v]) for (const [x, y] of [[0, 0], [GROUND_S - 1, 0], [0, GROUND_S - 1], [GROUND_S - 1, GROUND_S - 1]]) expect(alphaAt(t, GROUND_S, x, y)).toBe(0);
    expect(alphaAt(c, GROUND_S, m, m)).toBeGreaterThan(180);
    let glowing = 0, outside = 0;
    for (let y = 0; y < GROUND_S; y++) for (let x = 0; x < GROUND_S; x++) {
      if (alphaAt(v, GROUND_S, x, y) > 40) { glowing++; if (alphaAt(c, GROUND_S, x, y) < 60) outside++; }
    }
    expect(glowing).toBeGreaterThan(200);
    expect(outside / glowing).toBeLessThan(0.05);
  });
});
