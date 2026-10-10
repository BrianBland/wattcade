// Pure chase-camera math (tested): lags vertical follow in the air and pulls back so airtime reads on screen.
export interface CamTun { airLag: number; groundLag: number; airPull: number; airRise: number; airFov: number; lookMix: number }
export interface CamState { y: number; air: number }
export interface CamIn { x: number; y: number; z: number; heading: number; air: boolean; airS: number; groundY: number; onBike: boolean }
export interface CamOut { pos: [number, number, number]; look: [number, number, number]; fov: number }

export const BASE_FOV = 60;
export function stepCam(st: CamState, r: CamIn, tun: CamTun, dt: number): CamOut {
  const k = (rate: number) => 1 - Math.exp(-rate * dt);
  const targetY = r.air ? r.groundY + (r.y - r.groundY) * 0.35 : r.y;
  st.y += (targetY - st.y) * k(r.air ? tun.airLag : tun.groundLag);
  const airTarget = r.air ? Math.min(1, r.airS / 0.6) : 0;
  st.air += (airTarget - st.air) * k(r.air ? 4 : 2);
  const back = (r.onBike ? 9 : 6) + tun.airPull * st.air;
  const fx = Math.sin(r.heading), fz = Math.cos(r.heading);
  const camY = Math.max(st.y, -1) + 4.5 + tun.airRise * st.air;
  const lookGround = r.groundY + 1, lookRider = r.y + 1.2;
  const lookY = lookRider + (lookGround + (lookRider - lookGround) * tun.lookMix - lookRider) * st.air;
  return { pos: [r.x - fx * back, camY, r.z - fz * back], look: [r.x + fx * 4, lookY, r.z + fz * 4], fov: BASE_FOV + tun.airFov * st.air };
}

/** Vertical angle (deg) of point p seen from the camera relative to its look direction (for framing tests). */
export function pitchOffsetDeg(c: CamOut, p: [number, number, number]): number {
  const ang = (q: [number, number, number]) => Math.atan2(q[1] - c.pos[1], Math.hypot(q[0] - c.pos[0], q[2] - c.pos[2]));
  return ((ang(p) - ang(c.look)) * 180) / Math.PI;
}
