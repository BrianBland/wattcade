// Static batching: merge a subtree's meshes into one vertex-coloured toon mesh + one mesh per extra material
// (ink hulls, translucent shadows...). Subtrees flagged userData.dyn are left alone (they animate).
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { toon } from './jsr';

let VC: THREE.Material | null = null;
/** Shared vertex-coloured toon material for baked geometry. */
export const toonVC = () => (VC ??= Object.assign(toon(0xffffff), { vertexColors: true }));

const prep = (g: THREE.BufferGeometry, m: THREE.Matrix4, color?: THREE.Color) => {
  let n = g.index ? g.toNonIndexed() : g.clone();
  for (const k of Object.keys(n.attributes)) if (k !== 'position' && k !== 'normal') n.deleteAttribute(k);
  if (!n.attributes.normal) n.computeVertexNormals();
  n.applyMatrix4(m);
  if (color) { const c = new Float32Array(n.attributes.position.count * 3); for (let i = 0; i < c.length; i += 3) { c[i] = color.r; c[i + 1] = color.g; c[i + 2] = color.b; } n.setAttribute('color', new THREE.BufferAttribute(c, 3)); }
  return n;
};

/** Is this mesh a "body" (opaque coloured surface) that can go into the vertex-coloured batch? */
const isBody = (m: THREE.Material) => {
  const mm = m as THREE.MeshToonMaterial;
  return !mm.transparent && mm.side !== THREE.BackSide && !!mm.color && ((m as THREE.MeshToonMaterial).isMeshToonMaterial || (m as THREE.MeshLambertMaterial).isMeshLambertMaterial || (m as THREE.MeshBasicMaterial).isMeshBasicMaterial) && !(mm as THREE.MeshToonMaterial).map;
};

/**
 * Bake `root`'s static meshes in place: they're removed and replaced by ≤ (1 + extra materials) merged meshes,
 * expressed in root's local space. Empty Object3Ds (e.g. pedal anchors) and dyn subtrees stay.
 */
export function bakeInPlace(root: THREE.Object3D): number {
  root.updateMatrixWorld(true);
  const inv = root.matrixWorld.clone().invert();
  const body: THREE.BufferGeometry[] = [], extra = new Map<THREE.Material, THREE.BufferGeometry[]>();
  const victims: THREE.Mesh[] = [];
  const walk = (o: THREE.Object3D) => {
    for (const c of o.children) {
      if (c.userData.dyn) continue;
      const m = c as THREE.Mesh;
      if (m.isMesh && !(m as THREE.InstancedMesh).isInstancedMesh && !Array.isArray(m.material)) {
        const rel = inv.clone().multiply(m.matrixWorld);
        if (isBody(m.material)) body.push(prep(m.geometry, rel, (m.material as THREE.MeshToonMaterial).color));
        else { const arr = extra.get(m.material) ?? []; arr.push(prep(m.geometry, rel)); extra.set(m.material, arr); }
        victims.push(m);
      }
      walk(c);
    }
  };
  walk(root);
  if (!victims.length) return 0;
  for (const v of victims) { const kids = v.children.filter((k) => !(k as THREE.Mesh).isMesh || k.userData.dyn); v.parent?.remove(v); for (const k of kids) { (v.parent ?? root).add(k); } }
  let n = 0;
  if (body.length) { const g = mergeGeometries(body)!; const mesh = new THREE.Mesh(g, toonVC()); mesh.name = 'baked'; root.add(mesh); n++; }
  for (const [mat, gs] of extra) { const g = mergeGeometries(gs.map((x) => { if (x.attributes.color) x.deleteAttribute('color'); return x; }))!; const mesh = new THREE.Mesh(g, mat); mesh.name = 'baked'; mesh.renderOrder = (mat as THREE.Material).transparent ? 1 : 0; root.add(mesh); n++; }
  return n;
}
