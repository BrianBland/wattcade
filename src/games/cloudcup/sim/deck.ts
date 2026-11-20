import { LAP } from './track';

export const FORK = 190,
  LIP = 240,
  LAND = 264,
  JOIN = 302;
export const FLIGHT = 1,
  LAUNCH_SPEED = (LAND - LIP) / FLIGHT;
export const RESCUE = 2.15;
export const CATCH = 0.46,
  DROP = 1.94,
  PROTECTION = 2.3;
export function easeBetween(time: number, start: number, end: number) {
  const t = Math.max(0, Math.min(1, (time - start) / (end - start)));
  return t * t * (3 - 2 * t);
}
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
  return {
    fall: 0,
    fallX: 0,
    fallLift: 0,
    craneAway: 0,
    falls: 0,
    grace: 0,
    flight: 0,
    launchSpeed: 0,
    lift: 0,
    shove: 0,
    jumps: 0,
  };
}
type Bike = ReturnType<typeof chassis> & { at: number; x: number };
export function recover(b: Bike, dt: number) {
  b.craneAway = Math.max(0, b.craneAway - dt);
  b.grace = Math.max(0, b.grace - dt);
  if (!b.fall) return false;
  b.fall = b.fall <= dt + 1e-9 ? 0 : b.fall - dt;
  const age = RESCUE - b.fall;
  const destination = forkWidth(b.at) > 0 ? safeLine(b.at) : 0;
  const caught = b.fallLift - 1.55;
  b.x = b.fallX + (destination - b.fallX) * easeBetween(age, 1.09, 1.73);
  if (age < CATCH) b.lift = b.fallLift - 1.55 * (age / CATCH) ** 2;
  else if (age < 1.13) b.lift = caught + (2.65 - caught) * easeBetween(age, CATCH, 1.13);
  else if (age < DROP) b.lift = 2.65 - 2.4 * easeBetween(age, 1.64, DROP);
  else b.lift = 0.25 * (1 - ((age - DROP) / (RESCUE - DROP)) ** 2);
  if (!b.fall) {
    b.x = destination;
    b.lift = 0;
    b.grace = PROTECTION;
    b.craneAway = 0.4;
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
  b.fallX = b.x;
  b.fallLift = b.lift;
  b.fall = RESCUE;
  b.falls++;
  b.shove = 0;
  b.flight = 0;
}
