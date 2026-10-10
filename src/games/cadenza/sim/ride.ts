import type { MediaTimeline, ZoneTarget } from '../../../contracts';
import type { Phase } from './track';

/** Music sections stay intact; these longer blocks are the rider's instructions. */
export interface RideBlock { t0: number; t1: number; phase: Phase; target: ZoneTarget }
export interface RideConfig { buildZone: 3 | 4; dropZone: 4 | 5; holdZone: 3 | 4; sprintS: number }
export const COUNTDOWN_S = 3;
export const TRANSITION_S = 5;
export const MIN_BLOCK_S = 30;
const MUSICAL_EFFORT_S = 12;

const target = (phase: Phase, d: RideConfig): ZoneTarget => {
  switch (phase) {
    case 'recover': return { min: 1, max: 2, label: 'Break', source: 'power' };
    case 'sprint': return { min: d.dropZone, max: 5, label: 'Punch It!', source: 'power' };
    case 'climb': return { min: d.buildZone, max: (d.buildZone + 1) as 4 | 5, label: 'Hold Steady', source: 'power' };
    case 'hold': return { min: d.holdZone, max: (d.holdZone + 1) as 4 | 5, label: 'Hold Steady', source: 'power' };
    default: return { min: 2, max: 3, label: 'Hold Steady', source: 'power' };
  }
};

type Window = { t0: number; t1: number };
function mergeWindows(windows: Window[], duration: number): Window[] {
  const result: Window[] = [];
  for (const w of windows.sort((a, b) => a.t0 - b.t0)) {
    const t0 = Math.max(0, w.t0), t1 = Math.min(duration, w.t1);
    if (t1 <= t0) continue;
    const prev = result.at(-1);
    // Join overlapping breaks, without swallowing the build between them.
    if (prev && t0 - prev.t1 <= 3) prev.t1 = Math.max(prev.t1, t1);
    else result.push({ t0, t1 });
  }
  return result;
}

export function planRide(tl: MediaTimeline, d: RideConfig, longerBreaks = false): RideBlock[] {
  const duration = Math.max(0.1, tl.durationS), recoveryS = longerBreaks ? 45 : 15;
  const mixRecoveryS = longerBreaks ? 60 : 24;
  const sections = [...tl.sections].sort((a, b) => a.t0 - b.t0);
  const natural: Window[] = [];
  for (const s of sections) {
    if (s.kind === 'break' || s.kind === 'outro') {
      let t1 = Math.max(s.t1, s.t0 + recoveryS);
      // Standard rides keep the next musical drop; Longer Breaks deliberately protects more rest.
      if (!longerBreaks) {
        const drop = sections.find((x) => x.kind === 'drop' && x.t0 >= s.t1 && x.t0 < t1);
        if (drop) t1 = drop.t0;
      }
      natural.push({ t0: s.t0, t1 });
    }
  }
  for (const song of tl.songs.slice(1)) natural.push({ t0: song.t0 - mixRecoveryS / 2, t1: song.t0 + mixRecoveryS / 2 });
  let recoveries = mergeWindows(natural, duration);
  // Even a long mix with no detected breaks needs periodic recovery.
  const maxWorkS = longerBreaks ? 90 : 180, periodic: Window[] = [];
  let cursor = 0;
  for (const w of [...recoveries, { t0: duration, t1: duration }]) {
    while (w.t0 - cursor > maxWorkS) {
      const t0 = cursor + maxWorkS, t1 = Math.min(w.t0, t0 + (longerBreaks ? 45 : 30));
      periodic.push({ t0, t1 }); cursor = t1;
    }
    cursor = Math.max(cursor, w.t1);
  }
  recoveries = mergeWindows([...recoveries, ...periodic], duration);

  const sprints: Window[] = [];
  let lastSprintEnd = -Infinity;
  for (const s of sections) {
    if (s.kind !== 'drop') continue;
    const t0 = Math.max(0, s.t0), t1 = Math.min(duration, s.t1, t0 + d.sprintS);
    if (t1 - t0 < 3 || t0 - lastSprintEnd < (longerBreaks ? 60 : 30)) continue;
    // Standard rides can count down during the end of a musical break.
    if (recoveries.some((w) => w.t0 < t1 && w.t1 > t0 - (longerBreaks ? COUNTDOWN_S : 0))) continue;
    sprints.push({ t0, t1 }); lastSprintEnd = t1;
  }

  const cuts = [...new Set([0, duration, ...sections.flatMap((s) => [s.t0, s.t1]),
    ...recoveries.flatMap((w) => [w.t0, w.t1]), ...sprints.flatMap((w) => [w.t0, w.t1])])]
    .filter((p) => p >= 0 && p <= duration).sort((a, b) => a - b);
  let blocks: RideBlock[] = [];
  let si = 0, ri = 0, pi = 0;
  for (let i = 0; i < cuts.length - 1; i++) {
    const t0 = cuts[i], t1 = cuts[i + 1], p = (t0 + t1) / 2;
    while (si + 1 < sections.length && sections[si + 1].t0 <= p) si++;
    while (ri < recoveries.length && recoveries[ri].t1 <= p) ri++;
    while (pi < sprints.length && sprints[pi].t1 <= p) pi++;
    const section = sections[si], kind = section && p < section.t1 ? section.kind : 'verse';
    const phase: Phase = recoveries[ri] && p >= recoveries[ri].t0 ? 'recover'
      : sprints[pi] && p >= sprints[pi].t0 ? 'sprint'
      : kind === 'build' ? 'climb' : kind === 'drop' ? 'hold' : 'cruise';
    blocks.push({ t0, t1, phase, target: target(phase, d) });
  }
  const coalesce = (xs: RideBlock[]) => {
    const result: RideBlock[] = [];
    for (const b of xs) {
      const prev = result.at(-1);
      if (prev && prev.phase === b.phase) prev.t1 = b.t1;
      else result.push({ ...b });
    }
    return result;
  };
  blocks = coalesce(blocks);
  // Smooth small fluctuations, but retain meaningful builds and post-drop effort.
  // Work may merge into other work, never into a neighboring break.
  for (;;) {
    const i = blocks.findIndex((b, i) => b.phase !== 'sprint' && b.phase !== 'recover' && b.t1 - b.t0 < MIN_BLOCK_S
      && !((b.phase === 'climb' || b.phase === 'hold') && b.t1 - b.t0 >= MUSICAL_EFFORT_S)
      && [blocks[i - 1], blocks[i + 1]].some((x) => x && x.phase !== 'sprint' && x.phase !== 'recover'));
    if (i < 0) break;
    const b = blocks[i];
    const neighbors = [blocks[i - 1], blocks[i + 1]].filter((x) => x && x.phase !== 'sprint' && x.phase !== 'recover');
    const chosen = neighbors.sort((a, c) => (c.t1 - c.t0) - (a.t1 - a.t0))[0];
    if (chosen) { b.phase = chosen.phase; b.target = chosen.target; blocks = coalesce(blocks); }
  }
  return coalesce(blocks);
}

export function rideIndexAt(blocks: RideBlock[], p: number): number {
  let lo = 0, hi = blocks.length - 1;
  while (lo < hi) { const m = (lo + hi + 1) >> 1; if (blocks[m].t0 <= p + 1e-6) lo = m; else hi = m - 1; }
  return lo;
}
