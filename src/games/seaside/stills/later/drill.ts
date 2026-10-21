// Midday, 0:47 — drilling out of the fish: first person behind the scavenged drill (the bars became its grips), the
// bit biting into the bone layer at the end of a short bored tunnel whose walls show the layers already cut through:
// flesh → cartilage → bone. Chips fly back, sparks where steel meets bone.
import * as THREE from 'three';
import { VoxelGrid } from '../../voxel/grid';
import { noise2 } from '../../voxel/noise';
import { makeStage, type Stage } from '../stage';
import { L, fillBox, addLit, addGlow, rnd, Particles, wob } from './kit';

const FACE = -3.4; // where the bit meets the bone (camera at z = 0, looking down −z)

export function stillDrill(canvas: HTMLCanvasElement, w: number, h: number): Stage {
  const st = makeStage(canvas, w, h, {
    zenith: 0x1a0612, horizon: 0x2a0a1e, fog: 0x2a0a20, fogDensity: 0.05, sunDir: new THREE.Vector3(0, 1, 0.3), sunColor: 0xff9ac8, sunI: 0.3,
    hemiSky: 0xff6ab0, hemiGround: 0x3a0f30, hemiI: 0.6,
  });
  st.scene.fog = null; st.sun.castShadow = false;
  st.camera.fov = 74; st.camera.updateProjectionMatrix();
  st.camera.position.set(0, 0, 0); st.camera.lookAt(0, -0.18, -3); st.camera.updateMatrixWorld();

  // the bored tunnel: a rough cylinder whose wall material records the layers cut through; the end face is bone,
  // cut in concentric rings around the bit, with an annulus of cartilage still showing at its edge
  const s = 0.04, t = new VoxelGrid(s);
  const layer = (z: number) => (z > -1.2 ? 'flesh' : z > -2.4 ? 'cart' : 'bone');
  const tint = (kind: string, n: number) => kind === 'flesh' ? (n < 0.33 ? L.fleshDark : n < 0.66 ? L.flesh2 : L.flesh) : kind === 'cart' ? (n < 0.3 ? L.cartDark : n < 0.65 ? L.cart2 : L.cart) : n < 0.5 ? L.bone : L.bone2;
  fillBox(t, [-2.4, -2.1, FACE - 0.6], [2.4, 2.1, 0.8], (x, y, z) => {
    const R = 1.3 + 0.08 * Math.sin(Math.atan2(y, x) * 7 + z * 9) + 0.05 * noise2(x * 3, z * 3, 3), r = Math.hypot(x, y);
    const n = rnd(Math.round(x / s), Math.round(y / s), Math.round(z / s));
    if (z < FACE) { // the end face, cut into stepped rings around the bit
      const ring = Math.floor(r / 0.22), depth = FACE - 0.05 * ring - 0.04 * Math.sin(ring * 2.1);
      if (z > depth || r > R + 0.5) return 0;
      if (r > R - 0.15) return tint('cart', n);
      return ring % 2 ? (n < 0.5 ? L.bone2 : L.bone) : n < 0.6 ? L.ribEdge : L.bone;
    }
    if (r < R || r > R + 0.35) return 0;
    // spiral gouges from the bit along the wall
    const gouge = Math.sin(Math.atan2(y, x) * 2 + z * 11) > 0.85 && r < R + 0.06;
    return gouge ? (layer(z) === 'flesh' ? L.fleshDark : layer(z) === 'cart' ? L.cartDark : L.bone2) : tint(layer(z), n);
  });
  addLit(st, 'tunnel', t, 0.06, { cast: false, receive: false });

  // the drill: housing where the stem was, two vertical grips with gloves, a long fluted bit
  const d = new VoxelGrid(0.006);
  const Y = -0.5, Z = -0.6;
  d.wbox([-0.12, Y - 0.06, Z - 0.22], [0.12, Y + 0.1, Z + 0.12], L.drillBody);
  d.wbox([-0.125, Y + 0.02, Z - 0.22], [0.125, Y + 0.035, Z + 0.12], L.drillDark);
  d.wbox([-0.09, Y + 0.1, Z - 0.16], [0.09, Y + 0.13, Z + 0.06], L.drillBody2);
  for (let k = 0; k < 5; k++) d.wbox([-0.1 + k * 0.045, Y + 0.13, Z - 0.12], [-0.085 + k * 0.045, Y + 0.145, Z + 0.02], L.drillDark); // vents
  d.wellipsoid([0, Y + 0.02, Z - 0.24], [0.07, 0.07, 0.04], L.drillSteel2); // chuck
  const tip = [0, -0.18, FACE + 0.04];
  // fluted bit, built along its own +z axis so it can spin: a helix of two cutting edges around a tapering core
  const C0 = new THREE.Vector3(0, Y + 0.02, Z - 0.26), TIP = new THREE.Vector3(tip[0], tip[1], tip[2]), LB = C0.distanceTo(TIP);
  const bitG = new VoxelGrid(0.006);
  for (let k = 0; k <= 160; k++) {
    const u = k / 160, zz = u * LB, r = 0.055 * (1 - u * 0.75);
    bitG.wellipsoid([0, 0, zz], [r * 0.55, r * 0.55, 0.012], L.drillSteel2);
    for (const ph of [0, Math.PI]) { const a = u * 40 + ph; bitG.wellipsoid([Math.cos(a) * r, Math.sin(a) * r, zz], [0.012, 0.012, 0.012], L.drillSteel); }
  }
  const bit = new THREE.Group(); bit.position.copy(C0); st.scene.add(bit); bit.lookAt(TIP);
  const bitBase = bit.quaternion.clone();
  addLit(st, 'bit', bitG, 0.03, { cast: false, receive: false }, bit);
  for (const sx of [-1, 1]) {
    const gx = sx * 0.2, Y = -0.36; // grips stand up beside the housing, gloves in view
    d.wbox([gx - 0.025, Y - 0.12, Z - 0.05], [gx + 0.025, Y + 0.12, Z + 0.05], L.drillDark); // grip
    d.wsegment([gx - sx * 0.02, Y + 0.0, Z], [sx * 0.12, Y + 0.0, Z - 0.04], 0.02, L.drillSteel2); // arm to the housing
    // glove wrapped around the grip, knuckles forward, arm warmer heading back to the shoulder
    d.wellipsoid([gx, Y + 0.03, Z + 0.02], [0.045, 0.06, 0.05], L.gloveG);
    for (let f = 0; f < 4; f++) d.wsegment([gx + sx * 0.03, Y + 0.075 - f * 0.026, Z - 0.035], [gx - sx * 0.03, Y + 0.07 - f * 0.026, Z - 0.05], 0.012, L.gloveG2);
    d.wsegment([gx - sx * 0.03, Y + 0.08, Z + 0.01], [gx - sx * 0.04, Y + 0.09, Z - 0.04], 0.012, L.gloveTop); // thumb
    d.wsegment([gx, Y + 0.04, Z + 0.06], [gx + sx * 0.12, Y - 0.12, Z + 0.45], 0.045, L.drillDark);
  }
  const rig = new THREE.Group(); addLit(st, 'drill', d, 0.04, { cast: false, receive: false }, rig); st.scene.add(rig);
  // a work lamp on the housing
  const lamp = new THREE.SpotLight(0xfff0d8, 5, 8, 0.6, 0.6, 1.2); lamp.position.set(0, Y + 0.12, Z - 0.1); lamp.target.position.set(0, -0.1, FACE); st.scene.add(lamp, lamp.target);
  d.wbox([-0.03, Y + 0.13, Z - 0.2], [0.03, Y + 0.16, Z - 0.17], L.lamp);

  // sparks and chips are re-thrown every frame (deterministic per frame), see tick()
  const sparks = new Particles(st, 160, { intensity: 2.6 }), chips = new Particles(st, 70, { lit: true });
  const hot = new THREE.PointLight(0xffb060, 1.5, 3, 1.6); hot.position.set(tip[0], tip[1], tip[2] + 0.3); st.scene.add(hot);
  const rim = new THREE.PointLight(0xffd8b0, 1.2, 1.5, 1.5); rim.position.set(0, -0.15, -0.35); st.scene.add(rim); // separates the gloves from the dark tunnel
  const glow = addGlow(st, 'contact glow', (() => { const g = new VoxelGrid(0.02); g.wellipsoid(tip, [0.035, 0.035, 0.02], L.spark); return g; })(), 1.8);

  st.duration = 8;
  const spin = new THREE.Quaternion(), zAxis = new THREE.Vector3(0, 0, 1);
  st.tick = (t) => {
    const f = Math.floor(t * 30), bite = 0.6 + 0.4 * Math.abs(wob(t * 0.7, 3)); // the drill bucks harder when it bites
    st.camera.position.set(wob(t * 2.3, 1) * 0.006 * bite, wob(t * 2.9, 2) * 0.006 * bite, 0);
    spin.setFromAxisAngle(zAxis, -t * 38); bit.quaternion.copy(bitBase).multiply(spin);
    hot.intensity = 1.0 + 1.2 * bite * (0.6 + 0.4 * Math.abs(Math.sin(t * 37)));
    glow.scale.setScalar(0.8 + 0.4 * Math.abs(Math.sin(t * 29)));
    let n = 0;
    for (let i = 0; i < 160; i++) { // sparks: born at the tip, fly out along a ballistic arc, live ~0.35 s
      const born = (i / 160) * 0.35, age = ((t - born) % 0.35 + 0.35) % 0.35, gen = Math.floor((t - born) / 0.35) + f * 0;
      const a = rnd(i, gen, 130) * Math.PI * 2, sp = 1.2 + rnd(i, gen, 131) * 3.2 * bite, back = 0.6 + rnd(i, gen, 132) * 2.2;
      const p = [tip[0] + Math.cos(a) * sp * age, tip[1] + Math.sin(a) * sp * age * 0.8 - 2.5 * age * age, tip[2] + back * age];
      const len = 0.03 + 0.08 * (1 - age / 0.35);
      sparks.set(n++, p, [0.014, 0.014, len * 1.6], rnd(i, gen, 133) < 0.6 ? L.spark : L.lavaHot, [Math.sin(a) * 0.8, Math.cos(a) * 0.8, 0]);
    }
    sparks.commit(n);
    n = 0;
    for (let i = 0; i < 70; i++) { // chips: tumble out of the cut and fly back past the camera, live ~0.9 s
      const born = (i / 70) * 0.9, age = ((t - born) % 0.9 + 0.9) % 0.9, gen = Math.floor((t - born) / 0.9);
      const a = rnd(i, gen, 134) * Math.PI * 2, sp = 0.5 + rnd(i, gen, 135) * 1.2, back = 1.5 + rnd(i, gen, 136) * 2.5;
      const p = [tip[0] + Math.cos(a) * sp * age, tip[1] + Math.sin(a) * sp * age * 0.8 - 3 * age * age, tip[2] + back * age];
      const sz = 0.012 + rnd(i, gen, 137) * 0.03, kind = rnd(i, gen, 138);
      chips.set(n++, p, sz, kind < 0.6 ? L.bone : kind < 0.8 ? L.cart : L.flesh2, [t * 9 + i, t * 7 + i * 2, 0]);
    }
    chips.commit(n);
  };
  return st;
}
