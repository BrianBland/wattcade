import { ROUTES } from '../sim/race';
// Procedural people, bikes, Segways and horses: cel-shaded with warm-brown ink. Render-only.
// Crowd (pedestrians + cops + rider) = one InstancedMesh per body part (+ one ink hull each), posed from a single
// template rig, so the whole crowd is ~2 × parts draw calls. Bikes/Segways/horses are small merged groups.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { Snapshot } from '../sim/sim';
import { heightAt } from '../sim/world';
import { JSR, toon } from './jsr';
import { bakeInPlace } from './bake';
import { EXPR, faceAtlas, faceCell, fabricTex } from './textures';
import { DEALER, GANG } from '../sim/crime';
import { buildWeapon, flicker, type WeaponModel, type WeaponModelKind } from './weapons3d';

// ---------- shared materials ----------
const inkCache = new Map<number, THREE.Material>();
/** Ink hull that pushes back faces out along the normal (works on merged & instanced geometry). */
export function inkMat(w = 0.022): THREE.Material {
  let m = inkCache.get(w);
  if (!m) {
    const mm = new THREE.MeshBasicMaterial({ color: JSR.ink, side: THREE.BackSide });
    mm.onBeforeCompile = (sh) => { sh.vertexShader = sh.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>\ntransformed += normal * ${w.toFixed(4)};`); };
    mm.customProgramCacheKey = () => `ink${w}`;
    inkCache.set(w, (m = mm));
  }
  return m;
}
const toonCache = new Map<number, THREE.Material>();
const T = (c: number) => { let m = toonCache.get(c); if (!m) toonCache.set(c, (m = toon(c))); return m; };
// one ink width for all props so baking yields a single ink batch per object
const withInk = (geo: THREE.BufferGeometry, color: number, _w = 0.014) => { const m = new THREE.Mesh(geo, T(color)); m.add(new THREE.Mesh(geo, inkMat(0.014))); return m; };

// ---------- palette ----------
export const SKIN = [0xf1d3b6, 0xe0b48f, 0xc68e64, 0x9c6a45, 0x6e4a32, 0x4a3122];
const SHIRT = [0x8a9a7b, 0xb07a5a, 0xc9b894, 0x5f7480, 0x9d5c4a, 0x6b7b5c, 0xd8cbb0, 0x7a6a8a, 0x4f6d6a];
const PANTS = [0x4a4a52, 0x5c4a3a, 0x3d4f5f, 0x6b6450, 0x2f3a33, 0x8a7a60];
const HAIR = [0x2b1d14, 0x5a3a22, 0x8a6a3a, 0xc9a66b, 0x6d6d6d, 0x3a2a20];
export const BIKE_TINT: Record<string, number> = { scooter: 0x9d3a2e, city: 0x6f8a7a, fixie: 0xa8573d, bmx: 0x4f6d8a, cargo: 0x7d6a4a, tandem: 0x5f7480, ebike: 0x4a6b55 };
const COP = { shirt: 0x2f3e52, pants: 0x232c38, cap: 0x1f2834, helmet: 0xe8e2d4 };

// ---------- geometry helpers ----------
const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
/** Cylinder from a to b (merged-friendly). */
function tube(a: THREE.Vector3, b: THREE.Vector3, r: number, seg = 6): THREE.BufferGeometry {
  const d = b.clone().sub(a), g = new THREE.CylinderGeometry(r, r, d.length(), seg, 1, false);
  g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(V(0, 1, 0), d.clone().normalize()));
  g.translate((a.x + b.x) / 2, (a.y + b.y) / 2, (a.z + b.z) / 2);
  return g;
}
const strip = (g: THREE.BufferGeometry) => { const n = g.index ? g.toNonIndexed() : g; for (const k of Object.keys(n.attributes)) if (k !== 'position' && k !== 'normal') n.deleteAttribute(k); return n; };
const merge = (gs: THREE.BufferGeometry[]) => mergeGeometries(gs.map(strip))!;

// ---------- bikes ----------
export interface BikeRig { root: THREE.Group; wheels: THREE.Object3D[]; wheelR: number[]; cranks: THREE.Object3D[]; pedals: THREE.Object3D[]; bars: THREE.Object3D;
  /** rider attach points in bike space (first rider) */ seat: THREE.Vector3; bb: THREE.Vector3; grip: THREE.Vector3; crankLen: number; kind: string }

function wheel(r: number, color: number): THREE.Group {
  const g = new THREE.Group();
  const tire = new THREE.TorusGeometry(r, 0.035, 6, 24); tire.rotateY(Math.PI / 2);
  g.add(new THREE.Mesh(tire, T(0x2a2420)));
  const rim = new THREE.TorusGeometry(r - 0.04, 0.012, 4, 24); rim.rotateY(Math.PI / 2);
  g.add(new THREE.Mesh(rim, T(0xb8b0a0)));
  const spokes: THREE.BufferGeometry[] = [];
  for (let i = 0; i < 16; i++) { const a = (i / 16) * Math.PI * 2; spokes.push(tube(V(i % 2 ? 0.02 : -0.02, 0, 0), V(0, Math.cos(a) * (r - 0.04), Math.sin(a) * (r - 0.04)), 0.004, 3)); }
  g.add(new THREE.Mesh(merge(spokes), T(0x8c857a)));
  const hub = new THREE.CylinderGeometry(0.04, 0.04, 0.1, 8); hub.rotateZ(Math.PI / 2); g.add(new THREE.Mesh(hub, T(color)));
  return g;
}
function crankSet(len: number): { crank: THREE.Group; pedals: THREE.Object3D[] } {
  const crank = new THREE.Group(); const pedals: THREE.Object3D[] = [];
  const ring = new THREE.CylinderGeometry(0.1, 0.1, 0.015, 14); ring.rotateZ(Math.PI / 2); ring.translate(0.06, 0, 0);
  crank.add(new THREE.Mesh(ring, T(0x9a948a)));
  for (const s of [1, -1]) {
    const arm = new THREE.Mesh(tube(V(s * 0.08, 0, 0), V(s * 0.08, -len * s, 0), 0.016), T(0x8c857a)); crank.add(arm);
    const p = new THREE.Group(); p.position.set(s * 0.13, -len * s, 0);
    p.add(new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.02, 0.07), T(0x2a2420))); crank.add(p); pedals.push(p);
  }
  return { crank, pedals };
}
/** `parked`: bake the whole bike into one static mesh (+ ink): ~2 draw calls. Otherwise frame / each wheel / crank / bars are batched separately (~6). */
/** Razor kick scooter: low deck with grip tape, rear fender brake, tiny urethane wheels, folding T-bar. Rider stands on the
 * deck; `pedals[0]` = planted front foot, `pedals[1]` = kicking foot (animated in spin()). */
function buildScooter(color: number, parked: boolean): BikeRig {
  const root = new THREE.Group(); root.rotation.order = 'YXZ';
  const r = 0.1, R = V(0, r, -0.36), F = V(0, r, 0.36), H = V(0, 0.98, 0.42);
  const deck = new THREE.BoxGeometry(0.13, 0.04, 0.62); deck.translate(0, 0.14, -0.02);
  const tape = new THREE.BoxGeometry(0.115, 0.01, 0.56); tape.translate(0, 0.165, -0.03);
  const fender = new THREE.BoxGeometry(0.1, 0.02, 0.16); fender.rotateX(-0.25); fender.translate(0, 0.22, -0.4);
  root.add(withInk(deck, 0xb8bcc0, 0.01));
  root.add(withInk(tape, 0x2b2a24, 0.004)); root.add(withInk(fender, color, 0.008));
  const neck = merge([tube(V(0, 0.15, 0.27), V(0, 0.2, 0.36), 0.022), tube(V(0, 0.2, 0.36), H, 0.02)]);
  root.add(withInk(neck, color, 0.01));
  const clamp = new THREE.CylinderGeometry(0.03, 0.03, 0.06, 8); clamp.translate(0, 0.55, 0.4); root.add(withInk(clamp, 0x2b2a24, 0.006));
  const sw = (rr: number) => { const g = new THREE.Group(); const tyre = new THREE.TorusGeometry(rr * 0.75, rr * 0.28, 6, 14); tyre.rotateY(Math.PI / 2); g.add(withInk(tyre, 0xd8cbb0, 0.008)); const hub = new THREE.CylinderGeometry(rr * 0.4, rr * 0.4, 0.05, 8); hub.rotateZ(Math.PI / 2); g.add(new THREE.Mesh(hub, T(color))); return g; };
  const wR = sw(r), wF = sw(r); wR.position.copy(R); wF.position.copy(F); root.add(wR, wF);
  const bars = new THREE.Group(); bars.position.copy(H); root.add(bars);
  bars.add(withInk(merge([tube(V(-0.24, 0, 0), V(0.24, 0, 0), 0.016)]), 0x3d3a36, 0.008));
  for (const sx of [-1, 1]) { const g = new THREE.CylinderGeometry(0.024, 0.024, 0.1, 8); g.rotateZ(Math.PI / 2); g.translate(sx * 0.2, 0, 0); bars.add(new THREE.Mesh(g, T(0x2b2a24))); }
  const p0 = new THREE.Object3D(), p1 = new THREE.Object3D(); p0.position.set(0.04, 0.2, 0.08); p1.position.set(-0.08, 0.2, -0.18); root.add(p0, p1);
  if (parked) { bars.rotation.y = 0.35; bakeInPlace(root); }
  else { for (const o of [wR, wF, bars]) o.userData.dyn = true; bakeInPlace(root); for (const o of [wR, wF, bars]) { o.userData.dyn = false; bakeInPlace(o); o.userData.dyn = true; } }
  return { root, wheels: [wR, wF], wheelR: [r, r], cranks: [], pedals: [p0, p1], bars, seat: V(0, 0.2 + L.thigh + L.shin + 0.06, -0.06), bb: V(0, 0.2, 0), grip: H.clone(), crankLen: 0, kind: 'scooter' };
}
export function buildBike(kind: string, color = BIKE_TINT[kind] ?? 0x6f8a7a, parked = false): BikeRig {
  if (kind === 'scooter') return buildScooter(color, parked);
  const root = new THREE.Group(); root.rotation.order = 'YXZ';
  const frame = new THREE.Group(); root.add(frame);
  const rr = kind === 'bmx' ? 0.25 : kind === 'cargo' ? 0.32 : 0.34, rf = kind === 'bmx' ? 0.25 : kind === 'cargo' ? 0.24 : rr;
  const wb = kind === 'cargo' ? 1.9 : kind === 'tandem' ? 1.75 : kind === 'bmx' ? 0.95 : 1.05;
  const R = V(0, rr, -wb / 2), F = V(0, rf, wb / 2);
  const B = V(0, Math.max(0.27, rr - 0.03), -wb / 2 + 0.42);
  const S = V(0, kind === 'bmx' ? 0.72 : 0.86, B.z - 0.16);
  const headX = kind === 'cargo' ? -wb / 2 + 1.05 : kind === 'tandem' ? wb / 2 - 0.2 : wb / 2 - 0.2;
  const H = V(0, kind === 'bmx' ? 0.8 : 0.93, headX), Hb = V(0, H.y - 0.2, headX + 0.06);
  const tubes: THREE.BufferGeometry[] = [];
  const t = (a: THREE.Vector3, b: THREE.Vector3, r = 0.022) => tubes.push(tube(a, b, r));
  const Sl = S.clone().add(V(0, -0.06, 0.02));
  if (kind === 'city') { const mid = V(0, B.y + 0.12, B.z + 0.25); t(B, mid, 0.026); t(mid, Hb, 0.026); } // step-through
  else t(Sl, H);
  t(B, Hb, kind === 'ebike' ? 0.034 : 0.025); t(B, Sl); t(B, R, 0.016); t(Sl, R, 0.014); t(H, Hb, 0.03);
  if (kind === 'cargo') { // long cargo: frame runs forward low to a small front wheel
    const lowF = V(0, 0.3, F.z - 0.25); t(Hb, lowF, 0.026); t(lowF, F, 0.02);
    const box = new THREE.BoxGeometry(0.62, 0.38, 0.62); box.translate(0, 0.62, F.z - 0.5);
    frame.add(withInk(box, 0x9a7350));
  } else t(Hb, F, 0.018); // fork
  if (kind === 'tandem') { // stoker: second seat tube + bb, captain's tubes
    const B2 = V(0, B.y, wb / 2 - 0.55), S2 = V(0, 0.86, B2.z - 0.16);
    t(B, B2, 0.025); t(B2, S2.clone().add(V(0, -0.06, 0.02))); t(S2.clone().add(V(0, -0.06, 0.02)), H); t(Sl, S2.clone().add(V(0, -0.06, 0.02)));
  }
  frame.add(withInk(merge(tubes), color, 0.012));
  // saddle(s)
  const saddle = (p: THREE.Vector3) => { const g = new THREE.CapsuleGeometry(0.06, 0.14, 2, 6); g.rotateX(Math.PI / 2); g.scale(1, 0.5, 1); g.translate(p.x, p.y + 0.04, p.z); frame.add(withInk(g, 0x3a2a20, 0.01)); };
  if (kind === 'tandem') { saddle(S.clone().add(V(0, 0, -0.0))); saddle(V(0, 0.86, wb / 2 - 0.71)); } else saddle(S);
  if (kind === 'ebike') { const bat = new THREE.BoxGeometry(0.09, 0.09, 0.36); bat.rotateX(-Math.atan2(Hb.y - B.y, Hb.z - B.z)); bat.translate(0, (B.y + Hb.y) / 2 + 0.06, (B.z + Hb.z) / 2); frame.add(withInk(bat, 0x2f3a33, 0.01)); }
  // wheels
  const wR = wheel(rr, color), wF = wheel(rf, color); wR.position.copy(R); wF.position.copy(F); root.add(wR, wF);
  // cranks
  const cl = kind === 'bmx' ? 0.16 : 0.17;
  const c1 = crankSet(cl); c1.crank.position.copy(B); root.add(c1.crank);
  const cranks: THREE.Object3D[] = [c1.crank], pedals = [...c1.pedals];
  if (kind === 'tandem') { const c2 = crankSet(cl); c2.crank.position.set(0, B.y, wb / 2 - 0.55); root.add(c2.crank); cranks.push(c2.crank); pedals.push(...c2.pedals); }
  // bars (steer group at the head tube top)
  const bars = new THREE.Group(); bars.position.copy(H); root.add(bars);
  const bt: THREE.BufferGeometry[] = [];
  const rise = kind === 'bmx' ? 0.22 : 0.06, back = kind === 'city' ? -0.14 : kind === 'fixie' ? 0.08 : -0.04;
  bt.push(tube(V(0, 0, 0), V(0, rise, back * 0.5), 0.02));
  const gy = rise, gz = back;
  bt.push(tube(V(-0.28, gy, gz), V(0.28, gy, gz), 0.016));
  if (kind === 'fixie') for (const s of [1, -1]) { bt.push(tube(V(s * 0.2, gy, gz), V(s * 0.2, gy - 0.1, gz + 0.1), 0.014)); bt.push(tube(V(s * 0.2, gy - 0.1, gz + 0.1), V(s * 0.2, gy - 0.14, gz - 0.02), 0.014)); }
  if (kind === 'bmx') bt.push(tube(V(-0.2, 0.12, -0.02), V(0.2, 0.12, -0.02), 0.012));
  bars.add(new THREE.Mesh(merge(bt), T(0x3d3a36)));
  if (kind === 'city') { const bk = new THREE.BoxGeometry(0.36, 0.24, 0.3); bk.translate(0, -0.05, 0.3); bars.add(new THREE.Mesh(bk, T(0x9a7350))); }
  if (kind === 'tandem') { const sb = merge([tube(V(-0.2, 0.92, wb / 2 - 0.5), V(0.2, 0.92, wb / 2 - 0.5), 0.014)]); frame.add(withInk(sb, 0x3d3a36, 0.008)); }
  const gripZ = kind === 'fixie' ? gz - 0.02 : gz;
  if (parked) { bars.rotation.y = 0.35; bakeInPlace(root); }
  else { for (const o of [wR, wF, bars, ...cranks]) o.userData.dyn = true; bakeInPlace(root); for (const o of [wR, wF, bars, ...cranks]) { o.userData.dyn = false; bakeInPlace(o); o.userData.dyn = true; } }
  return { root, wheels: [wR, wF], wheelR: [rr, rf], cranks, pedals, bars, seat: S.clone().add(V(0, 0.07, 0)), bb: B.clone(), grip: H.clone().add(V(0, kind === 'fixie' ? gy - 0.1 : gy, gripZ)), crankLen: cl, kind };
}

export interface SegwayRig { root: THREE.Group; wheels: THREE.Object3D[] }
export function buildSegway(): SegwayRig {
  const root = new THREE.Group(); root.rotation.order = 'YXZ';
  const plat = new THREE.BoxGeometry(0.5, 0.08, 0.3); plat.translate(0, 0.22, 0); root.add(withInk(plat, 0x3d4247, 0.012));
  const st = merge([tube(V(0, 0.22, 0.05), V(0, 1.05, 0.12), 0.03), tube(V(-0.22, 1.05, 0.12), V(0.22, 1.05, 0.12), 0.025)]); root.add(withInk(st, 0x6f7479, 0.01));
  const wheels: THREE.Object3D[] = [];
  for (const s of [1, -1]) { const g = new THREE.Group(); g.userData.dyn = true; const w = new THREE.CylinderGeometry(0.22, 0.22, 0.09, 14); w.rotateZ(Math.PI / 2); g.add(new THREE.Mesh(w, T(0x2a2420))); const h = new THREE.CylinderGeometry(0.1, 0.1, 0.1, 8); h.rotateZ(Math.PI / 2); g.add(new THREE.Mesh(h, T(0xb8b0a0))); g.position.set(s * 0.32, 0.22, 0); root.add(g); wheels.push(g); }
  bakeInPlace(root); for (const w of wheels) { w.userData.dyn = false; bakeInPlace(w); w.userData.dyn = true; }
  return { root, wheels };
}

export interface HorseRig { root: THREE.Group; legs: Array<{ hip: THREE.Object3D; knee: THREE.Object3D; phase: number }>; neck: THREE.Object3D; tail: THREE.Object3D }
export function buildHorse(coat = 0x6b4a33): HorseRig {
  const root = new THREE.Group(); root.rotation.order = 'YXZ';
  const body = new THREE.CapsuleGeometry(0.36, 0.95, 4, 10); body.rotateX(Math.PI / 2); body.translate(0, 1.3, 0); root.add(withInk(body, coat, 0.02));
  const neck = new THREE.Group(); neck.position.set(0, 1.45, 0.65); root.add(neck);
  const ng = new THREE.CapsuleGeometry(0.17, 0.55, 3, 8); ng.translate(0, 0.32, 0); const nm = withInk(ng, coat, 0.018); nm.rotation.x = 0.6; neck.add(nm);
  const hg = new THREE.CapsuleGeometry(0.13, 0.42, 3, 8); hg.rotateX(Math.PI / 2 + 0.5); hg.translate(0, 0.72, 0.62); neck.add(withInk(hg, coat, 0.016));
  const mane = new THREE.BoxGeometry(0.06, 0.5, 0.12); mane.rotateX(0.6); mane.translate(0, 0.42, 0.12); neck.add(withInk(mane, 0x2b1d14, 0.01));
  for (const s of [1, -1]) { const e = new THREE.ConeGeometry(0.05, 0.14, 5); e.translate(s * 0.08, 0.98, 0.4); neck.add(withInk(e, coat, 0.008)); }
  const tail = new THREE.Group(); tail.position.set(0, 1.42, -0.82); root.add(tail);
  const tg = new THREE.CapsuleGeometry(0.06, 0.5, 2, 6); tg.translate(0, -0.3, 0); const tm = withInk(tg, 0x2b1d14, 0.01); tm.rotation.x = -0.4; tail.add(tm);
  const saddle = new THREE.CapsuleGeometry(0.3, 0.3, 2, 8); saddle.rotateX(Math.PI / 2); saddle.scale(1.05, 0.35, 1); saddle.translate(0, 1.64, -0.05); root.add(withInk(saddle, 0x5c3a24, 0.012));
  const legs: HorseRig['legs'] = [];
  const spots: Array<[number, number, number]> = [[0.2, 0.55, 0], [-0.2, 0.55, 0.5], [0.2, -0.55, 0.5], [-0.2, -0.55, 0]]; // diagonal pairs (trot)
  for (const [x, z, ph] of spots) {
    const hip = new THREE.Group(); hip.position.set(x, 1.15, z); root.add(hip);
    const up = new THREE.CapsuleGeometry(0.09, 0.42, 2, 6); up.translate(0, -0.3, 0); hip.add(withInk(up, coat, 0.012));
    const knee = new THREE.Group(); knee.position.set(0, -0.6, 0); hip.add(knee);
    const lo = new THREE.CapsuleGeometry(0.06, 0.38, 2, 6); lo.translate(0, -0.25, 0); knee.add(withInk(lo, coat, 0.01));
    const hoof = new THREE.CylinderGeometry(0.07, 0.08, 0.08, 6); hoof.translate(0, -0.5, 0.01); knee.add(withInk(hoof, 0x2a2420, 0.008));
    legs.push({ hip, knee, phase: ph });
  }
  const dyn = [neck, tail, ...legs.flatMap((l) => [l.hip, l.knee])];
  for (const o of dyn) o.userData.dyn = true;
  bakeInPlace(root);
  for (const o of dyn) { o.userData.dyn = false; bakeInPlace(o); o.userData.dyn = true; }
  return { root, legs, neck, tail };
}
export function poseHorse(h: HorseRig, gaitPhase: number, speed: number, t: number) {
  const amp = Math.min(0.7, speed * 0.07);
  for (const l of h.legs) { const p = (gaitPhase + l.phase) * Math.PI * 2; l.hip.rotation.x = Math.sin(p) * amp; l.knee.rotation.x = Math.max(0, Math.cos(p)) * amp * 1.4; }
  h.neck.rotation.x = Math.sin(gaitPhase * Math.PI * 4) * 0.06 * Math.min(1, speed / 4);
  h.tail.rotation.x = 0.2 + Math.sin(t * 3) * 0.15; h.tail.rotation.z = Math.sin(t * 2.3) * 0.2;
}

// ---------- people: one template rig, instanced parts ----------
// Each part type is ONE InstancedMesh (+ ink hull) shared by the whole crowd; paired limbs share a mesh
// (2 instances per person), so clothing variety costs instances, not draw calls. Clothes get a procedural
// fabric map (folds/seams/grime); faces are decals from a 4×4 expression atlas picked per instance.
type MarkKey = 'torso' | 'pelvis' | 'head' | 'nose' | 'uArmL' | 'uArmR' | 'lArmL' | 'lArmR' | 'handL' | 'handR' | 'thighL' | 'thighR' | 'shinL' | 'shinR' | 'footL' | 'footR'
  | 'hairCap' | 'hairBun' | 'helmet' | 'copCap' | 'beanie' | 'ballcap' | 'hood' | 'backpack' | 'bag' | 'belt' | 'badge' | 'skirt' | 'collar';
const L = { thigh: 0.42, shin: 0.42, uArm: 0.28, lArm: 0.27, torso: 0.42 };
interface Rig { root: THREE.Object3D; torso: THREE.Object3D; neck: THREE.Object3D; sh: [THREE.Object3D, THREE.Object3D]; el: [THREE.Object3D, THREE.Object3D]; hip: [THREE.Object3D, THREE.Object3D]; kn: [THREE.Object3D, THREE.Object3D]; ank: [THREE.Object3D, THREE.Object3D]; marks: Record<MarkKey, THREE.Object3D> }
function makeRig(): Rig {
  const O = () => new THREE.Object3D();
  const root = O(), torso = O(), neck = O(); root.add(torso); torso.add(neck); neck.position.y = L.torso + 0.05;
  const marks = {} as Record<MarkKey, THREE.Object3D>;
  const mark = (k: MarkKey, parent: THREE.Object3D, x: number, y: number, z: number) => { const m = O(); m.position.set(x, y, z); parent.add(m); marks[k] = m; };
  mark('pelvis', root, 0, 0.03, 0); mark('torso', torso, 0, L.torso / 2 + 0.02, 0); mark('head', neck, 0, 0.17, 0.01); mark('nose', neck, 0, 0.16, 0.16);
  mark('hairCap', neck, 0, 0.19, -0.005); mark('hairBun', neck, 0, 0.24, -0.14); mark('helmet', neck, 0, 0.23, 0); mark('copCap', neck, 0, 0.315, 0.0);
  mark('beanie', neck, 0, 0.262, -0.01); mark('ballcap', neck, 0, 0.235, 0); mark('hood', neck, 0, 0.0, -0.13); mark('collar', neck, 0, -0.02, 0);
  mark('backpack', torso, 0, L.torso / 2 + 0.05, -0.2); mark('badge', torso, 0.075, L.torso / 2 + 0.11, 0.135);
  mark('belt', root, 0, 0.1, 0); mark('bag', root, 0.21, 0.08, -0.02); mark('skirt', root, 0, -0.1, 0);
  const sh: Rig['sh'] = [O(), O()], el: Rig['el'] = [O(), O()], hip: Rig['hip'] = [O(), O()], kn: Rig['kn'] = [O(), O()], ank: Rig['ank'] = [O(), O()];
  const side: Array<['L' | 'R', number]> = [['L', 1], ['R', -1]];
  side.forEach(([n, s], i) => {
    sh[i].position.set(s * 0.2, L.torso - 0.03, 0); torso.add(sh[i]);
    mark(`uArm${n}` as MarkKey, sh[i], 0, -L.uArm / 2, 0);
    el[i].position.y = -L.uArm; sh[i].add(el[i]); mark(`lArm${n}` as MarkKey, el[i], 0, -L.lArm / 2, 0); mark(`hand${n}` as MarkKey, el[i], 0, -L.lArm - 0.035, 0.005);
    hip[i].position.set(s * 0.1, -0.02, 0); root.add(hip[i]); mark(`thigh${n}` as MarkKey, hip[i], 0, -L.thigh / 2, 0);
    kn[i].position.y = -L.thigh; hip[i].add(kn[i]); mark(`shin${n}` as MarkKey, kn[i], 0, -L.shin / 2, 0);
    ank[i].position.y = -L.shin; kn[i].add(ank[i]); mark(`foot${n}` as MarkKey, ank[i], 0, -0.035, 0.055);
  });
  return { root, torso, neck, sh, el, hip, kn, ank, marks };
}
const cap = (r: number, len: number, rs = 10) => new THREE.CapsuleGeometry(r, len, 4, rs);
/** scale x/z by a factor that varies linearly with y (top vs bottom), for tapered silhouettes */
function taper(g: THREE.BufferGeometry, bottom: number, top: number) {
  g.computeBoundingBox(); const b = g.boundingBox!, p = g.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < p.count; i++) { const u = (p.getY(i) - b.min.y) / (b.max.y - b.min.y || 1), k = bottom + (top - bottom) * u; p.setX(i, p.getX(i) * k); p.setZ(i, p.getZ(i) * k); }
  g.computeVertexNormals(); return g;
}
const sphere = (r: number, ws = 12, hs = 8) => new THREE.SphereGeometry(r, ws, hs);

export type Top = 'tee' | 'hoodie' | 'jacket' | 'vest' | 'tank' | 'uniform';
export type Bottom = 'pants' | 'cargo' | 'shorts' | 'skirt';
export type Hat = 'none' | 'beanie' | 'ballcap' | 'helmet' | 'copCap';
export interface PersonLook {
  skin: number; top: Top; shirt: number; jacket: number; bottom: Bottom; pants: number; shoes: number;
  hair: number; hairStyle: 'short' | 'bun' | 'bald'; hat: Hat; hatCol: number; carry: 'none' | 'backpack' | 'bag'; carryCol: number; face: number; cop?: boolean; /** holding a phone to the ear (witness) */ phone?: boolean;
}
type Part = { marks: MarkKey[]; geo: () => THREE.BufferGeometry; ink: number; fabric?: boolean; col: (lk: PersonLook) => number; show?: (lk: PersonLook) => boolean };
const sleeveLong = (lk: PersonLook) => lk.top === 'hoodie' || lk.top === 'jacket' || lk.top === 'uniform';
const outer = (lk: PersonLook) => (lk.top === 'jacket' || lk.top === 'hoodie' ? lk.jacket : lk.shirt);
const bareLegs = (lk: PersonLook) => lk.bottom === 'shorts' || lk.bottom === 'skirt';
const PARTS_DEF: Record<string, Part> = {
  torso: { marks: ['torso'], ink: 0.016, fabric: true, col: outer, geo: () => { const g = taper(cap(0.165, 0.2, 12), 0.86, 1.18); g.scale(1, 1, 0.74); return g; } },
  vest: { marks: ['torso'], ink: 0.014, fabric: true, col: (lk) => lk.jacket, show: (lk) => lk.top === 'vest', geo: () => { const g = taper(new THREE.CylinderGeometry(0.17, 0.17, 0.36, 12, 1, true, 0.5, Math.PI * 2 - 1.0), 0.95, 1.16); g.scale(1, 1, 0.8); g.translate(0, 0.02, 0); return g; } },
  collar: { marks: ['collar'], ink: 0, fabric: true, col: outer, show: (lk) => lk.top === 'jacket' || lk.top === 'uniform', geo: () => { const g = new THREE.TorusGeometry(0.085, 0.03, 5, 12); g.rotateX(Math.PI / 2); return g; } },
  hood: { marks: ['hood'], ink: 0.014, fabric: true, col: (lk) => lk.jacket, show: (lk) => lk.top === 'hoodie', geo: () => { const g = sphere(0.12, 10, 6); g.scale(1.25, 0.65, 0.7); return g; } },
  pelvis: { marks: ['pelvis'], ink: 0.016, fabric: true, col: (lk) => lk.pants, geo: () => { const g = sphere(0.16, 10, 6); g.scale(1.08, 0.72, 0.82); return g; } },
  skirt: { marks: ['skirt'], ink: 0.014, fabric: true, col: (lk) => lk.pants, show: (lk) => lk.bottom === 'skirt', geo: () => new THREE.CylinderGeometry(0.17, 0.27, 0.32, 12, 1, true) },
  belt: { marks: ['belt'], ink: 0, col: (lk) => (lk.cop ? 0x15110d : 0x3a2a1e), show: (lk) => !!lk.cop || lk.bottom === 'cargo', geo: () => { const g = new THREE.TorusGeometry(0.165, 0.028, 4, 16); g.rotateX(Math.PI / 2); g.scale(1.06, 1, 0.82); const buckle = new THREE.BoxGeometry(0.06, 0.05, 0.02); buckle.translate(0, 0, 0.14); return merge([g.toNonIndexed(), buckle.toNonIndexed()]); } },
  head: { marks: ['head'], ink: 0.016, col: (lk) => lk.skin, geo: () => { const g = sphere(0.15, 14, 10); g.scale(0.94, 1.08, 1); return g; } },
  nose: { marks: ['nose'], ink: 0, col: (lk) => lk.skin, geo: () => { const g = sphere(0.022, 6, 4); g.scale(1, 1.2, 1.1); return g; } },
  uArm: { marks: ['uArmL', 'uArmR'], ink: 0.014, fabric: true, col: (lk) => (lk.top === 'tank' ? lk.skin : outer(lk)), geo: () => taper(cap(0.056, L.uArm - 0.08), 0.9, 1.08) },
  lArm: { marks: ['lArmL', 'lArmR'], ink: 0.012, fabric: true, col: (lk) => (sleeveLong(lk) ? outer(lk) : lk.skin), geo: () => taper(cap(0.047, L.lArm - 0.08), 0.8, 1.05) },
  hand: { marks: ['handL', 'handR'], ink: 0, col: (lk) => (lk.cop ? 0x1f1a16 : lk.skin), geo: () => { const palm = sphere(0.046, 8, 6); palm.scale(0.75, 1.15, 0.95); const thumb = cap(0.016, 0.03, 5); thumb.rotateZ(0.6); thumb.translate(0.03, 0.01, 0.02); return merge([palm.toNonIndexed(), thumb.toNonIndexed()]); } },
  thigh: { marks: ['thighL', 'thighR'], ink: 0.014, fabric: true, col: (lk) => lk.pants, geo: () => taper(cap(0.082, L.thigh - 0.14), 0.82, 1.06) },
  shin: { marks: ['shinL', 'shinR'], ink: 0.012, fabric: true, col: (lk) => (bareLegs(lk) ? lk.skin : lk.pants), geo: () => { const g = taper(cap(0.064, L.shin - 0.1), 0.75, 1.05); return g; } },
  pocket: { marks: ['thighL', 'thighR'], ink: 0, fabric: true, col: (lk) => lk.pants, show: (lk) => lk.bottom === 'cargo', geo: () => { const g = new THREE.BoxGeometry(0.05, 0.12, 0.11); g.translate(0.075, -0.02, 0.0); return g; } },
  foot: { marks: ['footL', 'footR'], ink: 0.012, col: (lk) => lk.shoes, geo: () => { const g = new THREE.CapsuleGeometry(0.055, 0.13, 3, 8); g.rotateX(Math.PI / 2); g.scale(1, 0.75, 1); const sole = new THREE.BoxGeometry(0.11, 0.025, 0.24); sole.translate(0, -0.035, 0); return merge([g.toNonIndexed(), sole.toNonIndexed()]); } },
  hairCap: { marks: ['hairCap'], ink: 0.012, col: (lk) => lk.hair, show: (lk) => lk.hairStyle !== 'bald' && (lk.hat === 'none' || lk.hat === 'ballcap'), geo: () => { const g = new THREE.SphereGeometry(0.16, 14, 7, 0, Math.PI * 2, 0, Math.PI * 0.56); g.scale(0.96, 1, 1.04); g.rotateX(-0.25); return g; } },
  hairBun: { marks: ['hairBun'], ink: 0, col: (lk) => lk.hair, show: (lk) => lk.hairStyle === 'bun' && (lk.hat === 'none' || lk.hat === 'ballcap'), geo: () => sphere(0.07, 8, 6) },
  helmet: { marks: ['helmet'], ink: 0.014, col: (lk) => lk.hatCol, show: (lk) => lk.hat === 'helmet', geo: () => { const g = new THREE.SphereGeometry(0.178, 14, 6, 0, Math.PI * 2, 0, Math.PI * 0.5); g.scale(1, 0.85, 1.14); const ridge = new THREE.BoxGeometry(0.04, 0.03, 0.34); ridge.translate(0, 0.15, 0); const strap = new THREE.TorusGeometry(0.15, 0.008, 3, 12, Math.PI); strap.rotateY(Math.PI / 2); strap.rotateX(Math.PI); strap.translate(0, -0.02, 0.02); return merge([g.toNonIndexed(), ridge.toNonIndexed(), strap.toNonIndexed()]); } },
  copCap: { marks: ['copCap'], ink: 0.014, col: (lk) => lk.hatCol, show: (lk) => lk.hat === 'copCap', geo: () => { const top = new THREE.CylinderGeometry(0.17, 0.142, 0.09, 14); const band = new THREE.CylinderGeometry(0.147, 0.147, 0.045, 14); band.translate(0, -0.06, 0); const brim = new THREE.CylinderGeometry(0.1, 0.1, 0.015, 10); brim.scale(1, 1, 1.25); brim.translate(0, -0.075, 0.13); const crest = new THREE.BoxGeometry(0.05, 0.05, 0.01); crest.translate(0, -0.01, 0.165); return merge([top.toNonIndexed(), band.toNonIndexed(), brim.toNonIndexed(), crest.toNonIndexed()]); } },
  beanie: { marks: ['beanie'], ink: 0.012, fabric: true, col: (lk) => lk.hatCol, show: (lk) => lk.hat === 'beanie', geo: () => { const g = new THREE.SphereGeometry(0.168, 14, 7, 0, Math.PI * 2, 0, Math.PI * 0.55); g.scale(1, 0.95, 1.04); const cuff = new THREE.CylinderGeometry(0.166, 0.17, 0.06, 14, 1, true); cuff.translate(0, -0.005, 0); return merge([g.toNonIndexed(), cuff.toNonIndexed()]); } },
  ballcap: { marks: ['ballcap'], ink: 0.012, fabric: true, col: (lk) => lk.hatCol, show: (lk) => lk.hat === 'ballcap', geo: () => { const g = new THREE.SphereGeometry(0.163, 14, 6, 0, Math.PI * 2, 0, Math.PI * 0.47); const brim = new THREE.CylinderGeometry(0.11, 0.11, 0.014, 12, 1, false, -Math.PI / 2, Math.PI); brim.scale(1, 1, 1.4); brim.translate(0, 0.0, 0.13); return merge([g.toNonIndexed(), brim.toNonIndexed()]); } },
  backpack: { marks: ['backpack'], ink: 0.014, fabric: true, col: (lk) => lk.carryCol, show: (lk) => lk.carry === 'backpack', geo: () => { const g = new THREE.BoxGeometry(0.3, 0.36, 0.14, 2, 2, 1); const top = cap(0.07, 0.16, 6); top.rotateZ(Math.PI / 2); top.translate(0, 0.18, 0); const pocket = new THREE.BoxGeometry(0.2, 0.14, 0.06); pocket.translate(0, -0.08, -0.08); return merge([g.toNonIndexed(), top.toNonIndexed(), pocket.toNonIndexed()]); } },
  bag: { marks: ['bag'], ink: 0.012, fabric: true, col: (lk) => lk.carryCol, show: (lk) => lk.carry === 'bag', geo: () => { const g = new THREE.BoxGeometry(0.08, 0.24, 0.32); const flap = new THREE.BoxGeometry(0.09, 0.1, 0.33); flap.translate(0.005, 0.08, 0); const strap = new THREE.BoxGeometry(0.02, 0.02, 0.62); strap.rotateX(0.95); strap.rotateY(0.0); strap.translate(-0.1, 0.36, 0); return merge([g.toNonIndexed(), flap.toNonIndexed(), strap.toNonIndexed()]); } },
  phone: { marks: ['handR'], ink: 0, col: () => 0x1d1f22, show: (lk) => !!lk.phone, geo: () => { const g = new THREE.BoxGeometry(0.045, 0.1, 0.012); g.translate(0, 0.02, 0.03); return g; } },
  badge: { marks: ['badge'], ink: 0, col: () => 0xd8b24a, show: (lk) => !!lk.cop, geo: () => { const g = new THREE.CylinderGeometry(0.035, 0.035, 0.012, 6); g.rotateX(Math.PI / 2); return g; } },
};
const PARTS = Object.keys(PARTS_DEF);

const SHOES = [0x3a2a20, 0xd8cbb0, 0x2b2b2e, 0x6b4a32, 0x8a3a2e];
const JACKET = [0x4a4f3a, 0x5c3e2e, 0x2f3a44, 0x6b5a3e, 0x3d3530, 0x7a4a36, 0x55606a];
const HATC = [0x8a9a7b, 0xa8573d, 0xd8cbb0, 0x5f7480, 0x3a3a3e, 0x9a7a3a];
const CARRY = [0x4a4f3a, 0x7a4a36, 0x3a3a3e, 0x8a7a60, 0x6b3a2e];
export function lookFor(id: number, cop?: 'segway' | 'horse'): PersonLook {
  const h = (k: number) => Math.abs(Math.sin(id * 12.9898 + k * 78.233) * 43758.5453) % 1;
  const pick = <T,>(a: readonly T[], k: number) => a[Math.floor(h(k) * a.length) % a.length];
  const skin = pick(SKIN, 1), face = Math.floor(h(9) * 4);
  if (cop) return { skin, top: 'uniform', shirt: COP.shirt, jacket: COP.shirt, bottom: 'pants', pants: COP.pants, shoes: 0x15110d, hair: HAIR[0], hairStyle: 'short',
    hat: cop === 'horse' ? 'helmet' : 'copCap', hatCol: cop === 'horse' ? COP.helmet : COP.cap, carry: 'none', carryCol: 0, face, cop: true };
  const top = pick(['tee', 'hoodie', 'jacket', 'vest', 'tank', 'tee', 'hoodie'] as const, 2);
  const bottom = pick(['pants', 'cargo', 'shorts', 'skirt', 'pants', 'cargo'] as const, 3);
  const cargo = bottom === 'cargo' ? pick([0x6b6450, 0x4f5440, 0x7a6a50], 10) : pick(PANTS, 4);
  return { skin, top, shirt: pick(SHIRT, 5), jacket: pick(JACKET, 6), bottom, pants: cargo, shoes: pick(SHOES, 7), hair: pick(HAIR, 8), hairStyle: pick(['short', 'bun', 'bald', 'short'] as const, 11),
    hat: pick(['none', 'beanie', 'ballcap', 'none', 'helmet', 'none'] as const, 12), hatCol: pick(HATC, 13), carry: pick(['none', 'backpack', 'bag', 'none'] as const, 14), carryCol: pick(CARRY, 15), face };
}

/** 2-bone IK in the sagittal (y,z) plane: returns [upper, lower] x-rotations (0 = hanging down; + swings toward -z). */
export function ik2(dy: number, dz: number, l1: number, l2: number, bendFwd = true): [number, number] {
  const d = Math.min(l1 + l2 - 1e-3, Math.max(1e-3, Math.hypot(dy, dz)));
  const dir = Math.atan2(-dz, -dy);
  const a = Math.acos(Math.min(1, Math.max(-1, (l1 * l1 + d * d - l2 * l2) / (2 * l1 * d))));
  const b = Math.acos(Math.min(1, Math.max(-1, (l1 * l1 + l2 * l2 - d * d) / (2 * l1 * l2))));
  return bendFwd ? [dir - a, Math.PI - b] : [dir + a, -(Math.PI - b)];
}

export type PoseKind = 'ride' | 'walk' | 'stand' | 'flail' | 'ragdoll' | 'horse';
/** weapon use overriding the arms: aim (bazooka on shoulder, `kick` = recoil 0..1), throw (u 0..1 wind-up → release → follow-through), pull (grenade pin, u 0..1), carry (item in hand), pour (oil) */
export interface ArmUse { kind: 'aim' | 'throw' | 'pull' | 'carry' | 'pour' | 'phone' | 'flip'; u: number; kick?: number }
export interface PoseIn { kind: PoseKind; t: number; phase: number; lean?: number; spin?: number;
  /** ride: targets in rig-root (hip) space */ feet?: [THREE.Vector3, THREE.Vector3]; hands?: THREE.Vector3; torsoLean?: number;
  /** face expression (EXPR) */ expr?: number; /** arms flail wildly regardless of pose (stoker) */ flailArms?: boolean; arm?: ArmUse }
const lerp = (a: number, b: number, u: number) => a + (b - a) * Math.max(0, Math.min(1, u));
const ease = (u: number) => { const k = Math.max(0, Math.min(1, u)); return k * k * (3 - 2 * k); };
function pose(r: Rig, p: PoseIn) {
  for (const o of [r.torso, r.neck, ...r.sh, ...r.el, ...r.hip, ...r.kn, ...r.ank]) o.rotation.set(0, 0, 0);
  r.root.rotation.set(0, 0, 0); r.root.position.set(0, 0, 0);
  const s = Math.sin(p.phase), c = Math.cos(p.phase);
  if (p.kind === 'ride' || p.kind === 'horse') {
    const lean = p.torsoLean ?? 0.45; r.torso.rotation.x = lean; r.neck.rotation.x = -lean * 0.8;
    if (p.kind === 'horse') { for (let i = 0; i < 2; i++) { r.hip[i].rotation.set(-1.2, 0, (i ? -1 : 1) * 0.35); r.kn[i].rotation.x = 1.3; } }
    else if (p.feet) for (let i = 0; i < 2; i++) { const f = p.feet[i], hp = r.hip[i].position; const [a, b] = ik2(f.y - hp.y, f.z - hp.z, L.thigh, L.shin, true); r.hip[i].rotation.x = a; r.kn[i].rotation.x = b; r.ank[i].rotation.x = -a - b; }
    const hz = p.hands ?? new THREE.Vector3(0, 0.3, 0.55);
    for (let i = 0; i < 2; i++) {
      const sy = (L.torso - 0.03) * Math.cos(lean), sz = (L.torso - 0.03) * Math.sin(lean);
      const [a, b] = ik2(hz.y - sy, hz.z - sz, L.uArm, L.lArm + 0.04, false);
      r.sh[i].rotation.x = a - lean; r.el[i].rotation.x = b; r.sh[i].rotation.z = (i ? -1 : 1) * 0.12;
    }
  } else if (p.kind === 'walk') {
    for (let i = 0; i < 2; i++) { const k = i ? -1 : 1; r.hip[i].rotation.x = -k * s * 0.55; r.kn[i].rotation.x = Math.max(0, k * c) * 0.7; r.ank[i].rotation.x = -Math.max(0, -k * s) * 0.3; r.sh[i].rotation.x = k * s * 0.5; r.el[i].rotation.x = -0.35 - Math.max(0, -k * s) * 0.3; r.sh[i].rotation.z = (i ? -1 : 1) * 0.1; }
    r.torso.rotation.x = 0.06; r.torso.rotation.y = s * 0.08; r.neck.rotation.y = -s * 0.06; r.root.position.y = Math.abs(c) * 0.035;
  } else if (p.kind === 'flail') {
    const q = p.t * 18;
    for (let i = 0; i < 2; i++) { const k = i ? -1 : 1; r.hip[i].rotation.x = -k * Math.sin(q * 0.8) * 0.9; r.kn[i].rotation.x = Math.max(0, k * Math.cos(q * 0.8)) * 1.2; }
    r.torso.rotation.set(Math.sin(q * 0.5) * 0.2, 0, Math.sin(q * 0.7) * 0.25); r.neck.rotation.x = -0.4;
  } else if (p.kind === 'ragdoll') {
    const q = p.t * 7;
    for (let i = 0; i < 2; i++) { const k = i ? -1 : 1; r.sh[i].rotation.set(-1.6 + Math.sin(q + i) * 0.7, 0, k * (1.3 + Math.sin(q * 1.4) * 0.3)); r.el[i].rotation.x = -0.8 + Math.sin(q * 2 + i) * 0.5;
      r.hip[i].rotation.set(Math.sin(q * 1.1 + i * 3) * 0.8, 0, k * 0.45); r.kn[i].rotation.x = 0.4 + Math.abs(Math.sin(q + i)) * 0.9; }
    r.root.rotation.set(p.spin ?? 0, 0, (p.spin ?? 0) * 0.6);
  } else { // stand (Segway): arms forward to the bar
    for (let i = 0; i < 2; i++) { r.sh[i].rotation.set(-0.9, 0, (i ? -1 : 1) * 0.1); r.el[i].rotation.x = -0.5; r.hip[i].rotation.z = (i ? -1 : 1) * 0.06; }
    r.torso.rotation.x = 0.08;
  }
  if (p.kind === 'flail' || p.flailArms) { // windmilling arms above the head, elbows flapping
    const q = p.t * 17;
    for (let i = 0; i < 2; i++) { const k = i ? -1 : 1; const tl = r.torso.rotation.x;
      r.sh[i].rotation.set(-2.7 - tl + Math.sin(q + i * 2.1) * 0.75, Math.sin(q * 0.9 + i) * 0.4, k * (0.55 + Math.sin(q * 1.3 + i) * 0.45)); r.el[i].rotation.x = -0.5 + Math.sin(q * 1.7 + i) * 0.6; }
    r.neck.rotation.z = Math.sin(q * 0.6) * 0.25;
  }
  if (p.arm) armUse(r, p.arm);
  if (p.lean) r.root.rotation.z += p.lean;
}
/** weapon handling overrides (right arm = index 1; left = 0); compensates torso lean so the arm reads in world */
function armUse(r: Rig, a: ArmUse) {
  const tl = r.torso.rotation.x, R = r.sh[1], RE = r.el[1], Lh = r.sh[0], LE = r.el[0];
  if (a.kind === 'aim') { // tube on the right shoulder, right hand on the grip, left hand forward on the tube
    const k = a.kick ?? 0;
    R.rotation.set(-1.05 - tl + k * 0.35, 0.2, -0.25); RE.rotation.x = -1.35;
    Lh.rotation.set(-1.45 - tl + k * 0.3, -0.35, 0.35); LE.rotation.x = -0.45;
    r.torso.rotation.x = tl - k * 0.18; r.neck.rotation.y = -0.15;
  } else if (a.kind === 'throw') {
    const u = a.u; let sx: number, ex: number;
    if (u < 0.55) { const w = ease(u / 0.55); sx = lerp(-0.4, -3.5, w); ex = lerp(-0.4, -1.5, w); r.torso.rotation.y = lerp(0, 0.45, w); }          // wind up: arm cocked back over the shoulder
    else if (u < 0.72) { const w = ease((u - 0.55) / 0.17); sx = lerp(-3.5, -1.1, w); ex = lerp(-1.5, -0.1, w); r.torso.rotation.y = lerp(0.45, -0.35, w); } // whip
    else { const w = ease((u - 0.72) / 0.28); sx = lerp(-1.1, -0.3, w); ex = lerp(-0.1, -0.3, w); r.torso.rotation.y = lerp(-0.35, 0, w); }            // follow-through
    R.rotation.set(sx - tl, 0, -0.18); RE.rotation.x = ex;
    if (u < 0.55) { Lh.rotation.set(-1.3 - tl, 0, 0.3); LE.rotation.x = -0.3; } // off hand points at the target
  } else if (a.kind === 'pull') { // both hands at the chest, the left yanks the pin out sideways
    const w = ease(a.u);
    R.rotation.set(-1.0 - tl, 0.3, -0.1); RE.rotation.x = -1.6;
    Lh.rotation.set(-1.0 - tl, lerp(-0.3, 0.6, w), lerp(0.1, 0.9, w)); LE.rotation.x = lerp(-1.6, -0.6, w);
  } else if (a.kind === 'phone') { R.rotation.set(-0.35 - tl, 0, -0.55); RE.rotation.x = -2.55; r.neck.rotation.z = -0.15; // phone to the ear
  } else if (a.kind === 'flip') { const w = Math.sin(a.u * 9) * 0.12; R.rotation.set(-2.3 - tl + w, 0, -0.15); RE.rotation.x = -0.35; r.torso.rotation.y = -0.2;
  } else if (a.kind === 'pour') { R.rotation.set(-0.7 - tl, 0, -0.6 + Math.sin(a.u * 20) * 0.1); RE.rotation.x = -0.6; }
  else { R.rotation.set(-0.55 - tl, 0, -0.1); RE.rotation.x = -0.9; }
}

let GLARE: THREE.DataTexture | undefined;
/** Hard-cored radial glare (harsh siren bloom). */
function glareTex() {
  if (GLARE) return GLARE;
  const N = 32, d = new Uint8Array(N * N * 4);
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) { const r = Math.hypot(x - N / 2 + 0.5, y - N / 2 + 0.5) / (N / 2); const a = r < 0.25 ? 1 : Math.max(0, 1 - (r - 0.25) / 0.75) ** 2.2; const i = (y * N + x) * 4; d[i] = d[i + 1] = d[i + 2] = 255; d[i + 3] = Math.round(a * 255); }
  GLARE = new THREE.DataTexture(d, N, N); GLARE.needsUpdate = true; return GLARE;
}
/** toon material with the fabric detail map (UV-scaled so folds read at body scale) */
function fabricToon(): THREE.Material {
  const m = toon(0xffffff) as THREE.MeshToonMaterial; m.map = fabricTex(); m.map.repeat.set(2, 1.5); m.needsUpdate = true; return m;
}
/** face decal: front patch of a sphere just outside the head, atlas cell chosen per instance (aCell) */
function faceGeo() { const g = new THREE.SphereGeometry(0.153, 10, 8, Math.PI / 2 - 0.68, 1.36, 0.94, 1.02); g.scale(0.94, 1.08, 1); return g; }
function faceMat(): THREE.Material {
  const m = toon(0xffffff) as THREE.MeshToonMaterial; m.map = faceAtlas(); m.alphaTest = 0.5; m.transparent = false;
  m.onBeforeCompile = (sh) => {
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nattribute float aCell;')
      .replace('#include <uv_vertex>', '#include <uv_vertex>\nvMapUv = (vec2(1.0 - uv.x, uv.y) + vec2(mod(aCell, 4.0), floor(aCell / 4.0))) * 0.25;');
  };
  m.customProgramCacheKey = () => 'gtpFace'; return m;
}
export class Crowd {
  readonly group = new THREE.Group();
  private rig = makeRig(); private holder = new THREE.Object3D();
  private inst = new Map<string, { body: THREE.InstancedMesh; ink?: THREE.InstancedMesh; part: Part }>();
  private face: THREE.InstancedMesh; private cell: THREE.InstancedBufferAttribute;
  private n = 0; private zero = new THREE.Matrix4().makeScale(0, 0, 0); private col = new THREE.Color();
  constructor(readonly cap = 64) {
    this.holder.add(this.rig.root);
    for (const k of PARTS) {
      const part = PARTS_DEF[k], g = part.geo(), n = cap * part.marks.length;
      const body = new THREE.InstancedMesh(g, part.fabric ? fabricToon() : toon(0xffffff), n);
      const ink = part.ink > 0 ? new THREE.InstancedMesh(g, inkMat(part.ink), n) : undefined;
      for (const m of [body, ink]) if (m) { m.instanceMatrix.setUsage(THREE.DynamicDrawUsage); m.frustumCulled = false; this.group.add(m); }
      for (let i = 0; i < n; i++) body.setColorAt(i, this.col.set(0xffffff));
      this.inst.set(k, { body, ink, part });
    }
    const fg = faceGeo(); this.cell = new THREE.InstancedBufferAttribute(new Float32Array(cap), 1); this.cell.setUsage(THREE.DynamicDrawUsage); fg.setAttribute('aCell', this.cell);
    this.face = new THREE.InstancedMesh(fg, faceMat(), cap); this.face.instanceMatrix.setUsage(THREE.DynamicDrawUsage); this.face.frustumCulled = false; this.group.add(this.face);
  }
  begin() { this.n = 0; }
  /** Add one posed person whose hips sit at `world`. Returns the person's slot (or -1 if full). */
  add(world: THREE.Matrix4, look: PersonLook, p: PoseIn) {
    if (this.n >= this.cap) return -1;
    const i = this.n++;
    pose(this.rig, p);
    this.holder.matrixAutoUpdate = false; this.holder.matrix.copy(world); this.holder.matrixWorldNeedsUpdate = true; this.holder.updateMatrixWorld(true);
    for (const { body, ink, part } of this.inst.values()) {
      const vis = !part.show || part.show(look), col = this.col.set(part.col(look));
      part.marks.forEach((mk, j) => { const at = i * part.marks.length + j, m = vis ? this.rig.marks[mk].matrixWorld : this.zero; body.setMatrixAt(at, m); ink?.setMatrixAt(at, m); body.setColorAt(at, col); });
    }
    this.face.setMatrixAt(i, this.rig.marks.head.matrixWorld);
    this.cell.setX(i, faceCell(look.face, p.expr ?? (p.kind === 'flail' || p.flailArms ? EXPR.scared : p.kind === 'ragdoll' ? EXPR.scared : EXPR.neutral)));
    return i;
  }
  /** world matrix of a rig mark for the person just added (weapon attachment) */
  markWorld(k: 'handR' | 'handL' | 'torso' | 'head' | 'pelvis', out = new THREE.Matrix4()) { return out.copy(this.rig.marks[k].matrixWorld); }
  end() {
    for (const { body, ink, part } of this.inst.values()) {
      const used = this.n * part.marks.length, cap = this.cap * part.marks.length;
      for (let i = used; i < cap; i++) { body.setMatrixAt(i, this.zero); ink?.setMatrixAt(i, this.zero); }
      body.count = Math.max(1, used); if (ink) ink.count = body.count;
      body.instanceMatrix.needsUpdate = true; if (ink) ink.instanceMatrix.needsUpdate = true; if (body.instanceColor) body.instanceColor.needsUpdate = true;
    }
    for (let i = this.n; i < this.cap; i++) this.face.setMatrixAt(i, this.zero);
    this.face.count = Math.max(1, this.n); this.face.instanceMatrix.needsUpdate = true; this.cell.needsUpdate = true;
  }
  /** Draw calls this crowd costs regardless of headcount. */
  get drawCalls() { let n = 1; for (const v of this.inst.values()) n += v.ink ? 2 : 1; return n; }
}

// ---------- the scene-level character layer ----------
const M = new THREE.Matrix4(), Q = new THREE.Quaternion(), E = new THREE.Euler(0, 0, 0, 'YXZ'), P = new THREE.Vector3(), ONE = new THREE.Vector3(1, 1, 1);
const worldAt = (x: number, y: number, z: number, heading: number, pitch = 0, roll = 0) => M.compose(P.set(x, y, z), Q.setFromEuler(E.set(pitch, heading, roll, 'YXZ')), ONE).clone();

const ORGANIZER_LOOK: PersonLook = { ...lookFor(91), top: 'hoodie', jacket: 0x1f1d1b, shirt: 0x1f1d1b, bottom: 'pants', pants: 0x2a2724, hat: 'beanie', hatCol: 0x141312, carry: 'none', face: 3 } as PersonLook;
const DEALER_LOOK: PersonLook = { ...lookFor(77), top: 'jacket', jacket: 0x2b2622, shirt: 0x5a3a2a, bottom: 'pants', pants: 0x1f1c1a, hat: 'beanie', hatCol: 0x3a2a20, carry: 'bag', carryCol: 0x4a3a2a, face: 3 };
/** look for a crowd NPC: rival gang wear matching mustard jackets + dark beanies; witnesses hold a phone */
function npcLook(n: { id: number; gang?: boolean; callS?: number }): PersonLook {
  const lk = lookFor(n.id);
  if (n.gang) return { ...lk, top: 'jacket', jacket: GANG.colour, shirt: GANG.accent, bottom: 'cargo', pants: 0x2b2a24, hat: 'helmet', hatCol: GANG.colour, carry: 'none' };
  return (n.callS ?? 0) > 0 ? { ...lk, phone: true } : lk;
}
export class Characters {
  readonly group = new THREE.Group();
  readonly crowd = new Crowd(160);
  private riderBikes = new Map<string, BikeRig>();
  private tpl = new Map<string, BikeRig>(); private far = new Map<string, { body: THREE.InstancedMesh; ink: THREE.InstancedMesh; n: number }>();
  private farTpl(kind: string) { let r = this.tpl.get(kind); if (!r) { r = buildBike(kind); this.tpl.set(kind, r); } return r; }
  private farInst(kind: string) {
    let f = this.far.get(kind);
    if (!f) {
      const tp = this.farTpl(kind), parts: THREE.BufferGeometry[] = [];
      tp.wheels.forEach((w, i) => { const g = new THREE.TorusGeometry(tp.wheelR[i], 0.04, 4, 14); g.rotateY(Math.PI / 2); g.translate(w.position.x, w.position.y, w.position.z); parts.push(g.toNonIndexed()); });
      const [r0, r1] = tp.wheels.map((w) => w.position), L = r1.distanceTo(r0);
      const fr = new THREE.BoxGeometry(0.05, 0.05, L * 0.75); fr.translate(0, tp.bb.y + 0.15, (r0.z + r1.z) / 2); parts.push(fr.toNonIndexed());
      const st = new THREE.BoxGeometry(0.05, tp.seat.y - tp.bb.y, 0.05); st.translate(0, (tp.seat.y + tp.bb.y) / 2, tp.seat.z); parts.push(st.toNonIndexed());
      const g = mergeGeometries(parts)!; g.computeVertexNormals();
      const body = new THREE.InstancedMesh(g, toon(BIKE_TINT[kind] ?? 0x6f8a7a), 48), ink = new THREE.InstancedMesh(g, inkMat(0.02), 48);
      body.frustumCulled = ink.frustumCulled = false; body.instanceMatrix.setUsage(THREE.DynamicDrawUsage); ink.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      f = { body, ink, n: 0 }; this.far.set(kind, f); this.group.add(body, ink);
    }
    return f;
  }
  /** squash & stretch y-scale for the player's bike + rider (set by Fx) */
  squash = 1;
  private parked = new Map<number, BikeRig>(); private cyc = new Map<number, BikeRig & { wa: number; ca: number }>();
  private lights = new Map<number, THREE.Group>();
  /** Harsh strobing red/blue light bar + glare sprites (grit pass). */
  private copLight(id: number) {
    let g = this.lights.get(id);
    if (!g) {
      g = new THREE.Group();
      for (const [x, c] of [[-0.12, 0xff1a1a], [0.12, 0x1a4dff]] as const) {
        const b = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.08, 0.1), new THREE.MeshBasicMaterial({ color: c })); b.position.x = x; b.name = 'bar';
        const sp = new THREE.Sprite(new THREE.SpriteMaterial({ color: c, map: glareTex(), blending: THREE.AdditiveBlending, transparent: true, depthWrite: false, opacity: 1 })); sp.position.x = x * 2; sp.scale.setScalar(1.3); sp.name = 'glare';
        g.add(b, sp);
      }
      this.lights.set(id, g); this.group.add(g);
    }
    return g;
  }
  private segways = new Map<number, SegwayRig>(); private horses = new Map<number, HorseRig>();
  private prev = new Map<string, { x: number; z: number; h: number; dist: number; lean: number; steer: number }>();
  private crank = 0; private wheelA = 0; private riderLook: PersonLook;
  constructor(riderShirt: number) {
    this.group.add(this.crowd.group);
    this.riderLook = { ...lookFor(7), top: 'jacket', jacket: riderShirt, shirt: riderShirt, bottom: 'cargo', hat: 'helmet', hatCol: 0xd8cbb0, carry: 'bag', face: 1 };
  }
  private bikeFor(kind: string, paint?: number): BikeRig {
    const key = `${kind}:${paint ?? -1}`;
    let b = this.riderBikes.get(key);
    if (!b) { b = buildBike(kind, paint); this.riderBikes.set(key, b); this.group.add(b.root); }
    return b;
  }
  private motion(key: string, x: number, z: number, h: number, dt: number) {
    let m = this.prev.get(key);
    if (!m) { m = { x, z, h, dist: 0, lean: 0, steer: 0 }; this.prev.set(key, m); }
    const d = Math.hypot(x - m.x, z - m.z), dh = Math.atan2(Math.sin(h - m.h), Math.cos(h - m.h));
    const v = dt > 0 ? d / dt : 0, yaw = dt > 0 ? dh / dt : 0;
    m.dist += d; m.x = x; m.z = z; m.h = h;
    const k = 1 - Math.exp(-6 * dt);
    m.lean += (Math.max(-0.45, Math.min(0.45, -yaw * v * 0.05)) - m.lean) * k;
    m.steer += (Math.max(-0.5, Math.min(0.5, yaw * 0.35)) - m.steer) * k;
    return { v, m };
  }

  update(s: Snapshot, dt: number, cadence: number, paintCol: number | undefined) {
    const t = s.t;
    for (const f of this.far.values()) f.n = 0;
    this.crowd.begin();
    const used = new Set<string>();
    // --- rider ---
    const R = s.rider;
    if (s.mode === 'bike' && R.kind) {
      const b = this.bikeFor(R.kind, paintCol); used.add(`${R.kind}:${paintCol ?? -1}`);
      const { m } = this.motion('rider', R.x, R.z, R.heading, dt);
      const r0 = b.wheelR[0];
      this.wheelA += (R.speed / r0) * dt;
      this.crank += cadence > 5 ? (cadence / 60) * Math.PI * 2 * dt : (R.speed / r0 / 2.6) * dt;
      const wob = R.flat ? Math.sin(t * 9) * 0.12 : 0;
      b.root.position.set(R.x, R.y, R.z); b.root.rotation.set(R.air ? -0.05 : 0, R.heading, m.lean + wob);
      { const sq = this.squash, w = 1 / Math.sqrt(sq); b.root.scale.set(w, sq, w); }
      b.root.visible = true;
      this.spin(b, this.wheelA, this.crank, R.air ? 0 : m.steer + wob);
      b.root.updateMatrixWorld(true);
      const use = this.armUse(s);
      this.addRider(b, this.riderLook, 0, t, m.lean, { arm: use.arm, expr: use.expr });
      this.holdWeapon(s, use, true);
      if (b.kind === 'tandem' && (s.stoker ?? -1) >= 0) this.addRider(b, lookFor(s.stoker), 1, t, m.lean + Math.sin(t * 11) * 0.12, { flailArms: true, expr: EXPR.scared }); // snatched stoker: windmilling, screaming
    }
    for (const [k, b] of this.riderBikes) if (!used.has(k)) b.root.visible = false;
    if (s.mode === 'foot') {
      const { m } = this.motion('riderFoot', R.x, R.z, R.heading, dt);
      const use = this.armUse(s);
      this.crowd.add(worldAt(R.x, R.y + L.thigh + L.shin + 0.05, R.z, R.heading), this.riderLook, { kind: 'walk', t, phase: m.dist * 2.4, arm: use.arm, expr: use.expr });
      this.holdWeapon(s, use, false);
    }
    if (s.mode !== 'bike' && s.mode !== 'foot') this.holdWeapon(s, { arm: undefined, inHand: false }, false, true);
    if (s.ragdoll) this.crowd.add(worldAt(s.ragdoll.x, s.ragdoll.y + 0.5, s.ragdoll.z, R.heading), this.riderLook, { kind: 'ragdoll', t, phase: 0, spin: s.ragdoll.spin, expr: s.ragdoll.y < heightAt(s.ragdoll.x, s.ragdoll.z, s.bridge) + 0.3 ? EXPR.dazed : EXPR.scared });
    // --- pedestrians ---
    const seenC = new Set<number>();
    // the dealer by his van
    if (!s.race || s.race.state === 'done') for (const r of ROUTES) { // hooded race organizers by each chalk start line
      const ox = r.start.x + Math.cos(r.start.heading) * 4.4, oz = r.start.z - Math.sin(r.start.heading) * 4.4;
      if (Math.hypot(ox - R.x, oz - R.z) < 110) this.crowd.add(worldAt(ox, heightAt(ox, oz, s.bridge) + L.thigh + L.shin + 0.05, oz, Math.atan2(R.x - ox, R.z - oz)), ORGANIZER_LOOK, { kind: 'walk', t, phase: Math.PI / 2, expr: EXPR.neutral, arm: Math.hypot(ox - R.x, oz - R.z) < 8 ? { kind: 'flip', u: 0 } : undefined });
    }
    if (Math.hypot(DEALER.x - R.x, DEALER.z - R.z) < 130) this.crowd.add(worldAt(DEALER.x, heightAt(DEALER.x, DEALER.z, s.bridge) + L.thigh + L.shin + 0.05, DEALER.z, Math.atan2(R.x - DEALER.x, R.z - DEALER.z)), DEALER_LOOK, { kind: 'walk', t, phase: Math.PI / 2, expr: s.dealer.menu ? EXPR.neutral : EXPR.angry, arm: s.dealer.near ? { kind: 'carry', u: 0 } : undefined });
    // full bike rigs only for the 4 nearest riders inside 28 m (keeps a race grid / busy junction under the draw-call budget)
    const fullRig = new Set(s.npcs.filter((n) => n.bike && n.airS <= 0 && !n.stoker).map((n) => [n.id, Math.hypot(n.x - R.x, n.z - R.z)] as const).filter(([, d]) => d <= 28).sort((a, b) => a[1] - b[1]).slice(0, 4).map(([id]) => id));
    for (const n of s.npcs) {
      if (n.stoker) continue; // drawn on your tandem's back seat
      const { m, v } = this.motion(`n${n.id}`, n.x, n.z, n.heading, dt);
      if (n.bike && n.airS <= 0) { // NPC cyclist: own bike rig, pedalling, seated rider (hidden when far away)
        const dist = Math.hypot(n.x - R.x, n.z - R.z);
        if (!fullRig.has(n.id)) { // LOD: one instanced silhouette per bike kind (2 calls for all of them) + instanced rider
          if (dist > 120) continue;
          const tp = this.farTpl(n.bike); tp.root.position.set(n.x, n.y, n.z); tp.root.rotation.set(0, n.heading, m.lean); tp.root.updateMatrixWorld(true);
          const fi = this.farInst(n.bike); if (fi.n < fi.body.count) { fi.body.setMatrixAt(fi.n, tp.root.matrixWorld); fi.ink.setMatrixAt(fi.n, tp.root.matrixWorld); fi.n++; }
          this.addRider(tp, npcLook(n), 0, t, m.lean);
          continue;
        }
        const far = false;
        let b = this.cyc.get(n.id);
        if (!b || b.kind !== n.bike) { if (b) this.group.remove(b.root); b = Object.assign(buildBike(n.bike, n.gang ? GANG.colour : undefined), { wa: 0, ca: 0 }); this.cyc.set(n.id, b); this.group.add(b.root); }
        seenC.add(n.id); b.root.visible = !far; if (far) continue;
        b.wa += (v / b.wheelR[0]) * dt; b.ca += (v / b.wheelR[0] / 2.6) * dt;
        b.root.position.set(n.x, n.y, n.z); b.root.rotation.set(0, n.heading, m.lean);
        this.spin(b, b.wa, b.ca, m.steer); b.root.updateMatrixWorld(true);
        this.addRider(b, npcLook(n), 0, t, m.lean);
        continue;
      }
      if (n.angryS > 0 && n.airS <= 0 && n.stunS <= 0) { // jacked victim: run after you, shaking a fist
        const lk2 = npcLook(n), hip = L.thigh + L.shin + 0.05;
        this.crowd.add(worldAt(n.x, n.y + hip, n.z, n.heading), lk2, v > 0.5 ? { kind: 'walk', t, phase: m.dist * 2.2 + n.id, expr: EXPR.angry, arm: { kind: 'carry', u: 0 } } : { kind: 'flail', t: t * 1.6 + n.id, phase: 0, expr: EXPR.angry });
        continue;
      }
      const lk = npcLook(n);
      const hipY = L.thigh + L.shin + 0.05;
      if (n.airS > 0) this.crowd.add(worldAt(n.x, n.y + 0.6, n.z, n.heading), lk, { kind: 'ragdoll', t: t + n.id, phase: 0, spin: n.airS * 7 });
      else if (n.stunS > 0) this.crowd.add(worldAt(n.x, n.y + 0.2, n.z, n.heading, -Math.PI / 2), lk, { kind: 'ragdoll', t: 0.3 + n.id, phase: 0, spin: 0, expr: EXPR.dazed });
      else if (n.flailS > 0) this.crowd.add(worldAt(n.x, n.y + hipY, n.z, n.heading), lk, { kind: 'flail', t: t + n.id * 0.3, phase: 0 });
      else this.crowd.add(worldAt(n.x, n.y + hipY, n.z, n.heading), lk, { kind: 'walk', t, phase: m.dist * 2.6 + n.id, expr: (n.callS ?? 0) > 0 ? EXPR.angry : n.react === 'shout' || n.react === 'dodge' ? EXPR.scared : n.react ? EXPR.angry : (n.groggyS ?? 0) > 0 ? EXPR.dazed : EXPR.neutral,
        arm: (n.callS ?? 0) > 0 ? { kind: 'phone', u: 0 } : n.react === 'flip' || n.react === 'heckle' ? { kind: 'flip', u: t } : undefined });
    }
    for (const [id, b] of this.cyc) if (!seenC.has(id)) { this.group.remove(b.root); this.cyc.delete(id); }
    for (const f of this.far.values()) { f.body.count = f.ink.count = f.n; f.body.visible = f.ink.visible = f.n > 0; f.body.instanceMatrix.needsUpdate = f.ink.instanceMatrix.needsUpdate = true; }
    // --- parked bikes (upright on a kickstand lean) ---
    const seen = new Set<number>();
    for (const pb of s.bikes) {
      seen.add(pb.id); let b = this.parked.get(pb.id);
      if (!b) { b = buildBike(pb.kind, undefined, true); this.parked.set(pb.id, b); this.group.add(b.root); }
      b.root.position.set(pb.x, heightAt(pb.x, pb.z, s.bridge), pb.z); b.root.rotation.set(0, pb.heading, 0.12);
    }
    for (const [id, b] of this.parked) if (!seen.has(id)) { this.group.remove(b.root); this.parked.delete(id); }
    // --- cops ---
    const sc = new Set<number>(), hc = new Set<number>();
    for (const c of s.cops) {
      const { v, m } = this.motion(`c${c.id}`, c.x, c.z, c.heading, dt);
      const lk = lookFor(c.id, c.kind);
      const flying = c.airS > 0, spinR = flying ? c.airS * 7 : 0;
      if (c.kind === 'segway') {
        let g = this.segways.get(c.id); if (!g) { g = buildSegway(); this.segways.set(c.id, g); this.group.add(g.root); } sc.add(c.id);
        g.root.position.set(c.x, c.y, c.z); g.root.rotation.set(flying ? spinR : Math.min(0.25, v * 0.02), c.heading, flying ? c.airS * 4 : c.stunS > 0 ? Math.sin(t * 20) * 0.2 : 0);
        for (const w of g.wheels) w.rotation.x += (v / 0.22) * dt;
        const hipY = 0.26 + L.thigh + L.shin;
        if (flying) this.crowd.add(worldAt(c.x, c.y + 0.8, c.z, c.heading), lk, { kind: 'ragdoll', t, phase: 0, spin: spinR * 1.3 });
        else if (c.downed && c.stunS > 0) this.crowd.add(worldAt(c.x + 0.8, c.y + 0.2, c.z, c.heading, -Math.PI / 2), lk, { kind: 'ragdoll', t: 0.3 + c.id, phase: 0, spin: 0, expr: EXPR.dazed }); // flat on the ground
        else this.crowd.add(worldAt(c.x, c.y + hipY, c.z, c.heading, Math.min(0.25, v * 0.02)), lk, { kind: c.flailS > 0 ? 'flail' : 'stand', t, phase: 0, expr: c.state === 'patrol' ? EXPR.neutral : EXPR.angry });
      } else {
        let h = this.horses.get(c.id); if (!h) { h = buildHorse(c.id % 2 ? 0x6b4a33 : 0x8a6a4a); this.horses.set(c.id, h); this.group.add(h.root); } hc.add(c.id);
        h.root.position.set(c.x, c.y, c.z); h.root.rotation.set(flying ? spinR : 0, c.heading, flying ? c.airS * 3 : 0);
        poseHorse(h, m.dist / 2.6, v, t);
        h.root.updateMatrixWorld(true);
        if (flying) this.crowd.add(worldAt(c.x, c.y + 2.2, c.z, c.heading), lk, { kind: 'ragdoll', t, phase: 0, spin: spinR * 1.2 });
        else { const w = h.root.matrixWorld.clone().multiply(new THREE.Matrix4().makeTranslation(0, 1.82 + Math.abs(Math.sin(m.dist * 1.2)) * 0.05, -0.05)); this.crowd.add(w, lk, { kind: c.flailS > 0 ? 'flail' : 'horse', t, phase: 0, torsoLean: 0.1, hands: new THREE.Vector3(0, 0.15, 0.4), expr: c.state === 'patrol' ? EXPR.neutral : EXPR.angry }); }
      }
    }
    { // cop light bars: double-flash strobe, red/blue alternating, glare blooms
      const seen = new Set<number>();
      for (const c of s.cops) {
        if (c.state === 'patrol') continue; seen.add(c.id);
        const g = this.copLight(c.id), hy = c.kind === 'horse' ? 3.25 : 2.35;
        g.position.set(c.x, c.y + hy, c.z); g.rotation.y = c.heading;
        const ph = (t * 4 + c.id * 0.37) % 1, side = Math.floor(t * 4 + c.id * 0.37) % 2, on = ph < 0.18 || (ph > 0.3 && ph < 0.48);
        g.children.forEach((o, i) => { const mine = Math.floor(i / 2) === side; o.visible = o.name === 'bar' ? true : mine && on; if (o.name === 'bar') ((o as THREE.Mesh).material as THREE.MeshBasicMaterial).color.setHex(mine && on ? (i < 2 ? 0xff3030 : 0x3060ff) : (i < 2 ? 0x551010 : 0x101a55)); });
      }
      for (const [id, g] of this.lights) if (!seen.has(id)) { this.group.remove(g); this.lights.delete(id); }
    }
    for (const [id, g] of this.segways) if (!sc.has(id)) { this.group.remove(g.root); this.segways.delete(id); }
    for (const [id, h] of this.horses) if (!hc.has(id)) { this.group.remove(h.root); this.horses.delete(id); }
    this.crowd.end();
  }
  // ---- the rider's weapon: in hand on foot / while using it, slung on the back (bazooka) or at the hip otherwise ----
  private held = new Map<string, WeaponModel>();
  private heldModel(k: WeaponModelKind) { let w = this.held.get(k); if (!w) { w = buildWeapon(k); this.held.set(k, w); this.group.add(w.root); } return w; }
  private armUse(s: Snapshot): { arm?: ArmUse; inHand: boolean; expr: number; u?: number } {
    const w = s.weapon, t = s.t, has = (s.ammo as Record<string, number>)[w] > 0;
    if (s.cast) {
      const u = Math.min(1, (t - s.cast.t0) / s.cast.dur);
      if (w === 'bazooka' || s.cast.w === 'bazooka') return { arm: { kind: 'aim', u, kick: 0 }, inHand: true, expr: EXPR.angry, u };
      if (s.cast.w === 'oil') return { arm: { kind: 'pour', u }, inHand: true, expr: EXPR.angry, u };
      if (s.cast.w === 'grenade' && u < 0.45) return { arm: { kind: 'pull', u: u / 0.45 }, inHand: true, expr: EXPR.angry, u };
      const tu = s.cast.w === 'grenade' ? (u - 0.45) / 0.55 : u;
      return { arm: { kind: 'throw', u: tu * 0.55 }, inHand: true, expr: EXPR.angry, u };
    }
    const ls = s.lastShot, since = ls ? t - ls.t : 99;
    if (ls && since < 0.6) {
      if (ls.w === 'bazooka') return { arm: { kind: 'aim', u: 1, kick: Math.exp(-since * 9) }, inHand: true, expr: EXPR.angry };
      if (ls.w === 'oil') return { arm: { kind: 'pour', u: 1 + since }, inHand: true, expr: EXPR.angry };
      return { arm: { kind: 'throw', u: 0.55 + Math.min(1, since / 0.45) * 0.45 }, inHand: false, expr: EXPR.angry };
    }
    return { arm: s.mode === 'foot' && has && w !== 'bazooka' ? { kind: 'carry', u: 0 } : undefined, inHand: s.mode === 'foot' && has && w !== 'bazooka', expr: EXPR.neutral };
  }
  private holdWeapon(s: Snapshot, use: { arm?: ArmUse; inHand: boolean; u?: number }, onBike: boolean, hide = false) {
    for (const w of this.held.values()) w.root.visible = false;
    const k = s.weapon as WeaponModelKind; if (hide || !((s.ammo as Record<string, number>)[k] > 0 || s.cast)) return;
    const w = this.heldModel(k); w.root.visible = true; w.root.matrixAutoUpdate = false;
    const M2 = new THREE.Matrix4();
    if (k === 'bazooka') {
      if (use.arm?.kind === 'aim') { // on the right shoulder, level, pointing where you face; kicks back on recoil
        const sh = this.crowd.markWorld('torso', M2), p = new THREE.Vector3().setFromMatrixPosition(sh), kick = use.arm.kick ?? 0;
        const off = new THREE.Vector3(-0.2, 0.26, -0.05 - kick * 0.18).applyAxisAngle(new THREE.Vector3(0, 1, 0), s.rider.heading);
        w.root.matrix.compose(p.add(off), new THREE.Quaternion().setFromEuler(new THREE.Euler(-kick * 0.35, s.rider.heading, 0, 'YXZ')), ONE);
      } else w.root.matrix.copy(this.crowd.markWorld('torso', M2)).multiply(new THREE.Matrix4().compose(V(0.02, 0.0, -0.21), new THREE.Quaternion().setFromEuler(new THREE.Euler(-Math.PI / 2 + 0.25, 0, 0.75)), ONE)); // slung diagonally on the back
      if (w.warhead) w.warhead.visible = !(s.lastShot?.w === 'bazooka' && s.t - s.lastShot.t < 0.6);
    } else if (use.inHand || (!onBike && use.arm)) {
      w.root.matrix.copy(this.crowd.markWorld('handR', M2)).multiply(new THREE.Matrix4().compose(V(0, -0.04, 0.03), new THREE.Quaternion().setFromEuler(new THREE.Euler(Math.PI, 0, 0)), ONE));
    } else if (!use.arm) { // riding: clipped at the hip
      w.root.matrix.copy(this.crowd.markWorld('pelvis', M2)).multiply(new THREE.Matrix4().compose(V(-0.2, 0.02, 0.02), new THREE.Quaternion(), ONE));
    } else { w.root.visible = false; return; } // just released: it's in the air now
    w.root.matrixWorldNeedsUpdate = true;
    const lit = !!s.cast && s.cast.w === 'molotov' && (use.u ?? 0) > 0.25; // the rag is lit during the wind-up
    flicker(w, s.t, lit);
    if (w.pin) w.pin.visible = !(s.cast && s.cast.w === 'grenade' && (use.u ?? 0) > 0.3);
  }
  private spin(b: BikeRig, wheelA: number, crankA: number, steer: number) {
    for (const w of b.wheels) w.rotation.x = wheelA * (b.wheelR[0] / b.wheelR[b.wheels.indexOf(w)]);
    for (const c of b.cranks) c.rotation.x = crankA;
    if (b.kind === 'scooter' && b.pedals[1]) { // kick-push loop: plant behind, sweep back along the ground, lift and swing forward
      const ph = (crankA / (Math.PI * 2)) % 1, u = ph < 0 ? ph + 1 : ph;
      const back = u < 0.55 ? u / 0.55 : 1 - (u - 0.55) / 0.45, lift = u < 0.55 ? 0 : Math.sin(((u - 0.55) / 0.45) * Math.PI) * 0.16;
      b.pedals[1].position.set(-0.11, (u < 0.55 ? 0.02 : 0.08) + lift, -0.05 - back * 0.55);
      b.root.userData.kick = u;
    }
    for (const p of b.pedals) p.rotation.x = -crankA;
    b.bars.rotation.y = steer;
  }
  /** Seat a rider on bike `b` (seat index 0 = captain). Feet on the pedals, hands on the grips. */
  private addRider(b: BikeRig, look: PersonLook, seatI: number, t: number, lean: number, extra: Partial<PoseIn> = {}) {
    void lean;
    const wb = b.kind === 'tandem' ? 1.75 : 0;
    const seat = seatI === 0 ? b.seat : new THREE.Vector3(0, 0.93, wb / 2 - 0.71);
    const crank = b.cranks[seatI] ?? b.cranks[0];
    const feet: [THREE.Vector3, THREE.Vector3] = [0, 1].map((k) => {
      const ped = new THREE.Vector3(); (b.pedals[seatI * 2 + k] ?? b.pedals[k]).getWorldPosition(ped);
      return ped;
    }) as [THREE.Vector3, THREE.Vector3];
    void crank;
    const inv = new THREE.Matrix4().copy(b.root.matrixWorld).multiply(new THREE.Matrix4().makeTranslation(seat.x, seat.y + 0.05, seat.z - 0.02));
    const invM = inv.clone().invert();
    const fl = feet.map((f) => f.applyMatrix4(invM).add(new THREE.Vector3(0, 0.05, 0))) as [THREE.Vector3, THREE.Vector3];
    const grip = seatI === 0 ? b.grip.clone() : new THREE.Vector3(0, 0.92, seat.z + 0.3);
    const hands = grip.sub(seat).add(new THREE.Vector3(0, -0.05, 0));
    const torsoLean = Math.max(0.25, Math.min(1.1, Math.atan2(hands.z, Math.max(0.1, hands.y + 0.25)) * 0.9));
    return this.crowd.add(inv, look, { kind: 'ride', t, phase: 0, feet: fl, hands, torsoLean, ...extra });
  }
  setVisible(v: boolean) { this.group.visible = v; }
  /** Rough draw-call count (crowd + bikes/segways/horses currently alive). */
  drawCalls(): number {
    let n = this.crowd.drawCalls;
    this.group.traverse((o) => { if ((o as THREE.Mesh).isMesh && !(o as THREE.InstancedMesh).isInstancedMesh && o.visible) n++; if ((o as THREE.LineSegments).isLineSegments) n++; });
    return n;
  }
}
