// Authored in the bike's local frame (+Z is aft). The links turn about one
// another. Gathering the chain changes its curvature, never its length.
import { easeBetween } from './deck';
import { WIDTH } from './track';

export const linkCount = 16;
const pitch = 0.195;
export const SWING = 0.6;
export const rivalSwing = 0.4;
export const drawnPhase = 0.22;

export function sweepGesture(t: number) {
  const gather = easeBetween(t, 0, drawnPhase) * (1 - easeBetween(t, drawnPhase, 0.53));
  const follow = easeBetween(t, drawnPhase, 0.63) * (1 - easeBetween(t, 0.68, 1));
  const lift = easeBetween(t, 0, 0.24) * (1 - easeBetween(t, 0.68, 1));
  return {
    x: 0.54 + 0.23 * gather + 0.35 * follow,
    y: 1.21 + 0.41 * lift,
    z: -0.48 + 0.75 * gather - 0.2 * follow,
    twist: -0.52 * gather + 0.56 * follow,
  };
}

// Carried links hang in a vertical bight along the flank of the pod.
const carryAngles = Array.from({ length: linkCount }, (_, i) => {
  const fold = 0.16 + 3.65 * easeBetween((i + 0.5) / linkCount, 0.37, 0.75);
  return {
    yaw: Math.atan2(Math.cos(fold), 0.075),
    elevation: Math.atan2(-Math.sin(fold), Math.hypot(0.075, Math.cos(fold))),
  };
});
export function chainPath(t: number, side: number, points: Float32Array) {
  points[0] = points[1] = points[2] = 0;
  for (let i = 0; i < linkCount; i++) {
    const u = (i + 0.5) / linkCount;
    const local = t - 0.12 * u;
    const open = easeBetween(local, 0.015, 0.31) * (1 - easeBetween(local, 0.66, 0.88));
    const carry = carryAngles[i];
    const sweep = 1.62 - 2.92 * easeBetween(local, 0.2, 0.66);
    const yaw = carry.yaw + (sweep - carry.yaw) * open;
    const elevation = carry.elevation + open * (0.24 * Math.sin(Math.PI * t) - 0.32 * u - carry.elevation);
    const j = i * 3,
      horizontal = pitch * Math.cos(elevation);
    points[j + 3] = points[j] + side * horizontal * Math.cos(yaw);
    points[j + 4] = points[j + 1] + pitch * Math.sin(elevation);
    points[j + 5] = points[j + 2] + horizontal * Math.sin(yaw);
  }
}

export function inReach(gap: number, across: number, side: number) {
  return Math.abs(gap) < 3.8 && across * side > 0.05 && across * side < 0.88;
}

export function swingConnects(gap: number, across: number, side: number, t: number) {
  if (t < drawnPhase || t > 0.76 || !inReach(gap, across, side)) return false;
  const path = new Float32Array((linkCount + 1) * 3);
  chainPath(t, side, path);
  const grip = sweepGesture(t);
  // The rival's footprint is longer than it is wide. Test the swept steel
  // against that footprint, including a bent chain at either end of the arc.
  const x = across * WIDTH - side * grip.x,
    z = (-gap - grip.z) * 0.68;
  for (let i = 0; i < linkCount * 3; i += 3) {
    const dx = path[i + 3] - path[i],
      dz = (path[i + 5] - path[i + 2]) * 0.68;
    const rx = x - path[i],
      rz = z - path[i + 2] * 0.68;
    const along = Math.max(0, Math.min(1, (rx * dx + rz * dz) / (dx * dx + dz * dz)));
    if (Math.hypot(rx - along * dx, rz - along * dz) < 0.9) return true;
  }
  return false;
}
