import { LAP } from './track';

export const FORK = 190,
  LIP = 240,
  LAND = 264,
  JOIN = 302;
export const FLIGHT = 1,
  LAUNCH_SPEED = (LAND - LIP) / FLIGHT;
export const RESCUE = 2.15;
export const lapAt = (at: number) => ((at % LAP) + LAP) % LAP;
const unit = (x: number) => Math.max(0, Math.min(1, x));
function envelope(at: number, start: number, inEnd: number, outStart: number, end: number) {
  return Math.min(unit((at - start) / (inEnd - start)), unit((end - at) / (end - outStart)));
}
export function forkWidth(at: number) {
  return envelope(lapAt(at), FORK, 214, 282, JOIN);
}
export function narrowWidth(at: number) {
  return envelope(lapAt(at), 642, 666, 722, 746);
}
export function deck(at: number, right: boolean) {
  const fork = forkWidth(at),
    width = 1.32 - 0.7 * narrowWidth(at);
  return right ? { lo: fork * 0.38, hi: width + fork * 0.2 } : { lo: -width - fork * 0.61, hi: -fork * 0.52 };
}
export function rises(at: number) {
  return 1.7 * envelope(lapAt(at), 220, LIP, LAND, 280);
}
export function missing(at: number, right: boolean) {
  const d = lapAt(at);
  return right && d >= LIP && d < LAND;
}
export function supported(at: number, x: number) {
  const right = x > 0,
    span = deck(at, right);
  return x >= span.lo && x <= span.hi && !missing(at, right);
}
export function safeLine(at: number) {
  const span = deck(at, false);
  return (span.lo + span.hi) * 0.5;
}
export function rampLine(at: number) {
  const span = deck(at, true);
  return (span.lo + span.hi) * 0.5;
}
export function packPace(gap: number) {
  const distance = Math.max(0, Math.abs(gap) - 14);
  return 1 - Math.sign(gap) * 0.2 * unit(distance / 85);
}
export const salvage = [
  { at: 142, x: -0.65 },
  { at: 588, x: 0.7 },
  { at: 878, x: -0.78 },
];
export type Pickup = 'tow' | 'shield' | 'drive';
export function prize(gap: number, roll: number): Pickup {
  if (gap > 22 && roll < 0.75) return 'tow';
  return roll < (gap > 22 ? 0.91 : 0.6) ? 'shield' : 'drive';
}

export function chassis() {
  return { fall: 0, falls: 0, grace: 0, flight: 0, launchSpeed: 0, lift: 0, shove: 0, jumps: 0 };
}
type Bike = ReturnType<typeof chassis> & { at: number; x: number };
export function recover(b: Bike, dt: number) {
  b.grace = Math.max(0, b.grace - dt);
  if (!b.fall) return false;
  b.fall = Math.max(0, b.fall - dt);
  b.lift = -Math.min(11, 6.4 * (RESCUE - b.fall) ** 2);
  if (!b.fall) {
    b.x = forkWidth(b.at) > 0 ? safeLine(b.at) : 0;
    b.lift = 0;
    b.grace = 2.3;
  }
  return true;
}
// Both the launch test and the rendered mesh share the same lip and receiving
// deck. Lock forward momentum at takeoff so braking in midair cannot extend range.
export function crossDeck(b: Bike, previous: number, speed: number, dt: number) {
  const lip = Math.floor(previous / LAP) * LAP + LIP;
  if (!b.flight && previous < lip && b.at >= lip && b.x >= deck(lip, true).lo && b.x <= deck(lip, true).hi) {
    b.flight = FLIGHT;
    b.launchSpeed = speed;
    dt = (b.at - lip) / Math.max(0.001, speed);
  }
  if (b.flight) {
    b.flight = Math.max(0, b.flight - dt);
    const elapsed = 1 - b.flight / FLIGHT;
    b.lift = 1.7 + 3.5 * 4 * elapsed * (1 - elapsed);
    if (b.flight) return;
    const launch = Math.floor((b.at - LIP) / LAP) * LAP + LIP;
    const landing = launch + b.launchSpeed * FLIGHT;
    if (landing >= launch + LAND - LIP - 1e-7 && supported(landing, b.x) && supported(b.at, b.x)) {
      b.jumps++;
      b.lift = b.x > 0 ? rises(b.at) : 0;
      return;
    }
  } else if (supported(b.at, b.x)) {
    b.lift = b.x > 0 ? rises(b.at) : 0;
    return;
  }
  b.fall = RESCUE;
  b.falls++;
  b.shove = 0;
  b.flight = 0;
  b.lift = 0;
}
