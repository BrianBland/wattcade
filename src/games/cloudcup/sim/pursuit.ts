// The clock follows simulation time, including time spent on the crane.
// A paused ride stops the clock with the rest of the game.
export const kickSeconds = 20;
export const requiredSeconds = 90;
export const pursuitPhases = [
  { name: 'Roll out', seconds: 240, rival: -1 },
  { name: 'Duel 1', seconds: 120, rival: 0 },
  { name: 'Regroup', seconds: 120, rival: -1 },
  { name: 'Duel 2', seconds: 120, rival: 1 },
  { name: 'Regroup', seconds: 120, rival: -1 },
  { name: 'Duel 3', seconds: 120, rival: 2 },
  { name: 'Cool down', seconds: 240, rival: -1 },
] as const;

const workBands = [
  [0.65, 0.75],
  [0.82, 0.92],
  [0.95, 1.05],
] as const;
export function workBand(tier: number) {
  return workBands[tier];
}

export function targetBand(phase: number, elapsed: number, tier: number) {
  if (pursuitPhases[phase].rival >= 0) return workBand(tier);
  // Broad, stepped bands are readable on the bars and easy to hold on a trainer.
  const step = Math.min(3, Math.floor(elapsed / 60));
  const low = phase === 0 ? 0.4 + 0.05 * step : phase === 6 ? 0.55 - 0.05 * step : 0.48;
  return [low, low + 0.12];
}

export function pursuitClock() {
  return {
    phase: 0,
    elapsed: 0,
    duelSeconds: 0,
    workSeconds: 0,
    totalWork: 0,
    flags: 0,
    startGap: 0,
    split: 0,
    lastSplit: 0,
    lastSeconds: 0,
    lastWon: false,
    complete: false,
  };
}
export type Pursuit = ReturnType<typeof pursuitClock>;

// Reset the timing comparison at each bell. An earlier defeat cannot leave a
// rider minutes behind in the next duel. Gain is measured on the shared course
// survey, so taking a faster branch really does count toward the split.
export function scorePursuit(
  p: Pursuit,
  dt: number,
  watts: number,
  at: number,
  rivals: ReadonlyArray<{ at: number }>,
  tier: number,
  ftp: number,
) {
  if (p.complete) return;
  const phase = pursuitPhases[p.phase];
  const seconds = Math.min(dt, phase.seconds - p.elapsed);
  if (phase.rival >= 0) {
    const [low, high] = workBand(tier);
    p.split = at - rivals[phase.rival].at - p.startGap;
    p.totalWork += seconds;
    if (watts >= Math.round(low * ftp) && watts <= Math.round(high * ftp)) {
      p.duelSeconds += seconds;
      p.workSeconds += seconds;
    }
  }
  p.elapsed += seconds;
  if (p.elapsed < phase.seconds - 1e-7) return;
  if (phase.rival >= 0) {
    p.lastWon = Math.round(p.split) > 0 && p.duelSeconds >= requiredSeconds - 1e-6;
    if (p.lastWon) p.flags++;
    p.lastSplit = p.split;
    p.lastSeconds = p.duelSeconds;
  }
  if (p.phase === pursuitPhases.length - 1) {
    p.complete = true;
    return;
  }
  p.phase++;
  p.elapsed = 0;
  p.duelSeconds = 0;
  p.split = 0;
  const next = pursuitPhases[p.phase].rival;
  if (next >= 0) p.startGap = at - rivals[next].at;
}
