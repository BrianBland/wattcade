// The fishing animation as a pure function of the sim's fishing view and story time: rod swing and bend, where the
// line ends (and its sag), the bobber, ripples / splashes and the fish. Both the canvas placeholder and the voxel rig
// read it, so the animation is the same everywhere (and testable). Timings follow the prototype (`stills/ride.ts` on
// the storyboard branch).
import { FISHING_DEFAULTS } from '../sim/fishing';
import type { FishingView } from '../sim/fishing';

export interface FishPose {
  /** Rod swing (rad-ish): − back over the shoulder (wind-up, pull), + forward (the cast). */
  rodSwing: number;
  /** Blank bend 0..1 (load). */
  bend: number;
  /** The end of the line: 0 = dangling at the tip, 1 = at the target on the water. `lift` = height above the water
   *  (fraction of the view; < 0 under). `x` lateral −1..1, `far` 0 (near shore) .. 1 (far out). */
  end: { fly: number; x: number; far: number; lift: number };
  /** Line sag 0 (taut) .. 1 (slack). */
  sag: number;
  bobber: boolean;
  /** Ripple rings at the end point: age 0..1, size multiplier. */
  rings: Array<{ age: number; size: number }>;
  /** Splash bursts at the end point: age (s), big. */
  splashes: Array<{ age: number; big: boolean }>;
  /** The fish out of the water: `leap` height (fraction of view), `roll` (rad), `hang` = dangling from the rod. */
  fish: { leap: number; roll: number; hang: boolean; haul: number } | null;
}

const ease = (x: number) => (x <= 0 ? 0 : x >= 1 ? 1 : x * x * (3 - 2 * x));
const seg = (u: number, a: number, b: number) => Math.max(0, Math.min(1, (u - a) / (b - a)));
const T = FISHING_DEFAULTS;

/** Where the cast lands: the spot's side, as far out as the spot sits and the cast reached. */
export function castTarget(f: FishingView): { x: number; far: number } {
  const sp = f.spots[f.spot];
  return { x: sp?.x ?? 0, far: Math.max(0.1, Math.min(1, 0.5 * (sp?.far ?? 0.5) + 0.5 * f.cast)) };
}

export function fishPose(f: FishingView, t: number): FishPose {
  const u = f.phaseT, tg = castTarget(f);
  const p: FishPose = { rodSwing: 0.02 * Math.sin(t * 0.7), bend: 0.05, end: { fly: 0, x: tg.x, far: tg.far, lift: 0 }, sag: 0, bobber: true, rings: [], splashes: [], fish: null };
  const ring = (age: number, life: number, size = 1) => { if (age >= 0 && age < life) p.rings.push({ age: age / life, size }); };
  switch (f.phase) {
    case 'spot': case 'done':
      p.rodSwing += f.phase === 'done' ? 0.3 : 0;
      break;
    case 'cast': {
      const castS = T.castS, wind = ease(seg(u, 0, 0.6)), go = ease(seg(u, 0.6, 0.9));
      p.rodSwing = -1 * wind * (1 - go) + 0.3 * go;
      p.bend = 0.05 + Math.sin(seg(u, 0.6, 1.2) * Math.PI) * 0.35; // whip
      p.end.fly = ease(seg(u, 0.9, castS) ** 0.85);
      p.end.lift = Math.sin(p.end.fly * Math.PI) * 0.3;
      p.sag = 0.05;
      if (u >= castS - 0.05) p.splashes.push({ age: u - castS + 0.05, big: false });
      break;
    }
    case 'wait': {
      const nib = Math.max(0, 1 - f.nibbleAge / 0.4);
      p.end.fly = 1;
      p.end.lift = 0.006 * Math.sin(t * 2.2) - 0.02 * nib + (f.twitch ? 0.004 * Math.sin(t * 17) : 0);
      p.bend = 0.05 + 0.2 * nib + (f.twitch ? 0.04 : 0);
      p.sag = 0.6;
      ring(u, 1.6); ring(f.nibbleAge, 1.2, 0.6);
      break;
    }
    case 'bite':
      p.end.fly = 1;
      p.end.lift = -Math.min(1, u * 6) * 0.04;
      p.bobber = u < 0.2;
      p.bend = 0.45 + 0.1 * Math.sin(u * 30) * Math.exp(-u * 3);
      p.rodSwing = -0.06 * Math.exp(-((u - 0.05) ** 2) * 60);
      p.sag = 0.1;
      ring(u, 1.6, 1.4);
      if (u < 0.9) p.splashes.push({ age: u, big: false });
      break;
    case 'pull': {
      p.end.fly = 1;
      p.end.x = tg.x + 0.25 * Math.sin(t * 1.3) * (0.4 + 0.6 * f.stamina);
      p.end.far = tg.far * (0.25 + 0.75 * f.stamina); // the fish comes in as it tires
      p.end.lift = -0.03;
      p.bobber = false;
      p.bend = 0.25 + 0.75 * f.tension + 0.05 * Math.sin(t * 11);
      p.rodSwing = -0.35 + 0.03 * Math.sin(t * 9);
      ring((t % 1.1) / 1.1 * 1.6, 1.6, 0.8 + f.tension);
      break;
    }
    case 'haul': {
      const k = seg(u, 0, T.haulS), leap = seg(u, 0, T.haulS * 0.4), haul = ease(seg(u, T.haulS * 0.35, T.haulS));
      p.end.fly = 1; p.end.far = tg.far * 0.25; p.bobber = false;
      p.rodSwing = -0.35 - 0.25 * haul;
      p.bend = 0.6 * (1 - 0.6 * haul);
      p.fish = { leap: Math.sin(leap * Math.PI) * 0.18 + haul * 0.4, roll: (haul > 0.5 ? Math.PI / 2 : 0.9 - 1.8 * leap) + Math.sin(t * 23) * 0.35 * (1 - 0.6 * haul), hang: haul > 0.95, haul };
      if (k < 0.6) p.splashes.push({ age: u, big: true });
      ring(u, 1.6, 1.6);
      break;
    }
    case 'card':
      p.end.fly = 1; p.end.far = tg.far * 0.25; p.bobber = false;
      p.rodSwing = -0.6; p.bend = 0.25 + 0.03 * Math.sin(t * 5.5);
      p.fish = { leap: 0.4, roll: Math.PI / 2 + Math.sin(t * 5.5) * 0.25, hang: true, haul: 1 };
      break;
    case 'escape':
      p.end.fly = 1; p.end.lift = 0.004 * Math.sin(t * 2.2);
      p.rodSwing = 0.1 * Math.exp(-u * 2);
      p.bend = 0.02; p.sag = 1;
      ring(u, 1.6, 1.2);
      if (u < 0.9) p.splashes.push({ age: u, big: true });
      break;
  }
  return p;
}
