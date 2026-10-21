// Midday, 0:43 — inside the belly: a ribbed flesh cathedral, bile pools, bioluminescence, swallowed junk, the survey boat.
import * as THREE from 'three';
import { VoxelGrid } from '../../voxel/grid';
import { noise2, fbm } from '../../voxel/noise';
import { makeStage, type Stage } from '../stage';
import { L, fillBox, addLit, addGlow, fpBars, rnd } from './kit';

const R = (z: number) => 5.6 + 1.3 * Math.sin(z / 11) + 0.6 * Math.sin(z / 4.3 + 1);
const floorY = (x: number, z: number) => 0.14 * Math.sin(x * 1.5 + 2 * Math.sin(z * 0.33)) + 0.08 * Math.sin(z * 0.9 + x * 0.4);
const pool = (x: number, z: number) => z < -9 && noise2(x * 0.22 + 7, z * 0.17, 5) > 0.66;

export function stillBelly(canvas: HTMLCanvasElement, w: number, h: number): Stage {
  const st = makeStage(canvas, w, h, {
    zenith: 0x140612, horizon: 0x2a0f26, fog: 0x2b0d29, fogDensity: 0.03, sunDir: new THREE.Vector3(0.2, 0.8, 0.5), sunColor: 0xff9ac8, sunI: 0.7,
    hemiSky: 0xff6ab0, hemiGround: 0x3a0f30, hemiI: 0.85,
  });
  st.sun.castShadow = false;
  const s = 0.15, wall = new VoxelGrid(s), glow = new VoxelGrid(s), ribs = new VoxelGrid(s);
  fillBox(wall, [-9, -1.2, -78], [9, 12, 8], (x, y, z) => {
    const r = R(z), rx = r * 1.15, ry = r * 0.85, cy = ry - 0.6;
    const th = Math.atan2(y - cy, x);
    const re = 1 + 0.07 * (fbm(th * 2.2 + 3, z * 0.22, 3, 2) - 0.5) * 2;
    const q = Math.hypot(x / rx, (y - cy) / ry) / re;
    const fy = floorY(x, z) - (pool(x, z) ? 0.25 : 0);
    // ribs: bone bands arching over the upper half, protruding ~1 m inward
    const k = Math.round((z + 2) / -4.4), zr = -2 - 4.4 * k;
    if (k >= 1 && Math.abs(z - zr) < 0.32 + 0.06 * Math.sin(th * 5) && y > cy - ry * 0.6 && q > 1 - 1.5 / r && q < 1 + 0.6 / r) { ribs.set(ribs.vi(x, 0), ribs.vi(y, 1), ribs.vi(z, 2), q < 1 - 1.3 / r ? L.ribEdge : rnd(Math.round(x / s), Math.round(y / s), 3) < 0.6 ? L.bone : L.bone2); return 0; }
    if (q >= 1 && q < 1 + 0.9 / r && y > fy - 0.6) {
      const n = noise2(th * 4 + 9, z * 0.5, 7);
      if (q < 1 + 1.5 * s / r && rnd(Math.round(x / s), Math.round(y / s), Math.round(z / s)) < 0.02 + 0.05 * Math.max(0, n - 0.6)) { glow.set(glow.vi(x, 0), glow.vi(y, 1), glow.vi(z, 2), n > 0.7 ? L.spot2 : L.spot); return 0; }
      return n < 0.28 ? L.fleshDark : n < 0.5 ? L.flesh2 : n < 0.75 ? L.flesh : L.flesh3;
    }
    if (q < 1 && y <= fy && y > fy - 0.6) {
      if (pool(x, z) && y > fy - 0.15) { glow.set(glow.vi(x, 0), glow.vi(y, 1), glow.vi(z, 2), rnd(Math.round(x / s), Math.round(z / s), 9) < 0.15 ? L.bile2 : L.bile); return 0; }
      return Math.sin(x * 1.5 + 2 * Math.sin(z * 0.33)) > 0.55 ? L.fold : rnd(Math.round(x / s), Math.round(z / s), 4) < 0.5 ? L.flesh : L.flesh2;
    }
    return 0;
  });
  addLit(st, 'belly walls', wall, 0.07, { cast: false, receive: false });
  // ribs: pale bone with a faint self-light so the pink haze can't swallow them
  const ribGrp = addLit(st, 'ribs', ribs, 0.06, { cast: false, receive: false });
  ribGrp.traverse((o) => { const m = (o as THREE.Mesh).material as THREE.MeshLambertMaterial | undefined; if (m?.emissive) { m.emissive.set(0x4a3e32); } });
  addGlow(st, 'bioluminescence + bile', glow, 2.4);

  // swallowed things, at finer voxels
  const junk = new VoxelGrid(0.04), jglow = new VoxelGrid(0.04);
  const fyAt = (x: number, z: number) => floorY(x, z);
  // your old Pier Rod, lying across the floor in the foreground
  junk.wsegment([-1.3, fyAt(-1.3, -1.4) + 0.08, -1.4], [1.1, fyAt(1.1, -3.6) + 0.08, -3.6], 0.032, L.rodBlue);
  junk.wsegment([-1.3, fyAt(-1.3, -1.4) + 0.08, -1.4], [-0.95, fyAt(-1, -1.7) + 0.08, -1.7], 0.05, L.cork);
  junk.wellipsoid([-0.75, fyAt(-0.75, -1.9) + 0.05, -1.9], [0.09, 0.09, 0.08], L.steel2);
  for (let i = 0; i < 6; i++) { const t = 0.2 + i * 0.14, x = -1.3 + 2.4 * t, z = -1.4 - 2.2 * t; junk.wsegment([x, fyAt(x, z) + 0.06, z], [x, fyAt(x, z) + 0.11, z], 0.04, L.signWhite); }
  // a hubcap
  for (let a = 0; a < Math.PI * 2; a += 0.05) for (let r = 0; r < 0.36; r += 0.03) {
    const x = -2.1 + Math.cos(a) * r, z = -6.5 + Math.sin(a) * r * 0.9, y = fyAt(-2.1, -6.5) + 0.06 + Math.sin(a) * r * 0.25;
    junk.set(junk.vi(x, 0), junk.vi(y, 1), junk.vi(z, 2), r > 0.3 || (r < 0.1) ? L.hubcap2 : L.hubcap);
  }
  // VISTA POINT sign, leaning on a rib
  const sb = [3.0, fyAt(3.0, -10), -10];
  junk.wsegment(sb, [sb[0] - 0.35, sb[1] + 1.7, sb[2] + 0.1], 0.035, L.post);
  for (let u = -0.7; u <= 0.7; u += 0.04) for (let v = -0.22; v <= 0.22; v += 0.04) {
    const x = sb[0] - 0.33 + u * 0.98, y = sb[1] + 1.55 + v + u * 0.12, z = sb[2] + 0.14;
    const border = Math.abs(u) > 0.64 || Math.abs(v) > 0.17;
    const letter = !border && Math.abs(v) < 0.08 && (Math.floor((u + 0.7) / 0.08) % 3 !== 2) && Math.abs(u) < 0.58;
    junk.set(junk.vi(x, 0), junk.vi(y, 1), junk.vi(z, 2), border || letter ? L.signWhite : L.signGreen);
  }
  // the half-digested survey boat on its side, with its coring rig spilled out
  const bc = new THREE.Vector3(1.4, 0.9, -30);
  junk.wellipsoid([bc.x, bc.y, bc.z], [1.4, 1.0, 4.2], (x, y, z) => {
    const wy = y * 0.04, wx = x * 0.04;
    const roll = wy - bc.y + (wx - bc.x) * 0.6;
    return Math.abs(roll + 0.15) < 0.12 ? L.boatOrange : Math.abs(roll + 0.45) < 0.05 ? L.boatStripe : L.boatWhite;
  });
  junk.wbox([0.6, 1.6, -31.2], [1.8, 2.5, -29.4], L.boatWhite);
  junk.wbox([0.75, 2.0, -31.0], [1.65, 2.3, -29.6], L.boatStripe);
  // drill bit, gearbox, chain — each with a faint glow halo
  const bit = [-1.6, fyAt(-1.6, -23) + 0.4, -23];
  for (let t = 0; t < 1; t += 0.01) { const r = 0.32 * (1 - t), a = t * 22; junk.wellipsoid([bit[0] + Math.cos(a) * r * 0.5, bit[1] + t * 1.3 - 0.4, bit[2] + Math.sin(a) * r * 0.5], [r * 0.6 + 0.03, 0.05, r * 0.6 + 0.03], t * 22 % 2 < 1 ? L.steel : L.steel2); }
  junk.wbox([2.2, fyAt(2.4, -22), -22.6], [2.9, fyAt(2.4, -22) + 0.5, -21.9], L.steel2);
  junk.wbox([2.3, fyAt(2.4, -22) + 0.5, -22.4], [2.8, fyAt(2.4, -22) + 0.62, -22.1], L.steel);
  for (let i = 0; i < 14; i++) { const x = -0.4 + i * 0.12, z = -21.5 + Math.sin(i * 0.7) * 0.25; junk.wellipsoid([x, fyAt(x, z) + 0.05, z], [0.06, 0.03, 0.04], i % 2 ? L.chain : L.steel2); }
  for (const [c, r] of [[bit, 0.75], [[2.55, fyAt(2.4, -22) + 0.3, -22.2], 0.6], [[0.4, fyAt(0.4, -21.5) + 0.05, -21.5], 0.55]] as const)
    for (let a = 0; a < 40; a++) { const p = [c[0] + (rnd(a, 1, 7) - 0.5) * 2 * r, c[1] + (rnd(a, 2, 7) - 0.3) * r, c[2] + (rnd(a, 3, 7) - 0.5) * 2 * r]; jglow.wellipsoid(p, [0.025, 0.025, 0.025], L.partGlow); }
  addLit(st, 'junk', junk, 0.05, { cast: false, receive: false });
  addGlow(st, 'part sparkles', jglow, 2.0);

  // cyan light from the bile pools, a dim pink "sun" from above
  for (const [x, z] of [[-2, -7], [2.5, -16], [-1, -24], [1, -40]]) { const pl = new THREE.PointLight(0x5ff6e8, 6, 14, 1.6); pl.position.set(x, 0.6, z); st.scene.add(pl); }
  st.camera.fov = 72; st.camera.updateProjectionMatrix();
  st.camera.position.set(0.25, 1.55, 3.5);
  st.camera.lookAt(0.2, 1.25, -26);
  fpBars(st);
  return st;
}
