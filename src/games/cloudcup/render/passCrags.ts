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
    const count = Math.ceil((b - a) / 3);
    for (let i = 0; i <= count; i++) {
      const t = i / count,
        d = a + (b - a) * t;
      const taper = Math.sin(Math.PI * t) ** 0.55,
        edge = Math.sin(i * 0.47) * 0.5;
      const rise = (height + 3 * Math.sin(i * 0.54) + 2.3 * Math.cos(i * 0.87)) * taper;
      for (const [j, [across, fraction]] of [
        [2.35, 0],
        [2.7, 0.39],
        [3.06, 0.8],
        [3.92, 1],
        [5.1, 0.86],
        [6.3, 0],
      ].entries()) {
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
          .lerp(frost, j === 3 ? 0.88 : j === 4 ? 0.5 : 0.1)
          .multiplyScalar(0.82 + 0.16 * Math.sin(i * 1.42 + j * 0.7));
        color.push(shade.r, shade.g, shade.b);
        if (i < count && j < 5) {
          const k = offset + i * 6 + j;
          indices.push(k, k + 1, k + 7, k, k + 7, k + 6);
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
  root.add(
    new T.Mesh(
      g,
      new T.MeshStandardMaterial({
        map,
        vertexColors: true,
        flatShading: true,
        side: T.DoubleSide,
        roughness: 0.92,
      }),
    ),
  );
}
