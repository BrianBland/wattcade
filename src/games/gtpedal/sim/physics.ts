// Arcade rider physics: pure functions over plain state. Heading convention: 0 = +z, PI/2 = +x.
import { buildingAt, heightAt, LINES, nearestOnLine, type Line } from './world';

export interface Params {
  drive: number; drag: number; rollDecay: number; topSpeed: number; gravity: number; launchMul: number;
  climbMul: number; turnRate: number; snapR: number; snapPull: number; crashSpeed: number; grindR: number;
  /** share of top speed that scales with effort (0 = flat cap; 0.5 = 0.65 FTP gets 82 %, 1.2 FTP gets 110 %) */
  effortTop?: number;
}
export interface Body {
  x: number; z: number; y: number; vy: number; heading: number; speed: number;
  air: boolean; airS: number; spin: number; line: number; grinding: boolean;
}
export const newBody = (x: number, z: number, heading: number): Body =>
  ({ x, z, y: heightAt(x, z), vy: 0, heading, speed: 0, air: false, airS: 0, spin: 0, line: -1, grinding: false });

const wrap = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));

/** Lines roughly along heading within snapR, sorted left→right relative to heading. */
export function candidateLines(b: Body, snapR: number, maxAngle = 0.9): Array<{ line: Line; d: number; side: number; heading: number }> {
  const out: Array<{ line: Line; d: number; side: number; heading: number }> = [];
  for (const l of LINES) {
    const n = nearestOnLine(l, b.x, b.z);
    if (n.d > snapR) continue;
    let h = n.heading;
    if (Math.abs(wrap(h - b.heading)) > Math.PI / 2) h = wrap(h + Math.PI); // ride lines either way
    if (Math.abs(wrap(h - b.heading)) > maxAngle) continue;
    // side > 0 = to the rider's right (right = (-cos h, sin h) in x,z)
    const side = -(n.px - b.x) * Math.cos(b.heading) + (n.pz - b.z) * Math.sin(b.heading);
    out.push({ line: l, d: n.d, side, heading: h });
  }
  return out.sort((a, c) => a.side - c.side);
}

/** Pick the line to the left (-1) or right (+1) of the current one. */
export function switchLine(b: Body, dir: -1 | 1, snapR: number): number {
  const c = candidateLines(b, snapR * 2.5);
  const curSide = c.find((e) => e.line.id === b.line)?.side ?? 0;
  const pick = dir > 0 ? c.find((e) => e.side > curSide + 0.3) : [...c].reverse().find((e) => e.side < curSide - 0.3);
  return pick ? pick.line.id : b.line;
}

export interface StepIn { brake?: boolean; effort: number; steer: number; freeSteer: boolean; spinIn: number; grindHeld: boolean; bike: { power: number; top: number; turn: number; air: number }; topMul: number; boost: number }
export interface StepOut { crashed: boolean; landed: boolean; spinLanded: number; slope: number; splash: boolean; impact: number; grindEnded: number }

export function stepBody(b: Body, p: Params, inp: StepIn, dt: number, bridge: number, grindS: { s: number }): StepOut {
  const out: StepOut = { crashed: false, landed: false, spinLanded: 0, slope: 0, splash: false, impact: 0, grindEnded: 0 };
  const et = p.effortTop ?? 0;
  const effTop = Math.max(0.4, Math.min(1.4, 1 - et + et * inp.effort));
  const top = p.topSpeed * effTop * inp.bike.top * inp.topMul * (1 + inp.boost);
  // steering: line snap unless free-steering or airborne
  if (!b.air) {
    if (inp.freeSteer || b.line < 0) {
      b.heading = wrap(b.heading + inp.steer * p.turnRate * inp.bike.turn * dt);
      if (!inp.freeSteer) { const c = candidateLines(b, p.snapR, 0.5); if (c.length) b.line = c.reduce((a, e) => (e.d < a.d ? e : a)).line.id; }
      else b.line = -1;
    }
    if (b.line >= 0 && !inp.freeSteer) {
      const l = LINES[b.line], n = nearestOnLine(l, b.x, b.z);
      if (n.d > p.snapR * 2.5) b.line = -1;
      else {
        let h = n.heading; if (Math.abs(wrap(h - b.heading)) > Math.PI / 2) h = wrap(h + Math.PI);
        const side = -(n.px - b.x) * Math.cos(b.heading) + (n.pz - b.z) * Math.sin(b.heading);
        const want = wrap(h - Math.max(-0.6, Math.min(0.6, side * 0.25)));
        b.heading = wrap(b.heading + wrap(want - b.heading) * Math.min(1, p.snapPull * dt));
        if (n.seg === l.pts.length - 2 && n.d < 0.01 && (Math.hypot(b.x - l.pts[l.pts.length - 1][0], b.z - l.pts[l.pts.length - 1][1]) < 1)) b.line = -1; // end
      }
    }
  } else {
    b.spin += inp.spinIn * 7 * dt; b.heading = wrap(b.heading + inp.spinIn * 7 * dt);
  }
  // grind: tram/rail line under you + held
  const wasGrind = b.grinding;
  b.grinding = !b.air && inp.grindHeld && b.line >= 0 && (LINES[b.line].kind === 'tram' || LINES[b.line].kind === 'rail')
    && nearestOnLine(LINES[b.line], b.x, b.z).d < p.grindR && b.speed > 2;
  if (b.grinding) grindS.s += dt; else if (wasGrind) { out.grindEnded = grindS.s; grindS.s = 0; }
  // drive along ground
  const g0 = heightAt(b.x, b.z, bridge);
  const fx = Math.sin(b.heading), fz = Math.cos(b.heading);
  const ahead = heightAt(b.x + fx * 0.5, b.z + fz * 0.5, bridge);
  const rawSlope = (ahead - g0) / 0.5;
  // a lip (ground falls away just ahead) is not a downhill: it must not slingshot you
  const slope = b.air || ahead - g0 < -0.3 ? 0 : Math.max(-1, Math.min(1, rawSlope)); out.slope = slope;
  if (!b.air) {
    const drive = p.drive * inp.effort * inp.bike.power * (b.grinding ? 0.3 : 1);
    let a = drive - p.drag * b.speed * b.speed - p.rollDecay * b.speed - p.gravity * slope * p.climbMul;
    if (b.grinding) a = drive; // grinds are frictionless
    if (inp.brake) a = Math.min(a, -8);
    b.speed = Math.max(0, b.speed + a * dt);
    if (b.speed > top) b.speed = Math.max(top, b.speed - 6 * dt);
  }
  const nx = b.x + fx * b.speed * dt, nz = b.z + fz * b.speed * dt;
  const hit = buildingAt(nx, nz);
  const wall = heightAt(nx, nz, bridge) - b.y > 0.8; // too tall to roll up: edge walls, raised leaf ends
  if ((hit && b.y < hit.h) || wall) {
    out.impact = b.speed;
    if (b.speed > p.crashSpeed) { out.crashed = true; return out; }
    b.speed *= 0.3; b.heading = wrap(b.heading + Math.PI * 0.8); return out; // bonk
  }
  b.x = nx; b.z = nz;
  const g1 = heightAt(b.x, b.z, bridge);
  if (b.air) {
    b.vy -= p.gravity * dt; b.y += b.vy * dt; b.airS += dt;
    if (b.y <= g1) {
      out.landed = true; out.spinLanded = b.spin; out.impact = -b.vy;
      b.y = g1; b.vy = 0; b.air = false; b.airS = 0; b.spin = 0;
    }
  } else {
    const vyGround = (g1 - b.y) / dt;
    const ballistic = b.y + b.vy * dt - 0.5 * p.gravity * dt * dt;
    if (g1 < ballistic - 0.05 && b.vy > -0.5) {
      b.air = true; b.vy = Math.max(0, b.vy) * p.launchMul * inp.bike.air; b.y = ballistic; b.airS = 0; b.spin = 0; b.line = -1;
    } else if (g1 < b.y - 1.2) {
      b.air = true; b.vy = 0; b.line = -1; // fell off a ledge (stairs, canal)
    } else { b.vy = vyGround; b.y = g1; }
  }
  if (g1 < -3 && b.y < -3) out.splash = true;
  return out;
}
