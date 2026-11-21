import * as T from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { Course } from '../sim/track';

// Bottle kilns on the terraced rim. The lit fire doors and pale refractory
// bands are visible from both directions across the quarry.
export function buildKilns(scene: T.Object3D, course: Course, brick?: T.Texture) {
  const parts: T.BufferGeometry[] = [];
  function part(src: T.BufferGeometry, color: string, x = 0, y = 0, z = 0) {
    const g = src.index ? src.toNonIndexed() : src;
    if (g !== src) src.dispose();
    g.translate(x, y, z);
    const rgb = new T.Color(color),
      data = new Float32Array(g.attributes.position.count * 3);
    for (let i = 0; i < data.length; i += 3) rgb.toArray(data, i);
    g.setAttribute('color', new T.BufferAttribute(data, 3));
    parts.push(g);
  }
  const profile = [
    [5.2, -48],
    [5.2, -7],
    [4.4, -6.8],
    [4.2, 2.6],
    [4.5, 3],
    [4.3, 4.7],
    [3.8, 6.1],
    [2.1, 8.2],
    [1.35, 9.8],
    [1.1, 14.5],
    [1.32, 14.7],
    [1.32, 15.1],
    [0.99, 15.1],
    [0.95, 14.2],
  ];
  part(
    new T.LatheGeometry(
      profile.map(([x, y]) => new T.Vector2(x, y)),
      24,
    ),
    '#cba791',
  );
  for (const [r, y] of [
    [4.24, 1.3],
    [4.36, 4.1],
    [1.23, 12.9],
    [1.29, 14.4],
  ]) {
    part(new T.CylinderGeometry(r, r, 0.22, 24), '#43464b', 0, y);
  }
  for (let i = 0; i < 8; i++) {
    const a = (i * Math.PI) / 4;
    for (const [r, y, w, h, c] of [
      [4.22, 2.6, 1.16, 1.84, '#353338'],
      [4.36, 2.34, 0.82, 1.28, '#e3743b'],
      [4.4, 2.12, 0.63, 0.69, '#ffca83'],
    ] as const) {
      const door = new T.BoxGeometry(w, h, 0.16);
      door.rotateY(a);
      part(door, c, r * Math.sin(a), y, r * Math.cos(a));
    }
  }
  const geometry = mergeGeometries(parts)!;
  parts.forEach((p) => p.dispose());
  if (brick) {
    const pos = geometry.getAttribute('position'),
      uv = geometry.getAttribute('uv');
    for (let i = 0; i < pos.count; i++) uv.setXY(i, uv.getX(i) * 3, pos.getY(i) / 9);
  }
  const mat = new T.MeshStandardMaterial({
    map: brick ?? null,
    vertexColors: true,
    roughness: 0.92,
    side: T.DoubleSide,
  });
  const chimneys: T.Vector3[] = [];
  for (const [at, side, size] of [
    [29, -5.9, 0.83],
    [64, -6.8, 1.06],
    [118, 7.2, 1.3],
    [212, -7.3, 0.83],
    [373, 6.4, 1.26],
    [510, 6.6, 1.1],
    [560, 7.2, 1.45],
    [767, -6.6, 0.94],
    [880, 7.2, 1.34],
    [972, -6.6, 1.05],
  ]) {
    const p = course.world(at, side);
    const mesh = new T.Mesh(geometry, mat);
    mesh.name = 'bottle kiln';
    mesh.position.set(p.x, p.y - 4.7, p.z);
    mesh.scale.setScalar(size);
    mesh.receiveShadow = true;
    scene.add(mesh);
    chimneys.push(mesh.position.clone().add(new T.Vector3(0, 15.1 * size, 0)));
  }
  return chimneys;
}
