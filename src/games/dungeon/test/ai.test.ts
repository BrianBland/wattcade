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

describe('hero does not wedge in corridors', () => {
  it('rarely stands still while it has a path and nothing to fight or pick up', async () => {
    const { createGameSession, testProfile, NullInput } = await import('../../../core');
    const { module } = await import('../index');
    const s = createGameSession({ game: module, profile: testProfile(), input: new NullInput(), fake: { script: 'z2' }, seed: 11, simOpts: { autopilot: true, skipCamp: true, invulnerable: true } });
    let px = NaN, py = NaN, had = false, goal = 0, stuck = 0;
    for (let sec = 0; sec < 240; sec++) {
      s.step(30);
      const sn = s.sim.snapshot() as any, p = sn.player;
      const calm = !sn.enemies.some((e: any) => Math.hypot(e.x - p.x, e.y - p.y) < 6) && !sn.drops.some((d: any) => Math.hypot(d.x - p.x, d.y - p.y) < 6);
      if (had && calm && sn.phase === 'run') { goal++; if (Math.hypot(p.x - px, p.y - py) < 0.5) stuck++; }
      px = p.x; py = p.y; had = sn.ai.path.length > 0;
    }
    expect(goal).toBeGreaterThan(30);
    expect(stuck / goal).toBeLessThan(0.05); // was ~26% when a body grazing a wall could wedge
  });
});
