import * as T from 'three';
import { expect, it } from 'vitest';
import { buildKilns } from '../render/kilns';
import { buildSalvage } from '../render/salvage';
import { deck, missing, rises } from '../sim/deck';
import { LAP, courses } from '../sim/track';

it.each(courses)(
  '$name keeps salvage outside the riding envelope on both branches and on adjacent bends',
  (course) => {
    const { world } = course;
    const scene = new T.Scene();
    buildSalvage(scene, new T.Texture(), course);
    if (course === courses[1]) buildKilns(scene, course);
    scene.updateMatrixWorld();
    const sites = scene.children.map((object) => {
      const mesh = object as T.Mesh;
      mesh.geometry.computeBoundingBox();
      return {
        name: mesh.name,
        box: mesh.geometry.boundingBox!,
        inverse: mesh.matrixWorld.clone().invert(),
      };
    });
    const point = new T.Vector3();
    for (let at = 0; at < LAP; at += 1) {
      for (const right of [false, true]) {
        if (missing(at, right)) continue;
        const span = deck(at, right);
        for (const x of [span.lo - 0.1, (span.lo + span.hi) / 2, span.hi + 0.1]) {
          const p = world(at, x, 1 + (right ? rises(at) : 0));
          for (const site of sites) {
            point.set(p.x, p.y, p.z).applyMatrix4(site.inverse);
            if (site.box.containsPoint(point)) throw new Error(site.name + ' overlaps the course at ' + at);
          }
        }
      }
    }
    expect(new Set(sites.map((s) => s.name)).size).toBe(course === courses[1] ? 4 : 3);
  },
);
