import * as THREE from 'three';

/** Removed Three objects retain GPU allocations until explicitly disposed. */
export function disposeObjects(...roots: THREE.Object3D[]): void {
  const geometries = new Set<THREE.BufferGeometry>(), materials = new Set<THREE.Material>(), textures = new Set<THREE.Texture>();
  for (const root of roots) root.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (mesh.geometry) geometries.add(mesh.geometry);
    if (mesh.material) for (const m of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) materials.add(m);
    if (o instanceof THREE.InstancedMesh) o.dispose();
  });
  for (const g of geometries) g.dispose();
  for (const m of materials) {
    for (const t of [(m as THREE.MeshBasicMaterial).map, (m as THREE.MeshBasicMaterial).alphaMap]) if (t) textures.add(t);
    m.dispose();
  }
  for (const texture of textures) texture.dispose();
}
