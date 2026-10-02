// Static island: terrain (vertex-coloured, flat-shaded, paths painted in), coast rocks, islets, and the lighthouse.
import * as THREE from 'three';
import { islandHeight, LIGHTHOUSE, LIGHTHOUSE_Y, noise2 } from '../sim/layout';
import { lam, mergeStatic, mesh, mulberry, roofGeo, softTexture } from './util';

export type Seg = [number, number, number, number]; // x1 z1 x2 z2

export interface Terrain { mesh: THREE.Mesh; paintPaths(segs: Seg[], age: number[]): void; onPath(x: number, z: number): boolean }

const SAND = new THREE.Color(0xe6d3a0), WETSAND = new THREE.Color(0xb9a676), ROCK = new THREE.Color(0x8a8378), ROCK2 = new THREE.Color(0x6f6a63);
const GRASS = [new THREE.Color(0x7fb04a), new THREE.Color(0x6fa543), new THREE.Color(0x8cbb52), new THREE.Color(0x76a948)];
const SLOPE = [new THREE.Color(0x5f9440), new THREE.Color(0x689a42)];
const DIRT = new THREE.Color(0xb79a6a), COBBLE = new THREE.Color(0xa9a39a);

export function createTerrain(): Terrain {
  const W = 128, D = 92, SX = 128, SZ = 92;
  const g0 = new THREE.PlaneGeometry(W, D, SX, SZ); g0.rotateX(-Math.PI / 2); g0.translate(2, 0, -1);
  const g = g0.toNonIndexed(); g0.dispose();
  const pos = g.attributes.position;
  for (let i = 0; i < pos.count; i++) pos.setY(i, islandHeight(pos.getX(i), pos.getZ(i)));
  g.computeVertexNormals();
  const faces = pos.count / 3;
  const base = new Float32Array(pos.count * 3);
  const cx = new Float32Array(faces), cz = new Float32Array(faces), soil = new Uint8Array(faces);
  const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3(), n = new THREE.Vector3();
  const col = new THREE.Color();
  for (let f = 0; f < faces; f++) {
    a.fromBufferAttribute(pos, f * 3); b.fromBufferAttribute(pos, f * 3 + 1); c.fromBufferAttribute(pos, f * 3 + 2);
    n.subVectors(c, b).cross(b.clone().sub(a)).normalize(); if (n.y < 0) n.negate();
    const h = (a.y + b.y + c.y) / 3, x = (a.x + b.x + c.x) / 3, z = (a.z + b.z + c.z) / 3;
    cx[f] = x; cz[f] = z;
    const v = noise2(x * 0.35, z * 0.35);
    if (n.y < 0.5 || (h > 4 && Math.hypot(x - LIGHTHOUSE.x, z - LIGHTHOUSE.z) < 10 && n.y < 0.9)) col.copy(v > 0.5 ? ROCK : ROCK2);
    else if (n.y < 0.8 && h > 0.85) col.copy(SLOPE[Math.floor(v * 1.99)]);
    else if (h < 0.15) col.copy(WETSAND);
    else if (h < 0.85) { col.copy(SAND); soil[f] = 1; }
    else { col.copy(GRASS[Math.floor(v * 3.99)]).offsetHSL(0, 0, (noise2(x * 0.08, z * 0.08) - 0.5) * 0.08); soil[f] = 1; }
    for (let k = 0; k < 3; k++) col.toArray(base, (f * 3 + k) * 3);
  }
  const colors = new THREE.BufferAttribute(base.slice(), 3);
  g.setAttribute('color', colors);
  const m = new THREE.Mesh(g, new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true }));
  m.receiveShadow = true;
  let segs: Seg[] = [];
  const distSeg = (x: number, z: number, s: Seg) => {
    const dx = s[2] - s[0], dz = s[3] - s[1], L = dx * dx + dz * dz || 1;
    const t = Math.max(0, Math.min(1, ((x - s[0]) * dx + (z - s[1]) * dz) / L));
    return Math.hypot(x - s[0] - t * dx, z - s[1] - t * dz);
  };
  return {
    mesh: m,
    onPath: (x, z) => segs.some((s) => distSeg(x, z, s) < 0.9),
    paintPaths(newSegs, age) {
      segs = newSegs;
      const arr = colors.array as Float32Array;
      arr.set(base);
      for (let f = 0; f < faces; f++) {
        if (!soil[f]) continue;
        for (let s = 0; s < segs.length; s++) {
          const d = distSeg(cx[f], cz[f], segs[s]);
          const w = 0.55 + 0.15 * noise2(cx[f] * 0.9, cz[f] * 0.9);
          if (d < w) {
            col.copy(age[s] > 0.6 ? COBBLE : DIRT).offsetHSL(0, 0, (noise2(cx[f] * 2, cz[f] * 2) - 0.5) * 0.06);
            for (let k = 0; k < 3; k++) col.toArray(arr, (f * 3 + k) * 3);
            break;
          }
        }
      }
      colors.needsUpdate = true;
    },
  };
}

/** Coast rocks, reefs (where ships wreck), and distant islets. */
export function createScenery(): THREE.Group {
  const grp = new THREE.Group();
  const r = mulberry(7);
  const rockGeo = new THREE.DodecahedronGeometry(1, 0);
  for (let i = 0; i < 70; i++) {
    const ang = r() * Math.PI * 2;
    const x = 3 + Math.cos(ang) * 31 * (0.95 + r() * 0.15), z = -1 + Math.sin(ang) * 20 * (0.95 + r() * 0.2);
    if (z > 10 && x > -8 && x < 24) continue; // keep the harbour beach clear
    const h = islandHeight(x, z);
    if (h > 1.5 || h < -2.5) continue;
    const s = 0.6 + r() * 1.6;
    const m = mesh(rockGeo, lam(r() > 0.5 ? 0x8a8378 : 0x75706a), x, h * 0.5, z);
    m.scale.set(s, s * (0.6 + r() * 0.5), s); m.rotation.set(r() * 3, r() * 3, r() * 3);
    grp.add(m);
  }
  for (const [x, z, s] of REEFS) {
    const m = mesh(rockGeo, lam(0x5f5a55), x, -0.2, z); m.scale.set(s, s * 0.8, s); m.rotation.set(r(), r() * 3, r()); grp.add(m);
    const m2 = mesh(rockGeo, lam(0x6f6a63), x + s * 0.9, -0.4, z + s * 0.3); m2.scale.setScalar(s * 0.6); grp.add(m2);
  }
  // islets with a tree or two
  for (const [x, z, s] of [[62, -42, 7], [-70, -36, 5], [88, 8, 4], [-46, -60, 6]] as const) {
    const cone = mesh(new THREE.ConeGeometry(s, s * 0.7, 7), lam(0x7a8a5a), x, s * 0.2, z); grp.add(cone);
    const sand = mesh(new THREE.CylinderGeometry(s * 1.15, s * 1.3, 0.6, 9), lam(0xd9c690), x, -0.1, z); grp.add(sand);
    for (let k = 0; k < 2; k++) {
      const tx = x + (r() - 0.5) * s * 0.6, tz = z + (r() - 0.5) * s * 0.6;
      grp.add(mesh(new THREE.CylinderGeometry(0.15, 0.2, 1.4, 5), lam(0x6b4a2e), tx, s * 0.55 + 0.6, tz));
      grp.add(mesh(new THREE.IcosahedronGeometry(1.1, 0), lam(0x4f8a3c), tx, s * 0.55 + 1.7, tz));
    }
  }
  mergeStatic(grp);
  return grp;
}
/** Reef rocks off the harbour: [x, z, size]. Lost ships drift onto the first one. */
export const REEFS: Array<[number, number, number]> = [[-14, 33, 1.6], [-19, 30, 1.1], [30, 30, 1.3]];

export interface Lighthouse {
  group: THREE.Group;
  lanternPos: THREE.Vector3;
  update(o: { t: number; lamp: number; night: number; bloom: number; beamAngle: number; camera: THREE.Camera; lens: number }): void;
}

export function createLighthouse(color: string): Lighthouse {
  const grp = new THREE.Group();
  const X = LIGHTHOUSE.x, Y = LIGHTHOUSE_Y, Z = LIGHTHOUSE.z;
  grp.position.set(X, Y, Z);
  const H = 12, R0 = 2.1, R1 = 1.35;
  const rAt = (y: number) => R0 - (R0 - R1) * (y / H);
  grp.add(mesh(new THREE.CylinderGeometry(2.9, 3.2, 1.2, 10), lam(0x9a948a), 0, 0.3, 0));
  grp.add(mesh(new THREE.CylinderGeometry(R1, R0, H, 18, 1), lam(0xf4f1e8), 0, 0.9 + H / 2, 0));
  const stripe = new THREE.MeshLambertMaterial({ color: new THREE.Color(color), flatShading: true });
  for (const [y0, y1] of [[3, 5], [7.4, 9.4]]) grp.add(mesh(new THREE.CylinderGeometry(rAt(y1) + 0.04, rAt(y0) + 0.04, y1 - y0, 18), stripe, 0, 0.9 + (y0 + y1) / 2, 0));
  // door + windows
  grp.add(mesh(new THREE.BoxGeometry(0.9, 1.6, 0.3), lam(0x5a3a22), 0, 1.7, R0 - 0.05));
  const winMat = new THREE.MeshBasicMaterial({ color: 0x2a3440 });
  for (const [y, ang] of [[4.2, 0.4], [6.3, -0.5], [8.6, 0.2], [10.6, -0.3]]) {
    const w = mesh(new THREE.BoxGeometry(0.4, 0.7, 0.2), winMat, Math.sin(ang) * rAt(y - 0.9), y, Math.cos(ang) * rAt(y - 0.9), false); w.rotation.y = ang; grp.add(w);
  }
  const top = 0.9 + H;
  grp.add(mesh(new THREE.CylinderGeometry(2.15, 1.6, 0.4, 18), lam(0x3c414a), 0, top + 0.2, 0));
  const rail = mesh(new THREE.TorusGeometry(2.0, 0.05, 4, 24), lam(0x2d3138), 0, top + 1.0, 0); rail.rotation.x = Math.PI / 2; grp.add(rail);
  for (let i = 0; i < 12; i++) { const a = (i / 12) * Math.PI * 2; grp.add(mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.8, 4), lam(0x2d3138), Math.cos(a) * 2, top + 0.6, Math.sin(a) * 2, false)); }
  const glassMat = new THREE.MeshBasicMaterial({ color: 0xffe9a0 });
  const lanternY = top + 1.25;
  grp.add(mesh(new THREE.CylinderGeometry(1.15, 1.15, 1.7, 10), glassMat, 0, lanternY, 0, false));
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * Math.PI * 2;
    const bar = mesh(new THREE.BoxGeometry(0.08, 1.7, 0.08), lam(0x2d3138), Math.cos(a) * 1.17, lanternY, Math.sin(a) * 1.17, false); grp.add(bar);
  }
  grp.add(mesh(new THREE.ConeGeometry(1.5, 1.3, 10), lam(0x8c2f2a), 0, lanternY + 1.5, 0));
  grp.add(mesh(new THREE.SphereGeometry(0.22, 8, 6), lam(0xc9a43a), 0, lanternY + 2.25, 0));
  // keeper's cottage + fence
  const cot = new THREE.Group(); cot.position.set(4.2, 0, 2.6); cot.rotation.y = -0.4;
  cot.add(mesh(new THREE.BoxGeometry(3, 1.8, 2.2), lam(0xf0ebe0), 0, 0.9, 0));
  cot.add(mesh(roofGeo(3.3, 1.2, 2.6), lam(0x8c2f2a), 0, 1.8, 0));
  cot.add(mesh(new THREE.BoxGeometry(0.4, 1, 0.4), lam(0x9a948a), 0.9, 2.5, -0.3));
  const cw = mesh(new THREE.BoxGeometry(0.5, 0.5, 0.1), winMat, -0.7, 1.0, 1.12, false); cot.add(cw);
  cot.add(mesh(new THREE.BoxGeometry(0.6, 1.1, 0.1), lam(0x4a6a8a), 0.5, 0.55, 1.12, false));
  grp.add(cot);

  // ivy + climbing roses (shown bottom-up as the island blooms)
  const r = mulberry(31);
  const leafM = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), one = new THREE.Vector3();
  const leaves: Array<{ y: number; m: THREE.Matrix4; c: number }> = [], roses: Array<{ y: number; m: THREE.Matrix4; c: number }> = [];
  for (let i = 0; i < 46; i++) {
    const y = 1 + Math.pow(r(), 1.4) * 10.5, a = r() * Math.PI * 2 + Math.PI * 0.35, rr = rAt(y - 0.9) + 0.05;
    const flower = i % 4 === 3, c = flower ? (r() > 0.5 ? 0xff7eb6 : 0xffe066) : (r() > 0.5 ? 0x3f7d3a : 0x4f9a42);
    e.set(0, Math.PI / 2 - a, 0); q.setFromEuler(e); one.set(0.6, 1.2, 1);
    leafM.compose(new THREE.Vector3(Math.cos(a) * rr, y, Math.sin(a) * rr), q, one);
    (flower ? roses : leaves).push({ y, m: leafM.clone(), c });
  }
  const ivyMesh = (geo: THREE.BufferGeometry, list: typeof leaves) => {
    list.sort((p, q2) => p.y - q2.y);
    const im = new THREE.InstancedMesh(geo, new THREE.MeshLambertMaterial({ color: 0xffffff, flatShading: true }), list.length);
    list.forEach((it, i) => { im.setMatrixAt(i, it.m); im.setColorAt(i, new THREE.Color(it.c)); });
    im.count = 0; grp.add(im); return { im, n: list.length };
  };
  const ivy = [ivyMesh(new THREE.IcosahedronGeometry(0.42, 0), leaves), ivyMesh(new THREE.IcosahedronGeometry(0.2, 0), roses)];

  // lamp glow + beam (two opposing additive cones with alpha falling off with distance)
  const lanternPos = new THREE.Vector3(X, Y + lanternY, Z);
  const tex = softTexture(128, 0.1);
  const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, color: 0xffe2a0, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }));
  glow.position.set(0, lanternY, 0); grp.add(glow);
  const flare = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, color: 0xfff4d0, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, depthTest: false, fog: false }));
  flare.position.set(0, lanternY, 0); flare.renderOrder = 10; grp.add(flare);
  const beamMat = new THREE.ShaderMaterial({
    uniforms: { uOpacity: { value: 0.3 }, uColor: { value: new THREE.Color(0xfff0b8) } },
    vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
    fragmentShader: 'uniform float uOpacity; uniform vec3 uColor; varying vec2 vUv; void main(){ float a = uOpacity * pow(vUv.y, 1.4); gl_FragColor = vec4(uColor * a, a); }',
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
  });
  const L = 95;
  const coneGeo = new THREE.ConeGeometry(9, L, 24, 1, true); coneGeo.rotateZ(Math.PI / 2); coneGeo.translate(L / 2, 0, 0);
  const beam = new THREE.Group(); beam.position.set(0, lanternY, 0);
  const tilt = new THREE.Group(); tilt.rotation.z = -0.1; beam.add(tilt);
  tilt.add(new THREE.Mesh(coneGeo, beamMat));
  const back = new THREE.Mesh(coneGeo, beamMat); back.rotation.y = Math.PI; tilt.add(back);
  // lens tiers: brass Fresnel rings (2), a second pair of beams (3), a pennant on the roof (4)
  const twin = new THREE.Group(); twin.rotation.y = Math.PI / 2; twin.visible = false;
  for (const ry of [0, Math.PI]) { const c = new THREE.Mesh(coneGeo, beamMat); c.rotation.set(0, ry, -0.1); twin.add(c); }
  beam.add(twin);
  const brass = new THREE.Group(); brass.visible = false;
  for (const dy of [-0.8, 0, 0.8]) { const ring = mesh(new THREE.TorusGeometry(1.2, 0.07, 4, 20), lam(0xc9a43a), 0, lanternY + dy, 0, false); ring.rotation.x = Math.PI / 2; brass.add(ring); }
  brass.add(mesh(new THREE.CylinderGeometry(0.55, 0.55, 1.2, 10), new THREE.MeshBasicMaterial({ color: 0xfff6d0 }), 0, lanternY, 0, false));
  grp.add(brass);
  const pennant = new THREE.Group(); pennant.visible = false; pennant.position.set(0, lanternY + 2.3, 0);
  pennant.add(mesh(new THREE.CylinderGeometry(0.04, 0.04, 2, 5), lam(0x2d3138), 0, 1, 0, false));
  const flag = mesh(new THREE.BoxGeometry(1.2, 0.6, 0.03), stripe, 0.62, 1.65, 0, false); pennant.add(flag);
  grp.add(pennant);
  grp.add(beam);
  mergeStatic(grp, (o) => o === beam || o === brass || o === pennant);

  const tmp = new THREE.Vector3(), dir = new THREE.Vector3();
  return {
    group: grp, lanternPos,
    update({ t, lamp, night, bloom, beamAngle, camera, lens: tier }) {
      const lens = (tier - 1) / 3;
      brass.visible = tier >= 2; twin.visible = tier >= 3; pennant.visible = tier >= 4;
      flag.rotation.y = Math.sin(t * 2.3) * 0.3;
      beamMat.uniforms.uColor.value.setHex(tier >= 4 ? 0xf2f6ff : 0xfff0b8);
      beam.rotation.y = beamAngle;
      const on = Math.max(0, lamp);
      beamMat.uniforms.uOpacity.value = (0.07 + 0.45 * night) * on * (0.75 + 0.25 * lens);
      glassMat.color.setRGB(0.35 + 0.65 * on, 0.32 + 0.6 * on, 0.25 + 0.4 * on);
      const gs = (3 + 5 * on) * (0.6 + 0.6 * night) * (0.8 + 0.3 * lens);
      glow.scale.set(gs, gs, 1); (glow.material as THREE.SpriteMaterial).opacity = 0.25 + 0.6 * on;
      // flare when either beam points at the camera
      tmp.copy(camera.position).sub(lanternPos); tmp.y = 0; tmp.normalize();
      dir.set(Math.cos(beamAngle), 0, -Math.sin(beamAngle));
      const facing = Math.pow(Math.abs(dir.dot(tmp)), 40) * on;
      const fs = 2 + 26 * facing * (0.4 + 0.6 * night);
      flare.scale.set(fs, fs, 1); (flare.material as THREE.SpriteMaterial).opacity = facing * (0.35 + 0.55 * night);
      for (const v of ivy) v.im.count = Math.floor(v.n * Math.min(1, bloom));
      winMat.color.setRGB(0.16 + 0.84 * night, 0.2 + 0.6 * night, 0.25 + 0.15 * night);
    },
  };
}
