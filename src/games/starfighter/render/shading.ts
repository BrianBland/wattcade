import * as THREE from 'three';
/**
 * Procedural surface detail for instanced scenery, patched into MeshStandardMaterial (no textures to load):
 * lit/unlit window grids on building walls, strata bands on rock, panel seams on roofs and hulls. Everything is keyed
 * on world position, so it stays put as instances stream and scale.
 */
const VARYINGS = 'varying vec3 vWPos; varying vec3 vWNormal;';
function patch(material: THREE.MeshStandardMaterial, fragment: string, key: string) {
  material.onBeforeCompile = shader => {
    shader.vertexShader = shader.vertexShader.replace('#include <common>', `#include <common>\n${VARYINGS}`)
      .replace('#include <worldpos_vertex>', `#include <worldpos_vertex>
        vec4 wp = vec4(transformed, 1.0);
        #ifdef USE_INSTANCING
          wp = instanceMatrix * wp;
          vWNormal = normalize(mat3(modelMatrix) * mat3(instanceMatrix) * objectNormal);
        #else
          vWNormal = normalize(mat3(modelMatrix) * objectNormal);
        #endif
        vWPos = (modelMatrix * wp).xyz;`);
    shader.fragmentShader = shader.fragmentShader.replace('#include <common>', `#include <common>\n${VARYINGS}
      float shHash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}`)
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
      vec2 uv = vec2(dot(vWPos.xz, t) / 2.4, (vWPos.y + 6.0) / 2.8);
      vec2 cell = floor(uv), f = fract(uv);
      float pane = step(0.18, f.x) * step(f.x, 0.82) * step(0.25, f.y) * step(f.y, 0.78) * step(1.0, vWPos.y + 4.5);
      float h = shHash(cell + floor(vWPos.xz / 40.0) * 7.0), lit = step(0.6, h);
      vec3 warm = mix(vec3(1.0, 0.78, 0.45), vec3(0.55, 0.85, 1.0), step(0.85, h));
      diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * 0.45, pane * (1.0 - lit));
      totalEmissiveRadiance += warm * pane * lit * (0.55 + 0.35 * fract(h * 13.0));
    } else if (vWNormal.y > 0.5) {
      vec2 g = abs(fract(vWPos.xz / 3.0) - 0.5);
      diffuseColor.rgb *= 0.9 + 0.1 * step(0.46, max(g.x, g.y));
    }`, 'sq-windowed');
}
/** Rock: sedimentary strata bands and a darker, wetter base. */
export function strata(material: THREE.MeshStandardMaterial) {
  return patch(material, `
    float band = sin(vWPos.y * 1.7 + shHash(floor(vWPos.xz / 9.0)) * 3.0) * 0.5 + 0.5;
    diffuseColor.rgb *= 0.78 + 0.32 * band;
    diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * vec3(0.7, 0.62, 0.62), smoothstep(-2.0, -5.5, vWPos.y));`, 'sq-strata');
}
/** Plated metal (roofs, decks, hulls): panel seams and slight tonal variation per panel. */
export function plated(material: THREE.MeshStandardMaterial) {
  return patch(material, `
    vec2 q = abs(vWNormal.y) > 0.5 ? vWPos.xz / vec2(4.0, 6.0) : vec2(dot(vWPos.xz, normalize(vec2(-vWNormal.z, vWNormal.x))) / 6.0, vWPos.y / 2.0);
    vec2 g = abs(fract(q) - 0.5);
    diffuseColor.rgb *= (0.92 + 0.12 * shHash(floor(q))) * (1.0 - 0.18 * step(0.47, max(g.x, g.y)));`, 'sq-plated');
}
