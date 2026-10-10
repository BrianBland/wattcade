// Procedural people, bikes, Segways and horses: cel-shaded with warm-brown ink. Render-only.
// Crowd (pedestrians + cops + rider) = one InstancedMesh per body part (+ one ink hull each), posed from a single
// template rig, so the whole crowd is ~2 × parts draw calls. Bikes/Segways/horses are small merged groups.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { Snapshot } from '../sim/sim';
import { heightAt } from '../sim/world';
import { JSR, toon } from './jsr';
import { bakeInPlace } from './bake';

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
export const BIKE_TINT: Record<string, number> = { city: 0x6f8a7a, fixie: 0xa8573d, bmx: 0x4f6d8a, cargo: 0x7d6a4a, tandem: 0x5f7480, ebike: 0x4a6b55 };
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
export function buildBike(kind: string, color = BIKE_TINT[kind] ?? 0x6f8a7a, parked = false): BikeRig {
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
type PartKey = 'torso' | 'pelvis' | 'head' | 'nose' | 'uArmL' | 'uArmR' | 'lArmL' | 'lArmR' | 'thighL' | 'thighR' | 'shinL' | 'shinR' | 'footL' | 'footR' | 'hairCap' | 'hairBun' | 'helmet' | 'copCap';
const L = { thigh: 0.42, shin: 0.42, uArm: 0.28, lArm: 0.28, torso: 0.42 };
interface Rig { root: THREE.Object3D; torso: THREE.Object3D; neck: THREE.Object3D; sh: [THREE.Object3D, THREE.Object3D]; el: [THREE.Object3D, THREE.Object3D]; hip: [THREE.Object3D, THREE.Object3D]; kn: [THREE.Object3D, THREE.Object3D]; ank: [THREE.Object3D, THREE.Object3D]; marks: Record<PartKey, THREE.Object3D> }
function makeRig(): Rig {
  const O = () => new THREE.Object3D();
  const root = O(), torso = O(), neck = O(); root.add(torso); torso.add(neck); neck.position.y = L.torso + 0.06;
  const marks = {} as Record<PartKey, THREE.Object3D>;
  const mark = (k: PartKey, parent: THREE.Object3D, x: number, y: number, z: number) => { const m = O(); m.position.set(x, y, z); parent.add(m); marks[k] = m; };
  mark('pelvis', root, 0, 0.02, 0); mark('torso', torso, 0, L.torso / 2 + 0.04, 0); mark('head', neck, 0, 0.16, 0); mark('nose', neck, 0, 0.15, 0.14);
  mark('hairCap', neck, 0, 0.2, -0.01); mark('hairBun', neck, 0, 0.22, -0.13); mark('helmet', neck, 0, 0.22, 0); mark('copCap', neck, 0, 0.27, 0.02);
  const sh: Rig['sh'] = [O(), O()], el: Rig['el'] = [O(), O()], hip: Rig['hip'] = [O(), O()], kn: Rig['kn'] = [O(), O()], ank: Rig['ank'] = [O(), O()];
  const side: Array<['L' | 'R', number]> = [['L', 1], ['R', -1]];
  side.forEach(([n, s], i) => {
    sh[i].position.set(s * 0.21, L.torso - 0.02, 0); torso.add(sh[i]);
    mark(`uArm${n}` as PartKey, sh[i], 0, -L.uArm / 2, 0);
    el[i].position.y = -L.uArm; sh[i].add(el[i]); mark(`lArm${n}` as PartKey, el[i], 0, -L.lArm / 2, 0);
    hip[i].position.set(s * 0.1, -0.02, 0); root.add(hip[i]); mark(`thigh${n}` as PartKey, hip[i], 0, -L.thigh / 2, 0);
    kn[i].position.y = -L.thigh; hip[i].add(kn[i]); mark(`shin${n}` as PartKey, kn[i], 0, -L.shin / 2, 0);
    ank[i].position.y = -L.shin; kn[i].add(ank[i]); mark(`foot${n}` as PartKey, ank[i], 0, -0.03, 0.06);
  });
  return { root, torso, neck, sh, el, hip, kn, ank, marks };
}
const cap = (r: number, len: number) => new THREE.CapsuleGeometry(r, len, 3, 8);
const PART_GEO: Record<PartKey, () => THREE.BufferGeometry> = {
  torso: () => { const g = cap(0.17, 0.2); g.scale(1.15, 1, 0.8); return g; },
  pelvis: () => { const g = new THREE.SphereGeometry(0.16, 10, 6); g.scale(1.1, 0.7, 0.85); return g; },
  head: () => new THREE.SphereGeometry(0.15, 12, 8),
  nose: () => new THREE.SphereGeometry(0.03, 5, 4),
  uArmL: () => cap(0.06, L.uArm - 0.1), uArmR: () => cap(0.06, L.uArm - 0.1),
  lArmL: () => cap(0.052, L.lArm - 0.08), lArmR: () => cap(0.052, L.lArm - 0.08),
  thighL: () => cap(0.08, L.thigh - 0.14), thighR: () => cap(0.08, L.thigh - 0.14),
  shinL: () => cap(0.066, L.shin - 0.1), shinR: () => cap(0.066, L.shin - 0.1),
  footL: () => { const g = new THREE.CapsuleGeometry(0.055, 0.12, 2, 6); g.rotateX(Math.PI / 2); return g; }, footR: () => { const g = new THREE.CapsuleGeometry(0.055, 0.12, 2, 6); g.rotateX(Math.PI / 2); return g; },
  hairCap: () => new THREE.SphereGeometry(0.16, 12, 6, 0, Math.PI * 2, 0, Math.PI * 0.55),
  hairBun: () => new THREE.SphereGeometry(0.07, 8, 6),
  helmet: () => { const g = new THREE.SphereGeometry(0.175, 12, 6, 0, Math.PI * 2, 0, Math.PI * 0.5); g.scale(1, 0.85, 1.12); return g; },
  copCap: () => { const top = new THREE.CylinderGeometry(0.17, 0.15, 0.09, 12); const brim = new THREE.CylinderGeometry(0.1, 0.1, 0.015, 10); brim.scale(1, 1, 1.2); brim.translate(0, -0.04, 0.12); return merge([top, brim]); },
};
const PARTS = Object.keys(PART_GEO) as PartKey[];

export type PoseKind = 'ride' | 'walk' | 'stand' | 'flail' | 'ragdoll' | 'horse';
export interface PersonLook { skin: number; shirt: number; pants: number; shoes: number; hair: number; style: 'cap' | 'bun' | 'bald' | 'helmet' | 'copCap'; hat: number }
export function lookFor(id: number, cop?: 'segway' | 'horse'): PersonLook {
  const h = (k: number) => Math.abs(Math.sin(id * 12.9898 + k * 78.233) * 43758.5453) % 1;
  if (cop) return { skin: SKIN[Math.floor(h(1) * SKIN.length)], shirt: COP.shirt, pants: COP.pants, shoes: 0x1a1612, hair: HAIR[0], style: cop === 'horse' ? 'helmet' : 'copCap', hat: cop === 'horse' ? COP.helmet : COP.cap };
  const styles: PersonLook['style'][] = ['cap', 'bun', 'bald', 'cap', 'helmet'];
  return { skin: SKIN[Math.floor(h(1) * SKIN.length)], shirt: SHIRT[Math.floor(h(2) * SHIRT.length)], pants: PANTS[Math.floor(h(3) * PANTS.length)], shoes: h(4) < 0.5 ? 0x3a2a20 : 0xd8cbb0,
    hair: HAIR[Math.floor(h(5) * HAIR.length)], style: styles[Math.floor(h(6) * styles.length)], hat: [0x8a9a7b, 0xa8573d, 0xd8cbb0, 0x5f7480][Math.floor(h(7) * 4)] };
}
const colorOf = (k: PartKey, lk: PersonLook): number => {
  if (k === 'head' || k === 'nose' || k === 'lArmL' || k === 'lArmR') return lk.skin;
  if (k === 'torso' || k === 'uArmL' || k === 'uArmR') return lk.shirt;
  if (k === 'pelvis' || k.startsWith('thigh') || k.startsWith('shin')) return lk.pants;
  if (k.startsWith('foot')) return lk.shoes;
  if (k === 'hairCap' || k === 'hairBun') return lk.hair;
  return lk.hat;
};
const showPart = (k: PartKey, lk: PersonLook) => k === 'hairCap' ? lk.style === 'cap' || lk.style === 'bun' : k === 'hairBun' ? lk.style === 'bun' : k === 'helmet' ? lk.style === 'helmet' : k === 'copCap' ? lk.style === 'copCap' : true;

/** 2-bone IK in the sagittal (y,z) plane: returns [upper, lower] x-rotations (0 = hanging down; + swings toward -z). */
export function ik2(dy: number, dz: number, l1: number, l2: number, bendFwd = true): [number, number] {
  const d = Math.min(l1 + l2 - 1e-3, Math.max(1e-3, Math.hypot(dy, dz)));
  const dir = Math.atan2(-dz, -dy);
  const a = Math.acos(Math.min(1, Math.max(-1, (l1 * l1 + d * d - l2 * l2) / (2 * l1 * d))));
  const b = Math.acos(Math.min(1, Math.max(-1, (l1 * l1 + l2 * l2 - d * d) / (2 * l1 * l2))));
  return bendFwd ? [dir - a, Math.PI - b] : [dir + a, -(Math.PI - b)];
}

export interface PoseIn { kind: PoseKind; t: number; phase: number; lean?: number; spin?: number;
  /** ride: targets in rig-root (hip) space */ feet?: [THREE.Vector3, THREE.Vector3]; hands?: THREE.Vector3; torsoLean?: number }
function pose(r: Rig, p: PoseIn) {
  for (const o of [r.torso, r.neck, ...r.sh, ...r.el, ...r.hip, ...r.kn, ...r.ank]) o.rotation.set(0, 0, 0);
  r.root.rotation.set(0, 0, 0);
  const s = Math.sin(p.phase), c = Math.cos(p.phase);
  if (p.kind === 'ride' || p.kind === 'horse') {
    const lean = p.torsoLean ?? 0.45; r.torso.rotation.x = lean; r.neck.rotation.x = -lean * 0.8;
    if (p.kind === 'horse') { for (let i = 0; i < 2; i++) { r.hip[i].rotation.set(-1.2, 0, (i ? -1 : 1) * 0.35); r.kn[i].rotation.x = 1.3; } }
    else if (p.feet) for (let i = 0; i < 2; i++) { const f = p.feet[i], hp = r.hip[i].position; const [a, b] = ik2(f.y - hp.y, f.z - hp.z, L.thigh, L.shin, true); r.hip[i].rotation.x = a; r.kn[i].rotation.x = b; r.ank[i].rotation.x = -a - b; }
    const hz = p.hands ?? new THREE.Vector3(0, 0.3, 0.55);
    for (let i = 0; i < 2; i++) {
      const sy = (L.torso - 0.02) * Math.cos(lean), sz = (L.torso - 0.02) * Math.sin(lean);
      const [a, b] = ik2(hz.y - sy, hz.z - sz, L.uArm, L.lArm, false);
      r.sh[i].rotation.x = a - lean; r.el[i].rotation.x = b; r.sh[i].rotation.z = (i ? -1 : 1) * 0.12;
    }
  } else if (p.kind === 'walk') {
    for (let i = 0; i < 2; i++) { const k = i ? -1 : 1; r.hip[i].rotation.x = -k * s * 0.55; r.kn[i].rotation.x = Math.max(0, k * c) * 0.7; r.sh[i].rotation.x = k * s * 0.5; r.el[i].rotation.x = -0.35; r.sh[i].rotation.z = (i ? -1 : 1) * 0.08; }
    r.torso.rotation.x = 0.06; r.root.position.y = Math.abs(c) * 0.035;
  } else if (p.kind === 'flail') {
    const q = p.t * 18;
    for (let i = 0; i < 2; i++) { const k = i ? -1 : 1; r.sh[i].rotation.set(-2.6 + Math.sin(q + i * 2) * 0.6, 0, k * (0.5 + Math.sin(q * 1.3 + i) * 0.4)); r.el[i].rotation.x = -0.6 + Math.sin(q * 1.7) * 0.4;
      r.hip[i].rotation.x = -k * Math.sin(q * 0.8) * 0.9; r.kn[i].rotation.x = Math.max(0, k * Math.cos(q * 0.8)) * 1.2; }
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
  if (p.lean) r.root.rotation.z += p.lean;
}

export class Crowd {
  readonly group = new THREE.Group();
  private rig = makeRig(); private holder = new THREE.Object3D();
  private inst = new Map<PartKey, { body: THREE.InstancedMesh; ink: THREE.InstancedMesh }>();
  private n = 0; private zero = new THREE.Matrix4().makeScale(0, 0, 0); private col = new THREE.Color();
  constructor(readonly cap = 64) {
    this.holder.add(this.rig.root);
    for (const k of PARTS) {
      const g = PART_GEO[k]();
      const body = new THREE.InstancedMesh(g, toon(0xffffff), cap), ink = new THREE.InstancedMesh(g, inkMat(k === 'nose' ? 0.008 : 0.016), cap);
      body.instanceMatrix.setUsage(THREE.DynamicDrawUsage); ink.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      body.frustumCulled = ink.frustumCulled = false;
      for (let i = 0; i < cap; i++) body.setColorAt(i, this.col.set(0xffffff));
      this.inst.set(k, { body, ink }); this.group.add(body, ink);
    }
  }
  begin() { this.n = 0; }
  /** Add one posed person whose hips sit at `world` (an Object3D-like matrix source). */
  add(world: THREE.Matrix4, look: PersonLook, p: PoseIn) {
    if (this.n >= this.cap) return;
    const i = this.n++;
    pose(this.rig, p);
    this.holder.matrixAutoUpdate = false; this.holder.matrix.copy(world); this.holder.matrixWorldNeedsUpdate = true; this.holder.updateMatrixWorld(true);
    for (const k of PARTS) {
      const { body, ink } = this.inst.get(k)!;
      const m = showPart(k, look) ? this.rig.marks[k].matrixWorld : this.zero;
      body.setMatrixAt(i, m); ink.setMatrixAt(i, m); body.setColorAt(i, this.col.set(colorOf(k, look)));
    }
  }
  end() {
    for (const { body, ink } of this.inst.values()) {
      for (let i = this.n; i < this.cap; i++) { body.setMatrixAt(i, this.zero); ink.setMatrixAt(i, this.zero); }
      body.count = ink.count = Math.max(1, this.n);
      body.instanceMatrix.needsUpdate = ink.instanceMatrix.needsUpdate = true; if (body.instanceColor) body.instanceColor.needsUpdate = true;
    }
  }
  /** Draw calls this crowd costs regardless of headcount. */
  get drawCalls() { return this.inst.size * 2; }
}

// ---------- the scene-level character layer ----------
const M = new THREE.Matrix4(), Q = new THREE.Quaternion(), E = new THREE.Euler(0, 0, 0, 'YXZ'), P = new THREE.Vector3(), ONE = new THREE.Vector3(1, 1, 1);
const worldAt = (x: number, y: number, z: number, heading: number, pitch = 0, roll = 0) => M.compose(P.set(x, y, z), Q.setFromEuler(E.set(pitch, heading, roll, 'YXZ')), ONE).clone();

export class Characters {
  readonly group = new THREE.Group();
  readonly crowd = new Crowd(160);
  private riderBikes = new Map<string, BikeRig>();
  /** squash & stretch y-scale for the player's bike + rider (set by Fx) */
  squash = 1;
  private parked = new Map<number, BikeRig>(); private cyc = new Map<number, BikeRig & { wa: number; ca: number }>();
  private segways = new Map<number, SegwayRig>(); private horses = new Map<number, HorseRig>();
  private prev = new Map<string, { x: number; z: number; h: number; dist: number; lean: number; steer: number }>();
  private crank = 0; private wheelA = 0; private riderLook: PersonLook;
  constructor(riderShirt: number) {
    this.group.add(this.crowd.group);
    this.riderLook = { ...lookFor(7), shirt: riderShirt, style: 'helmet', hat: 0xd8cbb0 };
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
      this.addRider(b, this.riderLook, 0, t, m.lean);
      if (b.kind === 'tandem') this.addRider(b, lookFor(99), 1, t, m.lean);
    }
    for (const [k, b] of this.riderBikes) if (!used.has(k)) b.root.visible = false;
    if (s.mode === 'foot') {
      const { m } = this.motion('riderFoot', R.x, R.z, R.heading, dt);
      this.crowd.add(worldAt(R.x, R.y + L.thigh + L.shin + 0.05, R.z, R.heading), this.riderLook, { kind: 'walk', t, phase: m.dist * 2.4 });
    }
    if (s.ragdoll) this.crowd.add(worldAt(s.ragdoll.x, s.ragdoll.y + 0.5, s.ragdoll.z, R.heading), this.riderLook, { kind: 'ragdoll', t, phase: 0, spin: s.ragdoll.spin });
    // --- pedestrians ---
    const seenC = new Set<number>();
    for (const n of s.npcs) {
      const { m, v } = this.motion(`n${n.id}`, n.x, n.z, n.heading, dt);
      if (n.bike && n.airS <= 0) { // NPC cyclist: own bike rig, pedalling, seated rider (hidden when far away)
        const far = Math.hypot(n.x - R.x, n.z - R.z) > 110;
        let b = this.cyc.get(n.id);
        if (!b || b.kind !== n.bike) { if (b) this.group.remove(b.root); b = Object.assign(buildBike(n.bike), { wa: 0, ca: 0 }); this.cyc.set(n.id, b); this.group.add(b.root); }
        seenC.add(n.id); b.root.visible = !far; if (far) continue;
        b.wa += (v / b.wheelR[0]) * dt; b.ca += (v / b.wheelR[0] / 2.6) * dt;
        b.root.position.set(n.x, n.y, n.z); b.root.rotation.set(0, n.heading, m.lean);
        this.spin(b, b.wa, b.ca, m.steer); b.root.updateMatrixWorld(true);
        this.addRider(b, lookFor(n.id), 0, t, m.lean);
        continue;
      }
      if (n.angryS > 0 && n.airS <= 0 && n.stunS <= 0) { // jacked victim: run after you, shaking a fist
        const lk2 = lookFor(n.id), hip = L.thigh + L.shin + 0.05;
        this.crowd.add(worldAt(n.x, n.y + hip, n.z, n.heading), lk2, v > 0.5 ? { kind: 'walk', t, phase: m.dist * 2.2 + n.id } : { kind: 'flail', t: t * 1.6 + n.id, phase: 0 });
        continue;
      }
      const lk = lookFor(n.id);
      const hipY = L.thigh + L.shin + 0.05;
      if (n.airS > 0) this.crowd.add(worldAt(n.x, n.y + 0.6, n.z, n.heading), lk, { kind: 'ragdoll', t: t + n.id, phase: 0, spin: n.airS * 7 });
      else if (n.stunS > 0) this.crowd.add(worldAt(n.x, n.y + 0.2, n.z, n.heading, -Math.PI / 2), lk, { kind: 'ragdoll', t: 0.3 + n.id, phase: 0, spin: 0 });
      else if (n.flailS > 0) this.crowd.add(worldAt(n.x, n.y + hipY, n.z, n.heading), lk, { kind: 'flail', t: t + n.id * 0.3, phase: 0 });
      else this.crowd.add(worldAt(n.x, n.y + hipY, n.z, n.heading), lk, { kind: 'walk', t, phase: m.dist * 2.6 + n.id });
    }
    for (const [id, b] of this.cyc) if (!seenC.has(id)) { this.group.remove(b.root); this.cyc.delete(id); }
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
        else this.crowd.add(worldAt(c.x, c.y + hipY, c.z, c.heading, Math.min(0.25, v * 0.02)), lk, { kind: c.flailS > 0 ? 'flail' : 'stand', t, phase: 0 });
      } else {
        let h = this.horses.get(c.id); if (!h) { h = buildHorse(c.id % 2 ? 0x6b4a33 : 0x8a6a4a); this.horses.set(c.id, h); this.group.add(h.root); } hc.add(c.id);
        h.root.position.set(c.x, c.y, c.z); h.root.rotation.set(flying ? spinR : 0, c.heading, flying ? c.airS * 3 : 0);
        poseHorse(h, m.dist / 2.6, v, t);
        h.root.updateMatrixWorld(true);
        if (flying) this.crowd.add(worldAt(c.x, c.y + 2.2, c.z, c.heading), lk, { kind: 'ragdoll', t, phase: 0, spin: spinR * 1.2 });
        else { const w = h.root.matrixWorld.clone().multiply(new THREE.Matrix4().makeTranslation(0, 1.82 + Math.abs(Math.sin(m.dist * 1.2)) * 0.05, -0.05)); this.crowd.add(w, lk, { kind: c.flailS > 0 ? 'flail' : 'horse', t, phase: 0, torsoLean: 0.1, hands: new THREE.Vector3(0, 0.15, 0.4) }); }
      }
    }
    for (const [id, g] of this.segways) if (!sc.has(id)) { this.group.remove(g.root); this.segways.delete(id); }
    for (const [id, h] of this.horses) if (!hc.has(id)) { this.group.remove(h.root); this.horses.delete(id); }
    this.crowd.end();
  }
  private spin(b: BikeRig, wheelA: number, crankA: number, steer: number) {
    for (const w of b.wheels) w.rotation.x = wheelA * (b.wheelR[0] / b.wheelR[b.wheels.indexOf(w)]);
    for (const c of b.cranks) c.rotation.x = crankA;
    for (const p of b.pedals) p.rotation.x = -crankA;
    b.bars.rotation.y = steer;
  }
  /** Seat a rider on bike `b` (seat index 0 = captain). Feet on the pedals, hands on the grips. */
  private addRider(b: BikeRig, look: PersonLook, seatI: number, t: number, lean: number) {
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
    this.crowd.add(inv, look, { kind: 'ride', t, phase: 0, feet: fl, hands, torsoLean });
  }
  setVisible(v: boolean) { this.group.visible = v; }
  /** Rough draw-call count (crowd + bikes/segways/horses currently alive). */
  drawCalls(): number {
    let n = this.crowd.drawCalls;
    this.group.traverse((o) => { if ((o as THREE.Mesh).isMesh && !(o as THREE.InstancedMesh).isInstancedMesh && o.visible) n++; if ((o as THREE.LineSegments).isLineSegments) n++; });
    return n;
  }
}
