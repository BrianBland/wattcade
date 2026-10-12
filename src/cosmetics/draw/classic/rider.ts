// Original simple art, retained for the per-player Classic overworld mode.
import type { RiderLook } from '../../types';
import { BIKES, paintAt, type BikeCtx, type BikeDef, type WheelOpts } from './bikes';
import { drawHat, FULL_HEAD } from './hats';
import { drawCape, drawTorso, legsOf } from './jersey';
import { circle, joint, line, rect, SKIN, TAU, type G, type P } from '../prims';
import { drawPet, FLIERS, FLY_AT, RUN_AT, type PetCtx } from './pets';
import { drawTrail } from './trails';

export interface RiderOpts {
  /** Seconds (animations). */
  t?: number;
  /** Road speed in m/s (flames, trails, cape). */
  speed?: number;
  /** Biome gear from the warm-up: a space bubble or scuba mask over whatever hat is worn. */
  gear?: 'bubble' | 'scuba' | null;
  /** Towing the Drive-In projector trailer. */
  trailer?: boolean;
}

/**
 * Side-on rider on their bike, around the ground point (0,0), facing +x, ~24 px tall.
 * `crank` in revolutions (legs), `wheelM` metres travelled (wheels).
 */
export function drawRider(g: G, look: RiderLook, crank: number, wheelM: number, o: RiderOpts = {}) {
  const t = o.t ?? 0, speed = o.speed ?? 0;
  const def: BikeDef = BIKES[look.bike] ?? BIKES.road;
  const c = bikeCtx(g, look, crank, wheelM, t, speed);
  const pc: PetCtx = { t, speed, gait: (wheelM / 1.1) * TAU, color: look.color };
  const flier = FLIERS.has(look.pet), inBox = look.bike === 'cargo' && !flier && look.pet !== 'none';
  if (flier) at(g, FLY_AT, () => drawPet(g, look.pet, pc));
  g.save();
  const bob = def.bob?.(c) ?? 0, tilt = def.tilt?.(c) ?? 0;
  if (tilt) g.rotate(tilt);
  if (bob) g.translate(0, bob);
  const hitch = def.hitch ?? -7;
  if (o.trailer) trailer(c, hitch);
  drawTrail(g, look.trail, { t, speed, color: look.color, x0: o.trailer ? hitch - 27 : hitch - 4.5 });
  def.back?.(c);
  if (def.stoker) { g.save(); g.globalAlpha *= 0.55; body(c, look, { ...def, ...def.stoker, legs: 'pedal', cr: def.cr }, 'stoker', o); g.restore(); }
  body(c, look, def, 'rider', o);
  if (inBox) at(g, [7.6, -10.6], () => drawPet(g, look.pet, pc, true)); // a runner rides in the cargo box
  g.restore();
  if (!flier && !inBox && look.pet !== 'none') at(g, RUN_AT, () => drawPet(g, look.pet, pc));
}

function at(g: G, p: P, f: () => void) { g.save(); g.translate(p[0], p[1]); f(); g.restore(); }

function bikeCtx(g: G, look: RiderLook, crank: number, wheelM: number, t: number, speed: number): BikeCtx {
  const paint = look.paint;
  const frame = (u = 0.5) => paintAt(paint, t, u);
  const c: BikeCtx = {
    g, t, speed, spin: wheelM / 0.34, th: crank * TAU, color: look.color, paint, frame,
    tube: (a, b, w = 1.3) => {
      const col = frame(Math.min(1, Math.max(0, ((a[0] + b[0]) / 2 + 14) / 28)));
      if (paint.kind === 'glow') { g.save(); g.globalAlpha *= 0.35; line(g, col, w + 1.4, a, b); g.restore(); }
      line(g, col, w, a, b);
    },
    wheel: (x, y, r, w = {}) => wheel(c, x, y, r, w),
  };
  return c;
}

function wheel(c: BikeCtx, x: number, y: number, r: number, o: WheelOpts) {
  const g = c.g;
  if (o.disc) {
    circle(g, o.disc, x, y, r);
    if (o.glow) { g.save(); g.shadowColor = o.glow; g.shadowBlur = 3; g.strokeStyle = o.glow; g.lineWidth = 0.7; g.beginPath(); g.arc(x, y, r - 0.6, 0, TAU); g.stroke(); g.restore(); }
    return;
  }
  const tyre = o.tyre ?? 1.6;
  g.strokeStyle = o.color ?? '#1b1b22'; g.lineWidth = tyre; g.beginPath(); g.arc(x, y, r, 0, TAU); g.stroke();
  if (o.white) { g.strokeStyle = '#f5f5fa'; g.lineWidth = 0.5; g.beginPath(); g.arc(x, y, r - tyre * 0.45, 0, TAU); g.stroke(); }
  if (o.knobby) for (let i = 0; i < 12; i++) { const a = c.spin + (i * TAU) / 12; circle(g, '#1b1b22', x + Math.cos(a) * (r + tyre * 0.45), y + Math.sin(a) * (r + tyre * 0.45), 0.35); }
  const n = o.spokes ?? 3;
  g.strokeStyle = '#c8c8d0'; g.lineWidth = 0.6;
  for (let i = 0; i < n; i++) {
    const a = c.spin + (i * Math.PI) / n;
    g.beginPath(); g.moveTo(x - Math.cos(a) * r, y - Math.sin(a) * r); g.lineTo(x + Math.cos(a) * r, y + Math.sin(a) * r); g.stroke();
  }
}

function body(c: BikeCtx, look: RiderLook, def: BikeDef, who: 'rider' | 'stoker', o: RiderOpts) {
  const g = c.g, t = c.t, j = look.jersey, legs = legsOf(j);
  const hip = def.hip, lean = def.lean;
  const sh: P = [hip[0] + 8 * Math.sin(lean), hip[1] - 8 * Math.cos(lean)];
  const hl = lean * 0.55, head: P = [sh[0] + 3.4 * Math.sin(hl) + 0.6, sh[1] - 3.4 * Math.cos(hl)];
  const feet = footPoints(c, def);
  const leg = (foot: P, near: boolean) => {
    const k = joint(hip, foot, 6.4, 6.6, 1);
    line(g, near ? legs.thigh : shadeLeg(legs.thigh), 2.2, hip, k);
    line(g, legs.shin ? (near ? legs.shin : shadeLeg(legs.shin)) : near ? SKIN : '#c49a6c', 2, k, foot);
    line(g, '#222', 1.6, [foot[0] - 1, foot[1]], [foot[0] + 1.2, foot[1]]);
  };
  if (who === 'rider') drawCape(g, j, sh, t, c.speed);
  leg(feet[1], false);
  if (who === 'rider') def.frameDraw(c);
  leg(feet[0], true);
  drawTorso(g, j, hip, sh, t);
  const elbow = joint(sh, def.hand, 3.6, 3.8, -1);
  line(g, SKIN, 1.6, elbow, def.hand); line(g, j.base, 2, sh, elbow);
  if (who === 'rider') def.front?.(c);
  g.save(); g.translate(head[0], head[1]);
  if (!FULL_HEAD.has(look.hat) || who === 'stoker') circle(g, SKIN, 0, 0, 2.4);
  if (who === 'stoker') drawHat(g, 'road', { t, color: look.color, speed: c.speed, crank: c.th / TAU });
  else drawHat(g, look.hat, { t, color: look.color, speed: c.speed, crank: c.th / TAU });
  if (who === 'rider' && o.gear) gear(g, o.gear, t);
  g.restore();
  if (who === 'rider') def.over?.(c);
}

/** Near and far foot positions for the bike's leg style. */
function footPoints(c: BikeCtx, def: BikeDef): [P, P] {
  const th = c.th;
  if (def.legs === 'run') {
    const gr = def.ground ?? 0, f = (a: number): P => [def.hip[0] + 0.8 + Math.sin(a) * 3.6, gr - Math.max(0, Math.cos(a)) * 2.6];
    return [f(th), f(th + Math.PI)];
  }
  if (def.legs === 'dangle') {
    const ctr: P = [def.hip[0] + 2, def.hip[1] + 9], f = (a: number): P => [ctr[0] + Math.cos(a) * 1.3, ctr[1] + Math.sin(a) * 1.3];
    return [f(th), f(th + Math.PI)];
  }
  const bb = def.bb ?? [0, -5], cr = def.cr ?? 2.8, f = (a: number): P => [bb[0] + Math.cos(a) * cr, bb[1] + Math.sin(a) * cr];
  return [f(th), f(th + Math.PI)];
}
const shadeLeg = (c: string) => (c === '#22222b' ? '#15151c' : c);

/** Warm-up biome gear, drawn over the hat in head space. */
function gear(g: G, kind: 'bubble' | 'scuba', t: number) {
  if (kind === 'bubble') {
    g.fillStyle = '#d7f1ff55'; g.strokeStyle = '#e8f6ff'; g.lineWidth = 0.8;
    g.beginPath(); g.arc(0, -0.6, 4.6, 0, TAU); g.fill(); g.stroke();
    rect(g, '#ffffffaa', 1, -3.6, 1.2, 1.2);
    return;
  }
  rect(g, '#7fe0ff', 0.4, -1.2, 2.6, 1.6);                   // mask
  line(g, '#1b1b22', 0.8, [1.6, 1.4], [-6, 6]);               // hose to the tank
  g.fillStyle = '#d8f6ffcc';
  for (let i = 0; i < 3; i++) { const a = (t * 0.9 + i / 3) % 1; g.fillRect(Math.round(2 + Math.sin(a * 9 + i) * 1.5), Math.round(-4 - a * 14), a > 0.6 ? 2 : 1, a > 0.6 ? 2 : 1); }
}

/** The Drive-In projector trailer on a drawbar behind the rear axle. */
function trailer(c: BikeCtx, hitch: number) {
  const g = c.g, x = hitch - 4.5;
  line(g, '#555', 1, [hitch, -4.5], [x - 2.5, -4.5]);
  c.wheel(x - 8.5, -3, 3, { tyre: 1.4 });
  rect(g, '#4a4a58', x - 14.5, -11, 13, 6); rect(g, '#d63a3a', x - 14.5, -7, 13, 1); rect(g, '#f4f0e6', x - 13.5, -10, 5, 2);
  rect(g, '#222', x - 2.5, -12, 3, 3); rect(g, '#cfe8ff', x - 0.5, -11.5, 1, 2);
}
/** Where the trailer's lens sits for a bike (rider space), so the warm-up can aim the projector beam. */
export function lensFor(bike: string): P {
  const h = (BIKES[bike] ?? BIKES.road).hitch ?? -7;
  return [h - 5, -10.5];
}
