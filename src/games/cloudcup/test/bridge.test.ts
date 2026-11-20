import { expect, it } from 'vitest';
import { deck, FORK, JOIN, LAND, LIP, missing } from '../sim/deck';
import { courses } from '../sim/track';

it.each(courses)(
  '$name keeps both edges of the service bridge running forward through the fork and merge',
  (course) => {
    const { world, track } = course;
    // Match the two-unit mesh tessellation. Consecutive cross-sections must
    // not reverse, cross each other or jump sideways across the track.
    for (let at = FORK; at < JOIN; at += 2) {
      const heading = track(at + 1).yaw;
      for (const edge of ['lo', 'hi'] as const) {
        const a = world(at, deck(at, false)[edge]);
        const b = world(at + 2, deck(at + 2, false)[edge]);
        const dx = b.x - a.x,
          dz = b.z - a.z;
        expect(dx * Math.sin(heading) - dz * Math.cos(heading), 'forward travel at ' + at).toBeGreaterThan(
          0.75,
        );
        expect(Math.hypot(dx, dz), 'edge spacing at ' + at).toBeLessThan(3.3);
      }
      expect(missing(at, false)).toBe(false);
      expect(missing(at, true)).toBe(at >= LIP && at < LAND);
    }
  },
);
