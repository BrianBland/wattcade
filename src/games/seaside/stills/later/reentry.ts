// Evening, 1:52 — re-entry: falling toward the curved Earth, air igniting around you, wings tearing out at the edges
// of the frame, gloves still on the bars.
import * as THREE from 'three';
import { VoxelGrid } from '../../voxel/grid';
import { fbm } from '../../voxel/noise';
import { makeStage, type Stage } from '../stage';
import { L, addLit, addGlow, fpBars, rnd } from './kit';

export function stillReentry(canvas: HTMLCanvasElement, w: number, h: number): Stage {
  const sunDir = new THREE.Vector3(-0.6, 0.35, -0.7);
  const st = makeStage(canvas, w, h, {
    zenith: 0x02030a, horizon: 0x0a1030, fog: 0x000000, fogDensity: 0, sunDir, sunColor: 0xfff2dc, sunI: 2.6, hemiSky: 0x3a4a80, hemiGround: 0x0a0a14, hemiI: 0.5,
  });
  st.scene.fog = null; st.sun.castShadow = false;

  // the Earth: a voxel cap of a big sphere below, oceans/land/ice + a cloud shell, and an atmosphere rim
  const RE = 900, centre = new THREE.Vector3(0, -RE - 260, -420);
  const earth = new VoxelGrid(5), clouds = new VoxelGrid(5);
  const dirTo = new THREE.Vector3(0, 1, 0.55).normalize(); // the cap faces the camera
  for (let u = -1; u <= 1; u += 5 / RE / 1.2) for (let v = -1; v <= 1; v += 5 / RE / 1.2) {
    const d = new THREE.Vector3(u, 0, v).add(dirTo.clone().multiplyScalar(1.3)).normalize();
    if (d.dot(dirTo) < 0.72) continue;
    const p = centre.clone().addScaledVector(d, RE);
    const n = fbm(d.x * 4 + 3, d.z * 4 + d.y * 2, 5, 90), lat = d.dot(dirTo); // 1 at the centre of the cap → ~0.72 at its rim
    const c = lat < 0.75 && fbm(d.x * 6, d.z * 6, 2, 97) > 0.45 ? L.ice : n > 0.53 ? (n > 0.63 ? (fbm(d.x * 9, d.z * 9, 3, 91) > 0.55 ? L.desert : L.land2) : L.land) : n > 0.5 ? L.shelf : rnd(Math.round(u * 400), Math.round(v * 400), 92) < 0.5 ? L.ocean : L.ocean2;
    earth.set(earth.vi(p.x, 0), earth.vi(p.y, 1), earth.vi(p.z, 2), c);
    for (let k = 1; k <= 2; k++) earth.set(earth.vi(p.x - d.x * 5 * k, 0), earth.vi(p.y - d.y * 5 * k, 1), earth.vi(p.z - d.z * 5 * k, 2), c);
    if (fbm(d.x * 7 + 11, d.z * 7, 4, 93) > 0.67) { const q = centre.clone().addScaledVector(d, RE + 14); clouds.set(clouds.vi(q.x, 0), clouds.vi(q.y, 1), clouds.vi(q.z, 2), fbm(d.x * 20, d.z * 20, 2, 94) > 0.5 ? L.cloud : L.cloud2); }
  }
  addLit(st, 'earth', earth, 0.05, { cast: false, receive: false });
  addLit(st, 'clouds', clouds, 0.04, { cast: false, receive: false });
  const atmo = new THREE.Mesh(new THREE.SphereGeometry(RE + 40, 96, 48), new THREE.MeshBasicMaterial({ color: 0x5ab8ff, transparent: true, opacity: 0.22, side: THREE.BackSide, blending: THREE.AdditiveBlending, depthWrite: false }));
  atmo.position.copy(centre); st.scene.add(atmo);
  // stars
  const starG = new THREE.BufferGeometry(), sp: number[] = [];
  for (let i = 0; i < 1400; i++) { const a = rnd(i, 1, 95) * Math.PI * 2, b = rnd(i, 2, 95) * 0.9 + 0.05; sp.push(Math.cos(a) * Math.sin(b) * 4000, Math.cos(b) * 4000 - 200, Math.sin(a) * Math.sin(b) * 4000); }
  starG.setAttribute('position', new THREE.Float32BufferAttribute(sp, 3));
  st.scene.add(new THREE.Points(starG, new THREE.PointsMaterial({ color: 0xffffff, size: 2.2, sizeAttenuation: false })));

  st.camera.fov = 78; st.camera.updateProjectionMatrix();
  st.camera.position.set(0, 0, 0);
  st.camera.lookAt(0, -260, -420);
  st.camera.rotateZ(0.12);
  st.camera.updateMatrixWorld();

  // camera-space effects: fire streaking past the frame edges, plasma at the front wheel, wings tearing out
  const fx = new THREE.Group(); st.camera.add(fx);
  const fire = new VoxelGrid(0.012);
  for (let i = 0; i < 46; i++) {
    const a = rnd(i, 1, 96) * Math.PI * 2, r0 = 0.78 + rnd(i, 2, 96) * 0.25, len = 0.18 + rnd(i, 3, 96) * 0.4, z = -0.9 - rnd(i, 4, 96) * 0.6;
    if (Math.abs(Math.cos(a)) > 0.75) continue; // keep the sides clear for the wings
    const p0 = [Math.cos(a) * r0 * 1.6, Math.sin(a) * r0, z], p1 = [Math.cos(a) * (r0 + len) * 1.6, Math.sin(a) * (r0 + len), z + 0.4];
    fire.wsegment(p0, p1, 0.004 + rnd(i, 5, 96) * 0.006, i % 3 === 0 ? L.fire3 : i % 3 === 1 ? L.fire2 : L.fire);
  }
  fire.wellipsoid([0, -0.5, -0.95], [0.12, 0.03, 0.06], L.fire3); // plasma building under the front of the bike
  addGlow(st, 'fire', fire, 2.6, fx);
  // wings: big white feathers bursting in from both sides, lit orange from below
  const wing = new VoxelGrid(0.012);
  // each wing: a fan of long primary feathers sweeping up and out from behind the shoulders
  for (const sx of [-1, 1]) for (let f = 0; f < 8; f++) {
    const root = [sx * 0.5, -0.36, -0.42], ang = 0.15 + f * 0.17, len = 0.42 + (f < 5 ? f * 0.05 : (8 - f) * 0.05);
    const tip = [root[0] + sx * Math.cos(ang) * len * 0.75, root[1] + Math.sin(ang) * len, root[2] - 0.12 - f * 0.012];
    for (let k = 0; k <= 16; k++) { const t = k / 16, wdt = 0.03 * Math.sin(Math.PI * Math.min(1, t * 1.15)) + 0.008; const p = [root[0] + (tip[0] - root[0]) * t, root[1] + (tip[1] - root[1]) * t, root[2] + (tip[2] - root[2]) * t]; wing.wellipsoid(p, [wdt, wdt, 0.008], t > 0.85 ? L.feather3 : f % 2 ? L.feather : L.feather2); }
  }
  addLit(st, 'wings', wing, 0.04, { cast: false, receive: false }, fx);
  const wingLight = new THREE.PointLight(0xff8a3a, 4, 3, 1); wingLight.position.set(0, -0.5, -0.8); fx.add(wingLight);
  fpBars(st, -0.31, -0.46);
  return st;
}
