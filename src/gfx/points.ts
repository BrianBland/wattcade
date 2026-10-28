// Sized point clouds for WebGPURenderer. WebGPU draws THREE.Points at 1 px, so each point is an instanced sprite quad
// (PointsNodeMaterial) instead. Callers keep writing positions/colours into `cloud.attributes` and set needsUpdate.
import * as THREE from 'three/webgpu';
import { float, instancedBufferAttribute, materialColor, texture, vec4 } from 'three/tsl';
import type { Node } from 'three/webgpu';

export interface PointCloudParams {
  size: number; color?: THREE.ColorRepresentation; map?: THREE.Texture | null;
  sizeAttenuation?: boolean; transparent?: boolean; opacity?: number; depthWrite?: boolean; depthTest?: boolean;
  blending?: THREE.Blending; fog?: boolean;
  /** Multiply by the geometry's `color` attribute (3 or 4 components) per point. */
  vertexColors?: boolean;
}

/**
 * Swap a geometry attribute for an interleaved one over the same array, so `needsUpdate` reaches the instanced node.
 * Static usage on purpose: three re-uploads DynamicDraw buffers every frame; static ones only when the version bumps.
 */
function shareAttr(geo: THREE.BufferGeometry, name: string): THREE.InstancedInterleavedBuffer {
  const a = geo.getAttribute(name) as THREE.BufferAttribute;
  const buf = new THREE.InstancedInterleavedBuffer(a.array as Float32Array, a.itemSize, 1);
  geo.setAttribute(name, new THREE.InterleavedBufferAttribute(buf, a.itemSize, 0));
  return buf;
}

export class PointCloud extends THREE.Sprite {
  /** Per-point data: `position` (and `color` with vertexColors). Same arrays as the geometry passed in. */
  readonly cloud: THREE.BufferGeometry;
  declare material: THREE.PointsNodeMaterial;

  constructor(geo: THREE.BufferGeometry, p: PointCloudParams) {
    const pos = shareAttr(geo, 'position');
    const m = new THREE.PointsNodeMaterial({
      size: p.size, color: p.color ?? 0xffffff, map: p.map ?? null, sizeAttenuation: p.sizeAttenuation ?? true,
      transparent: p.transparent ?? false, opacity: p.opacity ?? 1, depthWrite: p.depthWrite ?? true, depthTest: p.depthTest ?? true,
      blending: p.blending ?? THREE.NormalBlending, fog: p.fog ?? true,
    });
    m.alphaToCoverage = false; // blend like the old gl points did
    m.positionNode = instancedBufferAttribute(pos, 'vec3');
    if (p.vertexColors) {
      // materialColor is vec3 (vec4 only with a map), so build rgb and alpha explicitly
      const n = geo.getAttribute('color').itemSize, buf = shareAttr(geo, 'color');
      const c = n === 4 ? instancedBufferAttribute(buf, 'vec4') as Node<'vec4'> : vec4(instancedBufferAttribute(buf, 'vec3') as Node<'vec3'>, 1);
      const mapA = p.map ? texture(p.map).a : float(1);
      m.colorNode = vec4(materialColor.rgb.mul(c.rgb), mapA.mul(c.a));
    }
    super(m);
    this.cloud = geo;
    this.count = pos.count;
    this.frustumCulled = false;
  }

  dispose() { this.cloud.dispose(); this.material.dispose(); }
}
