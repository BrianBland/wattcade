import * as THREE from 'three';

/**
 * Uniforms shared (by reference) by every Cadenza shader: zone colours, beat/band pulses, time, acid amount, fog.
 * The renderer updates them once per frame.
 */
export const U = {
  uAcc: { value: new THREE.Color('#00f0ff') },   // zone accent
  uAcc2: { value: new THREE.Color('#ff2bd6') },  // complementary accent
  uFog: { value: new THREE.Color('#05040c') },
  uWarm: { value: new THREE.Color('#ff8a3d') },  // Blade Runner haze orange
  uBeat: { value: 0 },      // 1 on a beat, decays
  uDown: { value: 0 },      // 1 on a downbeat, decays
  uBeatAge: { value: 9 },   // seconds since the last beat
  uBands: { value: new THREE.Vector3() }, // low / mid / high energy 0..1
  uTime: { value: 0 },
  uAcid: { value: 0 },      // 0..1: rainbow shimmer (drops)
  uCraftM: { value: 0 },    // metres travelled by the craft
  uNear: { value: 60 }, uFar: { value: 560 },
};

export const GLSL_COMMON = /* glsl */ `
uniform vec3 uAcc; uniform vec3 uAcc2; uniform vec3 uFog; uniform vec3 uWarm;
uniform float uBeat; uniform float uDown; uniform float uBeatAge; uniform vec3 uBands; uniform float uTime; uniform float uAcid;
uniform float uCraftM; uniform float uNear; uniform float uFar;
vec3 hue2rgb(float h) { return clamp(abs(mod(h * 6.0 + vec3(0.0, 4.0, 2.0), 6.0) - 3.0) - 1.0, 0.0, 1.0); }
float hash11(float p) { p = fract(p * 0.1031); p *= p + 33.33; p *= p + p; return fract(p); }
float fogF(float depth) { return smoothstep(uNear, uFar, depth); }
`;

export function shader(vertex: string, fragment: string, extra: Record<string, THREE.IUniform> = {}, opts: Partial<THREE.ShaderMaterialParameters> = {}) {
  return new THREE.ShaderMaterial({ uniforms: { ...U, ...extra }, vertexShader: GLSL_COMMON + vertex, fragmentShader: GLSL_COMMON + fragment, toneMapped: false, ...opts });
}
