import * as T from 'three';
import type { Course } from '../sim/track';
import type { VenueArt } from './venueTextures';

// Each panel belongs to a roadside machine: the lifting magnet, the flue
// cleanout and an oil-filled transformer at the fork demonstration.
export function districtRelic(root: T.Group, course: Course, id: number, art: VenueArt) {
  const kiln = id === 1,
    storm = id === 2;
  const at = kiln ? 377 : storm ? 77 : 78,
    side = kiln ? 2.85 : storm ? 2.45 : -2.7;
  const p = course.world(at, side, 0);
  const rig = new T.Group();
  rig.position.set(p.x, p.y, p.z);
  rig.rotation.y = -p.yaw + (side > 0 ? -0.16 : 0.16);
  root.add(rig);
  const metal = new T.MeshStandardMaterial({
    color: kiln ? '#775049' : storm ? '#394953' : '#534932',
    roughness: 0.66,
    metalness: 0.38,
  });
  const trim = new T.MeshStandardMaterial({
    color: kiln ? '#b78559' : storm ? '#9bb9c3' : '#c69e4e',
    roughness: 0.52,
    metalness: 0.35,
  });
  const lamp = new T.MeshBasicMaterial({ color: storm ? '#a4e8dc' : '#ffbd70' });
  const map = art(kiln ? 'kiln-mural' : storm ? 'heron-glass' : 'magnet-enamel');
  const enamel = new T.MeshStandardMaterial({
    map,
    roughness: kiln ? 0.66 : 0.38,
    metalness: storm ? 0.32 : 0.12,
    emissiveMap: map,
    emissive: 0xffffff,
    emissiveIntensity: storm ? 0.54 : 0.23,
  });
  const box = new T.BoxGeometry(),
    round = new T.CylinderGeometry(0.5, 0.5, 1, 16);
  function part(
    material: T.Material,
    g: T.BufferGeometry,
    x: number,
    y: number,
    z: number,
    w: number,
    h: number,
    l: number,
  ) {
    const m = new T.Mesh(g, material);
    m.position.set(x, y, z);
    m.scale.set(w, h, l);
    rig.add(m);
    return m;
  }
  if (storm) {
    part(metal, box, 0, -0.65, -1, 5.8, 0.65, 4.7);
    part(metal, box, -side * 1.48, -1.2, -1, 7.6, 0.48, 1.3);
    part(metal, box, 0, 2.5, -0.8, 4.55, 5.7, 2.55);
    for (const x of [-1.55, 0, 1.55]) {
      part(trim, round, x, 6.2, -1, 0.32, 2, 0.32);
      for (let j = 0; j < 4; j++)
        part(trim, round, x, 5.65 + j * 0.3, -1, 0.85 - j * 0.09, 0.16, 0.85 - j * 0.09);
    }
    part(lamp, box, 0, 5.31, 0.6, 4.1, 0.11, 0.18);
  } else if (kiln) {
    part(metal, box, 0, 0.8, -1, 6.8, 13.5, 4.2);
    part(trim, box, 0, 7.5, -1, 7.1, 0.48, 4.55);
    // A louvred vent over the tiles throws a band of amber on the coping.
    part(lamp, box, 0, 6.45, 1.15, 5.6, 0.75, 0.12);
    for (const x of [-2.4, -1.2, 0, 1.2, 2.4]) part(metal, box, x, 6.45, 1.28, 0.18, 0.88, 0.18);
  } else {
    part(metal, box, -1, 1, -1, 3.9, 10, 3.2);
    part(trim, box, 0.8, 6.05, -1, 8.2, 0.8, 2.7);
    for (const x of [3.05, 4.15]) part(metal, round, x, 4.65, -1, 0.12, 2.3, 0.12);
    part(trim, round, 3.6, 3.1, -1, 3.05, 1.0, 3.05);
    part(metal, round, 3.6, 2.61, -1, 3.25, 0.25, 3.25);
  }
  const x = id === 0 ? -1 : 0,
    z = kiln ? 1.15 : storm ? 0.53 : 0.65,
    w = kiln ? 4.4 : 3.25,
    h = kiln ? 6.5 : 4.9,
    y = kiln ? 2.6 : 2.65;
  part(trim, box, x, y, z, w + 0.22, h + 0.2, 0.18);
  part(enamel, new T.PlaneGeometry(), x, y, z + 0.11, w, h, 1);
}
