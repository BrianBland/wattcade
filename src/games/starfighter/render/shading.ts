import * as THREE from 'three';
/**
 * Procedural surface detail for instanced scenery, patched into MeshStandardMaterial (no textures to load):
 * lit/unlit window grids on building walls, strata bands on rock, panel seams on roofs and hulls. Everything is keyed
 * on true world position (the scene is drawn in the ship's moving frame; `sceneryPose` maps it back), so patterns stay
 * fixed to their surfaces as scenery streams past and the route turns.
 */
const VARYINGS = 'varying vec3 vWPos; varying vec3 vWNormal; varying float vH; varying float vBase; varying vec3 vOrigin; varying float vLZ;';
/** Bar-line light wave shared with the scenery: x = wave z position, y = strength. */
export const sceneryWave = { value: new THREE.Vector2(-9999, 0) };
/** Music for the lights: x = beat count, y/z/w = smoothed low/mid/high band levels. */
export const sceneryMusic = { value: new THREE.Vector4(0, 0, 0, 0) };
/** Ship route pose (world x, z, heading): local scene coords → world, matching render/space.ts. */
export const sceneryPose = { value: new THREE.Vector3(0, 0, 0) };
function patch(material: THREE.MeshStandardMaterial, fragment: string, key: string) {
  material.onBeforeCompile = shader => {
    shader.uniforms.uWave = sceneryWave; shader.uniforms.uMusic = sceneryMusic; shader.uniforms.uPose = sceneryPose;
    shader.vertexShader = shader.vertexShader.replace('#include <common>', `#include <common>\n${VARYINGS}\nuniform vec3 uPose;\nvec3 toWorld(vec3 l){ vec2 f = vec2(-sin(uPose.z), -cos(uPose.z)), r = vec2(cos(uPose.z), -sin(uPose.z)); vec2 w = uPose.xy + r * l.x + f * (34.0 - l.z); return vec3(w.x, l.y, w.y); }\nvec3 dirToWorld(vec3 n){ vec2 f = vec2(-sin(uPose.z), -cos(uPose.z)), r = vec2(cos(uPose.z), -sin(uPose.z)); vec2 w = r * n.x - f * n.z; return normalize(vec3(w.x, n.y, w.y)); }`)
      .replace('#include <worldpos_vertex>', `#include <worldpos_vertex>
        vec4 wp = vec4(transformed, 1.0);
        #ifdef USE_INSTANCING
          wp = instanceMatrix * wp;
          vWNormal = normalize(mat3(modelMatrix) * mat3(instanceMatrix) * objectNormal);
          vH = length(instanceMatrix[1].xyz); vBase = instanceMatrix[3].y - vH * 0.5; vOrigin = toWorld((modelMatrix * instanceMatrix[3]).xyz);
        #else
          vWNormal = normalize(mat3(modelMatrix) * objectNormal); vH = 1.0; vBase = 0.0; vOrigin = vec3(0.0);
        #endif
        vLZ = (modelMatrix * wp).z; vWPos = toWorld((modelMatrix * wp).xyz); vWNormal = dirToWorld(vWNormal);`);
    shader.fragmentShader = shader.fragmentShader.replace('#include <common>', `#include <common>\n${VARYINGS}
      uniform vec2 uWave; uniform vec4 uMusic; float shHash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
      float shNoise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.0-2.0*f);return mix(mix(shHash(i),shHash(i+vec2(1,0)),f.x),mix(shHash(i+vec2(0,1)),shHash(i+vec2(1,1)),f.x),f.y);}`)
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>\n${fragment}`);
  };
  material.customProgramCacheKey = () => key;
  return material;
}
/** Building walls: a window grid on vertical faces; some windows lit (warm or cool), others dark glass. */
export function windowed(material: THREE.MeshStandardMaterial) {
  return patch(material, `
    if (abs(vWNormal.y) < 0.5) {
      vec2 t = normalize(vec2(-vWNormal.z, vWNormal.x));
      // Each building (keyed by its origin) picks a window rhythm: bay width, floor height, and grid / ribbon / strip panes.
      float bs = shHash(floor(vOrigin.xz / 3.0) + vec2(5.3, 1.7)), cw = mix(1.8, 3.0, fract(bs * 7.0)), ch = mix(2.5, 3.3, fract(bs * 13.0));
      vec2 uv = vec2(dot(vWPos.xz, t) / cw, (vWPos.y + 6.0) / ch);
      vec2 cell = floor(uv), f = fract(uv);
      vec4 m = bs < 0.4 ? vec4(0.18, 0.82, 0.25, 0.78) : bs < 0.7 ? vec4(0.0, 1.0, 0.3, 0.72) : vec4(0.36, 0.64, 0.12, 0.9);
      float pane = step(m.x, f.x) * step(f.x, m.y) * step(m.z, f.y) * step(f.y, m.w) * step(1.0, vWPos.y + 4.5);
      float h = shHash(cell + floor(vWPos.xz / 40.0) * 7.0), lit = step(0.6, h);
      // Beat flicker: about 7% of windows re-roll their state on every beat (people switching lights on and off).
      if (fract(h * 91.7) < 0.07) lit = step(0.5, shHash(cell + vec2(uMusic.x * 0.37, uMusic.x * 1.13)));
      vec3 warm = mix(vec3(1.0, 0.78, 0.45), vec3(0.55, 0.85, 1.0), step(0.85, h));
      // Equalizer towers: the tallest buildings light from the bottom up with the music. Each window column is a band
      // (bass toward one edge, treble toward the other); bars climb with that band's level and colour shifts up the tower.
      float tower = step(32.0, vH) * step(0.55, shHash(floor(vOrigin.xz / 3.0)));
      if (tower > 0.5) {
        float col = fract(cell.x / 6.0) * 6.0, b = col / 5.0;
        float level = mix(mix(uMusic.y, uMusic.z, smoothstep(0.0, 0.5, b)), uMusic.w, smoothstep(0.5, 1.0, b));
        level = clamp(level * (0.85 + 0.3 * shHash(vec2(cell.x, 3.0))), 0.0, 1.0);
        float frac = clamp((vWPos.y - vBase) / vH, 0.0, 1.0);
        lit = step(frac, level * 0.95 + 0.04);
        warm = mix(mix(vec3(0.2, 0.95, 0.85), vec3(1.0, 0.75, 0.2), smoothstep(0.3, 0.65, frac)), vec3(1.0, 0.25, 0.55), smoothstep(0.7, 0.95, frac));
      }
      diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * 0.45, pane * (1.0 - lit));
      float wave = exp(-abs(vLZ - uWave.x) / 16.0) * uWave.y; // the bar-line wave travels in the ship's frame
      totalEmissiveRadiance += warm * pane * (lit * (0.55 + 0.35 * fract(h * 13.0)) + wave * 0.35);
    } else if (vWNormal.y > 0.5) {
      vec2 g = abs(fract(vWPos.xz / 3.0) - 0.5);
      diffuseColor.rgb *= 0.9 + 0.1 * step(0.46, max(g.x, g.y));
    }`, 'sq-windowed');
}
/**
 * Curtain-wall glass towers: a mullion grid over dark glass that reflects a dusk sky (deeper low, brighter high), with
 * a few office floors lit warm and the bar-line wave passing over the glass.
 */
export function curtain(material: THREE.MeshStandardMaterial) {
  return patch(material, `
    if (abs(vWNormal.y) < 0.5) {
      vec2 tg = normalize(vec2(-vWNormal.z, vWNormal.x));
      float u = dot(vWPos.xz, tg), v = vWPos.y + 6.0;
      vec2 g = abs(fract(vec2(u / 1.6, v / 3.0)) - 0.5);
      float mull = clamp(step(0.46, g.x) + step(0.465, g.y), 0.0, 1.0), frac = clamp((vWPos.y - vBase) / max(1.0, vH), 0.0, 1.0);
      vec3 sky = mix(vec3(0.03, 0.08, 0.2), vec3(0.3, 0.55, 0.8), frac * frac);
      float lit = step(0.8, shHash(vec2(floor(v / 3.0), floor(vOrigin.x) + floor(vOrigin.z) * 7.0))) * step(1.0, vWPos.y + 4.5);
      diffuseColor.rgb = mix(diffuseColor.rgb * 0.25, vec3(0.5, 0.55, 0.6), mull * 0.8);
      float wave = exp(-abs(vLZ - uWave.x) / 16.0) * uWave.y;
      totalEmissiveRadiance += (sky * 0.5 + vec3(1.0, 0.82, 0.55) * lit * 0.4 + vec3(0.3, 0.6, 0.7) * wave * 0.3) * (1.0 - mull);
    }`, 'sq-curtain');
}
/**
 * Rock: warped sedimentary strata of uneven thickness (on top of the kit's vertex-colour bands), vertical erosion
 * streaks down steep faces, wind-blown dust on ledges and tops, fine grit, and a darker, damper base.
 */
export function strata(material: THREE.MeshStandardMaterial) {
  return patch(material, `
    float n = shNoise(vWPos.xz * 0.08 + vWPos.y * 0.05);
    float y = vWPos.y + (n - 0.5) * 3.0;
    float band = sin(y * 1.9 + shHash(floor(vWPos.xz / 14.0)) * 3.0) * 0.5 + 0.5, fine = sin(y * 7.3 + n * 4.0) * 0.5 + 0.5;
    diffuseColor.rgb *= 0.82 + 0.2 * band + 0.06 * fine;
    // Streaks follow the face across (a safe tangent: the normal may point straight up).
    vec2 tr = vec2(-vWNormal.z, vWNormal.x); vec2 tg = dot(tr, tr) > 1e-6 ? normalize(tr) : vec2(1.0, 0.0);
    float steep = clamp(1.0 - abs(vWNormal.y), 0.0, 1.0), streak = shNoise(vec2(dot(vWPos.xz, tg) * 0.9, vWPos.y * 0.06));
    diffuseColor.rgb *= mix(1.0, 0.8 + 0.3 * streak, steep);
    diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.82, 0.55, 0.4), smoothstep(0.6, 0.95, vWNormal.y) * 0.25 * (0.6 + 0.4 * n));
    diffuseColor.rgb *= 0.94 + 0.12 * shHash(floor(vWPos.xz * 3.0 + vWPos.y * 2.0));
    diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * vec3(0.7, 0.62, 0.62), smoothstep(-2.0, -5.5, vWPos.y));`, 'sq-strata');
}
/** Plated metal (roofs, decks, hulls): panel seams and slight tonal variation per panel. */
export function plated(material: THREE.MeshStandardMaterial) {
  return patch(material, `
    vec2 q = abs(vWNormal.y) > 0.5 ? vWPos.xz / vec2(4.0, 6.0) : vec2(dot(vWPos.xz, normalize(vec2(-vWNormal.z, vWNormal.x))) / 6.0, vWPos.y / 2.0);
    vec2 g = abs(fract(q) - 0.5);
    diffuseColor.rgb *= (0.92 + 0.12 * shHash(floor(q))) * (1.0 - 0.18 * step(0.47, max(g.x, g.y)));`, 'sq-plated');
}
/** Lawn: mowing stripes, clumpy colour variation, worn darker edges. Applies to flat park ground. */
export function lawn(material: THREE.MeshStandardMaterial) {
  return patch(material, `
    float stripe = step(0.5, fract(vWPos.x / 4.0)) * 0.08;
    float clump = shHash(floor(vWPos.xz * 1.3)) * 0.06 + shHash(floor(vWPos.xz * 0.35)) * 0.08;
    diffuseColor.rgb *= 0.86 + stripe + clump;
    diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * vec3(0.9, 0.85, 0.7), step(0.42, abs(fract(vWPos.z / 16.0) - 0.5)) * 0.5);`, 'sq-lawn');
}
/** Foliage: lumpy light and shade across canopies, brighter tops, darker undersides. */
export function foliage(material: THREE.MeshStandardMaterial) {
  return patch(material, `
    float lump = shHash(floor(vWPos.xz * 2.2 + vWPos.y * 1.7));
    diffuseColor.rgb *= (0.78 + 0.3 * lump) * mix(0.75, 1.15, clamp(vWNormal.y * 0.5 + 0.5, 0.0, 1.0));`, 'sq-foliage');
}
/**
 * Lava-field rock (basalt, scoria, ash cones): vesicular grit, grey ash settling on ledges and tops, a warm underglow
 * near the ground from the lava around it, and molten rock where the geometry's `glow` attribute marks it (crater
 * lakes, flows) — a crusted, slowly shifting emissive that swells with the bass. Stays non-negative (bloom safety).
 */
export function magma(material: THREE.MeshStandardMaterial) {
  patch(material, `
    float n = shNoise(vWPos.xz * 0.35 + vWPos.y * 0.21), grit = shHash(floor(vWPos.xz * 4.0 + vWPos.y * 3.0));
    diffuseColor.rgb *= 0.86 + 0.18 * n + 0.08 * grit;
    diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.22, 0.21, 0.2), smoothstep(0.7, 0.95, vWNormal.y) * 0.35 * n);
    float foot = smoothstep(-3.0, -6.0, vWPos.y);
    totalEmissiveRadiance += vec3(0.5, 0.12, 0.02) * foot * (0.12 + 0.1 * uMusic.y);
    float crust = smoothstep(0.35, 0.75, shNoise(vWPos.xz * 0.9 + vec2(vWPos.y * 0.4, uMusic.x * 0.05)));
    float g = clamp(vGlow, 0.0, 1.0) * mix(1.0, 0.3, crust);
    diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.05, 0.02, 0.01), clamp(vGlow, 0.0, 1.0) * 0.85);
    totalEmissiveRadiance += vec3(1.0, 0.36, 0.06) * g * (0.75 + 0.35 * uMusic.y);`, 'sq-magma');
  const base = material.onBeforeCompile;
  material.onBeforeCompile = (shader, renderer) => {
    base.call(material, shader, renderer);
    shader.vertexShader = shader.vertexShader.replace('#include <common>', '#include <common>\nattribute float glow; varying float vGlow;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvGlow = glow;');
    shader.fragmentShader = shader.fragmentShader.replace('#include <common>', '#include <common>\nvarying float vGlow;');
  };
  return material;
}
