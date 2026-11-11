// Animated sea: waves displaced in the vertex shader (cheap on iPad) with analytic smooth normals, fine ripples,
// fresnel sky reflection, sun glints, shallow-water tint and noisy shore foam.
import * as THREE from 'three';
import { islandHeight } from '../sim/layout';
import { NOISE_GLSL } from './util';

/** JS mirror of the shader wave so ships and props can bob on the same surface. */
export function waveHeight(x: number, z: number, t: number, amp: number): number {
  return amp * (0.55 * Math.sin(x * 0.16 + t * 1.3 + z * 0.05) + 0.35 * Math.sin(z * 0.21 - t * 1.05 + x * 0.07) + 0.18 * Math.sin((x + z) * 0.37 + t * 2.1));
}

export interface Sea { mesh: THREE.Mesh; update(t: number, amp: number, dark: number, storm: number): void }

export function createSea(): Sea {
  // Graded grid: ~1 m cells around the island widening to ~6 m at the fogged horizon. Shading (normals, ripples,
  // foam) is per pixel, so no facet reads as a triangle. Spans x -260..260, z -220..300 like the old flat plane.
  const SEG = 180;
  const g = new THREE.PlaneGeometry(2, 2, SEG, SEG); g.rotateX(-Math.PI / 2);
  g.deleteAttribute('uv');
  const pos = g.attributes.position;
  const grade = (u: number) => 0.35 * u + 0.65 * u * u * u;
  for (let i = 0; i < pos.count; i++) {
    const u = pos.getX(i), v = pos.getZ(i);
    pos.setXYZ(i, 260 * grade(u), 0, (v < 0 ? 220 : 300) * grade(v));
  }
  const shore = new Float32Array(pos.count);
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), z = pos.getZ(i);
    // the island only spans ~130 x 95 m: skip the height function far out at sea
    const h = Math.abs(x) > 110 || z < -90 || z > 80 ? -9 : islandHeight(x, z);
    shore[i] = Math.max(0, Math.min(1, (h + 4) / 4)); // 0 deep .. 1 at the waterline
  }
  g.setAttribute('aShore', new THREE.BufferAttribute(shore, 1));

  const uniforms = {
    uTime: { value: 0 }, uAmp: { value: 0.3 }, uChop: { value: 0 },
    uDeep: { value: new THREE.Color(0x0f4c74) }, uShallow: { value: new THREE.Color(0x2fa7b5) }, uFoam: { value: new THREE.Color(0xf4fbff) },
    uSky: { value: new THREE.Color(0xbfe3f5) },
  };
  const mat = new THREE.MeshPhongMaterial({ color: 0xffffff, shininess: 160, specular: new THREE.Color(0x3a4650) });
  mat.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, uniforms);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', `#include <common>
        uniform float uTime; uniform float uAmp; attribute float aShore; varying float vShore; varying float vCrest; varying vec3 vWPos;
        float waveH(vec2 p) { return uAmp * (0.55 * sin(p.x * 0.16 + uTime * 1.3 + p.y * 0.05) + 0.35 * sin(p.y * 0.21 - uTime * 1.05 + p.x * 0.07) + 0.18 * sin((p.x + p.y) * 0.37 + uTime * 2.1)); }
        vec2 waveD(vec2 p) {
          float ca = cos(p.x * 0.16 + uTime * 1.3 + p.y * 0.05), cb = cos(p.y * 0.21 - uTime * 1.05 + p.x * 0.07), cc = cos((p.x + p.y) * 0.37 + uTime * 2.1);
          return uAmp * vec2(0.088 * ca + 0.0245 * cb + 0.0666 * cc, 0.0275 * ca + 0.0735 * cb + 0.0666 * cc);
        }`)
      .replace('#include <beginnormal_vertex>', `
        float damp = 1.0 - 0.6 * aShore;
        vec2 dH = waveD(position.xz) * damp;
        vec3 objectNormal = normalize(vec3(-dH.x, 1.0, -dH.y));`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        float wh = waveH(transformed.xz) * damp;
        transformed.y += wh; vShore = aShore; vCrest = wh / max(uAmp, 0.05);
        vWPos = (modelMatrix * vec4(transformed, 1.0)).xyz;`);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>
        uniform vec3 uDeep; uniform vec3 uShallow; uniform vec3 uFoam; uniform vec3 uSky; uniform float uTime; uniform float uChop;
        varying float vShore; varying float vCrest; varying vec3 vWPos;` + NOISE_GLSL)
      .replace('#include <color_fragment>', `#include <color_fragment>
        vec2 wp = vWPos.xz;
        float dist = length(vViewPosition);
        float fade = 1.0 - smoothstep(60.0, 220.0, dist); // ripples and foam detail fade into the distance (no shimmer)
        vec3 water = mix(uDeep, uShallow, smoothstep(0.35, 0.95, vShore));
        water *= 0.94 + 0.12 * fbm(wp * 0.05 + vec2(uTime * 0.01, 0.0));
        float fn = fbm(wp * 0.55 + vec2(uTime * 0.12, -uTime * 0.08));
        float crest = smoothstep(0.8 - 0.35 * uChop, 1.05, vCrest + (fn - 0.5) * 0.35) * (0.2 + 0.6 * uChop);
        float surfEdge = vShore + 0.05 * sin(uTime * 1.7 + vShore * 30.0) + (fn - 0.5) * 0.12;
        float surf = smoothstep(0.86, 0.97, surfEdge) * (0.65 + 0.35 * smoothstep(0.35, 0.6, fn));
        float foam = max(crest, surf) * mix(0.6, 1.0, fade);
        diffuseColor.rgb = mix(water, uFoam, foam);`)
      .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
        {
          // fine ripples: two drifting noise layers perturb the normal per pixel
          float e = 0.35;
          vec2 q1 = wp * 0.9 + vec2(uTime * 0.35, uTime * 0.2), q2 = wp * 2.1 - vec2(uTime * 0.25, -uTime * 0.4);
          float r0 = vnoise(q1) + 0.5 * vnoise(q2);
          float rx = vnoise(q1 + vec2(e, 0.0)) + 0.5 * vnoise(q2 + vec2(e, 0.0)) - r0;
          float rz = vnoise(q1 + vec2(0.0, e)) + 0.5 * vnoise(q2 + vec2(0.0, e)) - r0;
          float k = (0.16 + 0.4 * uChop) * fade;
          normal = normalize(normal - (viewMatrix * vec4(rx * k, 0.0, rz * k, 0.0)).xyz);
        }`)
      .replace('#include <opaque_fragment>', `
        float fres = pow(1.0 - clamp(dot(normal, normalize(vViewPosition)), 0.0, 1.0), 4.0);
        outgoingLight = mix(outgoingLight, uSky, fres * 0.55 * (1.0 - foam));
        #include <opaque_fragment>`);
  };
  const mesh = new THREE.Mesh(g, mat);
  mesh.receiveShadow = false;
  const deepDay = new THREE.Color(0x0f4c74), deepNight = new THREE.Color(0x061a2c), deepStorm = new THREE.Color(0x1d2e38);
  const shDay = new THREE.Color(0x2fa7b5), shNight = new THREE.Color(0x0e3a48);
  const skyDay = new THREE.Color(0xbfe3f5), skyNight = new THREE.Color(0x1a2c48), skyStorm = new THREE.Color(0x56636e);
  return {
    mesh,
    update(t, amp, dark, storm) {
      uniforms.uTime.value = t; uniforms.uAmp.value = amp; uniforms.uChop.value = Math.max(0, Math.min(1, (amp - 0.25) / 1.6));
      uniforms.uDeep.value.copy(deepDay).lerp(deepNight, dark).lerp(deepStorm, storm * 0.6);
      uniforms.uShallow.value.copy(shDay).lerp(shNight, dark).lerp(deepStorm, storm * 0.5);
      uniforms.uFoam.value.setScalar(0.96 - dark * 0.55);
      uniforms.uSky.value.copy(skyDay).lerp(skyNight, dark).lerp(skyStorm, storm * 0.7);
      mat.specular.setScalar(0.24 * (1 - dark * 0.6) * (1 - storm * 0.7));
    },
  };
}
