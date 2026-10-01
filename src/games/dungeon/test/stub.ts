// Minimal local stub of GameContext (delete once core's runHeadless is used instead).
import type { BikeState, GameContext, GameEvent, InputState, Profile, ResistanceEffect, Tuning } from '../../../contracts';
import { FIXED_DT } from '../../../contracts';

export type BikeScript = (t: number) => { power: number; cadence: number };
const FTP = 200;

export const SCRIPTS: Record<string, BikeScript> = {
  idle: () => ({ power: 0, cadence: 0 }),
  z2: () => ({ power: 0.65 * FTP, cadence: 90 }),
  sprints: (t) => ({ power: ((t % 120) >= 105 ? 1.5 : 0.6) * FTP, cadence: 90 }),
  sprintsEarly: (t) => ({ power: ((t % 120) < 15 ? 1.5 : 0.6) * FTP, cadence: 90 }),
};

function zoneOf(f: number): 1 | 2 | 3 | 4 | 5 | 6 | 7 {
  return f < 0.55 ? 1 : f <= 0.75 ? 2 : f <= 0.9 ? 3 : f <= 1.05 ? 4 : f <= 1.2 ? 5 : f <= 1.5 ? 6 : 7;
}

export function makeProfile(aimMode: Profile['settings']['aimMode'] = 'rotate'): Profile {
  return {
    id: 'p', name: 'T', color: '#0cf', ftp: FTP, maxHr: 185, weightKg: 75, xp: 0, level: 1, achievements: [],
    lifetime: { kj: 0, seconds: 0, sessions: 0, sprints: 0 }, gameData: {}, lastPlayed: {},
    settings: { difficulty: 1, zoneSource: 'power', aimMode, paddleDeadzone: 15, paddleInvertL: false, paddleInvertR: false, maxGradePct: 12, ergCapFtpFraction: 1.5 },
    createdAt: 0,
  };
}

export function makeRng(seed: number): () => number {
  let a = seed >>> 0;
  return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

export function makeStub(script: BikeScript, seed = 1, aimMode: Profile['settings']['aimMode'] = 'rotate') {
  const clock = { t: 0, timeScale: 1, now() { return this.t; } };
  const effects = new Map<string, ResistanceEffect>();
  const events: Array<{ t: number } & GameEvent> = [];
  const tuning: Tuning = {
    num: (_k, def) => () => def,
    bool: (_k, def) => () => def,
    choice: (_k, def) => () => def,
  };
  let saved: unknown;
  const bike: BikeState = {
    t: 0, connected: { trainer: false, hr: false, controller: false, fake: true },
    raw: { power: 0, cadence: 0, speedKph: 0, hr: null, resistanceLevel: null, lastPacketAgeS: 0 },
    power3s: 0, power10s: 0, cadence3s: 0, hr5s: null, crankRevs: 0, powerZone: 1, hrZone: null, effortZone: 1, ftpFraction: 0,
    sprinting: false, sprintCount: 0, kj: 0, activeSeconds: 0, gear: 6, trainerMode: 'sim',
  };
  const input: InputState = { held: new Set(), pressed: new Set(), released: new Set(), paddleL: 0, paddleR: 0, paddleIdleS: 0, source: 'script' };
  let sprintFor = 0;
  const ctx: GameContext = {
    clock, profile: makeProfile(aimMode), bike: () => bike, input: () => input,
    resistance: {
      set: (e) => { effects.set(e.id, e); }, clear: (id) => { effects.delete(id); }, clearAll: () => effects.clear(), useVirtualGears: () => {},
    },
    tuning, rng: makeRng(seed),
    emit: (e) => events.push({ t: clock.t, ...e }),
    debug: () => {}, save: (d) => { saved = d; }, load: <T>() => saved as T | undefined,
  };
  function tick() {
    clock.t += FIXED_DT; bike.t = clock.t;
    const s = script(clock.t);
    bike.raw.power = s.power; bike.raw.cadence = s.cadence;
    const k = 1 - Math.exp(-FIXED_DT / 3);
    bike.power3s += (s.power - bike.power3s) * k; bike.cadence3s += (s.cadence - bike.cadence3s) * k;
    bike.crankRevs += (s.cadence / 60) * FIXED_DT;
    bike.ftpFraction = bike.power3s / FTP; bike.powerZone = zoneOf(bike.ftpFraction);
    bike.effortZone = Math.min(5, bike.powerZone) as 1 | 2 | 3 | 4 | 5;
    sprintFor = bike.ftpFraction >= 1.2 ? sprintFor + FIXED_DT : 0;
    bike.sprinting = sprintFor >= 2;
    (input as { paddleIdleS: number }).paddleIdleS += FIXED_DT;
  }
  const gradeSum = () => { let g = 0; for (const e of effects.values()) g += e.gradePct ?? 0; return g; };
  return { ctx, bike, input, effects, events, tick, gradeSum };
}
