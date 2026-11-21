import * as T from 'three';
import type { Course } from '../sim/track';

// Baked checker insets cross the actual bank at the precise lap boundary.
export function timingLine(root: T.Object3D, course: Course, width: number) {
  const vertices: number[] = [];
  for (let j = 0; j < 2; j++)
    for (let i = 0; i < 22; i++) {
      if ((i + j) % 2) continue;
      const l = ((2 * i) / 22 - 1) * width,
        r = ((2 * (i + 1)) / 22 - 1) * width;
      const a = j * 0.55,
        b = a + 0.55;
      for (const [d, x] of [
        [a, l],
        [a, r],
        [b, r],
        [a, l],
        [b, r],
        [b, l],
      ]) {
        const p = course.world(d, x, 0.04);
        vertices.push(p.x, p.y, p.z);
      }
    }
  const geometry = new T.BufferGeometry();
  geometry.setAttribute('position', new T.Float32BufferAttribute(vertices, 3));
  root.add(new T.Mesh(geometry, new T.MeshBasicMaterial({ color: '#c1c2a9', side: T.DoubleSide })));
}
