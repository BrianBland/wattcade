import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { shader } from './look';
import { LW, newFrame, type Path } from './path';

/** The ribbon, its walls, tunnel tubes, light pylons and phrase arches. Geometry covers only the nearby road. */

const RIBBON_VS = /* glsl */ `
attribute float aTun; varying vec2 vUv; varying float vDepth; varying float vTun;
void main() { vUv = uv; vTun = aTun; vec4 mv = modelViewMatrix * vec4(position, 1.0); vDepth = -mv.z; gl_Position = projectionMatrix * mv; }`;
const RIBBON_FS = /* glsl */ `
uniform float uLanes; uniform float uInner;
varying vec2 vUv; varying float vDepth; varying float vTun;
void main() {
  float u = vUv.x, au = abs(u), m = vUv.y;
  vec3 acc = mix(uAcc, hue2rgb(fract(m * 0.004 + uTime * 0.12 + au * 0.25)), uAcid * 0.75);
  float edge = smoothstep(0.90, 0.985, au);
  float lc = (u / uInner) * uLanes * 0.5 + uLanes * 0.5;
  float d = abs(fract(lc + 0.5) - 0.5);
  float line = (1.0 - smoothstep(0.012, 0.045, d)) * step(au, uInner + 0.01);
  float chev = step(fract(m * 0.055 - au * 0.35), 0.06) * step(au, uInner);
  float grid = step(fract(m * 0.25), 0.02);
  // beat waves: a ring of light runs forward from the craft on every beat
  float wave = exp(-abs(m - (uCraftM + uBeatAge * 70.0)) * 0.22) * exp(-uBeatAge * 1.6);
  // tunnel reflections of the ring lights (every 12 m), glossy
  float refl = vTun * pow(clamp(0.5 + 0.5 * cos(m * 6.2831853 / 12.0), 0.0, 1.0), 16.0) * (0.5 + 0.9 * uBeat);
  float sheen = vTun * 0.25 * pow(clamp(0.5 + 0.5 * cos(m * 6.2831853 / 4.0 + u * 2.0), 0.0, 1.0), 30.0);
  vec3 base = uFog * 0.6 + vec3(0.006);
  vec3 c = base + acc * (edge * (1.3 + uBands.x * 1.2) + line * (0.22 + 0.5 * uBands.z) + chev * (0.08 + 0.2 * uBeat) + grid * 0.08 + wave * 1.1)
         + uAcc2 * (refl * 1.2 + sheen) + uWarm * 0.05 * (1.0 - au);
  gl_FragColor = vec4(mix(c, uFog, fogF(vDepth)), 1.0);
}`;

const TUBE_VS = /* glsl */ `
varying vec2 vUv; varying float vDepth;
void main() { vUv = uv; vec4 mv = modelViewMatrix * vec4(position, 1.0); vDepth = -mv.z; gl_Position = projectionMatrix * mv; }`;
const TUBE_FS = /* glsl */ `
varying vec2 vUv; varying float vDepth;
void main() {
  float a = vUv.x, m = vUv.y;
  float panel = fract(a * 8.0);
  float seam = 1.0 - smoothstep(0.0, 0.04, min(panel, 1.0 - panel));
  float ring = pow(clamp(0.5 + 0.5 * cos(m * 6.2831853 / 12.0), 0.0, 1.0), 40.0);
  float q = (a - 0.5) * 40.0; // q * q, not pow(q, 2.0): pow of a negative base is NaN on iOS GPUs, and bloom smears a NaN to black
  float top = exp(-q * q) * step(fract(m * 0.25), 0.4) * 0.45;
  float streak = pow(clamp(0.5 + 0.5 * sin(a * 120.0 + m * 0.05), 0.0, 1.0), 30.0) * 0.15;
  vec3 acc = mix(uAcc, hue2rgb(fract(a + uTime * 0.2 + m * 0.01)), uAcid * 0.6);
  vec3 c = uFog * 0.5 + acc * (seam * 0.55 + streak) + uAcc2 * ring * (1.2 + 1.6 * uBeat) + vec3(1.0, 0.95, 0.9) * top * (0.9 + 0.6 * uBands.z);
  gl_FragColor = vec4(mix(c, uFog, fogF(vDepth) * 0.85), 1.0);
}`;

const PYLON_VS = /* glsl */ `
varying float vY; varying float vDepth;
void main() {
  vec3 p = position; vY = uv.y;
  p.y *= 1.0 + uBands.x * 1.8 * uv.y;   // bass stretches the light bars upward
  vec4 mv = modelViewMatrix * instanceMatrix * vec4(p, 1.0); vDepth = -mv.z; gl_Position = projectionMatrix * mv;
}`;
const PYLON_FS = /* glsl */ `
varying float vY; varying float vDepth;
void main() {
  vec3 c = uAcc * (0.35 + 1.4 * uBeat) * (0.4 + vY) + uAcc2 * pow(clamp(vY, 0.0, 1.0), 6.0) * (0.5 + uDown * 2.0);
  gl_FragColor = vec4(mix(c, uFog, fogF(vDepth)), 1.0);
}`;
const ARCH_FS = /* glsl */ `
varying float vY; varying float vDepth;
void main() {
  vec3 c = mix(uAcc2, hue2rgb(fract(uTime * 0.3 + vDepth * 0.002)), uAcid * 0.5) * (0.5 + 2.2 * uDown + 0.6 * uBeat);
  gl_FragColor = vec4(mix(c, uFog, fogF(vDepth)), 1.0);
}`;

export function buildTrackMeshes(path: Path, fromS = 0, toS = path.track.durationS): THREE.Group {
  const g = new THREE.Group(), t = path.track, W = path.halfWidth;
  const first = Math.max(0, Math.min(path.n - 2, Math.floor(fromS * t.hz)));
  const last = Math.max(first + 1, Math.min(path.n - 1, Math.ceil(toS * t.hz))), n = last - first + 1;
  const fromD = t.dist[first], toD = t.dist[last];
  // ribbon + walls
  const vp = new Float32Array(n * 6), uv = new Float32Array(n * 4), tun = new Float32Array(n * 2), idx: number[] = [];
  const wp = new Float32Array(n * 12), wuv = new Float32Array(n * 8), widx: number[] = [];
  for (let i = 0; i < n; i++) {
    const P = path.pos, R = path.right, Up = path.up, j = first + i, o = j * 3;
    const L = [P[o] - R[o] * W, P[o + 1] - R[o + 1] * W, P[o + 2] - R[o + 2] * W], Rr = [P[o] + R[o] * W, P[o + 1] + R[o + 1] * W, P[o + 2] + R[o + 2] * W];
    vp.set([...L, ...Rr], i * 6);
    uv.set([-1, t.dist[j], 1, t.dist[j]], i * 4);
    tun.set([t.tunnel[j], t.tunnel[j]], i * 2);
    const hgt = 0.9;
    wp.set([...L, L[0] + Up[o] * hgt, L[1] + Up[o + 1] * hgt, L[2] + Up[o + 2] * hgt, ...Rr, Rr[0] + Up[o] * hgt, Rr[1] + Up[o + 1] * hgt, Rr[2] + Up[o + 2] * hgt], i * 12);
    wuv.set([0, t.dist[j], 1, t.dist[j], 0, t.dist[j], 1, t.dist[j]], i * 8);
    if (i) {
      const a = (i - 1) * 2, b = i * 2; idx.push(a, b, a + 1, a + 1, b, b + 1);
      const c = (i - 1) * 4, d = i * 4; widx.push(c, d, c + 1, c + 1, d, d + 1, c + 2, d + 2, c + 3, c + 3, d + 2, d + 3);
    }
  }
  const rg = new THREE.BufferGeometry();
  rg.setAttribute('position', new THREE.BufferAttribute(vp, 3)); rg.setAttribute('uv', new THREE.BufferAttribute(uv, 2)); rg.setAttribute('aTun', new THREE.BufferAttribute(tun, 1)); rg.setIndex(idx);
  const ribbon = new THREE.Mesh(rg, shader(RIBBON_VS, RIBBON_FS, { uLanes: { value: t.lanes }, uInner: { value: path.inner / W } }, { side: THREE.DoubleSide }));
  const wg = new THREE.BufferGeometry(); wg.setAttribute('position', new THREE.BufferAttribute(wp, 3)); wg.setAttribute('uv', new THREE.BufferAttribute(wuv, 2)); wg.setIndex(widx);
  const walls = new THREE.Mesh(wg, shader(TUBE_VS, /* glsl */ `varying vec2 vUv; varying float vDepth;
    void main() { float h = vUv.x; float band = pow(clamp(0.5 + 0.5 * cos(vUv.y * 0.6 - uTime * 6.0), 0.0, 1.0), 8.0);
      vec3 c = uAcc * ((1.0 - h) * 0.9 + band * 0.25 * (1.0 - h)); gl_FragColor = vec4(c * (1.0 - fogF(vDepth)), (1.0 - h) * 0.55); }`,
  {}, { transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide }));
  ribbon.frustumCulled = false; walls.frustumCulled = false;
  g.add(ribbon, walls);

  // tunnel tubes: a 270° octagonal arch over the track
  const tubeMat = shader(TUBE_VS, TUBE_FS, {}, { side: THREE.DoubleSide });
  const SEG = 9, R = W + 1.8;
  for (const tu of t.tunnels) {
    const i0 = Math.max(first, Math.floor(tu.t0 * t.hz)), i1 = Math.min(last, Math.ceil(tu.t1 * t.hz));
    if (i1 - i0 < 3) continue;
    const cnt = i1 - i0 + 1, pos = new Float32Array(cnt * (SEG + 1) * 3), tuv = new Float32Array(cnt * (SEG + 1) * 2), ix: number[] = [];
    for (let i = i0; i <= i1; i++) {
      const o = i * 3, row = i - i0;
      for (let k = 0; k <= SEG; k++) {
        const th = -0.18 * Math.PI + (k / SEG) * 1.36 * Math.PI, cx = Math.cos(th) * R, cy = Math.sin(th) * R * 0.75 + 0.3;
        pos.set([path.pos[o] + path.right[o] * cx + path.up[o] * cy, path.pos[o + 1] + path.right[o + 1] * cx + path.up[o + 1] * cy, path.pos[o + 2] + path.right[o + 2] * cx + path.up[o + 2] * cy], (row * (SEG + 1) + k) * 3);
        tuv.set([k / SEG, t.dist[i]], (row * (SEG + 1) + k) * 2);
        if (row && k) { const a = (row - 1) * (SEG + 1) + k - 1, b = row * (SEG + 1) + k - 1; ix.push(a, b, a + 1, a + 1, b, b + 1); }
      }
    }
    const tg = new THREE.BufferGeometry(); tg.setAttribute('position', new THREE.BufferAttribute(pos, 3)); tg.setAttribute('uv', new THREE.BufferAttribute(tuv, 2)); tg.setIndex(ix);
    const mesh = new THREE.Mesh(tg, tubeMat); mesh.frustumCulled = false; g.add(mesh);
  }

  if (!g.children.some((o) => (o as THREE.Mesh).material === tubeMat)) tubeMat.dispose();

  // light pylons every 24 m outside the walls (not inside tunnels)
  const fr = newFrame(), m = new THREE.Matrix4(), q = new THREE.Quaternion(), v = new THREE.Vector3(), one = new THREE.Vector3(1, 1, 1);
  const spots: Array<[number, number]> = [];
  for (let d = Math.max(12, Math.ceil((fromD - 12) / 24) * 24 + 12); d < toD; d += 24) { path.at(d, fr); if (fr.tunnel < 0.5) spots.push([d, -1], [d, 1]); }
  const pg = new THREE.BoxGeometry(0.28, 6, 0.28); pg.translate(0, 3, 0);
  const pylons = new THREE.InstancedMesh(pg, shader(PYLON_VS, PYLON_FS), Math.max(1, spots.length));
  const basis = new THREE.Matrix4();
  spots.forEach(([d, side], k) => {
    path.at(d, fr);
    v.copy(fr.p).addScaledVector(fr.r, side * (W + 1.8));
    basis.makeBasis(fr.r, fr.u, fr.f.clone().negate()); q.setFromRotationMatrix(basis);
    m.compose(v, q, one); pylons.setMatrixAt(k, m);
  });
  pylons.count = spots.length; pylons.frustumCulled = false; g.add(pylons);

  // phrase arches (neon frames that flash on downbeats)
  const post = new THREE.BoxGeometry(0.45, 7.5, 0.45);
  const parts = [post.clone().translate(-W - 0.8, 3.75, 0), post.clone().translate(W + 0.8, 3.75, 0), new THREE.BoxGeometry(2 * W + 2.05, 0.45, 0.45).translate(0, 7.5, 0)];
  const archGeo = mergeGeometries(parts)!;
  post.dispose(); for (const part of parts) part.dispose();
  const phrases = t.phrases.filter((p) => p > 1 && p >= fromS && p <= toS);
  const arches = new THREE.InstancedMesh(archGeo, shader(PYLON_VS.replace('p.y *= 1.0 + uBands.x * 1.8 * uv.y;', ''), ARCH_FS), Math.max(1, phrases.length));
  phrases.forEach((p, k) => {
    const d = path.distAt(p); path.at(d, fr);
    basis.makeBasis(fr.r, fr.u, fr.f.clone().negate()); q.setFromRotationMatrix(basis);
    m.compose(fr.p, q, one); arches.setMatrixAt(k, m);
  });
  arches.count = phrases.length; arches.frustumCulled = false; g.add(arches);
  return g;
}

export { LW };
