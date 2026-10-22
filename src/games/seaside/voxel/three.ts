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
 * Global look switches shared by every voxel material (uniform objects, so a look can change at runtime with no rebuild).
 *   bevel: per-cube edge shading — faces read as individual blocks, even when greedy-merged (0..1)
 *   cool:  hue-shifted lighting — shadow/ambient light shifts cool, direct sun warm (0..1)
 *   detail: mixed-size cubes — some cubes render as 2×2 or 4×4 smaller bevelled cubes (0..1), at every LOD
 */
const VOX_GLSL = `
float vxHash(vec3 c) { return fract(sin(dot(c, vec3(12.9898, 78.233, 37.719))) * 43758.5453); }
// bevel: within bw of a cube edge, tilt the shading toward that edge's outward direction (lit from above-left)
float vxBevel(vec3 fr, vec3 n, float bw) {
  vec3 ed = vec3(0.0);
  for (int a = 0; a < 3; a++) {
    if (abs(n[a]) > 0.5) continue;
    ed[a] = fr[a] < bw ? -(1.0 - fr[a] / bw) : fr[a] > 1.0 - bw ? (1.0 - (1.0 - fr[a]) / bw) : 0.0;
  }
  return dot(ed, normalize(vec3(-0.35, 1.0, 0.3))) * 0.5 - length(ed) * 0.1;
}
`;

export const LOOK = { bevel: { value: 0 }, cool: { value: 0 }, detail: { value: 0 } };

/**
 * Lambert material with per-voxel brightness jitter computed in the fragment shader (hash of the voxel cell under the
 * fragment), so greedy-merged quads still read as individual cubes. Optional travelling swell for water, baked sun
 * visibility, and the LOOK bevel / cool-shadow switches. Cell maths runs in the mesh's local space (grid `origin`).
 */
export function voxelMaterial(opts: { size: number; jitter: number; origin?: readonly number[]; /** false = no mixed-size sub-cubes (water) */ detail?: boolean; /** screen-door dissolve: x = progress 0..1, y = +1 fading in / −1 fading out */ fade?: { value: THREE.Vector2 }; wave?: { time: { value: number }; amp: number }; /** geometry has a baked `sunVis` attribute scaling direct light */ baked?: boolean }): THREE.MeshLambertMaterial {
  const mat = new THREE.MeshLambertMaterial({ vertexColors: true });
  const o = opts.origin ?? [0, 0, 0];
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.uVox = { value: opts.size };
    sh.uniforms.uJit = { value: opts.jitter };
    sh.uniforms.uOrigin = { value: new THREE.Vector3(o[0], o[1], o[2]) };
    sh.uniforms.uBevel = LOOK.bevel; sh.uniforms.uCool = LOOK.cool; sh.uniforms.uDetail = opts.detail === false || opts.wave ? { value: 0 } : LOOK.detail;
    if (opts.fade) sh.uniforms.uFade = opts.fade;
    if (opts.wave) sh.uniforms.uTime = opts.wave.time;
    sh.vertexShader = 'varying vec3 vVoxL;\nvarying vec3 vVoxN;\nvarying float vWave;\n' + (opts.wave ? 'uniform float uTime;\n' : '') + (opts.baked ? 'attribute float sunVis;\nvarying float vSunVis;\n' : '')
      + sh.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>
        vVoxL = position;
        vVoxN = normal;${opts.baked ? '\n        vSunVis = sunVis;' : ''}
        vWave = 0.0;
        ${opts.wave ? `vec3 wpos = (modelMatrix * vec4(position, 1.0)).xyz;
        vWave = sin(dot(wpos.xz, vec2(0.23, 0.11)) - uTime * 1.4) * 0.6 + sin(dot(wpos.xz, vec2(-0.07, 0.29)) - uTime * 2.0) * 0.4;
        transformed.y += vWave * ${opts.wave.amp.toFixed(3)};` : ''}`);
    const lights = `#include <lights_fragment_end>${opts.baked ? '\n  reflectedLight.directDiffuse *= vSunVis;' : ''}
      reflectedLight.indirectDiffuse *= mix(vec3(1.0), vec3(0.74, 0.84, 1.22), uCool);
      reflectedLight.directDiffuse *= mix(vec3(1.0), vec3(1.08, 1.0, 0.88), uCool);`;
    sh.fragmentShader = 'uniform float uVox;\nuniform float uJit;\nuniform vec3 uOrigin;\nuniform float uBevel;\nuniform float uCool;\nuniform float uDetail;\nvarying vec3 vVoxL;\nvarying vec3 vVoxN;\nvarying float vWave;\n' + VOX_GLSL + (opts.baked ? 'varying float vSunVis;\n' : '')
      + (opts.fade ? 'uniform vec2 uFade;\n' : '')
      + sh.fragmentShader.replace('#include <lights_fragment_end>', lights).replace('#include <clipping_planes_fragment>', opts.fade ? `#include <clipping_planes_fragment>
        { ivec2 q = ivec2(mod(floor(gl_FragCoord.xy), 4.0)); // 4×4 Bayer threshold
          int bm[16] = int[16](0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5);
          float b = (float(bm[q.x + q.y * 4]) + 0.5) / 16.0;
          if (uFade.y > 0.0 ? b >= uFade.x : b < uFade.x) discard; }` : '#include <clipping_planes_fragment>').replace('#include <color_fragment>', `#include <color_fragment>
        vec3 gv = (vVoxL - uOrigin) / uVox;
        vec3 cell = floor(gv - vVoxN * 0.5);
        float hj = vxHash(cell);
        float px = max(max(fwidth(gv.x), fwidth(gv.y)), fwidth(gv.z)); // voxels per pixel
        float bev = vxBevel(gv - cell, vVoxN, 0.14) * (1.0 - smoothstep(0.08, 0.2, px));
        // mixed-size cubes: in patches, a cube shows as 2×2 or 4×4 smaller bevelled cubes (fades when they'd be < ~3 px)
        float sub = 0.0;
        if (uDetail > 0.0) {
          float pick = 0.6 * vxHash(floor(cell / 3.0) + 5.0) + 0.4 * vxHash(cell + 17.0);
          float L = pick > 1.0 - 0.3 * uDetail ? 2.0 : pick > 1.0 - 0.7 * uDetail ? 1.0 : 0.0;
          if (L > 0.0) {
            float k = exp2(L);
            vec3 gs = gv * k, sc = floor(gs - vVoxN * 0.5);
            float vis = 1.0 - smoothstep(0.25, 0.5, px * k);
            sub = (vxBevel(gs - sc, vVoxN, 0.22) * 1.3 + (vxHash(sc + 3.1) - 0.5) * 0.24) * vis;
          }
        }
        diffuseColor.rgb *= 1.0 + (hj * 2.0 - 1.0) * uJit + 0.09 * vWave + uBevel * bev + uDetail * sub;`);
  };
  mat.customProgramCacheKey = () => `vox-${opts.size}-${opts.jitter}-${opts.wave ? 'w' : ''}-${opts.baked ? 'b' : ''}-${opts.fade ? 'f' : ''}`;
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
