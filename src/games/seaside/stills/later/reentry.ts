// Evening, 1:52 — re-entry: falling toward the curved Earth, air igniting around you, wings tearing out at the edges
// of the frame, gloves still on the bars.
import * as THREE from 'three';
import { VoxelGrid } from '../../voxel/grid';
import { fbm } from '../../voxel/noise';
import { makeStage, type Stage } from '../stage';
import { L, addLit, addGlow, fpBars, rnd, Particles, wob } from './kit';

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
  // fire: streaks stream outward from the centre of view, born and dying continuously (see tick); a plasma bloom
  // building under the front of the bike
  const streaks = new Particles(st, 140, { intensity: 2.6, parent: fx });
  const plasma = new VoxelGrid(0.012);
  plasma.wellipsoid([0, -0.46, -0.92], [0.17, 0.04, 0.09], L.fire3);
  plasma.wellipsoid([0, -0.47, -0.94], [0.26, 0.05, 0.13], L.fire2);
  const plasmaGrp = addGlow(st, 'plasma', plasma, 2.6, fx);
  // wings: big white feathers bursting in from both sides, lit orange from below
  // each wing: a fan of long primary feathers sweeping up and out from behind the shoulders, in its own pivot group
  const wings = [-1, 1].map((sx) => {
    const wing = new VoxelGrid(0.012), root0 = [sx * 0.5, -0.36, -0.42];
    for (let f = 0; f < 8; f++) {
    const root = [0, 0, 0], ang = 0.15 + f * 0.17, len = 0.42 + (f < 5 ? f * 0.05 : (8 - f) * 0.05);
    const tip = [root[0] + sx * Math.cos(ang) * len * 0.75, root[1] + Math.sin(ang) * len, root[2] - 0.12 - f * 0.012];
    for (let k = 0; k <= 16; k++) { const t = k / 16, wdt = 0.03 * Math.sin(Math.PI * Math.min(1, t * 1.15)) + 0.008; const p = [root[0] + (tip[0] - root[0]) * t, root[1] + (tip[1] - root[1]) * t, root[2] + (tip[2] - root[2]) * t]; wing.wellipsoid(p, [wdt, wdt, 0.008], t > 0.85 ? L.feather3 : f % 2 ? L.feather : L.feather2); }
    }
    const pivot = new THREE.Group(); pivot.position.set(root0[0], root0[1], root0[2]); fx.add(pivot);
    addLit(st, 'wing', wing, 0.04, { cast: false, receive: false }, pivot);
    return { pivot, sx };
  });
  const wingLight = new THREE.PointLight(0xff8a3a, 4, 3, 1); wingLight.position.set(0, -0.5, -0.8); fx.add(wingLight);
  fpBars(st, -0.31, -0.46);

  // motion: buffeting, fire streaming past, the wings beating hard (slowing the fall), the Earth swelling
  st.duration = 8;
  const base = st.camera.quaternion.clone(), shake = new THREE.Quaternion(), e = new THREE.Euler();
  st.tick = (t) => {
    st.camera.fov = 78 - t * 1.2; st.camera.updateProjectionMatrix(); // the planet grows
    e.set(wob(t * 1.6, 1) * 0.012, wob(t * 1.9, 2) * 0.012, 0.12 + wob(t * 0.9, 3) * 0.05);
    st.camera.quaternion.copy(base).multiply(shake.setFromEuler(new THREE.Euler(e.x, e.y, e.z - 0.12)));
    const beat = Math.sin(t * Math.PI * 2 * 0.9); // ~0.9 beats/s
    for (const w of wings) w.pivot.rotation.set(beat * 0.12, -w.sx * beat * 0.1, w.sx * (beat * 0.35 - 0.05));
    plasmaGrp.scale.set(1 + 0.15 * wob(t * 3, 4), 1 + 0.3 * Math.abs(wob(t * 5, 5)), 1);
    let n = 0;
    for (let i = 0; i < 140; i++) { // each streak: born near the centre ring, races outward and back past the camera
      const life = 0.45 + rnd(i, 0, 160) * 0.3, born = rnd(i, 1, 160) * life, age = ((t - born) % life + life) % life, gen = Math.floor((t - born) / life), u = age / life;
      const a = rnd(i, gen, 161) * Math.PI * 2;
      if (Math.abs(Math.cos(a)) > 0.8 && rnd(i, gen, 162) < 0.5) continue; // thinner over the wings
      const r = 0.45 + u * 0.9, len = 0.12 + 0.35 * u, z = -1.3 + u * 0.7;
      const col = rnd(i, gen, 163) < 0.33 ? L.fire3 : rnd(i, gen, 164) < 0.5 ? L.fire2 : L.fire;
      streaks.set(n++, [Math.cos(a) * r * 1.6, Math.sin(a) * r, z], [len, 0.008 + 0.01 * rnd(i, gen, 165), 0.01], col, [0, 0, Math.atan2(Math.sin(a), Math.cos(a) * 1.6)]);
    }
    streaks.commit(n);
  };
  return st;
}
