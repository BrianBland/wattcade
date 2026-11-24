// Shared GLSL snippets for the Watershed shaders (procedural, no textures).
export const NOISE_GLSL = /* glsl */ `
float wsHash(vec2 p) { p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
float wsNoise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(wsHash(i), wsHash(i + vec2(1.0, 0.0)), u.x), mix(wsHash(i + vec2(0.0, 1.0)), wsHash(i + vec2(1.0, 1.0)), u.x), u.y);
}
float wsFbm(vec2 p) {
  float s = 0.0, a = 0.5;
  for (int k = 0; k < 4; k++) { s += a * wsNoise(p); p = p * 2.03 + vec2(17.1, 9.3); a *= 0.5; }
  return s / 0.9375;
}
`;

/**
 * Soft cloud shadows drifting across the land (and the water): 0 = full sun, 1 = deepest shade. Needs NOISE_GLSL.
 * Large, slow blobs so the overview reads as a sunny day with weather passing over, never as noise.
 */
export const CLOUD_SHADOW_GLSL = /* glsl */ `
float wsCloudShadow(vec3 wp, float t) {
  vec2 p = wp.xz * 0.011 + vec2(t * 0.010, t * 0.004);
  float n = wsFbm(p) * 0.75 + wsNoise(p * 3.7 + 11.0) * 0.25;
  return smoothstep(0.56, 0.78, n);
}
`;
