/**
 * Strict-TS Three.js diorama builder for Penrose Pedals.
 * Builds a complete, leak-free Three.js scene from a `PenroseSnapshot`, with:
 * - Seamless open-cap optical perspective joins + golden seam glints
 * - Smart road-over-road `wheelOnTop` occlusion (passes under overpasses, never clips at joins)
 * - Exact wall-frame alignment for The Cube's awning, sail bridge, wall lift & rails, and tip blocks
 * - Zero z-fighting via polygonOffset on flush support masonry & clean turntable/disc drums
 * - Procedural Monument Valley stepped stone piers & terrace grounding into atmospheric haze
 * - Per-yaw camera framing (`boundsAtYaw`) so camera-crank rotations never crop roads or caps
 */

import * as THREE from 'three';
import { clamp, DEG, lerp, mulberry, type Mat4, type Vec3 } from '../sim/math';
import type { SimRoad } from '../sim/road';
import type {
  FaceKey,
  MachineSnapshot,
  PenroseSnapshot,
  SimEvent,
  VisualProp,
} from '../sim/types';
import {
  archGeo,
  type BloomRig,
  createBloom,
  type GoalRig,
  makeGoal,
  makeRibbon,
  makeWheel,
  type WheelRig,
} from './blooms';
import {
  FACE_COLORS,
  type HazeUniforms,
  LevelDisposer,
  lum,
  mixHex,
  mixPal,
  resolvePalette,
  setTri,
  type SharedTextures,
  skyAt,
  sp,
  type ThemeDef,
  THEMES,
  tone,
  updateHazeForScene,
} from './themes';

const TAU = Math.PI * 2;
const V3 = (x: number, y: number, z: number): THREE.Vector3 => new THREE.Vector3(x, z, y);
const W3 = (p: Vec3): THREE.Vector3 => new THREE.Vector3(p[0], p[1], p[2]);
const Y_AXIS = new THREE.Vector3(0, 1, 0);

function applyMat4(obj: THREE.Object3D, m: Mat4): void {
  const tm = new THREE.Matrix4();
  tm.fromArray(m);
  obj.matrixAutoUpdate = false;
  obj.matrix.copy(tm);
  obj.matrixWorldNeedsUpdate = true;
}

/** Build a right-handed transform matrix placing a unit box along basis (bx, by, bz) scaled by (sx, sy, sz) at pos. */
function makeOrientedBoxMatrix(
  bx: THREE.Vector3,
  by: THREE.Vector3,
  bz: THREE.Vector3,
  sx: number,
  sy: number,
  sz: number,
  pos: THREE.Vector3,
): THREE.Matrix4 {
  const x = new THREE.Vector3().crossVectors(by, bz).dot(bx) < 0 ? bx.clone().negate() : bx.clone();
  return new THREE.Matrix4()
    .makeBasis(x, by, bz)
    .multiply(new THREE.Matrix4().makeScale(sx, sy, sz))
    .setPosition(pos);
}

function addBox(
  parent: THREE.Object3D,
  x0: number, y0: number, z0: number,
  x1: number, y1: number, z1: number,
  mat: THREE.Material,
  D: LevelDisposer,
  roadLike = false,
): THREE.Mesh {
  const m = new THREE.Mesh(D.unitBox, mat);
  m.scale.set(Math.max(0.01, x1 - x0), Math.max(0.01, z1 - z0), Math.max(0.01, y1 - y0));
  m.position.set((x0 + x1) / 2, (z0 + z1) / 2, (y0 + y1) / 2);
  if (roadLike) m.userData.isRoad = true;
  parent.add(m);
  return m;
}

function addCyl(
  parent: THREE.Object3D,
  x: number, y: number, r: number, z0: number, z1: number,
  mat: THREE.Material,
  D: LevelDisposer,
  seg = 24,
  rTop?: number,
): THREE.Mesh {
  const m = new THREE.Mesh(D.geo(new THREE.CylinderGeometry(rTop ?? r, r, Math.max(0.01, z1 - z0), seg)), mat);
  m.position.set(x, (z0 + z1) / 2, y);
  parent.add(m);
  return m;
}

function bounceEase(t: number): number {
  const n = 7.5625, d = 2.75;
  if (t < 1 / d) return n * t * t;
  if (t < 2 / d) { const u = t - 1.5 / d; return n * u * u + 0.75; }
  if (t < 2.5 / d) { const u = t - 2.25 / d; return n * u * u + 0.9375; }
  const u = t - 2.625 / d;
  return n * u * u + 0.984375;
}

/* ---------- Portal Shader ---------- */

const PORTAL_VS = `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`;

const PORTAL_FS = `
uniform float uT;
uniform vec3 uC;
uniform float uOpen;
uniform sampler2D uMap;
uniform vec2 uRes;
uniform vec3 uSkyA;
uniform vec3 uSkyB;
varying vec2 vUv;
void main() {
  vec2 p = vUv - 0.5;
  p.x *= 1.12 / 1.46;
  float r = length(p);
  float a = atan(p.y, p.x);
  float sw = smoothstep(-0.3, 0.3, sin(a * 2.0 - r * 9.0 + uT * 1.6));
  vec3 c = mix(uC * 0.78, mix(uC, vec3(1.0), 0.5), sw * 0.55 + smoothstep(0.45, 0.0, r) * 0.45);
  vec2 sc = gl_FragCoord.xy / max(uRes, vec2(1.0));
  vec4 tx = texture2D(uMap, sc);
  vec3 sky = mix(uSkyB, uSkyA, sc.y);
  vec3 v = mix(sky, tx.rgb, tx.a);
  vec3 col = mix(c, v, uOpen);
  vec2 e = abs(vUv - 0.5) * 2.0;
  float rim = step(0.94, max(e.x, e.y * 1.01));
  gl_FragColor = vec4(mix(col, mix(uC, vec3(1.0), 0.35), rim * (1.0 - uOpen * 0.6)), 1.0);
}`;

/* ---------- Public BuiltScene Contract ---------- */

export interface CapAnchor {
  id: string;
  key: FaceKey;
  name: string;
  on: boolean;
  live: boolean;
  ready: boolean;
  worldPos: THREE.Vector3;
}

export interface BuiltScene {
  scene: THREE.Scene;
  theme: ThemeDef;
  center: THREE.Vector3;
  bounds: [number, number, number, number];
  pad: number;
  hasOverlay: boolean;
  caps: CapAnchor[];
  /** Smoothly interpolated framing bounds for any camera yaw (prevents cropping on camera-crank levels). */
  boundsAtYaw: (yawRad: number) => [number, number, number, number];
  sync: (
    snap: PenroseSnapshot,
    dt: number,
    elapsed: number,
    camera: THREE.OrthographicCamera,
    renderer: THREE.WebGLRenderer,
  ) => void;
  triggerSpark: (pos: Vec3, color?: string) => void;
  dispose: () => void;
}

/* ---------- Dynamic Updater Helpers ---------- */

type MachineUpdater = (m: MachineSnapshot, snap: PenroseSnapshot, dt: number, t: number) => void;
type PortalUpdater = (
  snap: PenroseSnapshot,
  dt: number,
  t: number,
  camera: THREE.OrthographicCamera,
  renderer: THREE.WebGLRenderer,
) => void;

const SR = new THREE.Vector3(1, 0, -1).normalize();
const SU = new THREE.Vector3(-1, 2, -1).normalize();
const SD = new THREE.Vector3(1, 1, 1).normalize();

interface YawFrame {
  yawRad: number;
  bounds: [number, number, number, number];
}

function computeYawFrames(
  yawsDeg: readonly number[],
  pts: readonly Vec3[],
  roads: readonly SimRoad[],
  caps: readonly Vec3[],
  centerSketch: Vec3,
): YawFrame[] {
  const c = V3(centerSketch[0], centerSketch[1], centerSketch[2]);
  const stops = yawsDeg.length ? [...yawsDeg].sort((a, b) => a - b) : [0];
  return stops.map((yd) => {
    const yawRad = yd * DEG;
    const R = SR.clone().applyAxisAngle(Y_AXIS, yawRad);
    const U = SU.clone().applyAxisAngle(Y_AXIS, yawRad);
    let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
    const addWorld = (p: THREE.Vector3, margin = 0) => {
      const dx = p.x - c.x, dy = p.y - c.y, dz = p.z - c.z;
      const sx = dx * R.x + dy * R.y + dz * R.z;
      const sy = dx * U.x + dy * U.y + dz * U.z;
      if (sx - margin < x0) x0 = sx - margin;
      if (sx + margin > x1) x1 = sx + margin;
      if (sy - margin < y0) y0 = sy - margin;
      if (sy + margin > y1) y1 = sy + margin;
    };
    if (yd === 0) {
      for (const pt of pts) addWorld(V3(pt[0], pt[1], pt[2]), 0);
    }
    const tmp = new THREE.Vector3();
    for (const r of roads) {
      const src = r.wp.length ? r.wp : r.localS.map((q) => q.p);
      for (const p of src) {
        tmp.set(p[0], p[1], p[2]);
        addWorld(tmp, 0.78);
      }
    }
    for (const cp of caps) {
      tmp.set(cp[0], cp[1], cp[2]);
      addWorld(tmp, 0.65);
    }
    if (!Number.isFinite(x0)) return { yawRad, bounds: [-6, 6, -5, 5] };
    return { yawRad, bounds: [x0, x1, y0, y1] };
  });
}

/* ---------- Open-Cap Road Rig & Perspective Seam Management ---------- */

type CapKey = '00' | '10' | '01' | '11';

interface RoadRig {
  road: SimRoad;
  parent: THREE.Object3D;
  mat: THREE.Material;
  w: number;
  th: number;
  cull: boolean;
  variants: Map<CapKey, THREE.Mesh>;
  activeKey: CapKey;
  activeMesh: THREE.Mesh;
  worldBox: THREE.Box3;
  hasDynamicTransform: boolean;
}

export function buildLevelScene(
  snap: PenroseSnapshot,
  haze: HazeUniforms,
  tex: SharedTextures,
  riderColor: string | undefined,
  reduceMotion: boolean,
): BuiltScene {
  const th = THEMES[snap.theme] ?? THEMES.dusk;
  const D = new LevelDisposer(haze);
  const scene = new THREE.Scene();
  const root = new THREE.Group();
  scene.add(root);

  const def = snap.levelDef;
  const built = snap.builtLevel;
  const frameCenter = built.frameOverride?.center ?? def.center;
  const framePts = built.frameOverride?.pts ?? def.pts;
  const pad = built.frameOverride?.pad ?? def.pad ?? 0.9;
  const center = V3(frameCenter[0], frameCenter[1], frameCenter[2]);

  // Dynamic transform groups keyed by groupId (e.g. `g_tt1`, `cube_body`, `cube_upper`)
  const groups = new Map<string, THREE.Group>();
  const getGroup = (groupId?: string): THREE.Object3D => {
    if (!groupId) return root;
    let g = groups.get(groupId);
    if (!g) {
      g = new THREE.Group();
      root.add(g);
      groups.set(groupId, g);
    }
    return g;
  };

  // 1. Build Roads with Open-Cap Variant Support & Double-Sided Lane Dashes
  const deckPal = th.path ?? th.deck ?? sp(th, 1);
  // Double-sided lane material ensures vertical walls, inverted ceilings & Möbius roads always show crisp dashes
  const laneMat = D.tri(tone(th.lane), { side: true });
  const roadMatDefault = D.tri(deckPal, { side: true });
  const goalRoadMat = D.tri(mixPal(deckPal, tone(th.goal), 0.14), { side: true });
  const waterRoadMat = D.tri(tone('#A8DCFA', 0.88, 0.72), { opacity: 0.55, side: true });
  const dynamicRoadMats = new Map<string, THREE.ShaderMaterial>();

  const roadRigs: RoadRig[] = [];
  const roadRigById = new Map<string, RoadRig>();

  const getOrBuildRoadVariant = (rig: RoadRig, key: CapKey): THREE.Mesh => {
    const existing = rig.variants.get(key);
    if (existing) return existing;
    const open: [boolean, boolean] = [key[0] === '1', key[1] === '1'];
    const mesh = makeRibbon(rig.road, rig.w, rig.th, rig.mat, D, { cull: rig.cull, open });
    mesh.userData.isRoad = true;
    mesh.visible = false;
    rig.parent.add(mesh);
    rig.variants.set(key, mesh);
    return mesh;
  };

  let minRoadY = Infinity;
  for (const r of built.roads) {
    for (const s of r.localS) {
      if (s.p[1] < minRoadY) minRoadY = s.p[1];
    }
    const parent = getGroup(r.groupId);
    let mat: THREE.Material = r.goal ? goalRoadMat : r.isReflection ? waterRoadMat : roadMatDefault;
    if (r.groupId && r.groupId.startsWith('g_')) {
      const mId = r.groupId.slice(2);
      let dm = dynamicRoadMats.get(mId);
      if (!dm) {
        dm = D.tri(th.idle, { fresh: true, side: true });
        dynamicRoadMats.set(mId, dm);
      }
      mat = dm;
    }

    const rw = r.w ?? 0.96;
    const rth = r.th ?? 0.24;
    const cull = !r.isReflection;
    const slab = makeRibbon(r, rw, rth, mat, D, { cull });
    slab.userData.isRoad = true;
    parent.add(slab);

    const variants = new Map<CapKey, THREE.Mesh>([['00', slab]]);
    const worldBox = new THREE.Box3();
    for (const p of r.wp.length ? r.wp : r.localS.map((s) => s.p)) {
      worldBox.expandByPoint(new THREE.Vector3(p[0], p[1], p[2]));
    }
    const rig: RoadRig = {
      road: r,
      parent,
      mat,
      w: rw,
      th: rth,
      cull,
      variants,
      activeKey: '00',
      activeMesh: slab,
      worldBox,
      hasDynamicTransform: !!r.transform,
    };
    roadRigs.push(rig);
    roadRigById.set(r.id, rig);

    if (!r.isReflection && !r.noLane) {
      const dash = makeRibbon(r, 0.048, 0, laneMat, D, { lift: 0.015, dash: [0.38, 0.18] });
      dash.userData.isRoad = true;
      parent.add(dash);
    }
  }

  // 2. Machine Visual Updaters & Blooms
  const machineUpdaters = new Map<string, MachineUpdater[]>();
  const addMachUpd = (id: string, fn: MachineUpdater) => {
    const arr = machineUpdaters.get(id) ?? [];
    arr.push(fn);
    machineUpdaters.set(id, arr);
  };
  const portalUpdaters: PortalUpdater[] = [];
  const generalUpdaters: Array<(t: number, dt: number, snap: PenroseSnapshot) => void> = [];

  // Cube body visual group (synced from cubeRotY & cubeSink)
  let cubeGroup: THREE.Group | null = null;

  // Build declarative VisualProps
  const rng = mulberry(1337 + def.id.length * 97);
  for (const prop of built.visuals) {
    buildVisualProp(prop, {
      root, getGroup, th, D, tex, rng,
      addMachUpd, portalUpdaters, generalUpdaters,
      onCubeGroup: (cg) => { cubeGroup = cg; },
    });
  }

  // Build architectural grounding piers/terraces for terrain/beat-composer levels
  if (def.terrain || (built.anchors && built.anchors.length > 0)) {
    buildArchitecturalGrounding(root, built.roads, built.anchors ?? [], th, D, minRoadY);
  }

  // Exact wall-frame visual scaffolding for Cube / wall machines (awning, wallArm, wallLift)
  const upVec = new THREE.Vector3(0, 1, 0);
  for (const m of snap.machines) {
    if (m.kind === 'awning') {
      // `g_${m.id}` receives `matMul(getMat(), basisMat)` directly from sim/machines.ts!
      // Local space is X = along wall (u), Y = up, Z = outward normal (n), matching `aw.occluder` to the mm!
      const g = getGroup(`g_${m.id}`);
      const w = Number(m.extra?.w ?? 1.9);
      const d = Number(m.extra?.d ?? 1.0);
      const leafM = D.tri(th.mech, { fresh: true, side: true });
      const slab = new THREE.Mesh(D.unitBox, leafM);
      slab.scale.set(w, 0.08, d);
      slab.position.set(0, 0, d / 2);
      g.add(slab);

      // Front scalloped valance stripes
      for (let k = 0; k < 4; k++) {
        const stripe = new THREE.Mesh(
          D.unitBox,
          D.basic(k % 2 ? (th.trim ?? '#FFFFFF') : (th.mechDark?.l ?? th.goal)),
        );
        stripe.scale.set(w / 4 - 0.02, 0.1, 0.14);
        stripe.position.set(-w / 2 + w / 8 + (k * w) / 4, 0, d - 0.07);
        g.add(stripe);
      }
      // Subtle hinge rod along wall edge
      const rod = new THREE.Mesh(D.geo(new THREE.CylinderGeometry(0.045, 0.045, w + 0.08, 10)), D.tri(th.mechDark ?? th.idle));
      rod.rotation.z = Math.PI / 2;
      g.add(rod);

      addMachUpd(m.id, (ms) => {
        setTri(leafM, mixPal(th.mech, tone(th.goal), ms.ready ? 0.42 : ms.on ? 0.22 : 0));
      });
    } else if (m.kind === 'wallArm') {
      const g = getGroup(`g_${m.id}`);
      const nx = Number(m.extra?.nx ?? 1), ny = Number(m.extra?.ny ?? 0), nz = Number(m.extra?.nz ?? 0);
      const ux = Number(m.extra?.ux ?? 0), uy = Number(m.extra?.uy ?? 0), uz = Number(m.extra?.uz ?? -1);
      const nW = new THREE.Vector3(nx, ny, nz).normalize();
      const uW = new THREE.Vector3(ux, uy, uz).normalize();

      // Hub disc lying flush against the wall normal
      const hub = new THREE.Mesh(D.geo(new THREE.CylinderGeometry(0.42, 0.42, 0.08, 24)), D.tri(th.mechDark ?? th.idle));
      hub.quaternion.setFromUnitVectors(upVec, nW);
      hub.position.copy(nW).multiplyScalar(-0.03);
      hub.userData.isRoad = true;
      g.add(hub);

      // Sail plate on Wall 5 (`cube_sail`): exact match with `sailOcc` OBB in sim/cube.ts!
      if (m.id === 'cube_sail') {
        const sailMat = D.tri(th.mech, { fresh: true, side: true });
        const sailPlate = new THREE.Mesh(D.unitBox, sailMat);
        sailPlate.matrixAutoUpdate = false;
        const scPos = uW.clone().multiplyScalar(0.85).addScaledVector(upVec, -0.3).addScaledVector(nW, 0.475);
        sailPlate.matrix.copy(makeOrientedBoxMatrix(uW, upVec, nW, 1.3, 0.06, 0.95, scPos));
        g.add(sailPlate);
        addMachUpd(m.id, (ms) => {
          setTri(sailMat, mixPal(th.mech, tone(th.goal), ms.on ? 0.35 : 0));
        });
      }

      // Tip block on Wall 6 (`cube_arm`): sits flush under the curled road tip along uW!
      const bs = Number(m.extra?.block ?? 0);
      if (bs > 0) {
        const len = Number(m.extra?.len ?? 2);
        const BR = 0.08;
        const blk = new THREE.Mesh(D.unitBox, D.tri(th.roof ?? th.mech, { polyOff: 1 }));
        blk.matrixAutoUpdate = false;
        const bPos = uW.clone().multiplyScalar(len + BR - 0.008 - bs / 2).addScaledVector(nW, -0.006 - bs / 2);
        blk.matrix.copy(makeOrientedBoxMatrix(uW, upVec, nW.clone().negate(), bs, bs, bs, bPos));
        g.add(blk);
      }
    } else if (m.kind === 'wallLift') {
      const g = getGroup(`g_${m.id}`);
      const ex = m.extra ?? {};
      const ux = Number(ex.ux ?? 0), uy = Number(ex.uy ?? 0), uz = Number(ex.uz ?? 1);
      const nx = Number(ex.nx ?? -1), ny = Number(ex.ny ?? 0), nz = Number(ex.nz ?? 0);
      const uW = new THREE.Vector3(ux, uy, uz).normalize();
      const nW = new THREE.Vector3(nx, ny, nz).normalize();
      const w = Number(ex.w ?? 1.4);
      const h = Number(ex.h ?? 1.0);
      const lo = Number(ex.lo ?? 3.38);
      const hi = Number(ex.hi ?? 4.5);
      const cPos = new THREE.Vector3(Number(ex.cx ?? -3), Number(ex.cy ?? 0.5), Number(ex.cz ?? 1.2));

      // Backing plate proud of the wall behind the moving loop
      const plateMat = D.tri(th.mech, { fresh: true, polyOff: 1 });
      const plate = new THREE.Mesh(D.unitBox, plateMat);
      plate.matrixAutoUpdate = false;
      plate.matrix.copy(makeOrientedBoxMatrix(uW, upVec, nW, w + 0.5, h + 0.5, 0.06, cPos));
      plate.userData.isRoad = true;
      g.add(plate);

      // Twin vertical guide rails mounted on `cube_body` so they rotate & sink with the tower
      const railParent = getGroup('cube_body');
      const railMat = D.tri(th.mechDark ?? th.idle, { polyOff: 1 });
      const railLen = hi - lo + h + 0.6;
      const r0 = new THREE.Vector3(Number(ex.r0x ?? -3), Number(ex.r0y ?? 4.4), Number(ex.r0z ?? 0.15));
      const r1 = new THREE.Vector3(Number(ex.r1x ?? -3), Number(ex.r1y ?? 4.4), Number(ex.r1z ?? 2.25));
      for (const rc of [r0, r1]) {
        const rail = new THREE.Mesh(D.unitBox, railMat);
        rail.matrixAutoUpdate = false;
        rail.matrix.copy(makeOrientedBoxMatrix(uW, upVec, nW, 0.08, railLen, 0.06, rc));
        railParent.add(rail);
      }

      addMachUpd(m.id, (ms) => {
        setTri(plateMat, mixPal(th.mech, tone(th.goal), ms.ready ? 0.42 : 0));
      });
    }
  }

  // 3. Machine Blooms (3D interactive ornaments at capPos) + Focus Hint Ring
  interface BloomInst {
    id: string;
    holder: THREE.Group;
    rig: BloomRig;
    ripple: THREE.Mesh;
    ringHalo: THREE.Mesh;
    e: number;
    v: number;
    spin: number;
    wasOn: boolean;
    wake: number;
    size: number;
  }
  const blooms = new Map<string, BloomInst>();
  const caps: CapAnchor[] = [];

  for (const m of snap.machines) {
    if (!m.key) continue;
    const holder = new THREE.Group();
    holder.position.copy(W3(m.capPos));
    const nrm = W3(m.capNormal).normalize();
    if (nrm.lengthSq() > 0.5) {
      holder.quaternion.setFromUnitVectors(upVec, nrm);
    }
    const rig = createBloom(th.bloom, th, D, tex);
    const sz = m.size || 0.7;
    rig.group.scale.setScalar(sz);
    holder.add(rig.group);

    const ripple = new THREE.Mesh(
      D.geo(new THREE.RingGeometry(0.46, 0.55, 36)),
      D.basic(FACE_COLORS[m.key], { opacity: 0, side: true }),
    );
    ripple.rotation.x = -Math.PI / 2;
    ripple.position.y = 0.03;
    holder.add(ripple);

    const ringHalo = new THREE.Mesh(
      D.geo(new THREE.RingGeometry(0.62, 0.78, 36)),
      D.basic('#FFE25A', { opacity: 0, side: true }),
    );
    ringHalo.rotation.x = -Math.PI / 2;
    ringHalo.position.y = 0.05;
    ringHalo.scale.setScalar(sz);
    holder.add(ringHalo);

    root.add(holder);
    blooms.set(m.id, {
      id: m.id,
      holder,
      rig,
      ripple,
      ringHalo,
      e: m.on ? 1 : 0,
      v: 0,
      spin: 0,
      wasOn: m.on,
      wake: -9,
      size: sz,
    });
    caps.push({
      id: m.id,
      key: m.key,
      name: m.name,
      on: m.on,
      live: m.live,
      ready: m.ready,
      worldPos: W3(m.capPos),
    });
  }

  // 4. Keys & Gates
  const keyMeshes = new Map<string, { group: THREE.Group; glow: THREE.Sprite }>();
  const keyMat = D.tri(tone('#FFD84D', 0.9, 0.72));
  for (const k of snap.keys) {
    const kg = new THREE.Group();
    kg.position.copy(W3(k.pos));
    kg.position.y += 0.45;
    const bow = new THREE.Mesh(D.geo(new THREE.TorusGeometry(0.18, 0.055, 8, 20)), keyMat);
    bow.position.y = 0.16;
    kg.add(bow);
    const shaft = new THREE.Mesh(D.unitBox, keyMat);
    shaft.scale.set(0.06, 0.34, 0.06);
    shaft.position.y = -0.06;
    kg.add(shaft);
    const bit1 = new THREE.Mesh(D.unitBox, keyMat);
    bit1.scale.set(0.14, 0.05, 0.05);
    bit1.position.set(0.07, -0.14, 0);
    kg.add(bit1);
    const bit2 = new THREE.Mesh(D.unitBox, keyMat);
    bit2.scale.set(0.1, 0.05, 0.05);
    bit2.position.set(0.05, -0.22, 0);
    kg.add(bit2);
    const glow = D.sprite(tex.glow, 1.3, 1.3, '#FFE25A', { opacity: 0.55, add: true });
    kg.add(glow);
    root.add(kg);
    keyMeshes.set(k.id, { group: kg, glow });
  }

  const gateMeshes = new Map<string, { left: THREE.Group; right: THREE.Group }>();
  for (const gt of built.gates) {
    const gg = new THREE.Group();
    gg.position.copy(W3(gt.pos));
    const heading = W3(gt.dir);
    gg.rotation.y = Math.atan2(-heading.z, heading.x);
    const pillarMat = D.tri(th.stone);
    const barMat = D.tri(tone('#FFD15C', 0.86, 0.7));
    for (const s of [-0.52, 0.52]) {
      const p = new THREE.Mesh(D.unitBox, pillarMat);
      p.scale.set(0.18, 1.2, 0.18);
      p.position.set(0, 0.6, s);
      gg.add(p);
    }
    const left = new THREE.Group();
    left.position.set(0, 0, -0.48);
    const lBar = new THREE.Mesh(D.unitBox, barMat);
    lBar.scale.set(0.08, 0.85, 0.46);
    lBar.position.set(0, 0.5, 0.23);
    left.add(lBar);
    gg.add(left);

    const right = new THREE.Group();
    right.position.set(0, 0, 0.48);
    const rBar = new THREE.Mesh(D.unitBox, barMat);
    rBar.scale.set(0.08, 0.85, 0.46);
    rBar.position.set(0, 0.5, -0.23);
    right.add(rBar);
    gg.add(right);

    root.add(gg);
    gateMeshes.set(gt.id, { left, right });
  }

  // 5. Hidden-Gap Ghost Bridge Shimmers + Optical Perspective-Join Glint Pool
  const ghostGaps: Array<{ mesh: THREE.Mesh; mat: THREE.MeshBasicMaterial }> = [];
  for (const hg of snap.hiddenGaps) {
    const a = W3(hg.a), b = W3(hg.b);
    const dist = Math.max(0.2, a.distanceTo(b));
    const mat = D.basic('#FFE89A', { opacity: 0, side: true, add: true });
    const mesh = new THREE.Mesh(D.geo(new THREE.PlaneGeometry(dist, 0.68)), mat);
    mesh.position.copy(a).lerp(b, 0.5);
    mesh.position.y += 0.04;
    mesh.rotation.x = -Math.PI / 2;
    const dir = b.clone().sub(a);
    mesh.rotation.z = -Math.atan2(dir.z, dir.x);
    mesh.userData.isRoad = true;
    root.add(mesh);
    ghostGaps.push({ mesh, mat });
  }

  const joinGlints = Array.from({ length: 6 }, () => {
    const s = D.sprite(tex.glow, 0.9, 0.9, '#FFF2B8', { opacity: 0, add: true, depthTest: false, order: 6 });
    scene.add(s);
    return s;
  });

  // 6. Goal Beacon
  let goalRig: GoalRig | null = null;
  if (snap.goal) {
    goalRig = makeGoal(th, D, tex);
    root.add(goalRig.group);
  }

  // 7. Wheel + Spark Burst Pool
  const wheelRig: WheelRig = makeWheel(th, riderColor, D, tex);
  scene.add(wheelRig.root);

  interface Spark {
    sprite: THREE.Sprite;
    vel: THREE.Vector3;
    age: number;
    life: number;
  }
  const sparkPool: Spark[] = Array.from({ length: 16 }, () => {
    const s = D.sprite(tex.diamond, 0.18, 0.18, th.spark, { opacity: 0, add: true, depthTest: false, order: 8 });
    scene.add(s);
    return { sprite: s, vel: new THREE.Vector3(), age: 99, life: 0.7 };
  });
  let sparkCursor = 0;

  const triggerSpark = (pos: Vec3, color?: string) => {
    if (reduceMotion) return;
    const count = 6;
    for (let i = 0; i < count; i++) {
      const spk = sparkPool[sparkCursor++ % sparkPool.length];
      spk.age = 0;
      spk.life = 0.55 + (i % 3) * 0.12;
      const a = (i / count) * TAU + sparkCursor * 0.37;
      spk.sprite.position.set(pos[0], pos[1] + 0.3, pos[2]);
      (spk.sprite.material as THREE.SpriteMaterial).color.set(color ?? th.spark);
      spk.vel.set(Math.cos(a) * 1.6, 1.8 + (i % 2) * 0.7, Math.sin(a) * 1.6);
    }
  };

  // 8. Per-Yaw Camera Framing (`yawFrames`)
  const yawFrames = computeYawFrames(
    def.yaws,
    framePts,
    built.roads,
    snap.machines.filter((m) => m.key).map((m) => m.capPos),
    frameCenter,
  );
  const bounds = yawFrames[0].bounds;

  const boundsAtYaw = (yawRad: number): [number, number, number, number] => {
    if (yawFrames.length === 1) return yawFrames[0].bounds;
    if (yawRad <= yawFrames[0].yawRad) return yawFrames[0].bounds;
    const last = yawFrames[yawFrames.length - 1];
    if (yawRad >= last.yawRad) return last.bounds;
    for (let i = 0; i < yawFrames.length - 1; i++) {
      const a = yawFrames[i], b = yawFrames[i + 1];
      if (yawRad >= a.yawRad && yawRad <= b.yawRad) {
        const k = clamp((yawRad - a.yawRad) / Math.max(1e-4, b.yawRad - a.yawRad), 0, 1);
        return [
          lerp(a.bounds[0], b.bounds[0], k),
          lerp(a.bounds[1], b.bounds[1], k),
          lerp(a.bounds[2], b.bounds[2], k),
          lerp(a.bounds[3], b.bounds[3], k),
        ];
      }
    }
    return bounds;
  };

  // 9. Gentle Sky Clouds & Theme Drift Particles (honors prefers-reduced-motion)
  if (!reduceMotion && def.ambient !== false) {
    const dark = lum(skyAt(th.sky, 0.5)) < 0.35;
    const cloudColor = dark ? mixHex(skyAt(th.sky, 0.1), '#FFFFFF', 0.2) : mixHex('#FFFFFF', skyAt(th.sky, 0.05), 0.08);
    const W = bounds[1] - bounds[0] + pad * 2;
    const H = bounds[3] - bounds[2] + pad * 2;
    const cloudCount = 4;
    for (let i = 0; i < cloudCount; i++) {
      const s = D.sprite(tex.cloud, 3.2 + rng() * 2.2, 1.2 + rng() * 0.5, cloudColor, { opacity: dark ? 0.35 : 0.78 });
      const bx = bounds[0] + ((i + 0.2 + 0.6 * rng()) / cloudCount) * W;
      const by = lerp(bounds[2] + H * 0.52, bounds[2] + H * 0.94, rng());
      scene.add(s);
      generalUpdaters.push((t) => {
        const x = bounds[0] - 2 + (((bx - bounds[0] + t * 0.2) % (W + 4)) + (W + 4)) % (W + 4);
        s.position.copy(center).addScaledVector(SR, x).addScaledVector(SU, by).addScaledVector(SD, -65);
      });
    }
    const driftTex = th.id === 'night' ? tex.glow : th.id === 'prism' ? tex.diamond : tex.petal;
    const driftCol = th.id === 'night' ? '#FFE69A' : th.id === 'garden' ? '#7CC95A' : th.spark;
    const driftCount = 8;
    for (let i = 0; i < driftCount; i++) {
      const sz = th.id === 'night' ? 0.26 : 0.15;
      const s = D.sprite(driftTex, sz, sz, driftCol, {
        opacity: 0.75,
        add: th.id === 'night' || th.id === 'prism',
        depthTest: false,
        order: 4,
      });
      const ox = rng() * W, oy = rng() * H, ph = rng() * TAU;
      const vx = 0.22 * (0.6 + rng()), vy = (th.id === 'night' ? 0.12 : -0.16) * (0.6 + rng());
      scene.add(s);
      generalUpdaters.push((t) => {
        const x = bounds[0] + (((ox + t * vx) % W) + W) % W;
        const y = bounds[2] + (((oy + t * vy + Math.sin(t + ph) * 0.25) % H) + H) % H;
        s.position.copy(center).addScaledVector(SR, x).addScaledVector(SU, y).addScaledVector(SD, 28);
        (s.material as THREE.SpriteMaterial).rotation = t * 0.9 + ph;
      });
    }
  }

  // 10. Atmospheric Haze & Initial Layer Tagging for `wheelOnTop`
  updateHazeForScene(haze, root, minRoadY, th);
  tagStaticWheelLayers(root, wheelRig.root);

  // State for dirty-flagged open-cap perspective join swapping & smart road occlusion
  let lastCapSig = '';
  const perspNeighbors = new Map<string, Set<string>>();
  const activeGlintPositions: THREE.Vector3[] = [];

  const updateOpticalSeamCaps = (yawRad: number, s: PenroseSnapshot, elapsed: number) => {
    // Only recompute when camera yaw, cube rotation, or any dynamic machine value changes
    let sig = `${Math.round(yawRad * 200)}|${Math.round(s.cubeRotY * 200)}|${Math.round(s.cubeSink * 100)}`;
    for (const m of s.machines) {
      if (m.on || m.kind !== 'pool') sig += `|${Math.round(m.value * 20)}`;
    }
    if (sig !== lastCapSig) {
      lastCapSig = sig;
      perspNeighbors.clear();
      activeGlintPositions.length = 0;

      // Build camera right/up/dir axes for exact orthographic projection
      const R = SR.clone().applyAxisAngle(Y_AXIS, yawRad);
      const U = SU.clone().applyAxisAngle(Y_AXIS, yawRad);

      interface OpenEnd {
        rig: RoadRig;
        k: 0 | 1;
        p: THREE.Vector3;
        sx: number;
        sy: number;
        ox: number;
        oy: number;
      }
      const ends: OpenEnd[] = [];
      for (const rig of roadRigs) {
        if (rig.road.closed || rig.road.isReflection || rig.road.localS.length < 2) continue;
        // Refresh world AABB for dynamic roads
        if (rig.hasDynamicTransform) {
          rig.worldBox.makeEmpty();
          for (const p of rig.road.wp) rig.worldBox.expandByPoint(new THREE.Vector3(p[0], p[1], p[2]));
        }
        for (const k of [0, 1] as const) {
          const e = rig.road.end(k);
          const p = new THREE.Vector3(e.p[0], e.p[1], e.p[2]);
          const dx = p.x - center.x, dy = p.y - center.y, dz = p.z - center.z;
          const sx = dx * R.x + dy * R.y + dz * R.z;
          const sy = dx * U.x + dy * U.y + dz * U.z;
          let ox = e.out[0] * R.x + e.out[1] * R.y + e.out[2] * R.z;
          let oy = e.out[0] * U.x + e.out[1] * U.y + e.out[2] * U.z;
          const ol = Math.hypot(ox, oy);
          if (ol > 1e-5) { ox /= ol; oy /= ol; }
          ends.push({ rig, k, p, sx, sy, ox, oy });
        }
      }

      const openState = new Map<RoadRig, [boolean, boolean]>();
      for (let i = 0; i < ends.length; i++) {
        const A = ends[i];
        for (let j = i + 1; j < ends.length; j++) {
          const B = ends[j];
          if (A.rig === B.rig) continue;
          const sDist = Math.hypot(A.sx - B.sx, A.sy - B.sy);
          if (sDist > 0.24) continue;
          // Outward directions must face opposite each other on screen
          const oppDot = -(A.ox * B.ox + A.oy * B.oy);
          if (oppDot < 0.82) continue;

          // Both 3D joins AND optical perspective joins benefit from open end-caps so no dark wall cuts the seam!
          const sa = openState.get(A.rig) ?? [false, false];
          sa[A.k] = true;
          openState.set(A.rig, sa);

          const sb = openState.get(B.rig) ?? [false, false];
          sb[B.k] = true;
          openState.set(B.rig, sb);

          // Record perspective neighbor pair & visual seam glint for true optical depth-separated joins
          const dist3D = A.p.distanceTo(B.p);
          if (dist3D > 0.35) {
            const na = perspNeighbors.get(A.rig.road.id) ?? new Set<string>();
            na.add(B.rig.road.id);
            perspNeighbors.set(A.rig.road.id, na);
            const nb = perspNeighbors.get(B.rig.road.id) ?? new Set<string>();
            nb.add(A.rig.road.id);
            perspNeighbors.set(B.rig.road.id, nb);

            // Pick the closer-to-camera endpoint for the subtle glint
            if (activeGlintPositions.length < joinGlints.length) {
              activeGlintPositions.push(A.p.clone().lerp(B.p, 0.5));
            }
          }
        }
      }

      // Swap visible cap variant on any road whose open-cap state changed
      for (const rig of roadRigs) {
        if (rig.road.closed || rig.road.isReflection) continue;
        const st = openState.get(rig) ?? [false, false];
        const key: CapKey = `${st[0] ? '1' : '0'}${st[1] ? '1' : '0'}` as CapKey;
        if (key !== rig.activeKey) {
          rig.activeMesh.visible = false;
          const next = getOrBuildRoadVariant(rig, key);
          next.visible = true;
          rig.activeMesh = next;
          rig.activeKey = key;
        }
      }
    }

    // Pulse active optical-join glint sprites gently
    for (let i = 0; i < joinGlints.length; i++) {
      const spg = joinGlints[i];
      if (i < activeGlintPositions.length) {
        spg.position.copy(activeGlintPositions[i]);
        (spg.material as THREE.SpriteMaterial).opacity = 0.24 + 0.12 * Math.sin(elapsed * 3.4 + i);
      } else {
        (spg.material as THREE.SpriteMaterial).opacity = 0;
      }
    }
  };

  // Smart road-over-road occlusion: distant elevated overpasses occlude the wheel (layer 2),
  // while the wheel's current road, adjacent roads (<1.25m), and optical perspective-joined roads never clip the wheel!
  const wheelPtScratch = new THREE.Vector3();
  const updateRoadOcclusion = (s: PenroseSnapshot) => {
    const curId = s.wheel.roadId;
    const neighbors = perspNeighbors.get(curId);
    wheelPtScratch.set(s.wheel.pos[0], s.wheel.pos[1], s.wheel.pos[2]);

    for (const rig of roadRigs) {
      if (rig.road.isReflection) continue;
      const isCurrent = rig.road.id === curId;
      const isPerspJoined = !!neighbors?.has(rig.road.id);
      const isNearWheel = isCurrent || isPerspJoined || rig.worldBox.distanceToPoint(wheelPtScratch) < 1.25;
      if (isNearWheel) {
        rig.activeMesh.layers.disable(2);
      } else {
        rig.activeMesh.layers.enable(2);
      }
    }
  };

  // Wheel orientation scratch vectors
  const wX = new THREE.Vector3(), wY = new THREE.Vector3(), wZ = new THREE.Vector3(), wM = new THREE.Matrix4();
  const camDir = new THREE.Vector3();

  const sync = (
    s: PenroseSnapshot,
    dt: number,
    elapsed: number,
    camera: THREE.OrthographicCamera,
    renderer: THREE.WebGLRenderer,
  ) => {
    // Sync Cube tower body & upper-storey reveal!
    const showCubeUpper = s.wallIndex >= 3 || s.cubeSink > 0.1;
    if (cubeGroup) {
      cubeGroup.rotation.y = s.cubeRotY;
      cubeGroup.position.y = -s.cubeSink;
    }
    const upperRoadsGrp = groups.get('cube_upper');
    if (upperRoadsGrp) upperRoadsGrp.visible = showCubeUpper;
    const sailGrp = groups.get('g_cube_sail');
    if (sailGrp) sailGrp.visible = showCubeUpper;
    const armGrp = groups.get('g_cube_arm');
    if (armGrp) armGrp.visible = showCubeUpper;

    // Sync dynamic road & machine groups (including roadless machines like awning!)
    for (const [gid, mat] of Object.entries(s.roadTransforms)) {
      const grp = groups.get(gid);
      if (grp) applyMat4(grp, mat);
    }

    // Update seamless open-cap perspective joins & smart road-over-road occlusion
    updateOpticalSeamCaps(s.yawRad, s, elapsed);
    updateRoadOcclusion(s);

    // Sync machines, blooms, dynamic road colors, and cap anchors
    const machById = new Map<string, MachineSnapshot>();
    for (const m of s.machines) machById.set(m.id, m);

    for (const cap of caps) {
      const m = machById.get(cap.id);
      if (!m) continue;
      cap.on = m.on;
      cap.live = m.live;
      cap.ready = m.ready;
      cap.worldPos.set(m.capPos[0], m.capPos[1], m.capPos[2]);
    }

    for (const m of s.machines) {
      const dm = dynamicRoadMats.get(m.id);
      if (dm) {
        const targetPal = m.on ? th.mech : m.ready ? mixPal(th.idle, th.mech, 0.35) : th.idle;
        setTri(dm, targetPal);
      }

      const b = blooms.get(m.id);
      if (b) {
        b.holder.visible = m.live;
        b.holder.position.set(m.capPos[0], m.capPos[1], m.capPos[2]);
        const nrm = W3(m.capNormal).normalize();
        if (nrm.lengthSq() > 0.5) b.holder.quaternion.setFromUnitVectors(upVec, nrm);

        if (m.on && !b.wasOn) b.wake = elapsed;
        b.wasOn = m.on;
        const target = m.on ? 1 : 0;
        b.v += (70 * (target - b.e) - 8.5 * b.v) * dt;
        b.e += b.v * dt;
        if (m.on && s.cadence > 10) b.spin += (1.2 + s.cadence * 0.015) * dt;
        b.rig.set(b.e, b.spin, elapsed);

        const w = elapsed - b.wake;
        const ripOn = w >= 0 && w < 0.85;
        (b.ripple.material as THREE.MeshBasicMaterial).opacity = ripOn ? (1 - w / 0.85) * 0.85 : 0;
        b.ripple.scale.setScalar(b.size * (1 + Math.max(0, w) * 2.5));

        const focused = s.focusMachine === m.id && s.hintTier > 0;
        (b.ringHalo.material as THREE.MeshBasicMaterial).opacity = focused ? 0.55 + 0.35 * Math.sin(elapsed * 5.5) : 0;
        b.ringHalo.scale.setScalar(b.size * (1 + (focused ? 0.18 * Math.sin(elapsed * 5.5) : 0)));
      }

      const upds = machineUpdaters.get(m.id);
      if (upds) {
        for (const fn of upds) fn(m, s, dt, elapsed);
      }
    }

    // Sync keys
    for (const k of s.keys) {
      const km = keyMeshes.get(k.id);
      if (!km) continue;
      km.group.visible = k.anim < 0.99;
      km.group.position.set(k.pos[0], k.pos[1] + 0.45 + k.anim * 1.4 + Math.sin(elapsed * 2.6) * 0.08, k.pos[2]);
      km.group.rotation.y = elapsed * 1.8 + k.anim * 4;
      km.group.scale.setScalar(Math.max(0.01, 1 - k.anim));
      (km.glow.material as THREE.SpriteMaterial).opacity = (1 - k.anim) * (0.45 + 0.15 * Math.sin(elapsed * 3.5));
    }

    // Sync gates
    for (const gt of s.gates) {
      const gm = gateMeshes.get(gt.id);
      if (!gm) continue;
      const rad = gt.angle * DEG;
      gm.left.rotation.y = rad;
      gm.right.rotation.y = -rad;
    }

    // Sync hidden-gap ghost bridges
    for (let i = 0; i < ghostGaps.length && i < s.hiddenGaps.length; i++) {
      const gg = ghostGaps[i];
      const hg = s.hiddenGaps[i];
      const a = W3(hg.a), b = W3(hg.b);
      gg.mesh.position.copy(a).lerp(b, 0.5);
      gg.mesh.position.y += 0.04;
      gg.mat.opacity = hg.hidden ? 0.28 + 0.14 * Math.sin(elapsed * 4.5) : 0;
    }

    // Sync Goal Beacon
    if (goalRig && s.goal) {
      camera.getWorldDirection(camDir).negate();
      goalRig.place(W3(s.goal.pos), W3(s.goal.normal), W3(s.goal.dir), camDir, elapsed);
    }

    // Sync Wheel pose
    const w = s.wheel;
    wheelRig.root.visible = w.mode !== 'dead';
    if (w.mode === 'spawn') {
      const p = W3(w.spawnPos);
      const n = W3(w.spawnNormal).normalize();
      const b = bounceEase(clamp(w.t / 0.7, 0, 1));
      wheelRig.root.position.copy(p).addScaledVector(n, (1 - b) * 3.2);
      wheelRig.root.scale.setScalar(1);
    } else if (w.mode === 'win') {
      wheelRig.root.position.set(w.pos[0], w.pos[1], w.pos[2]);
      const sc = Math.max(0.01, 1 - clamp(w.t / 0.9, 0, 1));
      wheelRig.root.scale.setScalar(sc);
    } else {
      wheelRig.root.position.set(w.pos[0], w.pos[1], w.pos[2]);
      wheelRig.root.scale.setScalar(1);
    }

    wY.set(w.normal[0], w.normal[1], w.normal[2]).normalize();
    wX.set(w.heading[0], w.heading[1], w.heading[2]);
    wX.addScaledVector(wY, -wX.dot(wY));
    if (wX.lengthSq() < 1e-6) wX.set(1, 0, 0);
    else wX.normalize();
    wZ.crossVectors(wX, wY);
    wheelRig.root.quaternion.setFromRotationMatrix(wM.makeBasis(wX, wY, wZ));
    wheelRig.spin.rotation.z = -w.spin;
    wheelRig.shadow.visible = w.mode === 'road' || w.mode === 'hop';

    // Update sparks
    for (const spk of sparkPool) {
      if (spk.age >= spk.life) {
        (spk.sprite.material as THREE.SpriteMaterial).opacity = 0;
        continue;
      }
      spk.age += dt;
      const f = clamp(spk.age / spk.life, 0, 1);
      spk.vel.y -= 5.2 * dt;
      spk.sprite.position.addScaledVector(spk.vel, dt);
      (spk.sprite.material as THREE.SpriteMaterial).opacity = (1 - f) * 0.95;
      spk.sprite.scale.setScalar(0.18 * (1 - f * 0.45));
    }

    // Update clouds, particles, sea, etc.
    for (const fn of generalUpdaters) fn(elapsed, dt, s);

    // Update throttled portal render targets
    for (const fn of portalUpdaters) fn(s, dt, elapsed, camera, renderer);
  };

  return {
    scene,
    theme: th,
    center,
    bounds,
    pad,
    hasOverlay: true,
    caps,
    boundsAtYaw,
    sync,
    triggerSpark,
    dispose: () => {
      scene.clear();
      D.dispose();
    },
  };
}

/**
 * One-time static layer assignment for `wheelOnTop`:
 * Layer 1 = wheel.
 * Layer 2 = opaque non-road occluders (towers, walls, awnings, sail bridges, companion blocks).
 * Road meshes are dynamically toggled on/off layer 2 per active wheel road in `updateRoadOcclusion`.
 */
function tagStaticWheelLayers(worldRoot: THREE.Object3D, wheelRoot: THREE.Object3D): void {
  wheelRoot.traverse((o) => {
    o.layers.set(1);
  });
  worldRoot.traverse((o) => {
    if (!(o as THREE.Mesh).isMesh) return;
    if (o.userData.isRoad || o.userData.rideThrough) return;
    const mat = (o as THREE.Mesh).material;
    if (Array.isArray(mat) ? mat.some((m) => m.transparent) : mat?.transparent) return;
    o.layers.enable(2);
  });
}

/* ---------- Procedural Monument Valley Grounding Piers & Terraces ---------- */

/**
 * Adds stepped Monument Valley stone plinths & slender piers under static holding loops
 * and terrain anchors (used by `def.terrain` and beat-composer levels) so structures sit
 * grounded over atmospheric haze without ever colliding with a lower road beneath them.
 */
function buildArchitecturalGrounding(
  root: THREE.Group,
  roads: readonly SimRoad[],
  anchors: ReadonlyArray<[number, number, number]>,
  th: ThemeDef,
  D: LevelDisposer,
  minRoadY: number,
): void {
  const baseZ = (Number.isFinite(minRoadY) ? minRoadY : 0) - 3.6;
  const plinthMat = D.tri(mixPal(th.stone, tone(th.ink), 0.08), { polyOff: 1 });
  const pierMat = D.tri(mixPal(th.stone, tone(th.ink), 0.16), { polyOff: 1 });

  // Helper: check if dropping a column at sketch (x, y) from zTop down to zBot would clip any lower road
  const hasLowerRoadUnder = (sx: number, sy: number, rPad: number, zTop: number): boolean => {
    for (const r of roads) {
      if (r.isReflection) continue;
      for (const s of r.localS) {
        // localS.p is in Three world coords [x, z_up, y_depth]
        if (s.p[1] < zTop - 0.45 && Math.abs(s.p[0] - sx) < rPad + 0.7 && Math.abs(s.p[2] - sy) < rPad + 0.7) {
          return true;
        }
      }
    }
    return false;
  };

  // 1. Stepped terrace plinths beneath static horizontal closed holding loops
  const placedCenters: Array<[number, number]> = [];
  for (const r of roads) {
    if (!r.closed || r.transform || r.isReflection || r.localS.length < 4) continue;
    // Only ground horizontal loops (normal pointing up in world Y)
    if (r.localS[0].n[1] < 0.85) continue;
    let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity, zAvg = 0;
    for (const s of r.localS) {
      if (s.p[0] < x0) x0 = s.p[0];
      if (s.p[0] > x1) x1 = s.p[0];
      if (s.p[2] < y0) y0 = s.p[2];
      if (s.p[2] > y1) y1 = s.p[2];
      zAvg += s.p[1];
    }
    zAvg /= r.localS.length;
    const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
    const hw = Math.max(0.9, (x1 - x0) / 2 + 0.52);
    const hh = Math.max(0.9, (y1 - y0) / 2 + 0.52);

    // Subtle coping cap cleanly beneath the road's underside (-0.25)
    addBox(root, cx - hw, cy - hh, zAvg - 0.65, cx + hw, cy + hh, zAvg - 0.25, plinthMat, D, true);
    placedCenters.push([cx, cy]);

    // Drop a stepped stone pier down into the haze if clear of any lower roads
    if (!hasLowerRoadUnder(cx, cy, Math.min(hw, hh) * 0.6, zAvg - 0.65)) {
      const pw = Math.max(0.55, hw * 0.64), ph = Math.max(0.55, hh * 0.64);
      const midZ = Math.max(baseZ + 1.2, zAvg - 1.5);
      addBox(root, cx - pw, cy - ph, midZ, cx + pw, cy + ph, zAvg - 0.65, plinthMat, D);
      addBox(root, cx - pw * 0.72, cy - ph * 0.72, baseZ, cx + pw * 0.72, cy + ph * 0.72, midZ, pierMat, D);
    }
  }

  // 2. Slender architectural piers at explicit terrain anchors (skipping duplicates close to loops)
  for (const [ax, ay, rad] of anchors) {
    if (placedCenters.some(([cx, cy]) => Math.hypot(cx - ax, cy - ay) < 1.6)) continue;
    // Find highest static road sample near this anchor to tuck pier cleanly underneath it
    let topZ = -Infinity;
    for (const r of roads) {
      if (r.transform || r.isReflection) continue;
      for (const s of r.localS) {
        if (Math.hypot(s.p[0] - ax, s.p[2] - ay) < Math.max(1.2, rad)) {
          if (s.p[1] > topZ) topZ = s.p[1];
        }
      }
    }
    if (!Number.isFinite(topZ) || hasLowerRoadUnder(ax, ay, 0.5, topZ - 0.3)) continue;
    const pr = clamp(rad * 0.45, 0.32, 0.65);
    addBox(root, ax - pr, ay - pr, baseZ, ax + pr, ay + pr, topZ - 0.26, pierMat, D);
    placedCenters.push([ax, ay]);
  }
}

/* ---------- Declarative VisualProp Builder ---------- */

interface PropContext {
  root: THREE.Group;
  getGroup: (groupId?: string) => THREE.Object3D;
  th: ThemeDef;
  D: LevelDisposer;
  tex: SharedTextures;
  rng: () => number;
  addMachUpd: (id: string, fn: MachineUpdater) => void;
  portalUpdaters: PortalUpdater[];
  generalUpdaters: Array<(t: number, dt: number, snap: PenroseSnapshot) => void>;
  onCubeGroup: (cg: THREE.Group) => void;
}

function buildVisualProp(prop: VisualProp, ctx: PropContext): void {
  const { root, getGroup, th, D, tex, addMachUpd, portalUpdaters } = ctx;

  switch (prop.kind) {
    case 'box': {
      const parent = getGroup(prop.groupId);
      const pal = resolvePalette(th, prop.pal);
      // Slight polygonOffset pushes support masonry cleanly behind flush road decks/walls
      addBox(parent, prop.x0, prop.y0, prop.z0, prop.x1, prop.y1, prop.z1, D.tri(pal, { polyOff: 1 }), D, !!prop.roadLike);
      break;
    }

    case 'cyl': {
      const parent = getGroup(prop.groupId);
      const pal = resolvePalette(th, prop.pal);
      const m = addCyl(parent, prop.x, prop.y, prop.r, prop.z0, prop.z1, D.tri(pal, { polyOff: 1 }), D, prop.seg ?? 20, prop.rTop);
      if (prop.rotX) m.rotation.x = prop.rotX;
      if (prop.rotZ) m.rotation.z = prop.rotZ;
      break;
    }

    case 'dome': {
      const parent = getGroup(prop.groupId);
      const pal = resolvePalette(th, prop.pal ?? 'mech');
      const m = new THREE.Mesh(
        D.geo(new THREE.SphereGeometry(prop.r, 18, 9, 0, TAU, 0, Math.PI / 2)),
        D.tri(pal),
      );
      m.position.copy(V3(prop.x, prop.y, prop.z));
      parent.add(m);
      break;
    }

    case 'roof': {
      const parent = getGroup(prop.groupId);
      const pal = resolvePalette(th, prop.pal ?? 'roof');
      const dx = prop.x1 - prop.x0, dy = prop.y1 - prop.y0;
      const diag = Math.hypot(dx, dy);
      const m = new THREE.Mesh(D.geo(new THREE.ConeGeometry(diag / 2, prop.h, 4, 1)), D.tri(pal));
      m.rotation.y = Math.PI / 4;
      m.scale.set((dx / diag) * 1.42, 1, (dy / diag) * 1.42);
      m.position.copy(V3((prop.x0 + prop.x1) / 2, (prop.y0 + prop.y1) / 2, prop.z + prop.h / 2));
      parent.add(m);
      break;
    }

    case 'tree': {
      const parent = getGroup(prop.groupId);
      const tg = new THREE.Group();
      tg.position.copy(V3(prop.x, prop.y, prop.z));
      const s = prop.s;
      const tr = new THREE.Mesh(D.geo(new THREE.CylinderGeometry(0.07 * s, 0.1 * s, 0.8 * s, 7)), D.tri(tone('#8A5A34')));
      tr.position.y = 0.4 * s;
      tg.add(tr);
      const leafPal = th.leaf ?? th.turf ?? tone('#6FCB4E');
      const c1 = new THREE.Mesh(D.geo(new THREE.IcosahedronGeometry(0.58 * s, 0)), D.tri(leafPal));
      c1.position.y = 1.0 * s;
      tg.add(c1);
      const c2 = new THREE.Mesh(D.geo(new THREE.IcosahedronGeometry(0.38 * s, 0)), D.tri(mixPal(leafPal, th.turf ?? leafPal, 0.5)));
      c2.position.set(0.22 * s, 1.38 * s, 0.08 * s);
      tg.add(c2);
      parent.add(tg);
      break;
    }

    case 'loopSlab': {
      const w = prop.w ?? 0.9;
      const pal = resolvePalette(th, prop.pal ?? 'stone');
      const mat = D.tri(pal, { polyOff: 1 });
      const z0 = prop.z, z1 = prop.z + 0.46;
      addBox(root, prop.x0, prop.y0, z0, prop.x1, prop.y0 + w, z1, mat, D, true);
      addBox(root, prop.x0, prop.y1 - w, z0, prop.x1, prop.y1, z1, mat, D, true);
      addBox(root, prop.x0, prop.y0 + w, z0, prop.x0 + w, prop.y1 - w, z1, mat, D, true);
      addBox(root, prop.x1 - w, prop.y0 + w, z0, prop.x1, prop.y1 - w, z1, mat, D, true);
      break;
    }

    case 'arch': {
      const parent = getGroup(prop.groupId);
      const pal = resolvePalette(th, prop.pal ?? 'stone');
      const m = new THREE.Mesh(D.geo(archGeo(prop.w, prop.h)), D.tri(pal, { side: true }));
      if (prop.face === 'x') {
        m.rotation.y = Math.PI / 2;
        m.position.copy(V3(prop.plane + 0.015, prop.u, prop.v));
      } else {
        m.position.copy(V3(prop.u, prop.plane + 0.015, prop.v));
      }
      parent.add(m);
      break;
    }

    case 'cliff': {
      const mat = D.tri(mixPal(th.stone, tone(th.ink), 0.12), { polyOff: 1 });
      const h = Math.max(1.2, prop.z - prop.zBase);
      const m = new THREE.Mesh(D.geo(new THREE.CylinderGeometry(1.15, 0.4, h, 7)), mat);
      m.position.copy(V3(prop.x, prop.y, prop.zBase + h / 2));
      if (prop.ang) m.rotation.y = prop.ang;
      root.add(m);
      break;
    }

    case 'lighthouse': {
      const h = prop.z1 - prop.z0;
      addCyl(root, prop.x, prop.y, prop.r, prop.z0, prop.z1, D.tri(th.stone), D, 20, prop.r * 0.72);
      addCyl(root, prop.x, prop.y, prop.r * 0.85, prop.z1, prop.z1 + 0.18, D.tri(th.roof ?? th.mech), D, 20);
      addCyl(root, prop.x, prop.y, prop.r * 0.56, prop.z1 + 0.18, prop.z1 + 0.72, D.basic('#FFF3B0'), D, 16);
      const roof = new THREE.Mesh(D.geo(new THREE.ConeGeometry(prop.r * 0.75, 0.55, 16)), D.tri(th.roof ?? th.mech));
      roof.position.copy(V3(prop.x, prop.y, prop.z1 + 0.98));
      root.add(roof);
      const glow = D.sprite(tex.glow, 2.2, 2.2, '#FFE88A', { opacity: 0.5, add: true });
      glow.position.copy(V3(prop.x, prop.y, prop.z1 + 0.45));
      root.add(glow);
      if (h > 2) {
        addCyl(root, prop.x, prop.y, prop.r * 0.88, prop.z0 + h * 0.42, prop.z0 + h * 0.56, D.tri(th.mech), D, 20, prop.r * 0.84);
      }
      break;
    }

    case 'windmill': {
      addCyl(root, prop.x, prop.y, 0.55, prop.z, prop.z + 2.4, D.tri(th.stone), D, 12, 0.36);
      const cap = new THREE.Mesh(D.geo(new THREE.ConeGeometry(0.45, 0.55, 12)), D.tri(th.roof ?? th.mech));
      cap.position.copy(V3(prop.x, prop.y, prop.z + 2.65));
      root.add(cap);
      const hub = new THREE.Group();
      hub.position.copy(V3(prop.x + 0.42, prop.y, prop.z + 2.0));
      const sailMat = D.tri(tone('#FFFBF2'), { side: true });
      for (let i = 0; i < 4; i++) {
        const arm = new THREE.Group();
        arm.rotation.x = (i * Math.PI) / 2;
        const spar = new THREE.Mesh(D.unitBox, D.tri(th.mech));
        spar.scale.set(0.05, 1.35, 0.05);
        spar.position.y = 0.68;
        arm.add(spar);
        const cloth = new THREE.Mesh(D.unitBox, sailMat);
        cloth.scale.set(0.02, 1.05, 0.34);
        cloth.position.set(0.02, 0.78, 0.18);
        arm.add(cloth);
        hub.add(arm);
      }
      root.add(hub);
      addMachUpd(prop.machineId, (ms, _snap, dt) => {
        hub.rotation.x += (0.8 + ms.progress * 3.8) * dt;
      });
      break;
    }

    case 'sea': {
      const sx = prop.x1 - prop.x0, sy = prop.y1 - prop.y0;
      const seaMat = D.basic('#4FA6D8', { opacity: 0.58, side: true });
      const plane = new THREE.Mesh(D.geo(new THREE.PlaneGeometry(sx, sy)), seaMat);
      plane.rotation.x = -Math.PI / 2;
      plane.position.copy(V3((prop.x0 + prop.x1) / 2, (prop.y0 + prop.y1) / 2, 0));
      plane.userData.isRoad = true;
      root.add(plane);

      addCyl(root, prop.gaugeX, prop.gaugeY, 0.11, -0.4, prop.hi + 0.55, D.tri(th.stone), D, 12);
      addCyl(root, prop.gaugeX, prop.gaugeY, 0.145, prop.hi - 0.08, prop.hi + 0.08, D.basic(th.goal), D, 12);

      addMachUpd(prop.machineId, (ms, _snap, _dt, t) => {
        const z = Number(ms.extra?.z ?? 0);
        plane.position.y = z + Math.sin(t * 2.2) * 0.03;
      });
      break;
    }

    case 'pool': {
      const [x0, y0, x1, y1] = prop.pool;
      const w = x1 - x0, h = y1 - y0;
      addBox(root, x0 - 0.14, y0 - 0.14, prop.wz - 0.36, x1 + 0.14, y1 + 0.14, prop.wz - 0.02, D.tri(th.stone, { polyOff: 1 }), D, true);
      const waterMat = D.basic('#88CFE8', { opacity: 0.65, side: true });
      const water = new THREE.Mesh(D.geo(new THREE.PlaneGeometry(w, h)), waterMat);
      water.rotation.x = -Math.PI / 2;
      water.position.copy(V3((x0 + x1) / 2, (y0 + y1) / 2, prop.wz));
      water.userData.isRoad = true;
      root.add(water);

      const ripples = Array.from({ length: 3 }, (_, i) => {
        const r = new THREE.Mesh(
          D.geo(new THREE.RingGeometry(0.18, 0.24, 24)),
          D.basic('#FFFFFF', { opacity: 0, side: true }),
        );
        r.rotation.x = -Math.PI / 2;
        r.position.copy(V3(x0 + w * (0.28 + i * 0.22), y0 + h * (0.35 + (i % 2) * 0.3), prop.wz + 0.015));
        r.userData.isRoad = true;
        root.add(r);
        return r;
      });

      let reflMat: THREE.ShaderMaterial | null = null;
      if (prop.skyRoadPts && prop.skyRoadPts.length >= 2) {
        const sh = prop.skyRoadH ?? 5;
        const skyMat = D.tri(th.deck ?? th.stone, { side: true });
        reflMat = D.tri(tone('#FFF4D2'), { fresh: true, opacity: 0.72, side: true });
        for (let i = 0; i < prop.skyRoadPts.length - 1; i++) {
          const a = prop.skyRoadPts[i], b = prop.skyRoadPts[i + 1];
          const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
          if (len < 0.05) continue;
          const ang = Math.atan2(-(b[1] - a[1]), b[0] - a[0]);
          const mx = (a[0] + b[0]) / 2, my = (a[1] + b[1]) / 2;
          const skySeg = new THREE.Mesh(D.unitBox, skyMat);
          skySeg.scale.set(len + 0.04, 0.22, 0.88);
          skySeg.position.copy(V3(mx, my, prop.wz + sh));
          skySeg.rotation.y = ang;
          root.add(skySeg);

          const reflSeg = new THREE.Mesh(D.unitBox, reflMat);
          reflSeg.scale.set(len + 0.04, 0.04, 0.88);
          reflSeg.position.copy(V3(mx, my, prop.wz + 0.01));
          reflSeg.rotation.y = ang;
          reflSeg.userData.isRoad = true;
          root.add(reflSeg);
        }
      }

      let gateReflMat: THREE.MeshBasicMaterial | null = null;
      if (prop.gate) {
        const gp = prop.gate.pos;
        const gMat = D.tri(th.mech);
        const bar = new THREE.Mesh(D.unitBox, gMat);
        const alongX = prop.gate.axis === 'x';
        bar.scale.set(alongX ? 0.26 : 1.4, prop.gate.h1 - prop.gate.h0, alongX ? 1.4 : 0.26);
        bar.position.copy(V3(gp[0], gp[1], (prop.gate.h0 + prop.gate.h1) / 2));
        root.add(bar);

        gateReflMat = D.basic(th.mech.l, { opacity: 0.55, side: true });
        const refBar = new THREE.Mesh(D.unitBox, gateReflMat);
        refBar.scale.set(alongX ? 0.26 : 1.4, 0.06, alongX ? 1.4 : 0.26);
        refBar.position.copy(V3(gp[0], gp[1], prop.wz + 0.03));
        refBar.userData.isRoad = true;
        root.add(refBar);
      }

      addMachUpd(prop.machineId, (ms, _snap, _dt, t) => {
        const wind = Number(ms.extra?.wind ?? 0);
        const still = Boolean(ms.extra?.still);
        waterMat.color.set(still ? '#A8E6F7' : '#78BED8');
        if (reflMat) {
          reflMat.uniforms.opacity.value = clamp(0.85 - wind * 0.75, 0.12, 0.85);
        }
        if (gateReflMat) {
          gateReflMat.opacity = clamp(0.75 - wind * 0.65, 0.08, 0.75);
        }
        ripples.forEach((r, i) => {
          const f = (t * (0.8 + wind * 1.4) + i * 0.33) % 1;
          r.scale.setScalar(0.5 + f * 3.2);
          (r.material as THREE.MeshBasicMaterial).opacity = wind * (1 - f) * 0.7;
        });
      });
      break;
    }

    case 'doorPair': {
      const makeDoorway = (pos: Vec3, ang: number) => {
        const grp = new THREE.Group();
        grp.position.copy(V3(pos[0], pos[1], pos[2]));
        grp.rotation.y = ang;
        grp.userData.rideThrough = true;
        root.add(grp);

        const stone = D.tri(sp(th, 0));
        const part = (sx: number, sy: number, sz: number, px: number, py: number, pz: number, mat: THREE.Material) => {
          const b = new THREE.Mesh(D.unitBox, mat);
          b.scale.set(sx, sy, sz);
          b.position.set(px, py, pz);
          b.userData.rideThrough = true;
          grp.add(b);
          return b;
        };
        part(0.24, 1.5, 0.24, 0, 0.75, -0.68, stone);
        part(0.24, 1.5, 0.24, 0, 0.75, 0.68, stone);
        part(0.3, 0.22, 1.6, 0, 1.6, 0, stone);
        const bannerM = D.basic('#FFFFFF');
        part(0.08, 0.5, 0.8, 0, 1.97, 0, bannerM);
        part(0.12, 0.08, 0.96, 0, 2.26, 0, stone);

        const skyTop = skyAt(th.sky, 0.05);
        const skyBot = skyAt(th.sky, 0.95);
        const pm = D.mat(
          new THREE.ShaderMaterial({
            uniforms: {
              uT: { value: 0 },
              uC: { value: new THREE.Color('#FFFFFF') },
              uOpen: { value: 0 },
              uMap: { value: null },
              uRes: { value: new THREE.Vector2(1, 1) },
              uSkyA: { value: new THREE.Color(skyTop) },
              uSkyB: { value: new THREE.Color(skyBot) },
            },
            side: THREE.DoubleSide,
            vertexShader: PORTAL_VS,
            fragmentShader: PORTAL_FS,
          }),
        );
        const portal = new THREE.Mesh(D.geo(new THREE.PlaneGeometry(1.12, 1.46)), pm);
        portal.rotation.y = Math.PI / 2;
        portal.position.set(0, 0.745, 0);
        portal.userData.rideThrough = true;
        grp.add(portal);
        return { grp, bannerM, portal, pm };
      };

      const near = makeDoorway(prop.near, prop.nearAng);
      const far = makeDoorway(prop.far, prop.farAng);
      const wantCol = prop.banners[prop.want] ?? '#46D6C2';
      far.bannerM.color.set(wantCol);
      (far.pm.uniforms.uC.value as THREE.Color).set(wantCol);

      const rt = D.rt(new THREE.WebGLRenderTarget(4, 4));
      const vc = new THREE.OrthographicCamera();
      vc.matrixAutoUpdate = false;
      vc.matrixWorldAutoUpdate = false;
      const M = new THREE.Matrix4(), inv = new THREE.Matrix4();
      const size = new THREE.Vector2();
      const prevColor = new THREE.Color();
      let openSmooth = prop.fixed ? 1 : 0;
      let rtAccum = 1;

      portalUpdaters.push((s, dt, t, cam, renderer) => {
        const ms = s.machines.find((mm) => mm.id === prop.machineId);
        const idx = prop.fixed ? prop.want : Number(ms?.extra?.i ?? 0);
        const matched = prop.fixed || Boolean(ms?.extra?.match);
        const col = prop.banners[idx % prop.banners.length] ?? wantCol;
        near.bannerM.color.set(col);
        (near.pm.uniforms.uC.value as THREE.Color).set(col);
        near.pm.uniforms.uT.value = t;
        far.pm.uniforms.uT.value = t;

        openSmooth += ((matched ? 1 : 0) - openSmooth) * Math.min(1, dt * 3.5);
        near.pm.uniforms.uOpen.value = openSmooth;
        if (openSmooth < 0.02) return;

        rtAccum += dt;
        if (rtAccum < 0.04) return;
        rtAccum = 0;

        renderer.getDrawingBufferSize(size);
        const w = Math.max(4, size.x >> 1), h = Math.max(4, size.y >> 1);
        if (rt.width !== w || rt.height !== h) rt.setSize(w, h);
        (near.pm.uniforms.uRes.value as THREE.Vector2).copy(size);

        vc.left = cam.left;
        vc.right = cam.right;
        vc.top = cam.top;
        vc.bottom = cam.bottom;
        vc.near = cam.near;
        vc.far = cam.far;
        vc.zoom = cam.zoom;
        vc.updateProjectionMatrix();

        near.grp.updateMatrixWorld();
        far.grp.updateMatrixWorld();
        M.copy(far.grp.matrixWorld).multiply(inv.copy(near.grp.matrixWorld).invert()).multiply(cam.matrixWorld);
        vc.matrix.copy(M);
        vc.matrixWorld.copy(M);
        vc.matrixWorldInverse.copy(M).invert();
        vc.layers.enableAll();

        const visFar = far.grp.visible, visNear = near.portal.visible;
        far.grp.visible = false;
        near.portal.visible = false;
        const prevRT = renderer.getRenderTarget();
        renderer.getClearColor(prevColor);
        const prevAlpha = renderer.getClearAlpha();
        renderer.setRenderTarget(rt);
        renderer.setClearColor(0x000000, 0);
        renderer.clear();
        renderer.render(root.parent!, vc);
        renderer.setRenderTarget(prevRT);
        renderer.setClearColor(prevColor, prevAlpha);
        far.grp.visible = visFar;
        near.portal.visible = visNear;
        near.pm.uniforms.uMap.value = rt.texture;
      });
      break;
    }

    case 'seamBar': {
      const mat = D.basic('#FFFFFF', { opacity: 0.9, side: true });
      const bar = new THREE.Mesh(D.unitBox, mat);
      if (prop.axis === 'y') bar.scale.set(0.16, 0.08, 1.05);
      else bar.scale.set(1.05, 0.08, 0.16);
      bar.position.copy(V3(prop.pos[0], prop.pos[1], prop.pos[2]));
      bar.userData.isRoad = true;
      root.add(bar);
      addMachUpd(prop.machineId, (ms) => {
        mat.color.set(ms.on ? '#FFD15C' : '#94A3C8');
      });
      break;
    }

    case 'clutchVisual': {
      const a = W3(prop.from), b = W3(prop.to);
      const dir = b.clone().sub(a).normalize();
      const ang = Math.atan2(-dir.z, dir.x);

      const bridgeMat = D.tri(th.mech, { fresh: true });
      const plank = new THREE.Mesh(D.unitBox, bridgeMat);
      plank.scale.set(0.1, 0.24, 0.9);
      plank.position.copy(a);
      plank.rotation.y = ang;
      plank.userData.isRoad = true;
      root.add(plank);

      const dockMat = D.basic('#FFD84D', { opacity: 0.35, side: true });
      const dock = new THREE.Mesh(D.unitBox, dockMat);
      dock.scale.set(0.32, 0.06, 1.02);
      dock.position.copy(b);
      dock.position.y += 0.03;
      dock.rotation.y = ang;
      dock.userData.isRoad = true;
      root.add(dock);

      const warnPos = a.clone().addScaledVector(dir, prop.maxLen);
      const perp = new THREE.Vector3(-dir.z, 0, dir.x);
      const redMat = D.tri(tone('#FF4D4D'));
      for (const s of [-0.52, 0.52]) {
        const post = new THREE.Mesh(D.geo(new THREE.CylinderGeometry(0.07, 0.08, 0.55, 10)), redMat);
        post.position.copy(warnPos).addScaledVector(perp, s);
        post.position.y += 0.26;
        root.add(post);
      }

      addMachUpd(prop.machineId, (ms, _snap, _dt, t) => {
        const len = Math.max(0.08, Number(ms.extra?.len ?? 0));
        const warn = Boolean(ms.extra?.warn);
        const locked = Boolean(ms.extra?.locked);
        const recoiling = Boolean(ms.extra?.recoiling);
        const shudder = recoiling ? Math.sin(t * 48) * 0.06 : warn ? Math.sin(t * 28) * 0.025 : 0;
        plank.scale.x = len;
        plank.position.copy(a).addScaledVector(dir, len / 2).addScaledVector(perp, shudder);
        plank.position.y = a.y - 0.12;
        const pal = recoiling ? tone('#FF4D4D') : locked ? tone('#FFD15C') : warn ? tone('#FF9A2B') : th.mech;
        setTri(bridgeMat, pal);
        dockMat.opacity = locked ? 0.9 : warn ? 0.55 + 0.35 * Math.sin(t * 14) : 0.25;
        dockMat.color.set(warn ? '#FF4D4D' : '#FFD84D');
      });
      break;
    }

    case 'conveyorVisual': {
      const beltLen = Math.abs(prop.dy) * (prop.laneCount + 0.4);
      const signY = Math.sign(prop.dy) || -1;
      const midY = prop.y0 + signY * (beltLen / 2);

      const bedMat = D.tri(th.mechDark ?? th.idle, { polyOff: 1 });
      addBox(root, prop.x - 0.52, Math.min(prop.y0, prop.y0 + signY * beltLen), -0.26, prop.x + 0.52, Math.max(prop.y0, prop.y0 + signY * beltLen), -0.02, bedMat, D, true);

      const slatCount = Math.max(5, Math.round(beltLen / 0.6));
      const slatMat = D.tri(th.mech);
      const slats = Array.from({ length: slatCount }, () => {
        const m = new THREE.Mesh(D.unitBox, slatMat);
        m.scale.set(0.84, 0.04, 0.14);
        m.userData.isRoad = true;
        root.add(m);
        return m;
      });

      const hlMat = D.basic('#FFD84D', { opacity: 0.75, side: true });
      const hl = new THREE.Mesh(D.unitBox, hlMat);
      hl.scale.set(1.16, 0.05, 0.96);
      hl.position.copy(V3(prop.x, midY, 0.02));
      hl.userData.isRoad = true;
      root.add(hl);

      addMachUpd(prop.machineId, (ms, _snap, _dt, t) => {
        const off = Number(ms.extra?.off ?? 0);
        const shift = Number(ms.extra?.shift ?? 1);
        slats.forEach((m, i) => {
          const f = ((i / slatCount) + (off / beltLen)) % 1;
          const y = prop.y0 + signY * ((f < 0 ? f + 1 : f) * beltLen);
          m.position.copy(V3(prop.x, y, 0.005));
        });
        const laneY = prop.y0 + prop.dy * clamp(shift, 1, prop.laneCount);
        hl.position.copy(V3(prop.x, laneY, 0.025));
        hlMat.opacity = ms.on ? 0.55 + 0.25 * Math.sin(t * 6) : 0.18;
      });
      break;
    }

    case 'companionVisual': {
      const a = V3(prop.a[0], prop.a[1], prop.a[2]);
      const b = V3(prop.b[0], prop.b[1], prop.b[2]);
      const len = a.distanceTo(b);
      const dir = b.clone().sub(a).normalize();
      const ang = Math.atan2(-dir.z, dir.x);

      const rail = new THREE.Mesh(D.unitBox, D.tri(th.stone));
      rail.scale.set(len, 0.12, 0.16);
      rail.position.copy(a).lerp(b, 0.5);
      rail.rotation.y = ang;
      root.add(rail);

      if (prop.markDist !== undefined) {
        const ring = new THREE.Mesh(D.geo(new THREE.TorusGeometry(0.45, 0.045, 8, 24)), D.basic(th.goal));
        ring.rotation.x = Math.PI / 2;
        ring.position.copy(a).addScaledVector(dir, prop.markDist);
        ring.position.y += 0.04;
        root.add(ring);
      }

      const blockMat = D.tri(th.mech, { fresh: true });
      const block = new THREE.Mesh(D.unitBox, blockMat);
      block.scale.set(1.3, 1.3, 1.0);
      root.add(block);

      addMachUpd(prop.machineId, (ms) => {
        const tv = clamp(Number(ms.extra?.t ?? 0), 0, 1);
        block.position.copy(a).lerp(b, tv);
        setTri(blockMat, ms.on ? tone('#FFD15C') : th.mech);
      });
      break;
    }

    case 'liftColumn': {
      const maxH = prop.zBase + prop.floors * prop.step + 0.4;
      addCyl(root, prop.x, prop.y, 0.28, prop.zBase - 1.5, maxH, D.tri(th.stone), D, 16);

      const collars: THREE.MeshBasicMaterial[] = [];
      for (let i = 0; i <= prop.floors; i++) {
        const fz = prop.zBase + i * prop.step;
        const cMat = D.basic(th.idle.l);
        const col = new THREE.Mesh(D.geo(new THREE.CylinderGeometry(0.38, 0.38, 0.1, 18)), cMat);
        col.position.copy(V3(prop.x, prop.y, fz - 0.15));
        root.add(col);
        collars.push(cMat);
      }

      const liftG = getGroup(`g_${prop.machineId}`);
      if (prop.deckBox) {
        const [bx0, by0, bx1, by1] = prop.deckBox;
        addBox(liftG, bx0, by0, -0.38, bx1, by1, -0.04, D.tri(th.mech, { polyOff: 1 }), D, true);
      }
      if (prop.trees) {
        for (const [tx, ty] of prop.trees) {
          buildVisualProp({ kind: 'tree', x: tx, y: ty, z: 0, s: 0.75, groupId: `g_${prop.machineId}` }, ctx);
        }
      }

      addMachUpd(prop.machineId, (ms) => {
        const fi = Number(ms.extra?.floorIdx ?? -1);
        collars.forEach((cm, i) => {
          cm.color.set(i === fi ? '#FFD84D' : th.idle.l);
        });
      });
      break;
    }

    case 'turntableVisual': {
      const [px, py, pz] = prop.pivot;
      // Stationary pedestal column cleanly beneath the turntable drum
      addCyl(root, px, py, prop.rad * 0.46, pz - 2.6, pz - 0.4, D.tri(th.stone), D, 18);
      // Rotating drum sits cleanly underneath the road's -0.24 underside (top at -0.25 -> zero z-fighting!)
      const grp = getGroup(`g_${prop.machineId}`);
      const disc = new THREE.Mesh(
        D.geo(new THREE.CylinderGeometry(prop.rad * 0.98, prop.rad * 1.04, 0.16, 28)),
        D.tri(th.mechDark ?? th.mech, { polyOff: 1 }),
      );
      disc.position.y = -0.33;
      disc.userData.isRoad = true;
      grp.add(disc);
      break;
    }

    case 'crossDiscVisual': {
      const [cx, cy, cz] = prop.center;
      addCyl(root, cx, cy, prop.rad * 0.65, cz - 2.6, cz - 0.4, D.tri(th.stone), D, 24);
      const grp = getGroup(`g_${prop.machineId}`);
      // Drum sits cleanly underneath the cross-disc road curves (top at -0.25) with a stepped bevel rim
      const disc = new THREE.Mesh(
        D.geo(new THREE.CylinderGeometry(prop.rad * 1.04, prop.rad * 1.08, 0.18, 36)),
        D.tri(th.mechDark ?? th.mech, { polyOff: 1 }),
      );
      disc.position.y = -0.34;
      disc.userData.isRoad = true;
      grp.add(disc);
      break;
    }

    case 'seesawVisual': {
      const [px, py, pz] = prop.pivot;
      addCyl(root, px, py, 0.42, pz - 2.2, pz - 0.28, D.tri(th.stone), D, 12, 0.22);
      const glowMat = D.basic('#FFD84D', { opacity: 0.25 });
      const bar = new THREE.Mesh(D.unitBox, glowMat);
      bar.scale.set(0.9, 0.14, 0.9);
      bar.position.copy(V3(px, py, pz - 0.34));
      root.add(bar);
      addMachUpd(prop.machineId, (ms) => {
        const c = Number(ms.extra?.c ?? 0);
        glowMat.opacity = 0.2 + c * 0.8;
        glowMat.color.set(c >= 0.85 ? '#2BD96B' : '#FFD84D');
        bar.scale.y = 0.14 + c * 0.35;
      });
      break;
    }

    case 'cameraDial': {
      const [px, py, pz] = prop.pos;
      addCyl(root, px, py, 0.56, pz - 0.14, pz, D.tri(th.stone), D, 24);
      const needle = new THREE.Mesh(D.unitBox, D.basic(th.goal));
      needle.scale.set(0.42, 0.05, 0.08);
      needle.position.copy(V3(px, py, pz + 0.04));
      root.add(needle);
      addMachUpd(prop.machineId, (ms) => {
        const ang = Number(ms.extra?.ang ?? 0);
        needle.rotation.y = ang * DEG;
      });
      break;
    }

    case 'windSockVisual': {
      addCyl(root, prop.x, prop.y, 0.05, prop.z, prop.z + 1.8, D.tri(tone(th.ink)), D, 8);
      const sock = new THREE.Group();
      sock.position.copy(V3(prop.x, prop.y, prop.z + 1.65));
      for (let i = 0; i < 4; i++) {
        const seg = new THREE.Mesh(
          D.geo(new THREE.CylinderGeometry(0.16 - i * 0.025, 0.18 - i * 0.025, 0.26, 10)),
          D.tri(tone(i % 2 ? '#FFFFFF' : '#FF5A3D')),
        );
        seg.rotation.z = -Math.PI / 2;
        seg.position.x = 0.18 + i * 0.24;
        sock.add(seg);
      }
      root.add(sock);
      addMachUpd(prop.machineId, (ms, _snap, _dt, t) => {
        const ang = Number(ms.extra?.ang ?? 0);
        sock.rotation.y = -(ang * DEG) + Math.sin(t * 5) * 0.06;
      });
      break;
    }

    case 'drawbridgeVisual': {
      const [hx, hy, hz] = prop.hinge;
      addCyl(root, hx, hy, 0.14, hz - 0.35, hz + 0.15, D.tri(th.mechDark ?? th.stone), D, 12);
      break;
    }

    case 'cubeVisual': {
      const { h, H, cr, storey } = prop;
      const R2 = cr - 0.02;
      const cube = new THREE.Group();
      root.add(cube);

      // Stationary stepped circular plinth underneath the rotating tower
      addCyl(root, 0, 0, h * 1.75, -3.6, -0.62, D.tri(th.idle), D, 48);
      addCyl(root, 0, 0, h * 1.55, -0.62, -0.32, D.tri(th.roof ?? th.stone), D, 48);
      addCyl(root, 0, 0, h * 1.42, -0.32, -0.02, D.tri(sp(th, 0)), D, 48);
      addCyl(root, 0, 0, h * 1.36, -0.02, 0, D.tri(th.roof ?? th.stone), D, 48);

      // Rounded tower body (polyOff: 1 keeps wall-wrapped roads razor sharp with zero z-fighting!)
      const stone = D.tri(sp(th, 0), { polyOff: 1 });
      addBox(cube, -h + R2, -h, 0, h - R2, h, H, stone, D);
      addBox(cube, -h, -h + R2, 0, h, h - R2, H, stone, D);
      for (const [sx, sy] of [[1, 1], [1, -1], [-1, 1], [-1, -1]] as const) {
        addCyl(cube, sx * (h - R2), sy * (h - R2), R2, 0, H, stone, D, 20);
      }

      // Thin flush storey cornice line separating lower and upper storeys
      const trimMat = D.tri(th.roof ?? th.idle, { polyOff: 1 });
      addBox(cube, -h - 0.02, -h + R2, storey - 0.12, h + 0.02, h - R2, storey - 0.04, trimMat, D);
      addBox(cube, -h + R2, -h - 0.02, storey - 0.12, h - R2, h + 0.02, storey - 0.04, trimMat, D);

      // Roof cornice & 4 corner finials
      addBox(cube, -h - 0.14, -h - 0.14, H, h + 0.14, h + 0.14, H + 0.14, D.tri(th.roof ?? th.stone, { polyOff: 1 }), D);
      for (const [sx, sy] of [[1, 1], [1, -1], [-1, 1], [-1, -1]] as const) {
        const fx = sx * (h - 0.05), fy = sy * (h - 0.05);
        addCyl(cube, fx, fy, 0.2, H + 0.14, H + 0.5, D.tri(th.roof ?? th.stone), D, 14);
        const cone = new THREE.Mesh(D.geo(new THREE.ConeGeometry(0.24, 0.55, 14)), D.tri(th.mech));
        cone.position.copy(V3(fx, fy, H + 0.77));
        cube.add(cone);
      }

      ctx.onCubeGroup(cube);
      break;
    }
  }
}

export function eventSparkColor(e: SimEvent, th: ThemeDef): string {
  switch (e.kind) {
    case 'perspJoin': return '#FFE25A';
    case 'key': return '#FFD84D';
    case 'gateOpen': return '#FFD15C';
    case 'latch': return th.mech.t;
    case 'win':
    case 'chapterWin': return th.goal;
    default: return th.spark;
  }
}
