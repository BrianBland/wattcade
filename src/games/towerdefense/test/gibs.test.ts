import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { NullInput, createGameSession, testProfile } from '../../../core';
import { module } from '../index';
import type { TdSnapshot } from '../sim/types';
import { buildRig, matrices, pose, type AlienManifest } from '../render/aliens/rig';
import { SPECIES } from '../render/aliens/species';
import { MAX_GIBS, gibAlpha, launchGibs, pickGibs, stepGib } from '../render/aliens/gibs';

const rig = (id: string) => buildRig(JSON.parse(readFileSync(join(process.cwd(), 'public', 'td', 'aliens', id, 'manifest.json'), 'utf8')) as AlienManifest);

describe('gibs', () => {
  it('a heavy throws off 3–6 real limbs, mixing both sides; the same seed picks the same parts', () => {
    const r = rig('warrior');
    for (const n of [3, 4, 5, 6]) {
      const keys = pickGibs(r, 11, n);
      expect(keys).toHaveLength(n);
      for (const k of keys) expect(r.order).toContain(k);
      expect(new Set(keys).size).toBe(n);
    }
    expect(pickGibs(r, 11, 5)).toEqual(pickGibs(r, 11, 5));
    expect(pickGibs(r, 11, 6).some((k) => /^claw/.test(k))).toBe(true);
  });
  it('the boss comes fully apart, capped', () => {
    const r = rig('tyrant'), keys = pickGibs(r, 3, 0, true, 20);
    expect(keys.length).toBe(20);
    expect(keys.some((k) => k.startsWith('scythe'))).toBe(true);
  });
  it('gibs launch from where each part was, outward, then fall, bounce, settle and expire', () => {
    const r = rig('warrior'), s = SPECIES.warrior, keys = pickGibs(r, 5, 5);
    const M = matrices(r, pose(r, s, { phase: 0.3 }));
    const gibs = launchGibs(r, M, keys, 40, 40, -Math.PI / 2, 8.8, 10, 5);
    expect(gibs).toHaveLength(5);
    for (const g of gibs) {
      expect(Math.hypot(g.x - 40, g.y - 40)).toBeLessThan(8.8); // starts on the body
      expect(g.vz).toBeGreaterThan(0);
      const d0 = Math.hypot(g.x - 40, g.y - 40);
      let t = 10, alive = true, peak = 0, landed = false;
      while (alive && t < 13) { t += 1 / 60; alive = stepGib(g, t, 1 / 60); peak = Math.max(peak, g.z); if (g.z === 0 && g.vz === 0) landed = true; }
      expect(peak).toBeGreaterThan(0.3);
      expect(landed).toBe(true);
      expect(alive).toBe(false);
      expect(Math.hypot(g.x - 40, g.y - 40)).toBeGreaterThan(d0); // flew outward
      expect(gibAlpha(g, g.t0 + g.life)).toBeCloseTo(0, 9);
    }
    expect(MAX_GIBS).toBeGreaterThanOrEqual(20);
  });
});

describe('boss intro fx', () => {
  it('the boss arrival emits a bossIntro fx with its wave', () => {
    const s = createGameSession({ game: module, profile: testProfile(), input: new NullInput(), fake: { script: 'sprints' }, seed: 1, simOpts: { autopilot: true, skipGarage: true } });
    let intro: number | null = null;
    for (let i = 0; i < 30 * 60 * 15 && intro == null; i++) {
      s.step(1);
      const f = (s.sim.snapshot() as TdSnapshot).fx.find((x) => x.kind === 'bossIntro');
      if (f && f.kind === 'bossIntro') intro = f.wave;
    }
    expect(intro).not.toBeNull();
    expect(intro! % 5).toBe(0);
  });
});
