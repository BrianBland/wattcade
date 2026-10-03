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
