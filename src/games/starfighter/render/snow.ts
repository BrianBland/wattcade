import * as THREE from 'three';
/**
 * Blizzard: wind-driven snow streaks over the play area. Entirely on the GPU: each flake's position is its seeded base
 * plus the accumulated wind shift, wrapped into a box around the view (ship-local scene coords), and `amount` (0..1) decides how many
 * flakes show and how hard the wind blows. No per-frame CPU work beyond three uniforms.
 */
const COUNT = 1600;
const BOX_MIN = new THREE.Vector3(-190, -4, -320), BOX_SIZE = new THREE.Vector3(380, 50, 420);
const vertex = /* glsl */ `
  attribute vec4 aSeed; // xyz = base in the box (0..1), w = per-flake variation
  uniform vec3 uShift; uniform float uAmount; uniform vec3 uWind; uniform vec3 uMin; uniform vec3 uSize;
  varying vec2 vUv; varying float vAlpha;
  void main() {
    float speed = 0.75 + 0.5 * aSeed.w;
    vec3 p = uMin + mod(aSeed.xyz * uSize + uShift * speed, uSize);
    vec4 c = viewMatrix * vec4(p, 1.0);
    vec3 dv = (viewMatrix * vec4(uWind, 0.0)).xyz; vec2 d = dot(dv.xy, dv.xy) > 1e-6 ? normalize(dv.xy) : vec2(0.0, 1.0), n = vec2(d.y, -d.x);
    float show = step(aSeed.w, uAmount), len = (1.0 + length(uWind) * 0.035) * (0.7 + 0.6 * aSeed.w), wid = 0.22 + 0.25 * aSeed.w;
    vec2 off = (d * position.y * len + n * position.x * wid) * show;
    gl_Position = projectionMatrix * (c + vec4(off, 0.0, 0.0));
    // Fade near the box edges so wrapping never pops, and with distance so the far field reads as haze, not dots.
    vec3 e = min(p - uMin, uMin + uSize - p) / (uSize * 0.08);
    vAlpha = show * clamp(min(min(e.x, e.y), e.z), 0.0, 1.0) * mix(0.75, 0.25, clamp(-c.z / 600.0, 0.0, 1.0));
    vUv = position.xy * 2.0;
  }`;
const fragment = /* glsl */ `
  varying vec2 vUv; varying float vAlpha;
  void main() {
    float a = exp(-vUv.x * vUv.x * 3.0) * (1.0 - vUv.y * vUv.y) * vAlpha;
    if (a < 0.01) discard;
    gl_FragColor = vec4(0.93, 0.96, 1.0, a);
  }`;
export function createSnow(scene: THREE.Scene) {
  const quad = new THREE.PlaneGeometry(1, 1), geo = new THREE.InstancedBufferGeometry();
  geo.index = quad.index; geo.setAttribute('position', quad.getAttribute('position'));
  const seeds = new Float32Array(COUNT * 4); let s = 12345;
  const rnd = () => (s = (s * 16807) % 2147483647) / 2147483647;
  for (let i = 0; i < seeds.length; i++) seeds[i] = rnd();
  geo.setAttribute('aSeed', new THREE.InstancedBufferAttribute(seeds, 4)); geo.instanceCount = 0;
  const uniforms = { uShift: { value: new THREE.Vector3() }, uAmount: { value: 0 }, uWind: { value: new THREE.Vector3() }, uMin: { value: BOX_MIN }, uSize: { value: BOX_SIZE } };
  const material = new THREE.ShaderMaterial({ vertexShader: vertex, fragmentShader: fragment, uniforms, transparent: true, depthWrite: false, side: THREE.DoubleSide });
  const mesh = new THREE.Mesh(geo, material); mesh.frustumCulled = false; mesh.renderOrder = 7; scene.add(mesh);
  // Always 'visible' so its buffers upload at mount; it simply draws no instances while there is no snow.
  return {
    /** `amount` 0..1: 0 hides the blizzard entirely. */
    update(dt: number, amount: number) {
      geo.instanceCount = amount > 0.01 ? COUNT : 0; uniforms.uAmount.value = amount;
      // Mostly blowing toward the camera and across, harder as it thickens; the shift accumulates so gusts never jump.
      const k = 0.6 + 0.9 * amount; uniforms.uWind.value.set(-26 * k, -4 * k, 62 * k); uniforms.uShift.value.addScaledVector(uniforms.uWind.value, Math.min(0.1, Math.max(0, dt)));
    },
    dispose() { quad.dispose(); geo.dispose(); material.dispose(); scene.remove(mesh); },
  };
}
