// Minimal local stub context approximating core scripts (delete once runHeadless is in use).
import type { BikeState, GameContext, GameEvent, GameSim, InputState, Profile, TrainerCommand, ResistanceEffect } from '../../../contracts';
import { FIXED_DT } from '../../../contracts';
import { createTdSim } from '../sim/sim';

export type ScriptName = 'sprints' | 'idle' | 'intervals';
const FTP = 200;

function scriptFrac(script: ScriptName, t: number): number {
  if (script === 'idle') return 0;
  if (script === 'sprints') return t % 120 >= 105 ? 1.5 : 0.6;
  return t % 300 < 180 ? 1.05 : 0.55;
}
function mulberry(seed: number) {
  let a = seed >>> 0;
  return () => { a = (a + 0x6d2b79f5) >>> 0; let x = Math.imul(a ^ (a >>> 15), 1 | a); x = (x + Math.imul(x ^ (x >>> 7), 61 | x)) ^ x; return ((x ^ (x >>> 14)) >>> 0) / 4294967296; };
}

export interface StubInput { held: Set<string>; pressed: Set<string>; released: Set<string>; paddleL: number; paddleR: number; paddleIdleS: number }

export function makeStub(script: ScriptName, seed: number, simOpts?: Record<string, unknown>, tune?: Record<string, number>) {
  const rng = mulberry(seed);
  let t = 0;
  const effects = new Map<string, ResistanceEffect>();
  const mixerCommands: TrainerCommand[] = [];
  const events: Array<{ t: number } & GameEvent> = [];
  let lastKey = '';
  const input: StubInput = { held: new Set(), pressed: new Set(), released: new Set(), paddleL: 0, paddleR: 0, paddleIdleS: 99 };
  const bike = { crankRevs: 0, power3s: 0, ftpFraction: 0, cadence3s: 0 } as unknown as BikeState & { crankRevs: number };
  const profile = { id: 'p', name: 'T', color: '#0f0', ftp: FTP, settings: { aimMode: 'rotate' } } as unknown as Profile;
  let saved: unknown;

  function recompute() {
    let top: ResistanceEffect | undefined;
    for (const e of effects.values()) if (!top || (e.priority ?? 0) >= (top.priority ?? 0)) top = e;
    if (!top) return;
    const cmd: TrainerCommand = top.mode === 'sim' ? { mode: 'sim', gradePct: top.gradePct ?? 0 }
      : top.mode === 'erg' ? { mode: 'erg', watts: top.watts ?? (top.ftpFraction ?? 0) * FTP }
      : { mode: 'resistance', levelPct: top.levelPct ?? 0 };
    const key = JSON.stringify(cmd);
    if (key !== lastKey) { lastKey = key; mixerCommands.push(cmd); }
  }
  const ctx: GameContext = {
    clock: { now: () => t, timeScale: 1 },
    profile,
    bike: () => bike,
    input: () => input as unknown as InputState,
    resistance: {
      set(e) { effects.set(e.id, e); recompute(); },
      clear(id) { effects.delete(id); recompute(); },
      clearAll() { effects.clear(); },
      useVirtualGears() {},
    },
    tuning: {
      num: (k, d) => () => tune?.[k] ?? d,
      bool: (_k, d) => () => d,
      choice: (_k, d) => () => d,
    },
    rng,
    emit(e) { events.push({ t, ...e }); },
    debug() {},
    save(d) { saved = d; },
    load<T>() { return saved as T | undefined; },
  };
  const sim = createTdSim(ctx, simOpts) as GameSim;
  let pw = 0;

  function step() {
    t += FIXED_DT;
    let w = scriptFrac(script, t) * FTP;
    const top = [...effects.values()][0];
    if (top?.mode === 'erg' && script !== 'idle') w = (top.ftpFraction ?? 0.95) * FTP;
    const cad = script === 'idle' ? 0 : 90;
    pw += (w - pw) * (FIXED_DT / 3);
    bike.raw = { power: w, cadence: cad } as BikeState['raw'];
    bike.power3s = pw; bike.ftpFraction = pw / FTP; bike.cadence3s = cad;
    (bike as { crankRevs: number }).crankRevs += (cad / 60) * FIXED_DT;
    sim.update(FIXED_DT);
    input.pressed.clear(); input.released.clear();
  }
  function run(minutes: number) {
    const n = Math.round((minutes * 60) / FIXED_DT);
    for (let i = 0; i < n && !sim.isOver(); i++) step();
    return { summary: sim.summary(), stats: {} as never, mixerCommands, isOver: sim.isOver(), events };
  }
  return { ctx, sim, step, run, input, effects, events, mixerCommands };
}
