import { describe, expect, it } from 'vitest';
import { clearLine, findPath } from '../sim/ai';

const grid = (rows: string[]) => ({ w: rows[0].length, h: rows.length, solid: (x: number, y: number) => x < 0 || y < 0 || y >= rows.length || x >= rows[0].length || rows[y][x] === '#' });

describe('hero pathfinding', () => {
  it('moves diagonally: raw path takes diagonal steps, smoothed path is one straight leg in the open', () => {
    const g = grid(['........', '........', '........', '........', '........', '........']);
    const raw = findPath(g.w, g.h, g.solid, 0, 0, 5, 5, { smooth: false });
    expect(raw).toHaveLength(5); // 5 diagonal steps, not 10 orthogonal ones
    expect(findPath(g.w, g.h, g.solid, 0, 0, 5, 5)).toEqual([{ x: 5.5, y: 5.5 }]);
  });
  it('never cuts a wall corner', () => {
    const g = grid(['..', '#.']); // stepping (0,0)->(1,1) would clip the wall at (0,1)
    const raw = findPath(g.w, g.h, g.solid, 0, 0, 1, 1, { smooth: false });
    expect(raw).toEqual([{ x: 1.5, y: 0.5 }, { x: 1.5, y: 1.5 }]);
  });
  it('string-pulls around obstacles without crossing walls, deterministically', () => {
    const g = grid(['..........', '..........', '....##....', '....##....', '....##....', '..........']);
    const a = findPath(g.w, g.h, g.solid, 1, 3, 8, 3), b = findPath(g.w, g.h, g.solid, 1, 3, 8, 3);
    expect(a).toEqual(b);
    expect(a.length).toBeLessThanOrEqual(3);
    let px = 1.5, py = 3.5;
    for (const q of a) { expect(clearLine(g.solid, px, py, q.x, q.y)).toBe(true); px = q.x; py = q.y; }
    expect(a[a.length - 1]).toEqual({ x: 8.5, y: 3.5 });
  });
  it('returns [] when unreachable', () => {
    const g = grid(['..#..', '..#..', '..#..']);
    expect(findPath(g.w, g.h, g.solid, 0, 0, 4, 0)).toEqual([]);
  });
});
