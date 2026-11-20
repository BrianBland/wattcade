import * as T from 'three';
import { expect, it } from 'vitest';
import { buildRails } from '../render/viaduct';
import { deck, forkWidth, LAND, LIP, rises } from '../sim/deck';
import { courses } from '../sim/track';

it('Magnet Mile joins the ramp rail caps along both banked edges and leaves clear air between the decks', () => {
  const course = courses[0];
  const { world } = course;
  const scene = new T.Scene();
  buildRails(scene, course);
  const ray = new T.Raycaster();
  ray.ray.direction.set(0, -1, 0);
  for (let at = LIP - 20.5; at < LAND + 15; at += 1) {
    const { lo, hi } = deck(at, true);
    for (const side of [lo + 0.022, hi - 0.022]) {
      const p = world(at, side, rises(at));
      ray.ray.origin.set(p.x, p.y + 1, p.z);
      const [cap] = ray.intersectObjects(scene.children);
      if (at > LIP && at < LAND) expect(cap, 'clear gap at ' + at).toBeUndefined();
      else {
        expect(cap, 'rail at ' + at).toBeDefined();
        expect(cap.point.y - p.y).toBeCloseTo(0.025 + 0.16 * forkWidth(at), 1);
      }
    }
  }
});
