// Static island: terrain (vertex-coloured, flat-shaded, paths painted in), coast rocks, islets, and the lighthouse.
import * as THREE from 'three';
import { islandHeight, LIGHTHOUSE, LIGHTHOUSE_Y, noise2 } from '../sim/layout';
import { NOISE_GLSL, blob, box, cone, cyl, ico, lam, mergeStatic, mesh, mulberry, rock, roofGeo, softTexture, sphere, stone, tiles, torus } from './util';
import type { Season } from '../sim/extras';

export type Seg = [number, number, number, number]; // x1 z1 x2 z2

export interface Terrain { mesh: THREE.Mesh; paintPaths(segs: Seg[], age: number[]): void; onPath(x: number, z: number): boolean; setSeason(s: Season): void }

const SAND = new THREE.Color(0xe6d3a0), WETSAND = new THREE.Color(0xb9a676), ROCK = new THREE.Color(0x8a8378), ROCK2 = new THREE.Color(0x6f6a63);
const GRASS = [new THREE.Color(0x7fb04a), new THREE.Color(0x6fa543), new THREE.Color(0x8cbb52), new THREE.Color(0x76a948)];
const SLOPE = [new THREE.Color(0x5f9440), new THREE.Color(0x689a42)];
const DIRT = new THREE.Color(0xb79a6a), COBBLE = new THREE.Color(0xa9a39a);
/** Per-season grass and slope palettes (spring is the base look). */
const hexes = (...h: number[]) => h.map((x) => new THREE.Color(x));
const SEASON_GRASS: Record<Season, THREE.Color[]> = {
  spring: GRASS, summer: hexes(0x6aa83e, 0x5f9c38, 0x78b244, 0x64a03c),
  autumn: hexes(0xa8a548, 0x9a9a40, 0xb5ad55, 0x8f9a3f), winter: hexes(0xeef3f7, 0xe3ebf2, 0xf6f9fb, 0xdfe8ef),
};
const SEASON_SLOPE: Record<Season, THREE.Color[]> = {
  spring: SLOPE, summer: hexes(0x578a3a, 0x60923c), autumn: hexes(0x7d8a3c, 0x86863f), winter: hexes(0xc9d3dc, 0xd8e0e6),
};
const WINTER_SAND = new THREE.Color(0xd9d2bf), WINTER_DIRT = new THREE.Color(0xa89a86);

export function createTerrain(): Terrain {
  // 2 vertices per metre, indexed so normals (and colours) blend smoothly: no facets read as triangles.
  const W = 128, D = 92, SX = 256, SZ = 184;
  const g = new THREE.PlaneGeometry(W, D, SX, SZ); g.rotateX(-Math.PI / 2); g.translate(2, 0, -1);
  g.deleteAttribute('uv');
  const pos = g.attributes.position;
  for (let i = 0; i < pos.count; i++) pos.setY(i, islandHeight(pos.getX(i), pos.getZ(i)));
  g.computeVertexNormals();
  const nrm = g.attributes.normal;
  const N = pos.count;
  const base = new Float32Array(N * 3);
  const vx = new Float32Array(N), vz = new Float32Array(N), soil = new Uint8Array(N);
  const kind = new Uint8Array(N), fv = new Float32Array(N), fv2 = new Float32Array(N); // 0 rock 1 slope 2 wet sand 3 sand 4 grass
  const col = new THREE.Color();
  for (let i = 0; i < N; i++) {
    const x = pos.getX(i), h = pos.getY(i), z = pos.getZ(i), ny = nrm.getY(i);
    vx[i] = x; vz[i] = z;
    fv[i] = noise2(x * 0.35, z * 0.35); fv2[i] = noise2(x * 0.08, z * 0.08);
    if (ny < 0.55 || (h > 4 && Math.hypot(x - LIGHTHOUSE.x, z - LIGHTHOUSE.z) < 10 && ny < 0.9)) kind[i] = 0;
    else if (ny < 0.82 && h > 0.85) kind[i] = 1;
    else if (h < 0.15) kind[i] = 2;
    else if (h < 0.85) { kind[i] = 3; soil[i] = 1; }
    else { kind[i] = 4; soil[i] = 1; }
  }
  let season: Season = 'spring';
  const tmpA = new THREE.Color(), tmpB = new THREE.Color();
  /** Blend a palette by a 0..1 noise value (smooth, no hard per-face steps). */
  const palette = (P: THREE.Color[], v: number) => { const f = Math.min(0.999, Math.max(0, v)) * (P.length - 1), k = Math.floor(f); return col.copy(P[k]).lerp(P[Math.min(P.length - 1, k + 1)], f - k); };
  const recolour = () => {
    const G = SEASON_GRASS[season], S = SEASON_SLOPE[season], snow = season === 'winter';
    for (let i = 0; i < N; i++) {
      const v = fv[i];
      if (kind[i] === 0) col.copy(tmpA.copy(ROCK2).lerp(tmpB.copy(ROCK), v));
      else if (kind[i] === 1) palette(S, v);
      else if (kind[i] === 2) col.copy(WETSAND);
      else if (kind[i] === 3) col.copy(snow ? WINTER_SAND : SAND);
      else palette(G, v).offsetHSL(0, 0, (fv2[i] - 0.5) * (snow ? 0.04 : 0.08));
      col.toArray(base, i * 3);
    }
  };
  recolour();
  const colors = new THREE.BufferAttribute(base.slice(), 3);
  g.setAttribute('color', colors);
  const mat = new THREE.MeshLambertMaterial({ vertexColors: true });
  // Surface detail in the fragment shader: fine colour noise everywhere, layered strata on cliffs, speckled grass.
  mat.onBeforeCompile = (sh) => {
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vWPos; varying vec3 vWNrm;')
      .replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\nvWPos = (modelMatrix * vec4(transformed, 1.0)).xyz; vWNrm = normalize(mat3(modelMatrix) * objectNormal);');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vWPos; varying vec3 vWNrm;' + NOISE_GLSL)
      .replace('#include <color_fragment>', `#include <color_fragment>
        vec3 wn = normalize(vWNrm);
        float steep = 1.0 - smoothstep(0.55, 0.85, wn.y);
        float n1 = fbm(vWPos.xz * 0.9), n2 = vnoise(vWPos.xz * 4.5);
        // strata: horizontal bands warped by noise, only on steep rock
        float band = sin(vWPos.y * 5.5 + fbm(vWPos.xz * 0.6 + vWPos.y * 0.3) * 5.0);
        float strata = steep * (0.08 * band + 0.1 * (vnoise(vec2(vWPos.x + vWPos.z, vWPos.y * 3.0) * 1.7) - 0.5));
        float flat_ = 1.0 - steep;
        diffuseColor.rgb *= 1.0 + (n1 - 0.5) * 0.18 + (n2 - 0.5) * 0.07 * flat_ + strata;
        // dark crevices at the foot of cliffs and lighter lips on top
        diffuseColor.rgb *= 1.0 - 0.12 * steep * smoothstep(0.55, 0.9, n2);`);
  };
  const m = new THREE.Mesh(g, mat);
  m.receiveShadow = true;
  let segs: Seg[] = [], segAge: number[] = [];
  const distSeg = (x: number, z: number, s: Seg) => {
    const dx = s[2] - s[0], dz = s[3] - s[1], L = dx * dx + dz * dz || 1;
    const t = Math.max(0, Math.min(1, ((x - s[0]) * dx + (z - s[1]) * dz) / L));
    return Math.hypot(x - s[0] - t * dx, z - s[1] - t * dz);
  };
  const pathCol = new THREE.Color();
  return {
    mesh: m,
    onPath: (x, z) => segs.some((s) => distSeg(x, z, s) < 0.9),
    setSeason(s) { if (s === season) return; season = s; recolour(); this.paintPaths(segs, segAge); },
    paintPaths(newSegs, age) {
      segs = newSegs; segAge = age;
      const arr = colors.array as Float32Array;
      arr.set(base);
      const boxes = segs.map((sg) => [Math.min(sg[0], sg[2]) - 1.2, Math.max(sg[0], sg[2]) + 1.2, Math.min(sg[1], sg[3]) - 1.2, Math.max(sg[1], sg[3]) + 1.2]);
      for (let i = 0; i < N; i++) {
        if (!soil[i]) continue;
        const x = vx[i], z = vz[i];
        let best = 9, bs = -1;
        for (let s = 0; s < segs.length; s++) {
          const bx = boxes[s]; if (x < bx[0] || x > bx[1] || z < bx[2] || z > bx[3]) continue;
          const d = distSeg(x, z, segs[s]); if (d < best) { best = d; bs = s; }
        }
        if (bs < 0) continue;
        const w = 0.55 + 0.15 * noise2(x * 0.9, z * 0.9);
        const k = 1 - Math.max(0, Math.min(1, (best - (w - 0.3)) / 0.45)); // soft edge
        if (k <= 0) continue;
        pathCol.copy(age[bs] > 0.6 ? COBBLE : season === 'winter' ? WINTER_DIRT : DIRT).offsetHSL(0, 0, (noise2(x * 2, z * 2) - 0.5) * 0.06);
        col.fromArray(base, i * 3).lerp(pathCol, k * k * (3 - 2 * k)).toArray(arr, i * 3);
      }
      colors.needsUpdate = true;
    },
  };
}

/** Coast rocks, reefs (where ships wreck), and distant islets. */
export function createScenery(): THREE.Group {
  const grp = new THREE.Group();
  const r = mulberry(7);
  const rocks = [rock(3), rock(7), rock(11), rock(19)];
  for (let i = 0; i < 70; i++) {
    const ang = r() * Math.PI * 2;
    const x = 3 + Math.cos(ang) * 31 * (0.95 + r() * 0.15), z = -1 + Math.sin(ang) * 20 * (0.95 + r() * 0.2);
    if (z > 10 && x > -8 && x < 24) continue; // keep the harbour beach clear
    const h = islandHeight(x, z);
    if (h > 1.5 || h < -2.5) continue;
    const s = 0.6 + r() * 1.6;
    const m = mesh(rocks[i % 4], lam(r() > 0.5 ? 0x8a8378 : 0x75706a), x, h * 0.5, z);
    m.scale.set(s, s * (0.6 + r() * 0.5), s); m.rotation.set(r() * 3, r() * 3, r() * 3);
    grp.add(m);
  }
  for (const [x, z, s] of REEFS) {
    const m = mesh(rocks[1], lam(0x5f5a55), x, -0.2, z); m.scale.set(s, s * 0.8, s); m.rotation.set(r(), r() * 3, r()); grp.add(m);
    const m2 = mesh(rocks[2], lam(0x6f6a63), x + s * 0.9, -0.4, z + s * 0.3); m2.scale.setScalar(s * 0.6); grp.add(m2);
  }
  // islets with a tree or two: a rounded grassy knoll on a sandy skirt
  for (const [x, z, s] of [[62, -42, 7], [-70, -36, 5], [88, 8, 4], [-46, -60, 6]] as const) {
    const hill = mesh(blob(1, 0.12, x + z, 3), lam(0x7a8a5a), x, -s * 0.12, z); hill.scale.set(s, s * 0.45, s); grp.add(hill);
    const sand = mesh(cyl(s * 1.15, s * 1.3, 0.6), lam(0xd9c690), x, -0.1, z); grp.add(sand);
    for (let k = 0; k < 2; k++) {
      const tx = x + (r() - 0.5) * s * 0.6, tz = z + (r() - 0.5) * s * 0.6;
      grp.add(mesh(cyl(0.15, 0.2, 1.4, 5), lam(0x6b4a2e), tx, s * 0.4 + 0.6, tz));
      grp.add(mesh(blob(1.1, 0.12, k + 2), lam(0x4f8a3c), tx, s * 0.4 + 1.7, tz));
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
  grp.add(mesh(cyl(2.9, 3.2, 1.2, 10), stone(0x9a948a), 0, 0.3, 0));
  grp.add(mesh(cyl(R1, R0, H, 18, 1), lam(0xf4f1e8), 0, 0.9 + H / 2, 0));
  const stripe = new THREE.MeshLambertMaterial({ color: new THREE.Color(color) });
  for (const [y0, y1] of [[3, 5], [7.4, 9.4]]) grp.add(mesh(cyl(rAt(y1) + 0.04, rAt(y0) + 0.04, y1 - y0, 18), stripe, 0, 0.9 + (y0 + y1) / 2, 0));
  // door + windows
  grp.add(mesh(box(0.9, 1.6, 0.3), lam(0x5a3a22), 0, 1.7, R0 - 0.05));
  const winMat = new THREE.MeshBasicMaterial({ color: 0x2a3440 });
  for (const [y, ang] of [[4.2, 0.4], [6.3, -0.5], [8.6, 0.2], [10.6, -0.3]]) {
    const w = mesh(box(0.4, 0.7, 0.2), winMat, Math.sin(ang) * rAt(y - 0.9), y, Math.cos(ang) * rAt(y - 0.9), false); w.rotation.y = ang; grp.add(w);
  }
  const top = 0.9 + H;
  grp.add(mesh(cyl(2.15, 1.6, 0.4, 18), lam(0x3c414a), 0, top + 0.2, 0));
  const rail = mesh(torus(2.0, 0.05, 4, 24), lam(0x2d3138), 0, top + 1.0, 0); rail.rotation.x = Math.PI / 2; grp.add(rail);
  for (let i = 0; i < 12; i++) { const a = (i / 12) * Math.PI * 2; grp.add(mesh(cyl(0.04, 0.04, 0.8, 4), lam(0x2d3138), Math.cos(a) * 2, top + 0.6, Math.sin(a) * 2, false)); }
  const glassMat = new THREE.MeshBasicMaterial({ color: 0xffe9a0 });
  const lanternY = top + 1.25;
  grp.add(mesh(cyl(1.15, 1.15, 1.7, 10), glassMat, 0, lanternY, 0, false));
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * Math.PI * 2;
    const bar = mesh(box(0.08, 1.7, 0.08), lam(0x2d3138), Math.cos(a) * 1.17, lanternY, Math.sin(a) * 1.17, false); grp.add(bar);
  }
  grp.add(mesh(cone(1.5, 1.3, 10), tiles(0x8c2f2a), 0, lanternY + 1.5, 0));
  grp.add(mesh(sphere(0.22, 8, 6), lam(0xc9a43a), 0, lanternY + 2.25, 0));
  // keeper's cottage + fence
  const cot = new THREE.Group(); cot.position.set(4.2, 0, 2.6); cot.rotation.y = -0.4;
  cot.add(mesh(box(3, 1.8, 2.2), lam(0xf0ebe0), 0, 0.9, 0));
  cot.add(mesh(roofGeo(3.3, 1.2, 2.6), tiles(0x8c2f2a), 0, 1.8, 0));
  cot.add(mesh(box(0.4, 1, 0.4), lam(0x9a948a), 0.9, 2.5, -0.3));
  const cw = mesh(box(0.5, 0.5, 0.1), winMat, -0.7, 1.0, 1.12, false); cot.add(cw);
  cot.add(mesh(box(0.6, 1.1, 0.1), lam(0x4a6a8a), 0.5, 0.55, 1.12, false));
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
    const im = new THREE.InstancedMesh(geo, new THREE.MeshLambertMaterial({ color: 0xffffff }), list.length);
    list.forEach((it, i) => { im.setMatrixAt(i, it.m); im.setColorAt(i, new THREE.Color(it.c)); });
    im.count = 0; grp.add(im); return { im, n: list.length };
  };
  const ivy = [ivyMesh(ico(0.42, 0), leaves), ivyMesh(ico(0.2, 0), roses)];

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
  const coneGeo = cone(9, L, 24, 1, true); coneGeo.rotateZ(Math.PI / 2); coneGeo.translate(L / 2, 0, 0);
  const beam = new THREE.Group(); beam.position.set(0, lanternY, 0);
  const tilt = new THREE.Group(); tilt.rotation.z = -0.1; beam.add(tilt);
  tilt.add(new THREE.Mesh(coneGeo, beamMat));
  const back = new THREE.Mesh(coneGeo, beamMat); back.rotation.y = Math.PI; tilt.add(back);
  // lens tiers: brass Fresnel rings (2), a second pair of beams (3), a pennant on the roof (4)
  const twin = new THREE.Group(); twin.rotation.y = Math.PI / 2; twin.visible = false;
  for (const ry of [0, Math.PI]) { const c = new THREE.Mesh(coneGeo, beamMat); c.rotation.set(0, ry, -0.1); twin.add(c); }
  beam.add(twin);
  const brass = new THREE.Group(); brass.visible = false;
  for (const dy of [-0.8, 0, 0.8]) { const ring = mesh(torus(1.2, 0.07, 4, 20), lam(0xc9a43a), 0, lanternY + dy, 0, false); ring.rotation.x = Math.PI / 2; brass.add(ring); }
  brass.add(mesh(cyl(0.55, 0.55, 1.2, 10), new THREE.MeshBasicMaterial({ color: 0xfff6d0 }), 0, lanternY, 0, false));
  grp.add(brass);
  const pennant = new THREE.Group(); pennant.visible = false; pennant.position.set(0, lanternY + 2.3, 0);
  pennant.add(mesh(cyl(0.04, 0.04, 2, 5), lam(0x2d3138), 0, 1, 0, false));
  const flag = mesh(box(1.2, 0.6, 0.03), stripe, 0.62, 1.65, 0, false); pennant.add(flag);
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
