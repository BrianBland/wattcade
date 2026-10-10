import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { buildBike, buildHorse, buildSegway, Crowd, ik2, lookFor } from '../render/chars';

const calls = (o: THREE.Object3D) => { let n = 0; o.traverse((q) => { if ((q as THREE.Mesh).isMesh || (q as THREE.LineSegments).isLineSegments) n++; }); return n; };
describe('procedural characters', () => {
  it('2-bone IK lands the foot on the target', () => {
    for (const [dy, dz] of [[-0.6, 0.3], [-0.75, -0.1], [-0.5, 0.45]]) {
      const [a, b] = ik2(dy, dz, 0.42, 0.42);
      const ky = -Math.cos(a) * 0.42, kz = -Math.sin(a) * 0.42;
      const fy = ky - Math.cos(a + b) * 0.42, fz = kz - Math.sin(a + b) * 0.42;
      expect(Math.hypot(fy - dy, fz - dz)).toBeLessThan(1e-3);
      expect(kz).toBeGreaterThan(Math.min(0, dz) - 0.3); // knee bends forward-ish
    }
  });
  it('every bike type builds with its own silhouette; draw calls stay small', () => {
    const sizes = new Set<string>();
    for (const k of ['city', 'fixie', 'bmx', 'cargo', 'tandem', 'ebike']) {
      const b = buildBike(k);
      expect(b.wheels).toHaveLength(2); expect(b.cranks.length).toBe(k === 'tandem' ? 2 : 1);
      const bb = new THREE.Box3().setFromObject(b.root); sizes.add(`${bb.getSize(new THREE.Vector3()).z.toFixed(2)}:${b.wheelR.join()}`);
      expect(calls(b.root)).toBeLessThanOrEqual(k === 'tandem' ? 7 : 6); // frame+ink, 2 wheels, crank(s), bars
      expect(calls(buildBike(k, undefined, true).root)).toBeLessThanOrEqual(2); // parked: fully baked
    }
    expect(sizes.size).toBeGreaterThanOrEqual(4);
    expect(calls(buildSegway().root)).toBeLessThanOrEqual(4); expect(calls(buildHorse().root)).toBeLessThanOrEqual(22);
  });
  it('the whole crowd is a fixed number of instanced draw calls', () => {
    const c = new Crowd(32);
    c.begin(); for (let i = 0; i < 30; i++) c.add(new THREE.Matrix4().makeTranslation(i, 0.9, 0), lookFor(i, i % 7 === 0 ? 'segway' : undefined), { kind: i % 2 ? 'walk' : 'flail', t: i, phase: i });
    c.end();
    expect(c.drawCalls).toBeLessThanOrEqual(40);
    expect(lookFor(3)).not.toEqual(lookFor(4));
  });
});
describe('lock-on reticle', () => {
  it('snaps in with a small overshoot and settles at 1', async () => {
    const { acquireEase } = await import('../render/reticle');
    expect(acquireEase(0)).toBeCloseTo(0, 5); expect(acquireEase(1)).toBeCloseTo(1, 5);
    const mid = [0.1, 0.15, 0.2, 0.25].map((t) => acquireEase(t)); expect(Math.max(...mid)).toBeGreaterThan(1);
  });
});
