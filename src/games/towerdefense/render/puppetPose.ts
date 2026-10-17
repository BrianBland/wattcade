/** Parts use absolute rest-frame coordinates; only parent motion is inherited. */
export interface RigPart {
  name: string; parent: string | null; pivot: number[]; aims?: boolean;
  recoil?: { distancePx: number; axis?: number[] };
}
export type Pose = [number, number, number, number, number, number];
export interface RigMotion { angle: number; revs: number; age: number }

function multiply(a: Pose, b: Pose): Pose {
  return [a[0] * b[0] + a[2] * b[1], a[1] * b[0] + a[3] * b[1],
    a[0] * b[2] + a[2] * b[3], a[1] * b[2] + a[3] * b[3],
    a[0] * b[4] + a[2] * b[5] + a[4], a[1] * b[4] + a[3] * b[5] + a[5]];
}
function rotation(angle: number, [x, y]: number[]): Pose {
  const c = Math.cos(angle), s = Math.sin(angle);
  return [c, s, -s, c, x - c * x + s * y, y - s * x - c * y];
}
/** Shared by part pixels, effect strips and muzzle anchors so shots follow the actual pose. */
export function partPose(parts: readonly RigPart[], name: string | undefined, motion: RigMotion): Pose {
  const p = parts.find(p => p.name === name);
  if (!p) return [1, 0, 0, 1, 0, 0];
  let pose = partPose(parts, p.parent ?? undefined, motion);
  if (p.aims) pose = multiply(pose, rotation(motion.angle, p.pivot));
  if (p.name === 'flywheel') pose = multiply(pose, rotation(motion.revs * Math.PI * 2, p.pivot));
  if (p.recoil) {
    const d = p.recoil.distancePx * Math.max(0, 1 - Math.max(0, motion.age) / 0.3);
    const [x, y] = p.recoil.axis ?? [0, 1];
    pose = multiply(pose, [1, 0, 0, 1, x * d, y * d]);
  }
  return pose;
}
export function posedPoint(pose: Pose, [x, y]: number[]) {
  return { x: pose[0] * x + pose[2] * y + pose[4], y: pose[1] * x + pose[3] * y + pose[5] };
}
