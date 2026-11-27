/**
 * Pure 3D math, rigid/affine transforms, orthographic isometric projection,
 * ray-vs-OBB occlusion tests, and deterministic PRNG for Penrose Pedals sim.
 * Zero Three.js or DOM imports so the full simulation runs deterministically in Node.
 */

export type Vec2 = [number, number];
export type Vec3 = [number, number, number];
/** Column-major 4x4 matrix (same layout as WebGL / Three.js Matrix4.elements). */
export type Mat4 = [
  number, number, number, number,
  number, number, number, number,
  number, number, number, number,
  number, number, number, number,
];
/** Unit quaternion [x, y, z, w]. */
export type Quat = [number, number, number, number];

export const TAU = Math.PI * 2;
export const DEG = Math.PI / 180;
export const UP_SKETCH: Vec3 = [0, 0, 1];
export const Y_UP: Vec3 = [0, 1, 0];

/** Sketch coords (x, y = depth, z = up) -> Three/world coords (x, z, y). */
export const V = (x: number, y: number, z: number): Vec3 => [x, z, y];
/** World coords (x, y = up, z = depth) -> Sketch coords (x, z, y). */
export const toSketch = (p: Vec3): Vec3 => [p[0], p[2], p[1]];

export const clamp = (v: number, a: number, b: number): number => (v < a ? a : v > b ? b : v);
export const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;
export const easeOut3 = (t: number): number => 1 - Math.pow(1 - clamp(t, 0, 1), 3);
export const easeIO3 = (t: number): number => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

/** Deterministic Mulberry32 PRNG matching the prototype's level generators. */
export function mulberry(seed: number): () => number {
  let a = seed | 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ---- Vec2 ----
export const v2Add = (a: Vec2, b: Vec2): Vec2 => [a[0] + b[0], a[1] + b[1]];
export const v2Sub = (a: Vec2, b: Vec2): Vec2 => [a[0] - b[0], a[1] - b[1]];
export const v2Scale = (a: Vec2, s: number): Vec2 => [a[0] * s, a[1] * s];
export const v2Dot = (a: Vec2, b: Vec2): number => a[0] * b[0] + a[1] * b[1];
export const v2Len = (a: Vec2): number => Math.hypot(a[0], a[1]);
export const v2Dist = (a: Vec2, b: Vec2): number => Math.hypot(a[0] - b[0], a[1] - b[1]);
export const v2Norm = (a: Vec2): Vec2 => {
  const l = Math.hypot(a[0], a[1]);
  return l > 1e-12 ? [a[0] / l, a[1] / l] : [0, 0];
};

// ---- Vec3 ----
export const v3Add = (a: Vec3, b: Vec3): Vec3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
export const v3AddScaled = (a: Vec3, b: Vec3, s: number): Vec3 => [a[0] + b[0] * s, a[1] + b[1] * s, a[2] + b[2] * s];
export const v3Sub = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
export const v3Scale = (a: Vec3, s: number): Vec3 => [a[0] * s, a[1] * s, a[2] * s];
export const v3Neg = (a: Vec3): Vec3 => [-a[0], -a[1], -a[2]];
export const v3Dot = (a: Vec3, b: Vec3): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
export const v3Cross = (a: Vec3, b: Vec3): Vec3 => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];
export const v3Len = (a: Vec3): number => Math.hypot(a[0], a[1], a[2]);
export const v3Dist = (a: Vec3, b: Vec3): number => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
export const v3Norm = (a: Vec3): Vec3 => {
  const l = Math.hypot(a[0], a[1], a[2]);
  return l > 1e-12 ? [a[0] / l, a[1] / l, a[2] / l] : [0, 1, 0];
};
export const v3Lerp = (a: Vec3, b: Vec3, t: number): Vec3 => [
  a[0] + (b[0] - a[0]) * t,
  a[1] + (b[1] - a[1]) * t,
  a[2] + (b[2] - a[2]) * t,
];

// ---- Quat ----
export const quatIdentity = (): Quat => [0, 0, 0, 1];

export function quatFromAxisAngle(axis: Vec3, rad: number): Quat {
  const n = v3Norm(axis);
  const h = rad * 0.5;
  const s = Math.sin(h);
  return [n[0] * s, n[1] * s, n[2] * s, Math.cos(h)];
}

export function quatFromUnitVectors(from: Vec3, to: Vec3): Quat {
  const f = v3Norm(from), t = v3Norm(to);
  const r = v3Dot(f, t) + 1;
  if (r < 1e-6) {
    const ortho: Vec3 = Math.abs(f[0]) > Math.abs(f[2]) ? [-f[1], f[0], 0] : [0, -f[2], f[1]];
    const n = v3Norm(ortho);
    return [n[0], n[1], n[2], 0];
  }
  const c = v3Cross(f, t);
  const l = Math.hypot(c[0], c[1], c[2], r);
  return [c[0] / l, c[1] / l, c[2] / l, r / l];
}

export function quatMul(a: Quat, b: Quat): Quat {
  const [ax, ay, az, aw] = a, [bx, by, bz, bw] = b;
  return [
    aw * bx + ax * bw + ay * bz - az * by,
    aw * by - ax * bz + ay * bw + az * bx,
    aw * bz + ax * by - ay * bx + az * bw,
    aw * bw - ax * bx - ay * by - az * bz,
  ];
}

export function quatSlerp(a: Quat, b: Quat, t: number): Quat {
  let [bx, by, bz, bw] = b;
  let dot = a[0] * bx + a[1] * by + a[2] * bz + a[3] * bw;
  if (dot < 0) { dot = -dot; bx = -bx; by = -by; bz = -bz; bw = -bw; }
  if (dot > 0.9995) {
    const q: Quat = [lerp(a[0], bx, t), lerp(a[1], by, t), lerp(a[2], bz, t), lerp(a[3], bw, t)];
    const l = Math.hypot(q[0], q[1], q[2], q[3]) || 1;
    return [q[0] / l, q[1] / l, q[2] / l, q[3] / l];
  }
  const theta0 = Math.acos(clamp(dot, -1, 1));
  const theta = theta0 * t;
  const sin0 = Math.sin(theta0);
  const s0 = Math.cos(theta) - dot * Math.sin(theta) / sin0;
  const s1 = Math.sin(theta) / sin0;
  return [a[0] * s0 + bx * s1, a[1] * s0 + by * s1, a[2] * s0 + bz * s1, a[3] * s0 + bw * s1];
}

export function quatRotateVec(q: Quat, v: Vec3): Vec3 {
  const [qx, qy, qz, qw] = q;
  const ix = qw * v[0] + qy * v[2] - qz * v[1];
  const iy = qw * v[1] + qz * v[0] - qx * v[2];
  const iz = qw * v[2] + qx * v[1] - qy * v[0];
  const iw = -qx * v[0] - qy * v[1] - qz * v[2];
  return [
    ix * qw + iw * -qx + iy * -qz - iz * -qy,
    iy * qw + iw * -qy + iz * -qx - ix * -qz,
    iz * qw + iw * -qz + ix * -qy - iy * -qx,
  ];
}

// ---- Mat4 (column-major) ----
export const matIdentity = (): Mat4 => [
  1, 0, 0, 0,
  0, 1, 0, 0,
  0, 0, 1, 0,
  0, 0, 0, 1,
];

export function matFromPosQuat(pos: Vec3, q: Quat = [0, 0, 0, 1]): Mat4 {
  const [x, y, z, w] = q;
  const x2 = x + x, y2 = y + y, z2 = z + z;
  const xx = x * x2, xy = x * y2, xz = x * z2;
  const yy = y * y2, yz = y * z2, zz = z * z2;
  const wx = w * x2, wy = w * y2, wz = w * z2;
  return [
    1 - (yy + zz), xy + wz, xz - wy, 0,
    xy - wz, 1 - (xx + zz), yz + wx, 0,
    xz + wy, yz - wx, 1 - (xx + yy), 0,
    pos[0], pos[1], pos[2], 1,
  ];
}

export function matFromPosRotY(pos: Vec3, rotY: number): Mat4 {
  const c = Math.cos(rotY), s = Math.sin(rotY);
  return [
    c, 0, -s, 0,
    0, 1, 0, 0,
    s, 0, c, 0,
    pos[0], pos[1], pos[2], 1,
  ];
}

export function matFromPosRotX(pos: Vec3, rotX: number): Mat4 {
  const c = Math.cos(rotX), s = Math.sin(rotX);
  return [
    1, 0, 0, 0,
    0, c, s, 0,
    0, -s, c, 0,
    pos[0], pos[1], pos[2], 1,
  ];
}

export function matFromPosRotZ(pos: Vec3, rotZ: number): Mat4 {
  const c = Math.cos(rotZ), s = Math.sin(rotZ);
  return [
    c, s, 0, 0,
    -s, c, 0, 0,
    0, 0, 1, 0,
    pos[0], pos[1], pos[2], 1,
  ];
}

export function matFromBasisPos(bx: Vec3, by: Vec3, bz: Vec3, pos: Vec3): Mat4 {
  return [
    bx[0], bx[1], bx[2], 0,
    by[0], by[1], by[2], 0,
    bz[0], bz[1], bz[2], 0,
    pos[0], pos[1], pos[2], 1,
  ];
}

export function matMul(a: Mat4, b: Mat4): Mat4 {
  const out = new Array<number>(16) as Mat4;
  for (let col = 0; col < 4; col++) {
    const b0 = b[col * 4], b1 = b[col * 4 + 1], b2 = b[col * 4 + 2], b3 = b[col * 4 + 3];
    out[col * 4] = a[0] * b0 + a[4] * b1 + a[8] * b2 + a[12] * b3;
    out[col * 4 + 1] = a[1] * b0 + a[5] * b1 + a[9] * b2 + a[13] * b3;
    out[col * 4 + 2] = a[2] * b0 + a[6] * b1 + a[10] * b2 + a[14] * b3;
    out[col * 4 + 3] = a[3] * b0 + a[7] * b1 + a[11] * b2 + a[15] * b3;
  }
  return out;
}

export function transformPoint(m: Mat4, p: Vec3): Vec3 {
  return [
    m[0] * p[0] + m[4] * p[1] + m[8] * p[2] + m[12],
    m[1] * p[0] + m[5] * p[1] + m[9] * p[2] + m[13],
    m[2] * p[0] + m[6] * p[1] + m[10] * p[2] + m[14],
  ];
}

export function transformDir(m: Mat4, d: Vec3): Vec3 {
  return v3Norm([
    m[0] * d[0] + m[4] * d[1] + m[8] * d[2],
    m[1] * d[0] + m[5] * d[1] + m[9] * d[2],
    m[2] * d[0] + m[6] * d[1] + m[10] * d[2],
  ]);
}

/** Invert a rigid (orthonormal rotation + translation) Mat4. */
export function invertRigid(m: Mat4): Mat4 {
  const r00 = m[0], r01 = m[4], r02 = m[8];
  const r10 = m[1], r11 = m[5], r12 = m[9];
  const r20 = m[2], r21 = m[6], r22 = m[10];
  const tx = m[12], ty = m[13], tz = m[14];
  return [
    r00, r01, r02, 0,
    r10, r11, r12, 0,
    r20, r21, r22, 0,
    -(r00 * tx + r10 * ty + r20 * tz),
    -(r01 * tx + r11 * ty + r21 * tz),
    -(r02 * tx + r12 * ty + r22 * tz),
    1,
  ];
}

// ---- Isometric camera projection ----
const INV_SQRT3 = 1 / Math.sqrt(3);
export const SD0: Vec3 = [INV_SQRT3, INV_SQRT3, INV_SQRT3];

export interface IsoBasis {
  /** Screen right (world unit vector). */
  R: Vec3;
  /** Screen up (world unit vector). */
  U: Vec3;
  /** Toward camera (world unit vector). */
  D: Vec3;
  center: Vec3;
}

export function rotateY(v: Vec3, rad: number): Vec3 {
  const c = Math.cos(rad), s = Math.sin(rad);
  return [v[0] * c + v[2] * s, v[1], -v[0] * s + v[2] * c];
}

/** Exact orthonormal camera basis matching Three.js OrthographicCamera at center + 120 * rotateY(SD0, yaw), lookAt(center), rotateZ(roll). */
export function makeIsoBasis(center: Vec3, yawRad: number, rollRad = 0): IsoBasis {
  const D = rotateY(SD0, yawRad);
  const R0 = v3Norm(v3Cross(Y_UP, D));
  const U0 = v3Cross(D, R0);
  if (Math.abs(rollRad) < 1e-9) return { R: R0, U: U0, D, center };
  const c = Math.cos(rollRad), s = Math.sin(rollRad);
  const R: Vec3 = [R0[0] * c + U0[0] * s, R0[1] * c + U0[1] * s, R0[2] * c + U0[2] * s];
  const U: Vec3 = [-R0[0] * s + U0[0] * c, -R0[1] * s + U0[1] * c, -R0[2] * s + U0[2] * c];
  return { R, U, D, center };
}

export function projectPoint(p: Vec3, b: IsoBasis): Vec2 {
  const dx = p[0] - b.center[0], dy = p[1] - b.center[1], dz = p[2] - b.center[2];
  return [
    dx * b.R[0] + dy * b.R[1] + dz * b.R[2],
    dx * b.U[0] + dy * b.U[1] + dz * b.U[2],
  ];
}

export function projectDir(d: Vec3, b: IsoBasis): Vec2 {
  return v2Norm([
    d[0] * b.R[0] + d[1] * b.R[1] + d[2] * b.R[2],
    d[0] * b.U[0] + d[1] * b.U[1] + d[2] * b.U[2],
  ]);
}

export function cameraDepth(p: Vec3, b: IsoBasis): number {
  return (p[0] - b.center[0]) * b.D[0] + (p[1] - b.center[1]) * b.D[1] + (p[2] - b.center[2]) * b.D[2] - 120;
}

export function unprojectCam(sx: number, sy: number, camZ: number, b: IsoBasis): Vec3 {
  const dz = camZ + 120;
  return [
    b.center[0] + b.R[0] * sx + b.U[0] * sy + b.D[0] * dz,
    b.center[1] + b.R[1] * sx + b.U[1] * sy + b.D[1] * dz,
    b.center[2] + b.R[2] * sx + b.U[2] * sy + b.D[2] * dz,
  ];
}

// ---- 2D segment intersection (for falling wheel catching lower roads) ----
export function segHit2D(p: Vec2, p2: Vec2, a: Vec2, b: Vec2): [number, number] | null {
  const rx = p2[0] - p[0], ry = p2[1] - p[1];
  const sx = b[0] - a[0], sy = b[1] - a[1];
  const den = rx * sy - ry * sx;
  if (Math.abs(den) < 1e-9) return null;
  const qx = a[0] - p[0], qy = a[1] - p[1];
  const t = (qx * sy - qy * sx) / den;
  const u = (qx * ry - qy * rx) / den;
  return t >= 0 && t <= 1 && u >= 0 && u <= 1 ? [t, u] : null;
}

// ---- Ray vs Oriented Bounding Box (for hidden-gap / live-gap occlusion) ----
export interface OccluderBox {
  /** Local AABB min/max in Three/world units before transform. */
  min: Vec3;
  max: Vec3;
  /** Rigid transform into world space (omit for static world-space box). */
  transform?: () => Mat4;
}

/** Distance along ray `orig + t * dir` (unit dir) to OBB, or Infinity if missed. */
export function rayHitsOBB(orig: Vec3, dir: Vec3, box: OccluderBox): number {
  let o = orig, d = dir;
  if (box.transform) {
    const inv = invertRigid(box.transform());
    o = transformPoint(inv, orig);
    d = transformDir(inv, dir);
  }
  let tmin = 0, tmax = Infinity;
  for (let i = 0; i < 3; i++) {
    const di = d[i];
    if (Math.abs(di) < 1e-9) {
      if (o[i] < box.min[i] || o[i] > box.max[i]) return Infinity;
    } else {
      let t1 = (box.min[i] - o[i]) / di;
      let t2 = (box.max[i] - o[i]) / di;
      if (t1 > t2) { const tmp = t1; t1 = t2; t2 = tmp; }
      if (t1 > tmin) tmin = t1;
      if (t2 < tmax) tmax = t2;
      if (tmin > tmax) return Infinity;
    }
  }
  return tmin >= 0 ? tmin : Infinity;
}

/** True if every sample along segment pa..pb (dropped 0.1 in world Y) is hidden behind at least one OBB from view direction D. */
export function isGapHidden(pa: Vec3, pb: Vec3, boxes: readonly OccluderBox[], D: Vec3): boolean {
  if (!boxes.length) return false;
  const rayDir: Vec3 = [-D[0], -D[1], -D[2]];
  for (let i = 0; i <= 8; i++) {
    const f = i / 8;
    const px = lerp(pa[0], pb[0], f);
    const py = lerp(pa[1], pb[1], f) - 0.1;
    const pz = lerp(pa[2], pb[2], f);
    const orig: Vec3 = [px + D[0] * 150, py + D[1] * 150, pz + D[2] * 150];
    let hit = false;
    for (const box of boxes) {
      if (rayHitsOBB(orig, rayDir, box) < 149.7) { hit = true; break; }
    }
    if (!hit) return false;
  }
  return true;
}

/** Camera view vector in sketch coords at yaw degrees (matches persp.ts / gen9.ts `viewDir`). */
export function viewDirSketch(yawDeg: number): Vec3 {
  const a = yawDeg * DEG;
  return [Math.cos(a) + Math.sin(a), Math.cos(a) - Math.sin(a), 1];
}

/** Point k units behind p along the camera line of sight at yawDeg (sketch coords). */
export function behindSketch(p: Vec3, yawDeg: number, k: number): Vec3 {
  const d = viewDirSketch(yawDeg);
  return [p[0] - k * d[0], p[1] - k * d[1], p[2] - k * d[2]];
}

/** 2D unit direction from heading degrees (sketch x-y plane). */
export const dir2D = (deg: number): Vec2 => [Math.cos(deg * DEG), Math.sin(deg * DEG)];
