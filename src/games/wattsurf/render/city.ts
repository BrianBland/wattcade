import * as THREE from 'three';
import { makeRng } from '../../../core/rng';
import { shader } from './look';
import { newFrame, type Path } from './path';

/**
 * The world around the track: a megacity of geometric skyscrapers whose heights stretch with the music's bands,
 * windows flicker, roofs pulse on the beat; a hazy sky dome (Blade Runner orange under neon), a giant ring on the
 * horizon that breathes with the bass, and sweeping searchlights.
 */
const TOWER_VS = /* glsl */ `
attribute float aBand; attribute float aSeed;
varying vec2 vUv; varying vec3 vSize; varying float vSeed; varying float vDepth; varying float vStretch; varying vec3 vN;
void main() {
  vUv = uv; vSeed = aSeed; vN = normal;
  float e = aBand < 0.5 ? uBands.x : aBand < 1.5 ? uBands.y : uBands.z;
  float stretch = e * (0.35 + 0.45 * sin(uTime * 0.7 + aSeed * 40.0)) + 0.25 * uBeat * step(0.7, fract(aSeed * 7.0));
  vStretch = stretch;
  vec3 p = position; p.y *= 1.0 + stretch;
  vSize = vec3(length(instanceMatrix[0].xyz), length(instanceMatrix[1].xyz) * (1.0 + stretch), length(instanceMatrix[2].xyz));
  vec4 mv = modelViewMatrix * instanceMatrix * vec4(p, 1.0); vDepth = -mv.z; gl_Position = projectionMatrix * mv;
}`;
const TOWER_FS = /* glsl */ `
varying vec2 vUv; varying vec3 vSize; varying float vSeed; varying float vDepth; varying float vStretch; varying vec3 vN;
float h2(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7)) + vSeed * 91.7) * 43758.5453); }
void main() {
  bool roof = abs(vN.y) > 0.5;
  float w = abs(vN.x) > 0.5 ? vSize.z : vSize.x;
  vec2 cell = vec2(vUv.x * w / 2.4, vUv.y * vSize.y / 3.0);
  vec2 f = fract(cell), id = floor(cell);
  float win = step(0.25, f.x) * step(f.x, 0.75) * step(0.3, f.y) * step(f.y, 0.7);
  float lit = step(0.62, h2(id)) * (0.7 + 0.3 * sin(uTime * (1.0 + h2(id + 3.0) * 4.0) + h2(id) * 20.0));
  vec3 warm = mix(uWarm, vec3(0.3, 0.9, 1.0), step(0.6, fract(vSeed * 13.0)));
  float edge = 1.0 - smoothstep(0.0, 0.02, min(min(vUv.x, 1.0 - vUv.x), 1.0 - vUv.y));
  float cap = smoothstep(0.985, 1.0, vUv.y);
  vec3 acc = mix(uAcc, hue2rgb(fract(vSeed + uTime * 0.15)), uAcid * 0.8);
  vec3 c = vec3(0.012, 0.012, 0.02) + warm * win * lit * 0.9 + acc * edge * (0.5 + vStretch * 1.5) + uAcc2 * cap * (0.6 + 2.0 * uBeat);
  if (roof) c = vec3(0.01) + uAcc2 * (0.3 + 1.5 * uBeat) * step(0.9, fract(vSeed * 5.0));
  float fog = smoothstep(uNear * 0.5, uFar * 1.3, vDepth);
  gl_FragColor = vec4(mix(c, uFog * 1.6 + uWarm * 0.04, fog * 0.92), 1.0);
}`;

const SKY_VS = /* glsl */ `varying vec3 vDir; void main() { vDir = normalize(position); vec4 mv = modelViewMatrix * vec4(position, 1.0); gl_Position = projectionMatrix * mv; }`;
const SKY_FS = /* glsl */ `
varying vec3 vDir;
void main() {
  float y = vDir.y;
  float horizon = exp(-abs(y) * 9.0);
  vec3 c = mix(uFog * 1.4, vec3(0.005, 0.0, 0.015), smoothstep(0.0, 0.5, y));
  c += uWarm * horizon * 0.22 + uAcc * horizon * (0.12 + 0.25 * uBands.x);
  c += vec3(1.0) * step(0.9985, fract(sin(dot(floor(vDir.xz * 300.0), vec2(12.9, 78.2))) * 43758.5)) * step(0.15, y) * 0.5; // a few stars through the smog
  gl_FragColor = vec4(c, 1.0);
}`;

const BEAM_VS = /* glsl */ `varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;
const BEAM_FS = /* glsl */ `
uniform vec3 uCol; varying vec2 vUv;
void main() {
  float a = (1.0 - vUv.y) * 0.9 * (0.4 + 0.8 * uBands.y) * pow(sin(vUv.x * 3.14159), 2.0);
  gl_FragColor = vec4(uCol * a * 0.35, 1.0);
}`;

export class City {
  readonly group = new THREE.Group();
  readonly sky: THREE.Mesh; readonly ring: THREE.Mesh;
  private beams: THREE.Mesh[] = [];
  constructor(path: Path, seed: number) {
    const rng = makeRng(seed * 31 + 5), fr = newFrame(), m = new THREE.Matrix4(), q = new THREE.Quaternion(), v = new THREE.Vector3(), s = new THREE.Vector3();
    const W = path.halfWidth;
    const spots: Array<{ pos: THREE.Vector3; size: THREE.Vector3; rot: number; band: number; seed: number }> = [];
    for (let d = 0; d < path.length + 400; d += 16) {
      path.at(d, fr);
      for (const side of [-1, 1]) for (let row = 0; row < 2; row++) {
        if (rng() < 0.25) continue;
        const off = W + 38 + row * 85 + rng() * 70, h = 18 + rng() ** 2 * (row ? 220 : 120);
        const flat = new THREE.Vector3(fr.r.x, 0, fr.r.z).normalize();
        v.copy(fr.p).addScaledVector(flat, side * off); v.y = fr.p.y - 30 - rng() * 10;
        spots.push({ pos: v.clone(), size: new THREE.Vector3(6 + rng() * 20, h + 30, 6 + rng() * 20), rot: rng() * Math.PI, band: Math.floor(rng() * 3), seed: rng() });
      }
    }
    const geo = new THREE.BoxGeometry(1, 1, 1); geo.translate(0, 0.5, 0);
    const band = new Float32Array(spots.length), sd = new Float32Array(spots.length);
    const towers = new THREE.InstancedMesh(geo, shader(TOWER_VS, TOWER_FS), Math.max(1, spots.length));
    spots.forEach((b, k) => {
      q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), b.rot);
      towers.setMatrixAt(k, m.compose(b.pos, q, s.copy(b.size)));
      band[k] = b.band; sd[k] = b.seed;
    });
    geo.setAttribute('aBand', new THREE.InstancedBufferAttribute(band, 1));
    geo.setAttribute('aSeed', new THREE.InstancedBufferAttribute(sd, 1));
    towers.frustumCulled = false;
    this.group.add(towers);

    this.sky = new THREE.Mesh(new THREE.SphereGeometry(850, 32, 16), shader(SKY_VS, SKY_FS, {}, { side: THREE.BackSide, depthWrite: false }));
    this.sky.renderOrder = -10;
    this.ring = new THREE.Mesh(new THREE.TorusGeometry(260, 3.2, 8, 96), shader(BEAM_VS, /* glsl */ `varying vec2 vUv; void main() { gl_FragColor = vec4(mix(uAcc2, hue2rgb(fract(vUv.x + uTime * 0.1)), uAcid) * (0.8 + 2.0 * uBands.x + 1.2 * uDown), 1.0); }`));
    for (let i = 0; i < 6; i++) {
      const col = i % 2 ? new THREE.Color('#ff8a3d') : new THREE.Color('#3dd8ff');
      const beam = new THREE.Mesh(new THREE.CylinderGeometry(1.5, 22, 520, 16, 1, true).translate(0, 260, 0),
        shader(BEAM_VS, BEAM_FS, { uCol: { value: col } }, { transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide }));
      this.beams.push(beam);
    }
  }

  /** Keep the sky, ring and searchlights around the camera; sweep the lights. */
  follow(camera: THREE.Camera, fwd: THREE.Vector3, t: number) {
    this.sky.position.copy(camera.position);
    const flat = new THREE.Vector3(fwd.x, 0, fwd.z).normalize();
    this.ring.position.copy(camera.position).addScaledVector(flat, 700).add(new THREE.Vector3(0, 120, 0));
    this.ring.lookAt(camera.position);
    const right = new THREE.Vector3(-flat.z, 0, flat.x);
    this.beams.forEach((b, i) => {
      const side = i % 2 ? 1 : -1, ahead = 200 + (i >> 1) * 140;
      b.position.copy(camera.position).addScaledVector(flat, ahead).addScaledVector(right, side * (140 + 30 * (i >> 1))).add(new THREE.Vector3(0, -60, 0));
      b.rotation.set(0.45 * Math.sin(t * 0.5 + i), 0, 0.4 * Math.sin(t * 0.37 + i * 1.7) * side);
    });
  }
  addTo(scene: THREE.Scene) { scene.add(this.group, this.sky, this.ring, ...this.beams); }
  removeFrom(scene: THREE.Scene) { scene.remove(this.group, this.sky, this.ring, ...this.beams); }
}
