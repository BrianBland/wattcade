// Cops: Segway (fast on flats, hopeless on ramps/stairs) and mounted horse (steady, any terrain). Pure.
import { findPath, visible, type NavNode } from './nav';
import { heightAt, onStairs, buildingAt } from './world';

export type CopKind = 'segway' | 'horse';
export type CopState = 'chase' | 'search' | 'patrol';
export interface Cop {
  id: number; kind: CopKind; x: number; y: number; z: number; vx: number; vy: number; vz: number; heading: number; speed: number;
  state: CopState; airS: number; stunS: number; flailS: number; flat: boolean; alive: boolean;
  path: NavNode[]; repathS: number; lastSeen: { x: number; z: number } | null; tackleCool: number;
}
export interface CopParams { segwaySpeed: number; horseSpeed: number; segwayRampMul: number; stairsMul: number; sightR: number; tackleR: number; gravity: number }

export const newCop = (id: number, kind: CopKind, x: number, z: number): Cop => ({ id, kind, x, y: heightAt(x, z), z, vx: 0, vy: 0, vz: 0, heading: 0, speed: 0,
  state: 'chase', airS: 0, stunS: 0, flailS: 0, flat: false, alive: true, path: [], repathS: 0, lastSeen: null, tackleCool: 1 });

/** Terrain speed for a cop at (x,z) heading `h`: Segways crawl on slopes and stairs. */
export function copTopSpeed(c: Cop, p: CopParams, bridge: number): number {
  const fx = Math.sin(c.heading), fz = Math.cos(c.heading);
  const slope = Math.abs(heightAt(c.x + fx, c.z + fz, bridge) - heightAt(c.x, c.z, bridge));
  let v = c.kind === 'segway' ? p.segwaySpeed : p.horseSpeed;
  if (c.kind === 'segway') { if (slope > 0.12) v *= p.segwayRampMul; if (onStairs(c.x, c.z)) v *= p.stairsMul; }
  else if (onStairs(c.x, c.z)) v *= 0.6;
  if (c.flat) v *= 0.5;
  return v;
}

export const canSee = (c: Cop, x: number, z: number, sightR: number) => Math.hypot(x - c.x, z - c.z) < sightR && visible(c.x, c.z, x, z, 3);

/** One tick of a cop. Returns true when it tackles the rider this tick. */
export function stepCop(c: Cop, p: CopParams, dt: number, rider: { x: number; z: number; y: number; catchable: boolean }, bridge: number): boolean {
  c.tackleCool = Math.max(0, c.tackleCool - dt);
  if (c.airS > 0) { // launched: ballistic, comedic
    c.airS += dt; c.vy -= p.gravity * dt; c.x += c.vx * dt; c.y += c.vy * dt; c.z += c.vz * dt;
    if (buildingAt(c.x, c.z)) { c.vx *= -0.5; c.vz *= -0.5; c.x += c.vx * dt * 2; c.z += c.vz * dt * 2; }
    const g = heightAt(c.x, c.z, bridge);
    if (c.y <= g) { c.y = g; c.vy = 0; c.vx = 0; c.vz = 0; c.airS = 0; c.stunS = Math.max(c.stunS, 2.5); }
    return false;
  }
  if (c.stunS > 0) { c.stunS -= dt; c.heading += dt * 8; c.speed = 0; return false; } // seeing stars / spinning out
  let tx: number, tz: number;
  if (c.flailS > 0) { // butt on fire: run around wildly
    c.flailS -= dt; c.heading += Math.sin(c.flailS * 7) * dt * 6; tx = c.x + Math.sin(c.heading) * 5; tz = c.z + Math.cos(c.heading) * 5;
  } else {
    const sees = canSee(c, rider.x, rider.z, p.sightR);
    if (sees) { c.lastSeen = { x: rider.x, z: rider.z }; c.state = 'chase'; } else if (c.state === 'chase') c.state = 'search';
    const goal = c.state === 'chase' ? { x: rider.x, z: rider.z } : c.lastSeen;
    if (!goal) { c.speed = 0; return false; }
    c.repathS -= dt;
    if (c.repathS <= 0 || !c.path.length) { c.path = findPath(c.x, c.z, goal.x, goal.z); c.repathS = sees ? 0.5 : 1.5; }
    while (c.path.length > 1 && Math.hypot(c.path[0].x - c.x, c.path[0].z - c.z) < 2.5) c.path.shift();
    const wp = c.path[0] ?? goal;
    tx = wp.x; tz = wp.z;
    if (c.state === 'search' && Math.hypot(goal.x - c.x, goal.z - c.z) < 3) { c.lastSeen = null; c.state = 'patrol'; }
  }
  const want = Math.atan2(tx - c.x, tz - c.z);
  const da = Math.atan2(Math.sin(want - c.heading), Math.cos(want - c.heading));
  c.heading += Math.max(-4 * dt, Math.min(4 * dt, da));
  const top = copTopSpeed(c, p, bridge) * (c.flailS > 0 ? 1.3 : 1);
  c.speed += Math.max(-10 * dt, Math.min(6 * dt, top - c.speed));
  const nx = c.x + Math.sin(c.heading) * c.speed * dt, nz = c.z + Math.cos(c.heading) * c.speed * dt;
  if (!buildingAt(nx, nz)) { c.x = nx; c.z = nz; } else c.speed *= 0.3;
  const g = heightAt(c.x, c.z, bridge);
  if (g < -2) { c.y = g; c.stunS = 3; c.z += c.z < -14 ? -12 : 12; c.y = heightAt(c.x, c.z, bridge); return false; } // splash, climb out
  c.y = g;
  if (c.flailS <= 0 && rider.catchable && c.tackleCool <= 0 && Math.hypot(rider.x - c.x, rider.z - c.z) < p.tackleR && Math.abs(rider.y - c.y) < 1.5) { c.tackleCool = 3; return true; }
  return false;
}
