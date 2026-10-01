// Minimal local stand-in for core's runHeadless + scripts. Delete once core's runHeadless exists.
import { FIXED_DT, type BikeState, type GameContext, type GameEvent, type GameModule, type InputState, type ResistanceEffect } from '../../../contracts';

export function makeRng(seed: number) {
  let a = seed >>> 0;
  return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
const zoneOf = (f: number): 1 | 2 | 3 | 4 | 5 => (f < 0.55 ? 1 : f <= 0.75 ? 2 : f <= 0.9 ? 3 : f <= 1.05 ? 4 : 5);

type Script = (t: number, rng: () => number, snap: any) => number; // -> ftpFraction
export const STUB_SCRIPTS: Record<string, Script> = {
  z2: () => 0.65,
  idle: () => 0,
  'storm-ready': (_t, _r, snap) => (snap?.hooks?.storm ? 0.95 : 0.65),
  mash: (_t, rng) => 0.4 + rng() * 1.2,
};

export function stubRun(game: GameModule, script: string, minutes: number, seed: number, simOpts?: Record<string, unknown>) {
  const rng = makeRng(seed);
  const events: Array<{ t: number } & GameEvent> = [];
  const effects = new Map<string, ResistanceEffect>();
  let t = 0, saved: unknown;
  let frac = 0, window3: number[] = [];
  const bike = { effortZone: 1 as 1 | 2 | 3 | 4 | 5, ftpFraction: 0, powerZone: 1 } as unknown as BikeState;
  const input = { held: new Set(), pressed: new Set(), released: new Set(), paddleL: 0, paddleR: 0, paddleIdleS: 99, source: 'script' } as unknown as InputState;
  const ctx: GameContext = {
    clock: { now: () => t, timeScale: 1 },
    profile: { id: 'p', name: 'p', color: '#ff0', ftp: 200 } as any,
    bike: () => bike, input: () => input,
    resistance: { set: (e) => effects.set(e.id, e), clear: (id) => effects.delete(id), clearAll: () => effects.clear(), useVirtualGears() {} },
    tuning: {
      num: (_k, def) => () => def, bool: (_k, def) => () => def, choice: (_k, def) => () => def,
    },
    rng, emit: (e) => events.push({ t, ...e }), debug() {}, save: (d) => { saved = d; }, load: () => undefined,
  };
  const sim = game.createSim(ctx, { seed, ...simOpts } as any);
  const scriptFn = STUB_SCRIPTS[script];
  const steps = Math.round((minutes * 60) / FIXED_DT);
  let maxGrade = -99;
  for (let i = 0; i < steps; i++) {
    t += FIXED_DT;
    // 3s smoothing of the scripted fraction, like power3s
    window3.push(scriptFn(t, rng, sim.snapshot())); if (window3.length > 90) window3.shift();
    frac = window3.reduce((a, b) => a + b, 0) / window3.length;
    (bike as any).ftpFraction = frac; (bike as any).effortZone = zoneOf(frac);
    sim.update(FIXED_DT);
    let g = 0; for (const e of effects.values()) g += e.gradePct ?? 0;
    maxGrade = Math.max(maxGrade, g);
  }
  sim.dispose?.();
  return { summary: sim.summary(), events, isOver: sim.isOver(), saved, maxGrade };
}
