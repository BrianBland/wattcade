// Pure camera math for the Watershed renderer (unit-tested, no three.js): fitting the overhead diorama view to the
// screen shape. Wide screens turn the view sideways (spring left, sea right) so the long valley fills the width.

export interface V3 { x: number; y: number; z: number }

/** World-space outline of the valley: X downstream (screen right in grid terms), Z across, Y up. */
export interface ValleyOutline { x0: number; x1: number; zHalf: number; heights: Array<[number, number]> }

/**
 * The valley as the overhead view must show it. `heights` are [grid row → world X fraction 0..1, ridge height] pairs
 * along the valley, so the steep head of the valley (high ground near the spring) is kept on screen too.
 */
export function valleyOutline(nx: number, ny: number): ValleyOutline {
  return { x0: -ny / 2, x1: ny / 2 + 4, zHalf: nx / 2, heights: [[0, 46], [0.28, 32], [0.5, 20], [0.78, 6], [1, 0]] };
}

/**
 * Pitch (radians below horizontal) of the overhead view. Upright (portrait / square): the steep look-down up the
 * valley. Sideways: a little steeper still, since the valley's width now runs up the screen and foreshortens.
 */
export function overheadPitch(sideways: boolean): number {
  return ((sideways ? 58 : 64) * Math.PI) / 180;
}

/**
 * Frame the overhead view. Upright, the camera looks up the valley (toward −X; screen right = −Z, across the valley);
 * sideways, it looks across from the near (+Z) side (toward −Z; screen right = +X, downstream), which is the upright
 * view turned a quarter turn: upstream is screen-left and steering "right" is screen-up. We pick the target and the
 * distance so every outline point projects inside the usable band [yLo, yHi] (NDC, −1 bottom … 1 top) and
 * |x| ≤ margin, as close as possible. `aspect` = W / H of the whole surface; `fovY` in radians.
 */
export function fitOverhead(o: ValleyOutline, fovY: number, aspect: number, yLo: number, yHi: number, pitch: number, sideways: boolean, margin = 0.94): { pos: V3; tgt: V3 } {
  // work in a view frame where the camera always looks toward −x' and screen right is −z'
  const toFrame = (x: number, z: number): [number, number] => (sideways ? [z, -x] : [x, z]);
  const fromFrame = (xf: number, zf: number): [number, number] => (sideways ? [-zf, xf] : [xf, zf]);
  const pts: V3[] = [];
  for (const [f, hgt] of o.heights) {
    const x = o.x0 + (o.x1 - o.x0) * f;
    for (const z of [-o.zHalf, o.zHalf]) { const [xf, zf] = toFrame(x, z); pts.push({ x: xf, y: hgt, z: zf }); }
  }
  let zMin = Infinity, zMax = -Infinity, xMin = Infinity, xMax = -Infinity;
  for (const p of pts) { zMin = Math.min(zMin, p.z); zMax = Math.max(zMax, p.z); xMin = Math.min(xMin, p.x); xMax = Math.max(xMax, p.x); }
  const zc0 = (zMin + zMax) / 2;
  const tanV = Math.tan(fovY / 2), tanH = tanV * aspect;
  const c = Math.cos(pitch), s = Math.sin(pitch);
  // camera basis: forward (−c, −s, 0), up (−s, c, 0), right (0, 0, −1)
  let zc = zc0;
  const fits = (tx: number, D: number) => {
    const px = tx + D * c, py = D * s;
    for (const p of pts) {
      const dx = p.x - px, dy = p.y - py, dz = p.z - zc;
      const depth = -dx * c - dy * s;
      if (depth <= 1) return false;
      const sx = -dz / (depth * tanH), sy = (-dx * s + dy * c) / (depth * tanV);
      if (Math.abs(sx) > margin || sy > yHi || sy < yLo) return false;
    }
    return true;
  };
  // perspective makes the high end of the valley lean outward, so search the lateral centre too
  let best = { tx: (xMin + xMax) / 2, zc: zc0, D: Infinity };
  const steps = 48, span = (zMax - zMin) * 0.15;
  for (let m = -4; m <= 4; m++) {
    zc = zc0 + (span * m) / 4;
    for (let k = 0; k <= steps; k++) {
      const tx = xMin + ((xMax - xMin) * k) / steps;
      let lo = 10, hi = 3000;
      if (!fits(tx, hi)) continue;
      for (let it = 0; it < 32; it++) { const mid = (lo + hi) / 2; if (fits(tx, mid)) hi = mid; else lo = mid; }
      if (hi < best.D) best = { tx, zc, D: hi };
    }
  }
  if (!Number.isFinite(best.D)) best.D = 300;
  const [px, pz] = fromFrame(best.tx + best.D * c, best.zc), [tx, tz] = fromFrame(best.tx, best.zc);
  return { pos: { x: px, y: best.D * s, z: pz }, tgt: { x: tx, y: 0, z: tz } };
}

/** Project a world point with a look-at camera (no roll, world up = +Y): NDC x/y, or null when behind the camera. */
export function project(p: V3, pos: V3, tgt: V3, fovY: number, aspect: number): { x: number; y: number } | null {
  let fx = tgt.x - pos.x, fy = tgt.y - pos.y, fz = tgt.z - pos.z;
  const fl = Math.hypot(fx, fy, fz); fx /= fl; fy /= fl; fz /= fl;
  // right = f × up(0,1,0) = (−fz, 0, fx)
  let rx = -fz, rz = fx; const rl = Math.hypot(rx, rz); rx /= rl; rz /= rl;
  // up' = right × f
  const ux = -rz * fy, uy = rz * fx - rx * fz, uz = rx * fy;
  const dx = p.x - pos.x, dy = p.y - pos.y, dz = p.z - pos.z;
  const zc = dx * fx + dy * fy + dz * fz;
  if (zc <= 0) return null;
  const tanV = Math.tan(fovY / 2);
  return { x: (dx * rx + dz * rz) / (zc * tanV * aspect), y: (dx * ux + dy * uy + dz * uz) / (zc * tanV) };
}
