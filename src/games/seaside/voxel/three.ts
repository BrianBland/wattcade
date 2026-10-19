// Three.js glue: one mesh per non-empty chunk.
import * as THREE from 'three';
import { VoxelGrid } from './grid';
import { meshChunk, type MeshOpts } from './mesh';

export interface BuiltGrid { group: THREE.Group; faces: number; chunks: number }

export function buildGrid(grid: VoxelGrid, opts: MeshOpts, material: THREE.Material, shadows = { cast: true, receive: true }): BuiltGrid {
  const group = new THREE.Group();
  let faces = 0, chunks = 0;
  for (const key of grid.chunks.keys()) {
    const m = meshChunk(grid, key, opts);
    if (!m.faces) continue;
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(m.positions, 3));
    geo.setAttribute('normal', new THREE.BufferAttribute(m.normals, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(m.colors, 3));
    geo.setIndex(new THREE.BufferAttribute(m.indices, 1));
    geo.computeBoundingSphere();
    const mesh = new THREE.Mesh(geo, material);
    mesh.castShadow = shadows.cast; mesh.receiveShadow = shadows.receive;
    group.add(mesh);
    faces += m.faces; chunks++;
  }
  return { group, faces, chunks };
}
