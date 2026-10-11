// Floor director (pure): paces each floor like an interval session. The sim feeds it game facts each tick
// and reads back the segment, which sets the HUD target, the trainer (grade offset or ERG target), and events.
//
//   warm-up (first floor of a run) -> explore Z2 -> AMBUSH Z3-4 (30-45 s) -> recover -> CALLED SPIN-UP (>100 rpm)
//   -> explore ... -> BOSS (main effort; shield = sprint, or a called surge in ERG) -> cool-down to the stairs.
// Longer rides add a second ambush per floor.

export type Seg = 'warmup' | 'explore' | 'ambush' | 'recover' | 'spinup' | 'boss' | 'cooldown';

export interface SegTarget { zone: [1 | 2 | 3 | 4 | 5, 1 | 2 | 3 | 4 | 5]; erg: number; grade: number; label: string; cadence?: number; source?: 'power' }
export interface DirectorCfg {
  warmupS: number; ambushS: number; recoverS: number; spinupS: number;
  firstAmbushAtS: number;   // floor time before the first ambush may trigger (after warm-up on a run's first floor)
  spinupAfterS: number;     // seconds of explore after recovering before the spin-up is called
  secondEffortMin: number;  // ride minutes after which floors get a 2nd ambush
  spinRpm: number;
  targets: Record<Seg, SegTarget>;
}
export const DEFAULT_TARGETS: Record<Seg, SegTarget> = {
  warmup:   { zone: [1, 2], erg: 0.5,  grade: -1, label: 'Warm up' },
  explore:  { zone: [2, 2], erg: 0.65, grade: 0,  label: 'Explore: Z2' },
  ambush:   { zone: [3, 4], erg: 0.88, grade: 3,  label: 'Ambush! Z3-4', source: 'power' },
  recover:  { zone: [1, 2], erg: 0.55, grade: -1, label: 'Recover' },
  spinup:   { zone: [2, 3], erg: 0.65, grade: -1, label: 'Spin up! >100 rpm', cadence: 100 },
  boss:     { zone: [3, 4], erg: 0.85, grade: 1,  label: 'Boss: main effort', source: 'power' },
  cooldown: { zone: [1, 2], erg: 0.5,  grade: -1, label: 'Cool down' },
};
export const DEFAULT_CFG: DirectorCfg = {
  warmupS: 120, ambushS: 40, recoverS: 60, spinupS: 20, firstAmbushAtS: 75, spinupAfterS: 30, secondEffortMin: 30, spinRpm: 100,
  targets: DEFAULT_TARGETS,
};

export interface DirectorState { seg: Seg; segT: number; floorT: number; ambushes: number; spinups: number; sinceRecover: number }
export interface DirectorIn {
  dt: number;
  rideMin: number;            // minutes since the ride started
  inFight: boolean;           // standing in an uncleared, locked room (an ambush spawns here)
  bossActive: boolean;
  bossDone: boolean;
}
export type DirectorEvent = 'ambush' | 'spinup' | 'spinupEnd' | 'ambushEnd';

export function newFloor(firstOfRun: boolean): DirectorState {
  return { seg: firstOfRun ? 'warmup' : 'explore', segT: 0, floorT: 0, ambushes: 0, spinups: 0, sinceRecover: 0 };
}
export const ambushesWanted = (rideMin: number, cfg: DirectorCfg = DEFAULT_CFG) => (rideMin >= cfg.secondEffortMin ? 2 : 1);

/** Advance the director. Mutates `s`; returns any events this tick. */
export function stepDirector(s: DirectorState, i: DirectorIn, cfg: DirectorCfg = DEFAULT_CFG): DirectorEvent[] {
  const ev: DirectorEvent[] = [];
  s.floorT += i.dt; s.segT += i.dt;
  const go = (seg: Seg) => { s.seg = seg; s.segT = 0; };
  if (i.bossDone) { if (s.seg !== 'cooldown') { if (s.seg === 'spinup') ev.push('spinupEnd'); go('cooldown'); } return ev; }
  if (i.bossActive) { if (s.seg !== 'boss') { if (s.seg === 'spinup') ev.push('spinupEnd'); go('boss'); } return ev; }
  switch (s.seg) {
    case 'warmup': if (s.segT >= cfg.warmupS) go('explore'); break;
    case 'boss': go('explore'); break; // boss reset (death) without a kill
    case 'ambush': if (s.segT >= cfg.ambushS) { ev.push('ambushEnd'); go('recover'); } break;
    case 'recover': if (s.segT >= cfg.recoverS) { go('explore'); s.sinceRecover = 0; } break;
    case 'spinup': if (s.segT >= cfg.spinupS) { ev.push('spinupEnd'); s.spinups++; go('explore'); } break;
    case 'cooldown': break;
    case 'explore': {
      s.sinceRecover += i.dt;
      const want = ambushesWanted(i.rideMin, cfg);
      if (s.ambushes < want && s.floorT >= cfg.firstAmbushAtS && i.inFight && (s.ambushes === 0 || s.spinups > 0)) { s.ambushes++; ev.push('ambush'); go('ambush'); }
      else if (s.ambushes > 0 && s.spinups === 0 && s.sinceRecover >= cfg.spinupAfterS) { ev.push('spinup'); go('spinup'); }
      break;
    }
  }
  return ev;
}

/** True while the game is calling for high cadence (only then are spin-ups above 100 rpm rewarded). */
export const spinupCalled = (s: DirectorState) => s.seg === 'spinup';
