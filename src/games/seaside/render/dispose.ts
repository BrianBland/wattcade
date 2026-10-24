import * as THREE from 'three';

/** Release resources owned by a set leaving the shared WorldView; keep the view itself alive. */
export function disposeSet(...roots: THREE.Object3D[]): void {
  const geometries = new Set<THREE.BufferGeometry>(), materials = new Set<THREE.Material>(), textures = new Set<THREE.Texture>();
  for (const root of roots) {
    root.traverse((o) => {
      if (!(o instanceof THREE.Mesh)) return;
      geometries.add(o.geometry);
      for (const m of Array.isArray(o.material) ? o.material : [o.material]) {
        materials.add(m);
        for (const value of Object.values(m)) if (value instanceof THREE.Texture) textures.add(value);
      }
      if (o instanceof THREE.InstancedMesh) o.dispose();
    });
    root.removeFromParent();
  }
  geometries.forEach((g) => g.dispose());
  materials.forEach((m) => m.dispose());
  textures.forEach((t) => t.dispose());
}
