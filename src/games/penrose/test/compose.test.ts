import { describe, expect, it } from 'vitest';
import { install } from '../engine/compose';

// the composer's planner is pure: give it the one helper it needs from the engine scope
const mulberry = (a: number) => () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
const scope: Record<string, any> = { mulberry };
install(scope);
const BEATS = scope.BEATS as Record<string, { keys: number; cam?: boolean; dz: number }>;
type Plan = { beats: Array<{ kind: string; dir: string; z: number }>; yaw: number; cam: boolean; sizes: number[][]; name: string };
const plans = Array.from({ length: 300 }, (_, i) => scope.composePlan(i + 1) as Plan | null).filter((p): p is Plan => !!p);

describe('penrose beat composer plans', () => {
  it('is deterministic per seed', () => {
    expect(JSON.stringify(scope.composePlan(42))).toBe(JSON.stringify(scope.composePlan(42)));
  });
  it('plans most seeds, each with 3 to 5 beats of at least 3 kinds', () => {
    expect(plans.length).toBeGreaterThan(200);
    for (const p of plans) { expect(p.beats.length).toBeGreaterThanOrEqual(3); expect(p.beats.length).toBeLessThanOrEqual(5); expect(new Set(p.beats.map((b) => b.kind)).size).toBeGreaterThanOrEqual(3); }
  });
  it('never needs more than the four face buttons, and never repeats a beat back to back', () => {
    for (const p of plans) {
      const keys = p.beats.reduce((n, b) => n + BEATS[b.kind].keys, 0) + (p.cam ? 1 : 0);
      expect(keys).toBeLessThanOrEqual(4);
      p.beats.forEach((b, i) => { if (i) expect(b.kind).not.toBe(p.beats[i - 1].kind); });
    }
  });
  it('keeps heights in range, runs every curtain and camera join the way that keeps them clear of the loops', () => {
    for (const p of plans) {
      let z = p.beats[0].z;
      for (const b of p.beats) { expect(b.z).toBe(z); z += BEATS[b.kind].dz; expect(z).toBeGreaterThanOrEqual(0); expect(z).toBeLessThanOrEqual(4); }
      for (const b of p.beats) {
        if (b.kind === 'curtain') expect(b.dir).toBe(p.yaw === 90 ? 'e' : 's');
        if (b.kind === 'camjoin' && p.yaw === 90) expect(b.dir).toBe('e');
      }
      expect(p.sizes.length).toBe(p.beats.length + 1);
    }
  });
  it('mixes its beats across seeds', () => {
    const count: Record<string, number> = {};
    for (const p of plans) for (const b of p.beats) count[b.kind] = (count[b.kind] || 0) + 1;
    for (const k of Object.keys(BEATS)) expect(count[k]).toBeGreaterThan(plans.length * .15);
  });
});
