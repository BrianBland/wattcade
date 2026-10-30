import { describe, expect, it } from 'vitest';
import { chunky, LookDirector, mixLook, resolveLook } from '../render/looks';
import { PerfGovernor, pixelSetting } from '../render/perf';

describe('looks and the dream dial', () => {
  it('blends two presets parameter by parameter', () => {
    const a = resolveLook('morning'), b = resolveLook('lava');
    expect(mixLook(a, b, 0).post.bloom).toBeCloseTo(a.post.bloom, 9);
    expect(mixLook(a, b, 1).post.bloom).toBeCloseTo(b.post.bloom, 9);
    expect(mixLook(a, b, 0.5).post.bloom).toBeCloseTo((a.post.bloom + b.post.bloom) / 2, 9);
    expect(mixLook(a, b, 1).post.ink.getHex()).toBe(b.post.ink.getHex());
  });

  it('blends posterize in from off without passing through a fraction of a level (a black screen)', () => {
    const a = resolveLook('morning'), b = resolveLook('fever');
    expect(mixLook(a, b, 0).post.posterize).toBe(0);
    expect(mixLook(a, b, 1).post.posterize).toBe(b.post.posterize);
    for (let t = 0.01; t < 1; t += 0.01) expect(mixLook(a, b, t).post.posterize).toBeGreaterThanOrEqual(b.post.posterize);
    expect(mixLook(b, a, 1).post.posterize).toBe(0);
  });

  it('never switches hard between scenes: every frame moves each parameter only a little', () => {
    const d = new LookDirector('morning', 6);
    let prev = d.step(0);
    const jumps: number[] = [];
    d.set('lava');
    for (let i = 0; i < 60 * 8; i++) {
      if (i === 120) d.set('jungle'); // a new scene mid-blend restarts from wherever the look is now
      const cur = d.step(1 / 60);
      for (const k of ['outline', 'grade', 'saturation', 'bloom', 'threshold', 'halation', 'dream'] as const) jumps.push(Math.abs(cur.post[k] - prev.post[k]));
      prev = cur;
    }
    expect(Math.max(...jumps)).toBeLessThan(0.02);
    expect(prev.post.bloom).toBeCloseTo(resolveLook('jungle').post.bloom, 3);
  });

  it('eases the dream dial toward the story value at a limited rate', () => {
    const d = new LookDirector('morning', 1, 0.1);
    d.set('morning', 0.9);
    d.step(1);
    expect(d.current.post.dream).toBeCloseTo(0.18 + 0.1, 6);
    for (let i = 0; i < 20; i++) d.step(1);
    expect(d.current.post.dream).toBeCloseTo(0.9, 6);
  });

  it('applies the chunky-pixel level on top of any look', () => {
    const d = new LookDirector('midday');
    d.pixelLevel = 2;
    expect(d.step(0.016).post.pixel).toBe(3);
    expect(chunky(resolveLook('raw').post, 0).pixel).toBe(1);
    expect(chunky(resolveLook('raw').post, 1)).toMatchObject({ pixel: 2, posterize: 24 });
  });
});

describe('perf governor', () => {
  const run = (g: PerfGovernor, fps: number, s: number) => { for (let t = 0; t < s; t += 1 / fps) g.sample(1 / fps); };
  it('falls back to chunky pixels when the frame rate stays under 40 fps', () => {
    const g = new PerfGovernor();
    run(g, 60, 10); expect(g.level).toBe(0);
    run(g, 35, 1.5); expect(g.level).toBe(0); // a short dip is fine
    run(g, 32, 6); expect(g.level).toBe(1);
    run(g, 32, 8); expect(g.level).toBe(2);
    run(g, 32, 8); expect(g.level).toBe(2);
  });
  it('ignores the warm-up and hidden-tab gaps', () => {
    const g = new PerfGovernor();
    run(g, 20, 2.5); g.sample(3); expect(g.level).toBe(0);
  });
  it('steps back up only after a long fast stretch, and stops flip-flopping', () => {
    const g = new PerfGovernor();
    run(g, 30, 8); expect(g.level).toBe(1);
    run(g, 60, 20); expect(g.level).toBe(1);
    run(g, 60, 20); expect(g.level).toBe(0);
    run(g, 30, 8); expect(g.level).toBe(1); // right after stepping up: locked down from now on
    run(g, 60, 120); expect(g.level).toBe(1);
  });
  it('reads the user setting from the save', () => {
    expect(pixelSetting({ pixelLook: 'on' })).toBe('on');
    expect(pixelSetting(undefined)).toBe('auto');
  });
});
