// Three.js glue: one mesh per non-empty chunk.
import * as THREE from 'three';
import { VoxelGrid } from './grid';
import { meshChunk, type MeshData, type MeshOpts } from './mesh';
import { mergeMeshData } from './merge';
import { meshChunkGreedy } from './greedy';

export interface BuiltGrid { group: THREE.Group; faces: number; chunks: number }

export function buildGrid(grid: VoxelGrid, opts: MeshOpts, material: THREE.Material, shadows = { cast: true, receive: true }): BuiltGrid {
  const group = new THREE.Group();
  let faces = 0, chunks = 0;
  for (const key of grid.chunks.keys()) {
    const m = opts.greedy ? meshChunkGreedy(grid, key, opts) : meshChunk(grid, key, opts);
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

/**
 * Lambert material with per-voxel brightness jitter computed in the fragment shader (hash of the voxel cell under the
 * fragment), so greedy-merged quads still read as individual cubes. Optional travelling swell for water.
 */
export function voxelMaterial(opts: { size: number; jitter: number; wave?: { time: { value: number }; amp: number }; /** geometry has a baked `sunVis` attribute scaling direct light */ baked?: boolean }): THREE.MeshLambertMaterial {
  const mat = new THREE.MeshLambertMaterial({ vertexColors: true });
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.uVox = { value: opts.size };
    sh.uniforms.uJit = { value: opts.jitter };
    if (opts.wave) sh.uniforms.uTime = opts.wave.time;
    sh.vertexShader = 'varying vec3 vVoxW;\nvarying vec3 vVoxN;\nvarying float vWave;\n' + (opts.wave ? 'uniform float uTime;\n' : '') + (opts.baked ? 'attribute float sunVis;\nvarying float vSunVis;\n' : '')
      + sh.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>
        vVoxW = (modelMatrix * vec4(position, 1.0)).xyz;
        vVoxN = normal;${opts.baked ? '\n        vSunVis = sunVis;' : ''}
        vWave = 0.0;
        ${opts.wave ? `vWave = sin(dot(vVoxW.xz, vec2(0.23, 0.11)) - uTime * 1.4) * 0.6 + sin(dot(vVoxW.xz, vec2(-0.07, 0.29)) - uTime * 2.0) * 0.4;
        transformed.y += vWave * ${opts.wave.amp.toFixed(3)};` : ''}`);
    sh.fragmentShader = 'uniform float uVox;\nuniform float uJit;\nvarying vec3 vVoxW;\nvarying vec3 vVoxN;\nvarying float vWave;\n' + (opts.baked ? 'varying float vSunVis;\n' : '')
      + sh.fragmentShader.replace('#include <lights_fragment_end>', opts.baked ? '#include <lights_fragment_end>\n  reflectedLight.directDiffuse *= mix(0.0, 1.0, vSunVis);' : '#include <lights_fragment_end>').replace('#include <color_fragment>', `#include <color_fragment>
        vec3 cell = floor(vVoxW / uVox - vVoxN * 0.5);
        float hj = fract(sin(dot(cell, vec3(12.9898, 78.233, 37.719))) * 43758.5453);
        diffuseColor.rgb *= 1.0 + (hj * 2.0 - 1.0) * uJit + 0.09 * vWave;`);
  };
  mat.customProgramCacheKey = () => `vox-${opts.size}-${opts.jitter}-${opts.wave ? 'w' : ''}-${opts.baked ? 'b' : ''}`;
  return mat;
}

/** A three.js geometry from mesher output (carries the baked `sunVis` attribute when present). */
export function geometryFrom(m: MeshData): THREE.BufferGeometry {
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(m.positions, 3));
  geo.setAttribute('normal', new THREE.BufferAttribute(m.normals, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(m.colors, 3));
  if (m.sunVis) geo.setAttribute('sunVis', new THREE.BufferAttribute(m.sunVis, 1));
  geo.setIndex(new THREE.BufferAttribute(m.indices, 1));
  geo.computeBoundingSphere();
  return geo;
}

const meshAll = (grid: VoxelGrid, keys: number[], opts: MeshOpts) => keys.map((k) => (opts.greedy ? meshChunkGreedy(grid, k, opts) : meshChunk(grid, k, opts)));

/** All chunks of a grid as ONE mesh (one draw call). Returns null when there are no faces. */
export function buildMergedMesh(grid: VoxelGrid, opts: MeshOpts, material: THREE.Material): { mesh: THREE.Mesh; faces: number } | null {
  const m = mergeMeshData(meshAll(grid, [...grid.chunks.keys()], opts));
  return m ? { mesh: new THREE.Mesh(geometryFrom(m), material), faces: m.faces } : null;
}

/** Chunks merged into one mesh per `cell`-metre square cluster: few draw calls, frustum culling still works per cluster. */
export function buildClusteredMeshes(grid: VoxelGrid, opts: MeshOpts, material: THREE.Material, cell = 48): { meshes: THREE.Mesh[]; faces: number } {
  const groups = new Map<string, number[]>();
  const span = 32 * grid.size;
  for (const k of grid.chunks.keys()) {
    const [cx, , cz] = VoxelGrid.unkey(k);
    const key = `${Math.floor((grid.origin[0] + cx * span) / cell)},${Math.floor((grid.origin[2] + cz * span) / cell)}`;
    (groups.get(key) ?? groups.set(key, []).get(key)!).push(k);
  }
  const meshes: THREE.Mesh[] = [];
  let faces = 0;
  for (const keys of groups.values()) {
    const m = mergeMeshData(meshAll(grid, keys, opts));
    if (m) { meshes.push(new THREE.Mesh(geometryFrom(m), material)); faces += m.faces; }
  }
  return { meshes, faces };
}
