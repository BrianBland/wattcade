import { describe, expect, it } from 'vitest';
import { blob, cone, cyl, roundSegs, sphere, torus } from '../render/util';

describe('smooth primitives', () => {
  it('raises round shapes to enough segments, keeps deliberate pyramids and blades', () => {
    expect(cyl(0.04, 0.04, 1, 5).parameters.radialSegments).toBeGreaterThanOrEqual(8);
    expect(cyl(2.1, 2.1, 1, 10).parameters.radialSegments).toBeGreaterThanOrEqual(36);
    expect(cone(1.4, 1.8, 4).parameters.radialSegments).toBe(4);
    expect(cone(0.1, 0.5, 3).parameters.radialSegments).toBe(3);
    expect(sphere(0.5, 6, 5).parameters.widthSegments).toBeGreaterThanOrEqual(16);
    expect(torus(2, 0.05, 3, 24).parameters.tubularSegments).toBeGreaterThanOrEqual(24);
    // a partial wedge gets a proportional share, not a full ring
    expect(cone(2.4, 1.2, 12, 1, true, 0, Math.PI / 6).parameters.radialSegments).toBeLessThanOrEqual(Math.ceil(roundSegs(2.4) / 12) + 1);
  });
  it('blobs are indexed (shared vertices, smooth normals) and cached', () => {
    const g = blob(1, 0.1, 3);
    expect(g.index).not.toBeNull();
    expect(blob(1, 0.1, 3)).toBe(g);
    expect(g.attributes.position.count).toBeGreaterThan(80);
  });
});
