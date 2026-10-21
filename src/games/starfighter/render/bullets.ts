import * as THREE from 'three';
import type { BoltView } from '../sim/types';
/**
 * Enemy bullets as shaped, camera-facing sprites (one instanced draw for bodies and trails):
 *  - pink: an orb with a white-hot core, a coloured ring and a soft halo;
 *  - amber: a needle aligned with its flight;
 *  - wall shots: diamonds, so walls read as their own pattern.
 * Each bullet trails a fading streak; rings brighten on the beat. Quads are built in view space along the projected
 * velocity, so shapes keep their proportions from the high camera instead of flattening onto the ground plane.
 */
const MAX = 640;
const SHAPE = { orb: 0, needle: 1, diamond: 2, trail: 3 };
const vertex = /* glsl */ `
  attribute vec3 aCenter; attribute vec2 aDir; attribute vec2 aSize; attribute vec3 aColor; attribute float aShape;
  uniform float uBeat; varying vec2 vUv; varying vec3 vColor; varying float vShape;
  void main() {
    vec4 c = viewMatrix * vec4(aCenter, 1.0);
    // Flight direction in view space (from the world xz velocity), so needles and trails point where they travel.
    vec3 dv = (viewMatrix * vec4(aDir.x, 0.0, aDir.y, 0.0)).xyz; vec2 d = length(dv.xy) > 1e-4 ? normalize(dv.xy) : vec2(0.0, 1.0);
    vec2 n = vec2(d.y, -d.x); // right-handed with d, so quads keep front-facing winding
    float pulse = aShape < 2.5 ? 1.0 + uBeat * 0.22 : 1.0;
    vec2 off = d * position.y * aSize.x * pulse + n * position.x * aSize.y * pulse;
    // Trails hang behind their bullet: shift the quad back by half its length.
    if (aShape > 2.5) off -= d * aSize.x * 0.5;
    gl_Position = projectionMatrix * (c + vec4(off, 0.0, 0.0));
    vUv = position.xy * 2.0; vColor = aColor; vShape = aShape;
  }`;
const fragment = /* glsl */ `
  uniform float uBeat; varying vec2 vUv; varying vec3 vColor; varying float vShape;
  void main() {
    vec2 q = vUv; float d;
    if (vShape > 2.5) { // trail: bright at the bullet, fading back, soft edges
      float along = q.y * 0.5 + 0.5, edge = 1.0 - abs(q.x);
      float a = along * along * smoothstep(0.0, 0.7, edge);
      gl_FragColor = vec4(vColor * a * 0.75, 1.0); return;
    }
    if (vShape > 1.5) d = abs(q.x) + abs(q.y);              // diamond
    else if (vShape > 0.5) d = length(q * vec2(1.0, 0.55)); // needle (long along flight)
    else d = length(q);                                      // orb
    // Small hot core tinted toward the colour, a saturated ring that brightens on the beat, a wide soft halo.
    float core = smoothstep(0.3, 0.08, d);
    float ring = smoothstep(0.74, 0.56, d) * smoothstep(0.24, 0.42, d) * (1.0 + 0.7 * uBeat);
    float halo = exp(-d * d * 2.2) * 0.7;
    vec3 col = mix(vec3(1.0), vColor, 0.35) * core * 0.9 + vColor * (ring * 0.95 + halo * 0.55);
    col = min(col, vec3(1.0)); // stay in range so colour survives the bloom instead of clipping to white
    if (dot(col, vec3(1.0)) < 0.01) discard;
    gl_FragColor = vec4(col, 1.0);
  }`;
export function createBullets(scene: THREE.Scene) {
  const quad = new THREE.PlaneGeometry(1, 1), geo = new THREE.InstancedBufferGeometry();
  geo.index = quad.index; geo.setAttribute('position', quad.getAttribute('position'));
  const center = new THREE.InstancedBufferAttribute(new Float32Array(MAX * 2 * 3), 3), dir = new THREE.InstancedBufferAttribute(new Float32Array(MAX * 2 * 2), 2);
  const size = new THREE.InstancedBufferAttribute(new Float32Array(MAX * 2 * 2), 2), color = new THREE.InstancedBufferAttribute(new Float32Array(MAX * 2 * 3), 3);
  const shape = new THREE.InstancedBufferAttribute(new Float32Array(MAX * 2), 1);
  for (const a of [center, dir, size, color, shape]) a.setUsage(THREE.DynamicDrawUsage);
  geo.setAttribute('aCenter', center); geo.setAttribute('aDir', dir); geo.setAttribute('aSize', size); geo.setAttribute('aColor', color); geo.setAttribute('aShape', shape);
  geo.instanceCount = 0;
  const uniforms = { uBeat: { value: 0 } };
  const material = new THREE.ShaderMaterial({ vertexShader: vertex, fragmentShader: fragment, uniforms, transparent: true, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending });
  const mesh = new THREE.Mesh(geo, material); mesh.frustumCulled = false; mesh.renderOrder = 5; scene.add(mesh);
  const PINK = [1.0, 0.16, 0.62], AMBER = [1.0, 0.5, 0.06];
  return {
    update(bolts: readonly BoltView[], beat: number) {
      uniforms.uBeat.value = beat;
      let n = 0;
      const put = (x: number, y: number, z: number, dx: number, dz: number, len: number, wid: number, c: number[], s: number) => {
        center.setXYZ(n, x, y, z); dir.setXY(n, dx, dz); size.setXY(n, len, wid); color.setXYZ(n, c[0], c[1], c[2]); shape.setX(n, s); n++;
      };
      for (const b of bolts.slice(0, MAX)) {
        const sp = Math.hypot(b.vx, b.vy) || 1, dx = b.vx / sp, dz = b.vy / sp, c = b.kind === 'amber' ? AMBER : PINK;
        const s = b.wall ? SHAPE.diamond : b.kind === 'amber' ? SHAPE.needle : SHAPE.orb, k = b.wall ? 1.5 : 1;
        // Trail first (drawn under the body in the same additive pass), length grows with speed.
        put(b.x, b.height, b.y - 50, dx, dz, (2.4 + sp * 0.14) * k, 1.1 * k, c, SHAPE.trail);
        put(b.x, b.height, b.y - 50, dx, dz, (s === SHAPE.needle ? 4.6 : 4.3) * k, (s === SHAPE.needle ? 2.4 : 4.3) * k, c, s);
      }
      geo.instanceCount = n;
      for (const a of [center, dir, size, color, shape]) a.needsUpdate = true;
    },
    dispose() { quad.dispose(); geo.dispose(); material.dispose(); scene.remove(mesh); },
  };
}
