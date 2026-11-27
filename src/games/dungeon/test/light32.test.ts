import { describe, expect, it } from 'vitest';
import { lineOfSight, losAt, shade, surfaceAt, LIGHT_SCALE, type LightGrid } from '../render/light32';

// 9x7 room split by a wall column at x=4 (rows 1..5), outer walls all round
const rows = ['#########', '#...#...#', '#...#...#', '#...#...#', '#...#...#', '#.......#', '#########'];
const grid: LightGrid = { w: 9, h: 7, wall: (x, y) => rows[y]?.[x] !== '.' };
describe('pixel lighting', () => {
  it('walls block light; open floor around a corner is reached', () => {
    const l = lineOfSight(grid, 2, 2, 6);
    expect(losAt(l, 3, 2)).toBe(true);
    expect(losAt(l, 6, 2)).toBe(false);   // behind the dividing wall
    expect(losAt(lineOfSight(grid, 1, 5, 7), 7, 5)).toBe(true);   // along the open bottom row, past the divider
  });
  it('a wall face is lit only by a light standing in front of it', () => {
    expect(losAt(lineOfSight(grid, 2, 3, 6), 2, 0)).toBe(true);   // top wall face, light below it
    const above = lineOfSight(grid, 5, 5, 6);
    expect(losAt(above, 5, 6)).toBe(false);                       // bottom wall: light is above its face
  });
  it('wall-face pixels rising into the tile above use the face below', () => {
    expect(surfaceAt(grid, 2 * 32 + 5, 0 * 32 + 30, 32, 16)).toEqual({ tx: 2, ty: 0, top: false });
    expect(surfaceAt(grid, 4 * 32 + 5, 1 * 32 + 5, 32, 16).top).toBe(true);
  });
  it('shading is brighter near a light and never black under ambient', () => {
    const W = 9 * 32, H = 7 * 32, out = new Uint8ClampedArray(Math.ceil(W / 2) * Math.ceil(H / 2) * 4);
    const light = { x: 2.5 * 32, y: 2.5 * 32, r: 120, c: [255, 200, 140] as const, i: 1 };
    shade({ grid, ts: 32, rise: 16, ox: 0, oy: 0, W, H, amb: [0.5, 0.5, 0.5], lights: [{ ...light, los: lineOfSight(grid, 2, 2, 4) }] }, out);
    const at = (x: number, y: number) => out[((y >> 1) * Math.ceil(W / 2) + (x >> 1)) * 4];
    expect(at(80, 80)).toBeGreaterThan(at(6.5 * 32, 2.5 * 32));
    expect(at(6.5 * 32, 2.5 * 32)).toBeGreaterThan(0.3 * 255 / LIGHT_SCALE);
  });
});
