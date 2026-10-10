import * as THREE from 'three';
const hull = new THREE.ConeGeometry(2.2, 7, 4);
hull.rotateX(-Math.PI / 2); hull.rotateZ(Math.PI / 4);
const box = new THREE.BoxGeometry(1, 1, 1);
const sphere = new THREE.SphereGeometry(1, 12, 8);
const ring = new THREE.TorusGeometry(1, 0.08, 6, 32); ring.rotateX(Math.PI / 2);
export const geometries = { hull, box, sphere, ring };
export function shipModel(color: string, kind: string): THREE.Group {
  const g = new THREE.Group();
  const plate = new THREE.MeshStandardMaterial({ color, metalness: 0.6, roughness: 0.3 });
  const dark = new THREE.MeshStandardMaterial({ color: '#15253d', metalness: 0.7, roughness: 0.4 });
  const light = new THREE.MeshBasicMaterial({ color: kind === 'player' || kind === 'escort' ? '#80eeff' : '#ffad66' });
  const add = (geo: THREE.BufferGeometry, mat: THREE.Material, pos: number[], scale: number[]) => {
    const m = new THREE.Mesh(geo, mat); m.position.set(pos[0], pos[1], pos[2]); m.scale.set(scale[0], scale[1], scale[2]); g.add(m); return m;
  };
  add(hull, plate, [0, 0.7, 0], [1, 0.5, 1]);
  add(sphere, dark, [0, 1.3, -0.4], [0.8, 0.45, 1.6]);
  add(box, light, [0, 1.75, -0.5], [0.35, 0.08, 1.2]);
  const wings = kind === 'escort' ? 4.3 : kind === 'armor' ? 2.8 : 3.6;
  for (const side of [-1, 1]) {
    add(box, plate, [side * wings / 2, 0.6, 0.8], [wings, 0.35, 1.7]).rotation.y = side * 0.22;
    add(box, dark, [side * wings, 0.6, 0], [0.8, 0.9, 3]);
    add(box, light, [side * wings, 0.65, -1.6], [0.3, 0.3, 0.7]);
    const engine = add(sphere, light, [side * 1.1, 0.6, 3.1], [0.5, 0.3, 1.2]); engine.name = 'engine';
  }
  if (kind !== 'player' && kind !== 'escort') g.rotation.y = Math.PI;
  return g;
}
export function bossModel(style: number): THREE.Group {
  const g = shipModel(['#c29049', '#aa503b', '#459da2', '#8860ba', '#609c51'][style], 'boss');
  g.scale.setScalar(2.3);
  const material = new THREE.MeshBasicMaterial({ color: '#ffb964' });
  const hoop = new THREE.Mesh(ring, material); hoop.scale.setScalar(3.4 + style * 0.2); hoop.position.y = 1; g.add(hoop);
  for (let i = 0; i < style + 2; i++) {
    const pod = new THREE.Mesh(box, material), a = i * Math.PI * 2 / (style + 2);
    pod.position.set(Math.cos(a) * 4, 0.7, Math.sin(a) * 3); pod.scale.set(0.8, 0.8, 1.8); g.add(pod);
  }
  return g;
}
export function disposeModel(g: THREE.Object3D) {
  const materials = new Set<THREE.Material>();
  g.traverse(o => { if (o instanceof THREE.Mesh) for (const m of Array.isArray(o.material) ? o.material : [o.material]) materials.add(m); });
  for (const m of materials) m.dispose();
}
