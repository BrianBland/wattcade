import * as T from 'three';
import { courses, winchCut, LAP } from '../sim/track';
import { valley, saddle } from '../sim/pass';

// Schist cuttings rise above the carriage road. At a switchback the *other*
// leg can lie under the same ridge, so check both measured roads for clearance.
export function addPassCrags(root: T.Group, map: T.Texture, bed: (x: number, z: number) => number) {
  const road = courses[4],
    lines = [];
  for (let d = 0; d < LAP; d += 3) lines.push(road.track(d));
  for (let d = valley; d <= saddle; d += 3) lines.push(winchCut.track(d));
  const xyz: number[] = [],
    uv: number[] = [],
    color: number[] = [],
    indices: number[] = [];
  const shade = new T.Color(),
    strata = new T.Color('#9da4a5'),
    frost = new T.Color('#c8cbb8');
  for (const [a, b, side, height] of [
    [138, 317, -1, 18],
    [516, 620, -1, 14],
    [690, 840, 1, 21],
  ]) {
    const offset = xyz.length / 3;
    const count = Math.ceil((b - a) / 1.15);
    // Recessed joints undercut each shelf. Broad changes in strike interrupt
    // the bedding, while short fissures catch the sun as the road bends.
    const section = [
      [2.16, 0, 0.65],
      [2.39, 0.13, 0.76],
      [2.53, 0.24, 0.87],
      [2.68, 0.29, 0.52],
      [2.57, 0.33, 0.72],
      [2.61, 0.43, 1.03],
      [2.87, 0.47, 0.55],
      [2.78, 0.52, 0.72],
      [2.91, 0.64, 1.04],
      [3.15, 0.69, 0.54],
      [3.02, 0.73, 0.82],
      [3.17, 0.83, 1.04],
      [3.43, 0.86, 0.62],
      [3.36, 0.91, 0.83],
      [3.79, 1, 1.05],
      [4.55, 0.98, 1],
      [5.27, 0.8, 0.84],
      [6.3, 0, 0.64],
    ];
    for (let i = 0; i <= count; i++) {
      const t = i / count,
        d = a + (b - a) * t;
      const taper = Math.sin(Math.PI * t) ** 0.6;
      const fault = Math.sin(d * 0.078) + 0.53 * Math.sin(d * 0.219 + 1.07);
      const joint = Math.max(0, 1 - Math.abs(Math.sin(d * 0.181 + Math.sin(d * 0.085))) * 4);
      const edge = 0.32 * fault + 0.14 * joint;
      const rise = (height + 3.1 * fault + 1.36 * Math.sin(d * 0.51) - 1.4 * joint) * taper;
      for (const [j, [nominal, level, light]] of section.entries()) {
        const grain = 0.085 * Math.sin(d * 0.84 + j * 0.43) + 0.044 * Math.sin(d * 1.27 + j * 0.91);
        const across = nominal + grain + joint * 0.26;
        const fraction = level + Math.sin(Math.PI * level) * 0.057 * Math.sin(d * 0.126 + j * 0.24);
        const p = road.world(d, side * (across + edge), 0);
        let y = bed(p.x, p.z) - 1.5 + fraction * (rise + 6 * taper);
        for (const lane of lines) {
          const gap = Math.hypot(p.x - lane.x, p.z - lane.z);
          if (gap < 14) y = Math.min(y, lane.y - 2 + Math.max(0, gap - 8) * 3.0);
        }
        xyz.push(p.x, y, p.z);
        uv.push(d / 12, (y + across * 0.9) / 9);
        shade
          .copy(strata)
          .lerp(frost, j >= 14 ? 0.58 : 0.11)
          .multiplyScalar(light * (0.94 + 0.09 * Math.sin(d * 0.42 + j * 0.3)));
        color.push(shade.r, shade.g, shade.b);
        if (i < count && j < section.length - 1) {
          const k = offset + i * section.length + j;
          if (side > 0)
            indices.push(k, k + section.length, k + 1, k + 1, k + section.length, k + section.length + 1);
          else indices.push(k, k + 1, k + section.length, k + 1, k + section.length + 1, k + section.length);
        }
      }
    }
  }
  map.wrapS = map.wrapT = T.RepeatWrapping;
  const g = new T.BufferGeometry();
  g.setAttribute('position', new T.Float32BufferAttribute(xyz, 3));
  g.setAttribute('uv', new T.Float32BufferAttribute(uv, 2));
  g.setAttribute('color', new T.Float32BufferAttribute(color, 3));
  g.setIndex(indices);
  g.computeVertexNormals();
  const wall = new T.Mesh(
    g,
    new T.MeshStandardMaterial({
      map,
      bumpMap: map,
      bumpScale: 0.83,
      vertexColors: true,
      side: T.DoubleSide,
      roughness: 0.86,
    }),
  );
  wall.castShadow = true;
  wall.receiveShadow = true;
  root.add(wall);
}
