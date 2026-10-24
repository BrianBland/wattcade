// Chapter 2a (#190): the belly's rules, pure. Waking up (cadence opens the eyes in two slow blinks), the spare parts
// (grab each one with A as you ride past it, or the bike scoops it up: generous), and the drill's layers (flesh,
// cartilage, bone), read off the drill scene's effort plan so the bore depth is effort-gated like the scene itself.
import type { Scene } from './types';

export interface BellyTuning {
  /** Pedalling at or above this cadence wakes you (rpm). */ wakeRpm: number;
  /** Seconds of pedalling to open the eyes fully. */ wakeS: number;
  /** A part is in reach this far (scene progress) either side of it. */ partReach: number;
}

export const BELLY_DEFAULTS: BellyTuning = { wakeRpm: 30, wakeS: 45, partReach: 0.07 };

export type PartId = 'bit' | 'gearbox' | 'chain';
export interface PartDef { id: PartId; name: string; /** spareParts progress where it lies */ at: number }

/** The survey boat's coring rig, spilled along the last chamber. */
export const PARTS: readonly PartDef[] = [
  { id: 'bit', name: 'the drill bit', at: 0.3 },
  { id: 'gearbox', name: 'the gearbox', at: 0.48 },
  { id: 'chain', name: 'the drive chain', at: 0.66 },
];

const clamp01 = (x: number) => Math.max(0, Math.min(1, x));
const smooth = (a: number, b: number, x: number) => { const t = clamp01((x - a) / (b - a)); return t * t * (3 - 2 * t); };

/** Wake level for Eyes open: pedalling time, with a floor from the scene clock so a stopped rider still wakes. */
export const wakeFloor = (p: number) => smooth(0.55, 0.95, p);

/** Eyelids (0 shut .. 1 open) for a wake level 0..1: two slow blinks, then open. */
export function lidOpen(wake: number): number {
  const w = clamp01(wake);
  if (w < 0.08) return 0;
  if (w < 0.3) return 0.45 * smooth(0.08, 0.24, w) * (1 - smooth(0.24, 0.3, w)); // first blink: a slit, shut again
  if (w < 0.62) return 0.75 * smooth(0.36, 0.52, w) * (1 - smooth(0.54, 0.62, w)); // second: wider, shut again
  return smooth(0.66, 0.92, w);
}

/** Which part is in reach at spareParts progress `p` (not yet grabbed), else null. */
export function partInReach(p: number, got: ReadonlySet<PartId>, reach: number): PartDef | null {
  return PARTS.find((x) => !got.has(x.id) && Math.abs(p - x.at) <= reach) ?? null;
}

/** Parts ridden past without a grab (the bike scoops them up). */
export const partsPassed = (p: number, got: ReadonlySet<PartId>, reach: number) => PARTS.filter((x) => !got.has(x.id) && p > x.at + reach);

// ---- the drill ----------------------------------------------------------------------------------------------------

export type DrillLayerId = 'flesh' | 'cartilage' | 'bone' | 'rock';
export interface DrillLayer {
  id: DrillLayerId; name: string;
  /** Bore thickness (m). */ m: number;
  /** Face / wall colour (hex) and what it sounds like (for the sound pass, #197). */ color: number; sound: string;
  /** Camera shake (m) and chatter (Hz) while boring it: soft flesh wobbles, bone bucks. */ shake: number; chatter: number;
}

/** The belly's layers, in boring order. Each one is one of drill1's Z3 blocks (80 / 84 / 86 % FTP). */
export const BELLY_LAYERS: readonly DrillLayer[] = [
  { id: 'flesh', name: 'Flesh', m: 1.4, color: 0xd2487e, sound: 'squelch', shake: 0.004, chatter: 5 },
  { id: 'cartilage', name: 'Cartilage', m: 1.2, color: 0xd4e6f0, sound: 'crunch', shake: 0.007, chatter: 11 },
  { id: 'bone', name: 'Bone', m: 0.9, color: 0xfff3da, sound: 'screech', shake: 0.011, chatter: 19 },
];
const ROCK: DrillLayer = { id: 'rock', name: 'Rock', m: 1.2, color: 0x3b3438, sound: 'grind', shake: 0.01, chatter: 15 };

export const drillLayers = (sc: Pick<Scene, 'id' | 'effort'>): readonly DrillLayer[] =>
  sc.id === 'drill1' ? BELLY_LAYERS : sc.effort.filter(([, v]) => v >= BORE_FTP).map(() => ROCK);

/** Effort segments at or above this (fraction of FTP) are bores; the rest are the ramp-in, chip-clearing rests and
 *  the last crack. */
export const BORE_FTP = 0.75;

export type DrillPhase = 'start' | 'bore' | 'rest' | 'crack';
export interface DrillView {
  phase: DrillPhase;
  /** 0..1 through the phase. */ k: number;
  /** The layer at the bit (index into `layers`) and how far through it (0..1). */ layer: number; layerK: number;
  /** Bored depth and the total (m). */ depth: number; total: number;
  /** Planned effort right now (fraction of FTP): the ERG target. */ ftp: number;
  /** Seconds (plan) left in this phase. */ left: number;
}

/** Where the drill is at plan seconds `t` into a drill scene. Depth only grows while boring. */
export function drillView(sc: Pick<Scene, 'id' | 'effort'>, t: number): DrillView {
  const layers = drillLayers(sc), total = layers.reduce((a, l) => a + l.m, 0);
  let acc = 0, bores = 0, depth = 0;
  const n = sc.effort.length;
  for (let i = 0; i < n; i++) {
    const [d, v] = sc.effort[i], bore = v >= BORE_FTP, end = acc + d;
    if (t < end || i === n - 1) {
      const k = d > 0 ? clamp01((t - acc) / d) : 1;
      const L = Math.min(layers.length - 1, bore ? bores : Math.max(0, bores - 1));
      if (bore) depth += layers[L].m * k;
      const after = sc.effort.slice(i + 1).some(([, x]) => x >= BORE_FTP);
      const phase: DrillPhase = bore ? 'bore' : !bores ? 'start' : after ? 'rest' : 'crack';
      return { phase, k, layer: L, layerK: bore ? k : bores ? 1 : 0, depth, total, ftp: v, left: Math.max(0, end - t) };
    }
    if (bore) { depth += layers[Math.min(layers.length - 1, bores)].m; bores++; }
    acc = end;
  }
  return { phase: 'crack', k: 1, layer: layers.length - 1, layerK: 1, depth: total, total, ftp: sc.effort[n - 1][1], left: 0 };
}

/** Coggan Z3 (tempo): 76–90 % FTP. */
export const Z3: readonly [number, number] = [0.76, 0.9];
/** Planned Z3 seconds in a scene's effort plan. */
export const planZ3S = (sc: Pick<Scene, 'effort'>) => sc.effort.reduce((a, [d, v]) => a + (v >= Z3[0] && v <= Z3[1] ? d : 0), 0);
