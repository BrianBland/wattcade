// Animated sea: waves displaced in the vertex shader (cheap on iPad), flat-shaded, shallow-water tint and shore foam.
import * as THREE from 'three';
import { islandHeight } from '../sim/layout';

/** JS mirror of the shader wave so ships and props can bob on the same surface. */
export function waveHeight(x: number, z: number, t: number, amp: number): number {
  return amp * (0.55 * Math.sin(x * 0.16 + t * 1.3 + z * 0.05) + 0.35 * Math.sin(z * 0.21 - t * 1.05 + x * 0.07) + 0.18 * Math.sin((x + z) * 0.37 + t * 2.1));
}

export interface Sea { mesh: THREE.Mesh; update(t: number, amp: number, dark: number, storm: number): void }

export function createSea(): Sea {
  const SIZE = 520, SEG = 150;
  const g = new THREE.PlaneGeometry(SIZE, SIZE, SEG, SEG); g.rotateX(-Math.PI / 2);
  g.translate(0, 0, 40);
  const pos = g.attributes.position;
  const shore = new Float32Array(pos.count);
  for (let i = 0; i < pos.count; i++) {
    const h = islandHeight(pos.getX(i), pos.getZ(i));
    shore[i] = Math.max(0, Math.min(1, (h + 4) / 4)); // 0 deep .. 1 at the waterline
  }
  g.setAttribute('aShore', new THREE.BufferAttribute(shore, 1));

  const uniforms = {
    uTime: { value: 0 }, uAmp: { value: 0.3 }, uChop: { value: 0 },
    uDeep: { value: new THREE.Color(0x0f4c74) }, uShallow: { value: new THREE.Color(0x2fa7b5) }, uFoam: { value: new THREE.Color(0xf4fbff) },
  };
  const mat = new THREE.MeshPhongMaterial({ color: 0xffffff, flatShading: true, shininess: 40, specular: new THREE.Color(0x3a4a58) });
  mat.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, uniforms);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', `#include <common>
        uniform float uTime; uniform float uAmp; attribute float aShore; varying float vShore; varying float vCrest;
        float waveH(vec2 p) { return uAmp * (0.55 * sin(p.x * 0.16 + uTime * 1.3 + p.y * 0.05) + 0.35 * sin(p.y * 0.21 - uTime * 1.05 + p.x * 0.07) + 0.18 * sin((p.x + p.y) * 0.37 + uTime * 2.1)); }`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        float wh = waveH(transformed.xz) * (1.0 - 0.6 * aShore);
        transformed.y += wh; vShore = aShore; vCrest = wh / max(uAmp, 0.05);`);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>
        uniform vec3 uDeep; uniform vec3 uShallow; uniform vec3 uFoam; uniform float uTime; uniform float uChop; varying float vShore; varying float vCrest;`)
      .replace('#include <color_fragment>', `#include <color_fragment>
        vec3 water = mix(uDeep, uShallow, smoothstep(0.35, 0.95, vShore));
        float crest = smoothstep(0.85 - 0.35 * uChop, 1.05, vCrest) * (0.2 + 0.6 * uChop);
        float surf = smoothstep(0.86, 0.97, vShore + 0.04 * sin(uTime * 1.7 + vShore * 30.0));
        diffuseColor.rgb = mix(water, uFoam, max(crest, surf));`);
  };
  const mesh = new THREE.Mesh(g, mat);
  mesh.receiveShadow = false;
  const deepDay = new THREE.Color(0x0f4c74), deepNight = new THREE.Color(0x061a2c), deepStorm = new THREE.Color(0x1d2e38);
  const shDay = new THREE.Color(0x2fa7b5), shNight = new THREE.Color(0x0e3a48);
  return {
    mesh,
    update(t, amp, dark, storm) {
      uniforms.uTime.value = t; uniforms.uAmp.value = amp; uniforms.uChop.value = Math.max(0, Math.min(1, (amp - 0.25) / 1.6));
      uniforms.uDeep.value.copy(deepDay).lerp(deepNight, dark).lerp(deepStorm, storm * 0.6);
      uniforms.uShallow.value.copy(shDay).lerp(shNight, dark).lerp(deepStorm, storm * 0.5);
      uniforms.uFoam.value.setScalar(0.96 - dark * 0.55);
    },
  };
}
