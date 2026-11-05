// Animated sea: waves displaced in the vertex stage (TSL) (cheap on iPad), flat-shaded, shallow-water tint and shore foam.
import * as THREE from 'three/webgpu';
import { attribute, max, mix, positionLocal, sin, smoothstep, uniform, varying, vec3 } from 'three/tsl';
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

  const uTime = uniform(0), uAmp = uniform(0.3), uChop = uniform(0);
  const uDeep = uniform(new THREE.Color(0x0f4c74)), uShallow = uniform(new THREE.Color(0x2fa7b5)), uFoam = uniform(new THREE.Color(0xf4fbff));
  const mat = new THREE.MeshPhongNodeMaterial({ color: 0xffffff, flatShading: true, shininess: 40, specular: new THREE.Color(0x3a4a58) });
  // vertex: same wave as waveHeight(), damped near the shore
  const aShore = attribute<'float'>('aShore', 'float'), p = positionLocal.xz;
  const waveH = uAmp.mul(sin(p.x.mul(0.16).add(uTime.mul(1.3)).add(p.y.mul(0.05))).mul(0.55)
    .add(sin(p.y.mul(0.21).sub(uTime.mul(1.05)).add(p.x.mul(0.07))).mul(0.35))
    .add(sin(p.x.add(p.y).mul(0.37).add(uTime.mul(2.1))).mul(0.18)));
  const wh = waveH.mul(aShore.mul(-0.6).add(1));
  mat.positionNode = positionLocal.add(vec3(0, wh, 0));
  // fragment: deep -> shallow tint, crest foam with chop, surf at the waterline
  const vShore = varying(aShore), vCrest = varying(wh.div(max(uAmp, 0.05)));
  const water = mix(uDeep, uShallow, smoothstep(0.35, 0.95, vShore));
  const crest = smoothstep(uChop.mul(-0.35).add(0.85), 1.05, vCrest).mul(uChop.mul(0.6).add(0.2));
  const surf = smoothstep(0.86, 0.97, vShore.add(sin(uTime.mul(1.7).add(vShore.mul(30))).mul(0.04)));
  mat.colorNode = mix(water, uFoam, max(crest, surf));
  const mesh = new THREE.Mesh(g, mat);
  mesh.receiveShadow = false;
  const deepDay = new THREE.Color(0x0f4c74), deepNight = new THREE.Color(0x061a2c), deepStorm = new THREE.Color(0x1d2e38);
  const shDay = new THREE.Color(0x2fa7b5), shNight = new THREE.Color(0x0e3a48);
  return {
    mesh,
    update(t, amp, dark, storm) {
      uTime.value = t; uAmp.value = amp; uChop.value = Math.max(0, Math.min(1, (amp - 0.25) / 1.6));
      uDeep.value.copy(deepDay).lerp(deepNight, dark).lerp(deepStorm, storm * 0.6);
      uShallow.value.copy(shDay).lerp(shNight, dark).lerp(deepStorm, storm * 0.5);
      uFoam.value.setScalar(0.96 - dark * 0.55);
    },
  };
}
