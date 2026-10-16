import type { PaintLook } from '../../types';
import { circle, line, oval, poly, quad, rect, ring, shade, TAU, type G, type P } from '../prims';

/** Everything a bike drawer needs. Coordinates: ground contact at y = 0, facing +x, a rider ~24 px tall. */
export interface BikeCtx {
  g: G; t: number; speed: number;
  /** Wheel rotation (radians) and crank angle (radians). */
  spin: number; th: number;
  color: string; paint: PaintLook;
  /** Frame colour at u ∈ [0, 1] along the bike (back → front). */
  frame(u?: number): string;
  /** A frame tube in the paint (with glow if the paint has it). */
  tube(a: P, b: P, w?: number): void;
  wheel(x: number, y: number, r: number, o?: WheelOpts): void;
}
export interface WheelOpts { tyre?: number; white?: boolean; knobby?: boolean; disc?: string; glow?: string; spokes?: number; color?: string }

export interface BikeDef {
  hip: P; hand: P;
  /** Crank centre and radius ('pedal' legs). */
  bb?: P; cr?: number;
  /** Torso angle from vertical (radians, + leans forward). */
  lean: number;
  legs: 'pedal' | 'run' | 'dangle';
  /** Ground for running feet (default 0). */
  ground?: number;
  /** Whole-rig vertical bob / tilt (radians) at this moment. */
  bob?(c: BikeCtx): number;
  tilt?(c: BikeCtx): number;
  back?(c: BikeCtx): void;    // behind the rider (trails, flames)
  frameDraw(c: BikeCtx): void; // wheels + frame, between the far and near leg
  front?(c: BikeCtx): void;   // over the legs and torso (shells, armrests), under the head
  over?(c: BikeCtx): void;    // over everything (domes)
  /** A second rider (tandem stoker): drawn translucent, same crank. */
  stoker?: { hip: P; hand: P; bb: P; lean: number };
  /** Projector-trailer hitch (x of the rear axle). */
  hitch?: number;
}

const WOOD = '#c8a85a';
const dark = '#1b1b22';

/** Classic diamond frame between rear axle `r`, bottom bracket `bb`, seat top `s`, head top `h`, front axle `f`. */
function diamond(c: BikeCtx, r: P, bb: P, s: P, h: P, f: P) {
  c.tube(r, bb); c.tube(bb, s); c.tube(s, r); c.tube(bb, h); c.tube(s, h); c.tube(h, f);
}
const saddle = (g: G, x: number, y: number, w = 2.8) => line(g, '#333', 1.4, [x - w / 2, y], [x + w / 2, y]);
const crank = (c: BikeCtx, bb: P, cr: number) => line(c.g, '#999', 0.8, bb, [bb[0] + Math.cos(c.th) * cr, bb[1] + Math.sin(c.th) * cr]);

const road: BikeDef = {
  hip: [-3, -14], hand: [6.8, -13.6], bb: [0, -5], cr: 2.8, lean: 0.8, legs: 'pedal', hitch: -7,
  frameDraw: (c) => {
    c.wheel(-7, -4.5, 4.5); c.wheel(7, -4.5, 4.5);
    diamond(c, [-7, -4.5], [0, -5], [-3.2, -12.5], [5, -12], [7, -4.5]);
    saddle(c.g, -3.1, -13.2); line(c.g, '#333', 1.3, [5, -12], [6.6, -13.6], [7.4, -12.4]); crank(c, [0, -5], 2.8);
  },
};

export const BIKES: Record<string, BikeDef> = {
  road,
  bmx: {
    hip: [-2.8, -12.6], hand: [5.4, -14.2], bb: [0, -3.8], cr: 2.6, lean: 0.55, legs: 'pedal', hitch: -5.5,
    frameDraw: (c) => {
      c.wheel(-5.5, -3.4, 3.4, { tyre: 1.9 }); c.wheel(5.5, -3.4, 3.4, { tyre: 1.9 });
      diamond(c, [-5.5, -3.4], [0, -3.8], [-2.6, -10.4], [4.2, -10], [5.5, -3.4]);
      line(c.g, '#333', 1, [4.2, -10], [5, -14]); line(c.g, '#333', 0.8, [4.4, -14.2], [6, -14.2]); saddle(c.g, -2.7, -11.4, 2.2); crank(c, [0, -3.8], 2.6);
    },
  },
  mtb: {
    hip: [-3, -14], hand: [6.2, -13.4], bb: [0, -5], cr: 2.8, lean: 0.65, legs: 'pedal', hitch: -7,
    frameDraw: (c) => {
      c.wheel(-7, -4.6, 4.6, { tyre: 2.4, knobby: true }); c.wheel(7, -4.6, 4.6, { tyre: 2.4, knobby: true });
      c.tube([-7, -4.6], [0, -5]); c.tube([0, -5], [-3, -12.4]); c.tube([-3, -11], [-7, -4.6]); c.tube([0, -5], [4.8, -11.6], 1.6); c.tube([-3, -11.4], [4.8, -11.6]);
      line(c.g, '#555', 1.8, [4.8, -11.6], [5.8, -8]); line(c.g, '#999', 1.1, [5.8, -8], [7, -4.6]);
      saddle(c.g, -3, -13); line(c.g, '#333', 1.1, [4.8, -11.6], [5.6, -13.2], [7, -13.2]); crank(c, [0, -5], 2.8);
    },
  },
  cruiser: {
    hip: [-3.6, -13.6], hand: [4, -15.2], bb: [0, -4.8], cr: 2.6, lean: 0.2, legs: 'pedal', hitch: -7.4,
    frameDraw: (c) => {
      for (const x of [-7.4, 7.4]) { c.wheel(x, -4.8, 4.8, { tyre: 1.8, white: true }); c.g.strokeStyle = c.frame(); c.g.lineWidth = 0.7; c.g.beginPath(); c.g.arc(x, -4.8, 5.8, Math.PI * 1.1, Math.PI * 1.9); c.g.stroke(); }
      quad(c.g, c.frame(0.5), 1.4, [-7.4, -4.8], [-2, -13], [5.4, -11.6]); c.tube([0, -4.8], [-3.4, -12.4]); quad(c.g, c.frame(0.5), 1.4, [0, -4.8], [2, -9], [5.4, -11.4]); c.tube([5.4, -11.6], [7.4, -4.8]);
      line(c.g, '#c6ccd6', 1, [5.4, -11.6], [5.6, -14.4]); quad(c.g, '#c6ccd6', 0.9, [5.6, -14.4], [5, -16.4], [3.6, -15.4]); saddle(c.g, -3.6, -13, 3.4); crank(c, [0, -4.8], 2.6);
    },
  },
  pennyfarthing: {
    hip: [1, -21], hand: [6, -20.4], bb: [3, -11], cr: 2.4, lean: 0.12, legs: 'pedal', hitch: -10,
    frameDraw: (c) => {
      c.wheel(3, -11, 11, { tyre: 1.4, spokes: 6 }); c.wheel(-10, -2.6, 2.6, { tyre: 1.2 });
      quad(c.g, c.frame(0.4), 1.5, [3.4, -21.6], [-6, -20], [-10, -2.6]); line(c.g, c.frame(0.9), 1.2, [3.4, -21.6], [3, -11]);
      saddle(c.g, 0.8, -21.8, 2.4); quad(c.g, '#c6ccd6', 0.9, [2.2, -22.4], [4, -23.6], [6.4, -21]); crank(c, [3, -11], 2.4);
    },
  },
  tricycle: {
    hip: [-1.6, -11.2], hand: [5, -12.6], bb: [5, -5], cr: 2, lean: 0.08, legs: 'pedal', hitch: -5,
    frameDraw: (c) => {
      c.wheel(-4.2, -2.9, 2.6, { tyre: 1.4, color: '#2a2a33' }); c.wheel(-5.2, -2.6, 2.6, { tyre: 1.4 });
      c.wheel(5, -5, 5, { tyre: 1.6 });
      c.tube([-5.2, -2.6], [-1.6, -9.6]); c.tube([-1.6, -9.6], [4.4, -10.4], 1.6); c.tube([4.4, -10.4], [5, -5]);
      line(c.g, '#c6ccd6', 0.9, [4.4, -10.4], [4.6, -12.8], [5.6, -12.8]); saddle(c.g, -1.6, -10.2, 2.6); crank(c, [5, -5], 2);
    },
  },
  clown: {
    hip: [-1.2, -7.2], hand: [3.2, -8.6], bb: [0, -2.2], cr: 1.4, lean: 0.25, legs: 'pedal', hitch: -3,
    frameDraw: (c) => {
      c.wheel(-3, -2, 2, { tyre: 1.2 }); c.wheel(3, -2, 2, { tyre: 1.2 });
      diamond(c, [-3, -2], [0, -2.2], [-1.2, -6], [2.4, -6], [3, -2]);
      line(c.g, '#333', 0.9, [2.4, -6], [2.8, -8.6], [3.8, -8.6]); circle(c.g, '#e8322b', 4.2, -9, 0.9); saddle(c.g, -1.2, -6.6, 2); crank(c, [0, -2.2], 1.4);
    },
  },
  chopper: {
    hip: [-4.2, -11.4], hand: [4.4, -19.6], bb: [-1, -4.8], cr: 2.6, lean: -0.18, legs: 'pedal', hitch: -8,
    frameDraw: (c) => {
      c.wheel(-8, -4.4, 4.4, { tyre: 2.2 }); c.wheel(10.4, -3.6, 3.6, { tyre: 1.4 });
      c.tube([-8, -4.4], [-1, -4.8]); c.tube([-1, -4.8], [-4.4, -10.2]); c.tube([-4.4, -10.2], [-8, -4.4]); c.tube([-1, -4.8], [3.2, -12.6]); c.tube([-4.4, -10.2], [3.2, -12.6]);
      line(c.g, '#c6ccd6', 1.1, [3.2, -12.6], [10.4, -3.6]);
      line(c.g, '#333', 2, [-7.6, -11], [-2.2, -11]); line(c.g, '#c6ccd6', 0.8, [-7.4, -11], [-8.4, -14.4]);
      quad(c.g, '#c6ccd6', 0.9, [3.2, -12.6], [2.6, -20], [4.8, -19.8]); crank(c, [-1, -4.8], 2.6);
    },
  },
  hobbyhorse: {
    hip: [-1, -12.6], hand: [4.6, -15], lean: 0.25, legs: 'run', hitch: -9,
    frameDraw: (c) => {
      c.wheel(-9, -1.6, 1.6, { tyre: 1 });
      line(c.g, WOOD, 1, [-9, -1.6], [5.4, -16.4]);
      oval(c.g, c.frame(), 6.4, -17.6, 2.6, 1.6, 0.5); oval(c.g, c.frame(), 8.4, -16.6, 1.6, 1, 0.3); poly(c.g, c.frame(), [5.4, -19], [6, -21], [6.6, -18.8]);
      circle(c.g, dark, 7, -18, 0.35); for (let i = 0; i < 4; i++) line(c.g, c.color, 0.8, [4.4 + i * 0.7, -18.6 - i * 0.2], [3.6 + i * 0.6, -17]);
    },
  },
  tandem: {
    hip: [-3, -14], hand: [6.8, -13.6], bb: [0, -5], cr: 2.8, lean: 0.8, legs: 'pedal', hitch: -16,
    stoker: { hip: [-12, -14], hand: [-4.6, -14.6], bb: [-9, -5], lean: 0.7 },
    frameDraw: (c) => {
      c.wheel(-16, -4.5, 4.5); c.wheel(7, -4.5, 4.5);
      c.tube([-16, -4.5], [-9, -5]); c.tube([-9, -5], [0, -5]); c.tube([-9, -5], [-12.2, -12.5]); c.tube([-12.2, -12.5], [-16, -4.5]);
      c.tube([-12.2, -12.2], [-3.2, -12.5]); c.tube([0, -5], [-3.2, -12.5]); c.tube([0, -5], [5, -12]); c.tube([-3.2, -12.5], [5, -12]); c.tube([5, -12], [7, -4.5]);
      saddle(c.g, -12.1, -13.2); saddle(c.g, -3.1, -13.2); line(c.g, '#333', 1, [-3.2, -12.5], [-3.6, -14.6], [-4.4, -14.6]);
      line(c.g, '#333', 1.3, [5, -12], [6.6, -13.6], [7.4, -12.4]); crank(c, [0, -5], 2.8); crank(c, [-9, -5], 2.8);
    },
  },
  cargo: {
    hip: [-5, -14], hand: [3.6, -15], bb: [-2, -5], cr: 2.8, lean: 0.4, legs: 'pedal', hitch: -9,
    frameDraw: (c) => {
      c.wheel(-9, -4.5, 4.5); c.wheel(11, -3, 3);
      c.tube([-9, -4.5], [-2, -5]); c.tube([-2, -5], [-5.2, -12.5]); c.tube([-5.2, -12.5], [-9, -4.5]); c.tube([-2, -5], [11, -3.6]); c.tube([-5.2, -12.4], [2, -12.6]);
      line(c.g, '#c6ccd6', 1, [2, -12.6], [2.6, -15.2], [4, -15.2]); line(c.g, '#999', 0.6, [2, -12.6], [11, -3]);
      saddle(c.g, -5, -13.2); crank(c, [-2, -5], 2.8);
    },
    front: (c) => { rect(c.g, WOOD, 3, -11, 9.4, 6.6); for (let y = -9.4; y < -4.5; y += 1.6) line(c.g, shade(WOOD, 0.75), 0.3, [3, y], [12.4, y]); rect(c.g, c.frame(), 3, -11.4, 9.4, 0.8); },
  },
  recumbent: {
    hip: [-3.4, -7.4], hand: [-0.4, -7.6], bb: [8.6, -9.6], cr: 2.2, lean: -1.05, legs: 'pedal', hitch: -9,
    frameDraw: (c) => {
      c.wheel(-9, -4, 4); c.wheel(8, -3, 3);
      c.tube([-9, -4], [-3, -6]); c.tube([-3, -6], [8.6, -9.6]); c.tube([4.6, -8.4], [8, -3]);
      line(c.g, '#333', 1.6, [-6.6, -6.2], [-1.6, -6.2]); line(c.g, '#333', 1.6, [-6.6, -6.2], [-8.4, -12]); crank(c, [8.6, -9.6], 2.2);
    },
  },
  velomobile: {
    hip: [-3.4, -7.4], hand: [-0.4, -7.6], bb: [8.6, -9.6], cr: 2.2, lean: -1.05, legs: 'pedal', hitch: -9,
    frameDraw: (c) => { c.wheel(-8, -2.6, 2.6, { tyre: 1.2 }); c.wheel(7, -2.6, 2.6, { tyre: 1.2 }); },
    front: (c) => {
      const g = c.g; g.fillStyle = c.frame(0.5); g.beginPath(); g.moveTo(-13, -5); g.quadraticCurveTo(-10, -13, -2, -12.6); g.lineTo(0.6, -12.8);
      g.quadraticCurveTo(10, -12.4, 13.6, -5); g.quadraticCurveTo(12, -2, 6, -2.4); g.lineTo(-9, -2.4); g.quadraticCurveTo(-13, -2.6, -13, -5); g.closePath(); g.fill();
      line(g, shade(c.frame(0.5), 0.7), 0.5, [-11, -4.6], [12, -4.6]); oval(g, '#15151c', -4.6, -12.4, 2.6, 0.8);
    },
  },
  sofa: {
    hip: [-5.4, -9.4], hand: [1.8, -9.8], bb: [5, -5.6], cr: 1.8, lean: -0.3, legs: 'pedal', hitch: -9,
    frameDraw: (c) => {
      for (const x of [-8.6, -3, 3, 8]) c.wheel(x, -1.4, 1.4, { tyre: 0.8, spokes: 1 });
      const s = c.frame(); rect(c.g, s, -11, -8.4, 19.6, 4); rect(c.g, shade(s, 0.85), -11.4, -16.4, 3.4, 12); rect(c.g, shade(s, 1.15), -8, -9.6, 13, 1.6); crank(c, [5, -5.6], 1.8);
    },
    front: (c) => { const s = c.frame(); rect(c.g, shade(s, 0.85), 5.6, -10.8, 3.4, 6.4); circle(c.g, shade(s, 0.85), 7.3, -10.8, 1.7); },
  },
  bamboo: {
    hip: [-3, -14], hand: [6.8, -13.6], bb: [0, -5], cr: 2.8, lean: 0.8, legs: 'pedal', hitch: -7,
    frameDraw: (c) => {
      c.wheel(-7, -4.5, 4.5); c.wheel(7, -4.5, 4.5);
      const t = (a: P, b: P) => { line(c.g, WOOD, 1.5, a, b); for (let k = 0.33; k < 1; k += 0.33) circle(c.g, shade(WOOD, 0.6), a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k, 0.55); };
      t([-7, -4.5], [0, -5]); t([0, -5], [-3.2, -12.5]); t([-3.2, -12.5], [-7, -4.5]); t([0, -5], [5, -12]); t([-3.2, -12.5], [5, -12]);
      c.tube([5, -12], [7, -4.5]); saddle(c.g, -3.1, -13.2); line(c.g, c.frame(), 1.3, [5, -12], [6.6, -13.6], [7.4, -12.4]); crank(c, [0, -5], 2.8);
    },
  },
  ostrich: {
    hip: [-1, -17.6], hand: [4.2, -19], lean: 0.2, legs: 'dangle', hitch: -6,
    frameDraw: (c) => {
      const g = c.g, ph = c.th;
      for (const [a, col] of [[ph + Math.PI, '#c99a72'], [ph, '#e9b48a']] as const) {
        const knee: P = [Math.sin(a) * 2.6 - 0.4, -8 + Math.cos(a) * 0.6], foot: P = [Math.sin(a) * 4.4, -Math.max(0, Math.cos(a)) * 2.4];
        line(g, col, 0.9, [0, -13], knee, foot); line(g, col, 0.6, foot, [foot[0] + 1.2, foot[1]]);
      }
      oval(g, '#3b3030', -0.6, -14.6, 5.4, 3.2); for (let i = 0; i < 3; i++) oval(g, '#f5f5fa', -5.8 - i * 0.4, -16 + i * 1.2, 1.8, 0.8, -0.4);
      rect(g, c.frame(), -2.6, -17.8, 4.4, 2);
      quad(g, '#e9b48a', 1.2, [3.8, -16], [7.4, -19], [6.6, -25]); circle(g, '#e9b48a', 7, -25.4, 1.3); poly(g, '#d68a3a', [8, -25.6], [9.8, -25.2], [8, -24.8]); circle(g, dark, 7.4, -25.8, 0.3);
    },
  },
  swan: {
    hip: [-3, -10.6], hand: [3, -12], bb: [3, -7], cr: 1.8, lean: 0.06, legs: 'pedal', hitch: -8,
    frameDraw: (c) => { c.wheel(-6, -2, 2, { tyre: 1 }); c.wheel(5, -2, 2, { tyre: 1 }); },
    front: (c) => {
      const g = c.g; g.fillStyle = '#f5f5fa'; g.beginPath(); g.moveTo(-12, -10); g.quadraticCurveTo(-9, -3, 0, -2.6); g.quadraticCurveTo(8, -2.6, 9, -8); g.lineTo(-12, -10); g.closePath(); g.fill();
      line(g, c.frame(), 0.8, [-11, -9.2], [8.4, -8]);
      quad(g, '#f5f5fa', 2.2, [6.6, -8], [12, -14], [7.6, -20]); circle(g, '#f5f5fa', 8, -21, 1.6); poly(g, '#ff8a1a', [9.4, -21.4], [11.4, -20.6], [9.4, -20.2]); circle(g, dark, 8.4, -21.6, 0.3);
    },
  },
  ufo: {
    hip: [-1, -9.4], hand: [3.2, -10.6], bb: [2, -7], cr: 1.6, lean: 0.12, legs: 'pedal', hitch: -9,
    bob: (c) => -3 + Math.sin(c.t * 2.2) * 0.8,
    back: (c) => { const g = c.g; g.save(); g.globalAlpha *= 0.18; poly(g, '#9fffe0', [-4, -3], [4, -3], [7, 3], [-7, 3]); g.restore(); },
    frameDraw: () => {},
    front: (c) => {
      const g = c.g; oval(g, shade(c.frame(), 0.8), 0, -5, 11.6, 2.6); oval(g, c.frame(), 0, -5.8, 11, 1.6);
      for (let i = 0; i < 6; i++) circle(g, Math.floor(c.t * 4 + i) % 3 === 0 ? '#fff3a0' : '#5d636e', -8.6 + i * 3.4, -4.6, 0.55);
    },
    over: (c) => { const g = c.g; g.fillStyle = '#bfefff40'; g.strokeStyle = '#e8f6ffaa'; g.lineWidth = 0.6; g.beginPath(); g.ellipse(1, -6.2, 6.4, 9.6, 0, Math.PI, TAU); g.fill(); g.stroke(); },
  },
  carousel: {
    hip: [-1, -16], hand: [2.6, -18.2], lean: 0.1, legs: 'dangle', hitch: -9,
    bob: (c) => Math.sin(c.th) * 1.4 - 2,
    frameDraw: (c) => {
      const g = c.g, b = Math.sin(c.th) * 1.4 - 2; // undo the bob for the base (it stays on the road)
      g.save(); g.translate(0, -b);
      for (const x of [-7, 7]) c.wheel(x, -1.4, 1.4, { tyre: 0.9, spokes: 1 });
      rect(g, '#b23a5a', -9, -3.4, 18, 1.6); for (let x = -8; x < 9; x += 2) circle(g, '#ffd23b', x, -2.6, 0.35);
      g.restore();
      line(g, '#ffd23b', 0.9, [0.6, -30 - b], [0.6, -3.4 - b]);
      oval(g, '#f5f5fa', -0.6, -13, 5.2, 2.6); poly(g, '#f5f5fa', [3, -14], [6, -19], [8, -18], [5.6, -13]); oval(g, '#f5f5fa', 7.4, -17.8, 1.8, 1.1, 0.6);
      line(g, '#f5f5fa', 1, [-4, -11.6], [-6.4, -8.6]); line(g, '#f5f5fa', 1, [3, -11.6], [5.4, -8.8]); quad(g, c.color, 1, [-5.6, -13.6], [-8, -13], [-8.2, -10]);
      for (let i = 0; i < 3; i++) line(g, c.color, 0.7, [3.6 + i * 0.8, -16.4 - i * 0.6], [2.8 + i * 0.8, -15]); circle(g, dark, 7.8, -18.2, 0.3); rect(g, c.frame(), -2.4, -15.8, 4, 1.6);
    },
  },
  tron: {
    hip: [-4, -10.6], hand: [5, -10.4], bb: [-1, -6], cr: 0.01, lean: 1.2, legs: 'pedal', hitch: -8,
    back: (c) => {
      const g = c.g, col = c.frame(), len = 30 + Math.min(1, c.speed / 8) * 50;
      const gr = g.createLinearGradient(-9, 0, -9 - len, 0); gr.addColorStop(0, col); gr.addColorStop(1, /^#[0-9a-f]{6}$/i.test(col) ? `${col}00` : 'rgba(0,0,0,0)');
      g.save(); g.shadowColor = col; g.shadowBlur = 4; g.fillStyle = gr; g.fillRect(-9 - len, -5.4, len, 3.2); g.restore();
    },
    frameDraw: (c) => {
      const g = c.g, col = c.frame();
      for (const x of [-7, 7]) c.wheel(x, -4.2, 4.2, { disc: '#0a0d14', glow: col });
      poly(g, '#0a0d14', [-11, -4], [-8.6, -9.4], [-2, -10.2], [6, -10], [11, -6], [9, -3.6], [-9, -3.6]);
      g.save(); g.shadowColor = col; g.shadowBlur = 3; line(g, col, 0.6, [-10.4, -4.4], [-8.4, -9], [-2, -9.8], [6, -9.6], [10.4, -6]); g.restore();
    },
  },
  rocket: {
    ...road,
    back: (c) => {
      const g = c.g, p = Math.min(1, c.speed / 9), fl = 3 + p * 9 + Math.sin(c.t * 40) * 1.2;
      poly(g, '#ffd23b', [-12.2, -15.2], [-12.2 - fl, -14], [-12.2, -12.8]); poly(g, '#ff5a1a', [-12.2, -14.8], [-12.2 - fl * 0.6, -14], [-12.2, -13.2]);
    },
    front: (c) => { rect(c.g, '#c6ccd6', -12, -15.4, 8, 2.8); poly(c.g, '#e8322b', [-4, -15.4], [-1.6, -14], [-4, -12.6]); rect(c.g, '#e8322b', -12.4, -15.6, 1.2, 3.2); },
  },
  tallbike: {
    hip: [-3, -24], hand: [6.8, -23.6], bb: [0, -15], cr: 2.8, lean: 0.8, legs: 'pedal', hitch: -7,
    frameDraw: (c) => {
      c.wheel(-7, -4.5, 4.5); c.wheel(7, -4.5, 4.5);
      diamond(c, [-7, -4.5], [0, -5], [-3.2, -12.5], [5, -12], [7, -4.5]);
      diamond(c, [-7, -14.5], [0, -15], [-3.2, -22.5], [5, -22], [6, -13]);
      c.tube([-7, -4.5], [-7, -14.5]); c.tube([5, -12], [6, -13]); line(c.g, '#555', 0.4, [0, -15], [-7, -4.5]);
      saddle(c.g, -3.1, -23.2); line(c.g, '#333', 1.3, [5, -22], [6.6, -23.6], [7.4, -22.4]); crank(c, [0, -15], 2.8);
    },
  },
  unicycle: {
    hip: [0, -15.6], hand: [5.6, -18.6], bb: [0, -5.4], cr: 2.4, lean: 0.04, legs: 'pedal', hitch: -5.4,
    tilt: (c) => Math.sin(c.t * 3.1) * 0.06,
    frameDraw: (c) => { c.wheel(0, -5.4, 5.4, { tyre: 1.6 }); c.tube([0, -5.4], [0, -14.6], 1.4); saddle(c.g, 0, -15, 3); crank(c, [0, -5.4], 2.4); },
  },
  broom: {
    hip: [-1, -11.8], hand: [5.2, -12], lean: 0.35, legs: 'dangle', hitch: -12,
    bob: (c) => -2 + Math.sin(c.t * 1.7) * 1.2,
    back: (c) => { for (let i = 0; i < 6; i++) { const k = (c.t * 1.2 + i / 6) % 1; circle(c.g, c.frame(k), -14 - k * 18, -10 + Math.sin(i * 2.3 + c.t) * 2, 0.6 * (1 - k)); } },
    frameDraw: (c) => {
      line(c.g, '#8a5a2b', 1, [-10, -9.6], [9, -12.4]);
      for (let i = -2; i <= 2; i++) line(c.g, '#d9b45a', 0.6, [-9.6, -9.6], [-15, -9.6 + i * 1.3]);
      line(c.g, c.frame(), 0.9, [-10, -10.4], [-10, -8.8]);
    },
  },
  wheel: {
    hip: [-0.6, -9.4], hand: [3.4, -11.4], lean: 0.35, legs: 'run', ground: -1.4, hitch: -12,
    frameDraw: (c) => {
      const g = c.g, col = c.frame();
      ring(g, col, 1.3, 0, -12, 12); ring(g, shade(col, 0.7), 0.5, 0, -12, 10.8);
      for (let i = 0; i < 18; i++) { const a = c.spin * 0.4 + (i * TAU) / 18; line(g, shade(col, 0.85), 0.4, [Math.cos(a) * 10.8, -12 + Math.sin(a) * 10.8], [Math.cos(a) * 12, -12 + Math.sin(a) * 12]); }
      line(g, '#9a9aa8', 0.5, [0, -12], [0, -1.2]); circle(g, '#9a9aa8', 0, -12, 0.8);
    },
  },
};

/** Paint colour at u ∈ [0, 1] (rainbow cycles in time; fade blends frame → frame2). */
export function paintAt(p: PaintLook, t: number, u = 0.5): string {
  if (p.kind === 'rainbow') return `hsl(${Math.round((t * 70 + u * 160) % 360)} 90% 60%)`;
  if (p.kind === 'fade' && p.frame2) return mixHex(p.frame, p.frame2, u);
  return p.frame;
}
function mixHex(a: string, b: string, k: number): string {
  const pa = parseInt(a.slice(1), 16), pb = parseInt(b.slice(1), 16);
  const ch = (s: number) => Math.round(((pa >> s) & 255) * (1 - k) + ((pb >> s) & 255) * k);
  return `#${((ch(16) << 16) | (ch(8) << 8) | ch(0)).toString(16).padStart(6, '0')}`;
}
