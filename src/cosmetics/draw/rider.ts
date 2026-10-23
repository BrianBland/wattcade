import type { RiderLook } from '../types';
import { BIKES, paintAt, type BikeCtx, type BikeDef, type WheelOpts } from './bikes';
import { drawHat, FULL_HEAD } from './hats';
import { drawCape, drawTorso, legsOf } from './jersey';
import { circle, joint, line, poly, rect, shade, SKIN, TAU, type G, type P } from './prims';
import { drawPet, FLIERS, FLY_AT, RUN_AT, type PetCtx } from './pets';
import { drawTrail } from './trails';
import { bottomColors, bottomLength, drawBack, drawBottomDetail, drawHipWear, drawEyewear, drawFootwear, drawGloves, resolveWear } from './outfit';
import { drawCensor } from './censor';

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
// A fixed sprite grid keeps the world, large menu portraits and cab rider in the
// same art style. Two samples per rider unit preserve small hat details; the
// world's existing low-res buffer selects its native samples without smoothing.
// Reuse one surface per destination, rather than allocating during animation.
const SPRITE = { x: -110, y: -54, w: 154, h: 72, density: 2 };
const surfaces = new WeakMap<G, { canvas: HTMLCanvasElement; g: G }>();
const cutouts = new WeakMap<G, { canvas: HTMLCanvasElement; g: G }>();
const CUTOUT = { x: -24, y: -49, w: 48, h: 61, density: 2 };
const TRANSLUCENT_HATS = new Set(['halo', 'lamp', 'bubble']);

/** Threshold coverage on the solid character only. Glass, trails and glows keep
 * their intentional transparency in separate passes. Nearest-neighbor scaling
 * alone cannot remove Canvas's antialiased polygon edges. */
function drawCutout(g: G, paint: (ctx: G) => void) {
  if (typeof document === 'undefined') { paint(g); return; }
  let s = cutouts.get(g);
  if (!s) {
    const canvas = document.createElement('canvas');
    canvas.width = CUTOUT.w * CUTOUT.density; canvas.height = CUTOUT.h * CUTOUT.density;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) return;
    s = { canvas, g: ctx }; cutouts.set(g, s);
  }
  const p = CUTOUT, ctx = s.g;
  ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.clearRect(0, 0, s.canvas.width, s.canvas.height);
  ctx.setTransform(p.density, 0, 0, p.density, -p.x * p.density, -p.y * p.density);
  paint(ctx);
  const pixels = ctx.getImageData(0, 0, s.canvas.width, s.canvas.height);
  for (let i = 3; i < pixels.data.length; i += 4) pixels.data[i] = pixels.data[i] >= 128 ? 255 : 0;
  ctx.putImageData(pixels, 0, 0);
  g.save(); g.imageSmoothingEnabled = false; g.drawImage(s.canvas, p.x, p.y, p.w, p.h); g.restore();
}

export function drawRider(g: G, look: RiderLook, crank: number, wheelM: number, o: RiderOpts = {}) {
  // The pure drawing smoke tests also run in Node without a DOM.
  if (typeof document === 'undefined') { paintRider(g, look, crank, wheelM, o); return; }
  let surface = surfaces.get(g);
  if (!surface) {
    const canvas = document.createElement('canvas');
    canvas.width = SPRITE.w * SPRITE.density; canvas.height = SPRITE.h * SPRITE.density;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    surface = { canvas, g: ctx }; surfaces.set(g, surface);
  }
  const s = surface.g, p = SPRITE;
  s.setTransform(1, 0, 0, 1, 0, 0); s.clearRect(0, 0, surface.canvas.width, surface.canvas.height);
  s.setTransform(p.density, 0, 0, p.density, -p.x * p.density, -p.y * p.density);
  paintRider(s, look, crank, wheelM, o);
  g.save(); g.imageSmoothingEnabled = false;
  g.drawImage(surface.canvas, p.x, p.y, p.w, p.h);
  g.restore();
  if (resolveWear(look.outfit?.bottoms)?.kind === 'censor') {
    const def = BIKES[look.bike] ?? BIKES.road;
    const c = bikeCtx(g, look, crank, wheelM, o.t ?? 0, o.speed ?? 0);
    g.save();
    g.rotate(def.tilt?.(c) ?? 0); g.translate(0, def.bob?.(c) ?? 0);
    drawCensor(g, def.hip, c.t);
    if (def.stoker) drawCensor(g, def.stoker.hip ?? def.hip, c.t);
    g.restore();
  }
}

function paintRider(g: G, look: RiderLook, crank: number, wheelM: number, o: RiderOpts) {
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

/** The actual bike art without its rider, pet or trail, for item shelves. */
export function drawBikeItem(g: G, look: RiderLook, t: number, wheels = true) {
  const def = BIKES[look.bike] ?? BIKES.road;
  const c = bikeCtx(g, look, .18, t * 4.5, t, 6);
  if (!wheels) c.wheel = () => {};
  g.save();
  if (def.bob) g.translate(0, def.bob(c));
  if (def.tilt) g.rotate(def.tilt(c));
  def.frameDraw(c); def.front?.(c); def.over?.(c);
  g.restore();
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
  // Narrow metal rim and fine spokes leave open negative space inside the tyre.
  g.strokeStyle = '#aab6c7'; g.lineWidth = 0.5;
  g.beginPath(); g.arc(x, y, r - tyre * 0.4, 0, TAU); g.stroke();
  if (o.white) { g.strokeStyle = '#f5f5fa'; g.lineWidth = 0.5; g.beginPath(); g.arc(x, y, r - tyre * 0.45, 0, TAU); g.stroke(); }
  if (o.knobby) for (let i = 0; i < 12; i++) { const a = c.spin + (i * TAU) / 12; circle(g, '#1b1b22', x + Math.cos(a) * (r + tyre * 0.45), y + Math.sin(a) * (r + tyre * 0.45), 0.35); }
  const n = o.spokes ?? 3;
  g.strokeStyle = '#c5cdd8'; g.lineWidth = 0.6;
  for (let i = 0; i < n; i++) {
    const a = c.spin + (i * Math.PI) / n;
    g.beginPath(); g.moveTo(x - Math.cos(a) * r, y - Math.sin(a) * r); g.lineTo(x + Math.cos(a) * r, y + Math.sin(a) * r); g.stroke();
  }
  rect(g, '#7e899b', x - 0.5, y - 0.5, 1, 1);
}

/** Flat, tapered limb with squared ends rather than a rounded capsule. */
function limb(g: G, color: string, a: P, b: P, width: number, tip = width) {
  const d = Math.max(0.01, Math.hypot(b[0] - a[0], b[1] - a[1]));
  const nx = -(b[1] - a[1]) / d / 2, ny = (b[0] - a[0]) / d / 2;
  poly(g, color, [a[0] + nx * width, a[1] + ny * width], [b[0] + nx * tip, b[1] + ny * tip],
    [b[0] - nx * tip, b[1] - ny * tip], [a[0] - nx * width, a[1] - ny * width]);
}

function body(c: BikeCtx, look: RiderLook, def: BikeDef, who: 'rider' | 'stoker', o: RiderOpts) {
  drawCutout(c.g, (g) => bodyShapes(bikeCtx(g, look, c.th / TAU, c.spin * 0.34, c.t, c.speed), look, def, who));
  const head = headAt(def);
  c.g.save(); c.g.translate(head[0], head[1]);
  if (who === 'rider' && TRANSLUCENT_HATS.has(look.hat)) drawHat(c.g, look.hat, { t: c.t, color: look.color, speed: c.speed, crank: c.th / TAU });
  if (resolveWear(look.outfit?.eyewear)?.kind === 'bubble') drawEyewear(c.g, look.outfit?.eyewear);
  if (who === 'rider' && o.gear) gear(c.g, o.gear, c.t);
  c.g.restore();
  if (who === 'rider') def.over?.(c);
}

function headAt(def: BikeDef): P {
  const sh: P = [def.hip[0] + 8 * Math.sin(def.lean), def.hip[1] - 8 * Math.cos(def.lean)];
  // Anchor the small facial features to the sprite grid. The head stays steady
  // while the feet/knees move continuously through the crank's full phase.
  return [Math.round((sh[0] + 3.8 * Math.sin(def.lean * 0.45) + 0.8) * 2) / 2,
    Math.round((sh[1] - 3.8 * Math.cos(def.lean * 0.45)) * 2) / 2];
}

function bodyShapes(c: BikeCtx, look: RiderLook, def: BikeDef, who: 'rider' | 'stoker') {
  const g = c.g, t = c.t, j = look.jersey, outfit = look.outfit;
  const legs = bottomColors(outfit?.bottoms) ?? legsOf(j);
  const hip = def.hip, lean = def.lean;
  const sh: P = [hip[0] + 8 * Math.sin(lean), hip[1] - 8 * Math.cos(lean)];
  const head = headAt(def);
  const feet = footPoints(c, def);
  const leg = (foot: P, near: boolean) => {
    const k = joint(hip, foot, 6.4, 6.6, 1);
    const thigh = near ? legs.thigh : shade(legs.thigh, 0.65);
    const shin = legs.shin ?? SKIN;
    limb(g, near ? shin : shade(shin, 0.72), k, foot, 2, 1.6);
    limb(g, near ? shin : shade(shin, 0.72), hip, k, 2.8, 2.3);
    const fraction = bottomLength(outfit?.bottoms);
    const shortsEnd: P = legs.shin ? k : [hip[0] + (k[0] - hip[0]) * fraction, hip[1] + (k[1] - hip[1]) * fraction];
    limb(g, thigh, hip, shortsEnd, 3.5, 3.1);
    drawBottomDetail(g, outfit?.bottoms, hip, k, foot, near, t);
    if (outfit?.footwear && resolveWear(outfit.footwear)?.kind !== 'none') drawFootwear(g, outfit.footwear, foot, near, t);
    else {
      rect(g, '#182132', foot[0] - 1, foot[1] - 0.7, 2.8, 1.3);
      if (near) rect(g, '#aab8c7', foot[0] - 0.8, foot[1] + 0.4, 2.4, 0.4);
    }
  };
  if (who === 'rider') {
    if (outfit?.back && resolveWear(outfit.back)?.kind !== 'none') drawBack(g, outfit.back, hip, sh, t, c.speed);
    else drawCape(g, j, sh, t, c.speed);
  }
  leg(feet[1], false);
  if (who === 'rider') def.frameDraw(c);
  leg(feet[0], true);
  drawHipWear(g, outfit?.bottoms, hip, t);
  limb(g, SKIN, sh, [head[0] - 0.5, head[1] + 2], 1.8);
  drawTorso(g, j, hip, sh, t);
  const elbow = joint(sh, def.hand, 4.1, 4.3, -1);
  limb(g, SKIN, sh, elbow, 2.4, 2.1);
  limb(g, SKIN, elbow, def.hand, 2.1, 1.7);
  const cuff: P = [sh[0] + (elbow[0] - sh[0]) * 0.65, sh[1] + (elbow[1] - sh[1]) * 0.65];
  const cut = j.cut ?? (j.pattern === 'coat' ? 'coat' : j.pattern === 'royal' ? 'robe' : 'jersey');
  if (!['tank', 'bikini', 'mesh', 'vest'].includes(cut)) limb(g, j.base, sh, ['hoodie', 'coat', 'jacket', 'robe'].includes(cut) ? def.hand : cuff, 3.1, 2.7);
  const gloveKind = resolveWear(outfit?.gloves)?.kind;
  rect(g, gloveKind === 'none' || gloveKind === 'bands' ? SKIN : '#182132', def.hand[0] - 0.5, def.hand[1] - 0.5, 1.5, 1.3);
  if (who === 'rider') def.front?.(c);
  drawGloves(g, outfit?.gloves, elbow, def.hand);
  g.save(); g.translate(head[0], head[1]);
  if (!FULL_HEAD.has(look.hat) || who === 'stoker') {
    poly(g, SKIN, [-2.4, -2.5], [1.7, -2.5], [2.8, -1.5], [2.8, -0.3], [3.3, 0.2],
      [2.8, 0.7], [2.8, 1.7], [1.3, 2.7], [-1.5, 2.5], [-2.8, 1]);
    rect(g, '#273043', -2.7, -2.2, 0.9, 2.4);
    rect(g, '#d9a46b', -2, 0, 0.5, 1);
    rect(g, '#182132', 1.5, -1, 0.5, 1);
  }
  if (who === 'stoker') drawHat(g, 'road', { t, color: look.color, speed: c.speed, crank: c.th / TAU });
  else if (!TRANSLUCENT_HATS.has(look.hat)) drawHat(g, look.hat, { t, color: look.color, speed: c.speed, crank: c.th / TAU });
  if (resolveWear(outfit?.eyewear)?.kind !== 'bubble' && (who === 'stoker' || !FULL_HEAD.has(look.hat) && look.hat !== 'welder')) drawEyewear(g, outfit?.eyewear);
  g.restore();
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
