import * as T from 'three';
import { LAP, type Course } from '../sim/track';

// Carry the baked bank all the way into the infield and the outside berm.
// A level floor across the oval slices through the low shoulder on both turns.
export function bowlField(root: T.Group, course: Course, width: number, grit: T.Texture) {
  const pos: number[] = [],
    uv: number[] = [],
    colors: number[] = [],
    indices: number[] = [];
  const soil = new T.Color('#94735a'),
    grass = new T.Color('#645e47'),
    shade = new T.Color();
  function vertex(x: number, y: number, z: number, blend: number) {
    pos.push(x, y, z);
    uv.push(x / 8, z / 8);
    shade.copy(soil).lerp(grass, blend);
    colors.push(shade.r, shade.g, shade.b);
  }
  const count = 270;
  for (let i = 0; i <= count; i++) {
    const at = (LAP * i) / count;
    for (const side of [-11, -3.7, -width, width, width + 1.45]) {
      const p = course.world(at, side);
      vertex(p.x, side === -11 ? -1.8 : p.y - 0.08, p.z, side === -11 ? 0.88 : 0.15);
    }
    vertex(115, -1.1, 0, 1);
    if (i === count) continue;
    for (const j of [0, 1, 3, 4]) {
      const k = i * 6 + j;
      indices.push(k, k + 1, k + 7, k, k + 7, k + 6);
    }
  }
  const g = new T.BufferGeometry();
  g.setAttribute('position', new T.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new T.Float32BufferAttribute(uv, 2));
  g.setAttribute('color', new T.Float32BufferAttribute(colors, 3));
  g.setIndex(indices);
  g.computeVertexNormals();
  grit.wrapS = grit.wrapT = T.RepeatWrapping;
  const field = new T.Mesh(
    g,
    new T.MeshStandardMaterial({ map: grit, vertexColors: true, side: T.DoubleSide, roughness: 1 }),
  );
  field.receiveShadow = true;
  root.add(field);
  return field;
}
