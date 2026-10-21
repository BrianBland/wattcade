// Midday, 0:47 — drilling out of the fish: first person behind the scavenged drill (the bars became its grips), the
// bit biting into the bone layer at the end of a short bored tunnel whose walls show the layers already cut through:
// flesh → cartilage → bone. Chips fly back, sparks where steel meets bone.
import * as THREE from 'three';
import { VoxelGrid } from '../../voxel/grid';
import { noise2 } from '../../voxel/noise';
import { makeStage, type Stage } from '../stage';
import { L, fillBox, addLit, addGlow, rnd } from './kit';

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
  const s = 0.04, t = new VoxelGrid(s), sparks = new VoxelGrid(0.02);
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
  for (let k = 0; k <= 160; k++) { // fluted bit: a helix of two cutting edges around a core, tapering to the tip
    const u = k / 160, p = [0, Y + 0.02 + (tip[1] - Y - 0.02) * u, Z - 0.26 + (tip[2] - Z + 0.26) * u], r = 0.055 * (1 - u * 0.75);
    d.wellipsoid(p, [r * 0.55, r * 0.55, 0.012], L.drillSteel2);
    for (const ph of [0, Math.PI]) { const a = u * 40 + ph; d.wellipsoid([p[0] + Math.cos(a) * r, p[1] + Math.sin(a) * r, p[2]], [0.012, 0.012, 0.012], L.drillSteel); }
  }
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

  // sparks spraying off the contact point, bone chips and flesh scraps flying back past the camera
  for (let i = 0; i < 90; i++) {
    const a = rnd(i, 1, 100) * Math.PI * 2, sp = 0.2 + rnd(i, 2, 100) * 1.1, back = rnd(i, 3, 100) * 2.4;
    const p0 = [tip[0] + Math.cos(a) * 0.03, tip[1] + Math.sin(a) * 0.03, tip[2] + 0.02];
    const p1 = [p0[0] + Math.cos(a) * sp, p0[1] + Math.sin(a) * sp * 0.8 + 0.1, p0[2] + back * 0.35];
    sparks.wsegment(p0.map((v, k) => v + (p1[k] - v) * 0.55), p1, 0.006, i % 3 ? L.spark : L.lavaHot);
  }
  sparks.wellipsoid(tip, [0.035, 0.035, 0.02], L.spark);
  addGlow(st, 'sparks', sparks, 1.8);
  const chips = new VoxelGrid(0.012);
  for (let i = 0; i < 45; i++) {
    const a = rnd(i, 4, 101) * Math.PI * 2, rr = 0.2 + rnd(i, 5, 101) * 0.9, z = FACE + 0.2 + rnd(i, 6, 101) * 1.6;
    const c = [Math.cos(a) * rr, -0.15 + Math.sin(a) * rr * 0.8, z], sz = 0.012 + rnd(i, 7, 101) * 0.025;
    chips.wbox([c[0] - sz, c[1] - sz, c[2] - sz], [c[0] + sz, c[1] + sz, c[2] + sz], rnd(i, 8, 101) < 0.55 ? L.bone : rnd(i, 9, 101) < 0.5 ? L.cart : L.flesh2);
  }
  addLit(st, 'chips', chips, 0.05, { cast: false, receive: false });
  const hot = new THREE.PointLight(0xffb060, 1.5, 3, 1.6); hot.position.set(tip[0], tip[1], tip[2] + 0.3); st.scene.add(hot);
  return st;
}
