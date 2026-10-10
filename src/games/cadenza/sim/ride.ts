import type { MediaTimeline, ZoneTarget } from '../../../contracts';
import type { Phase } from './track';

/** Music sections stay intact; these longer blocks are the rider's instructions. */
export interface RideBlock { t0: number; t1: number; phase: Phase; target: ZoneTarget }
/**
 * Difficulty sets the intensity *and* the rest: `sprintEveryS` = minimum time between sprint starts (drop-heavy music
 * doesn't stack efforts), `restS` = shortest break / outro recovery, `mixRestS` = recovery around a song handover,
 * `periodicRestS` after `maxWorkS` of uninterrupted work.
 */
export interface RideConfig {
  buildZone: 3 | 4; dropZone: 4 | 5; holdZone: 3 | 4; sprintS: number;
  sprintEveryS: number; restS: number; mixRestS: number; maxWorkS: number; periodicRestS: number;
}
export const COUNTDOWN_S = 3;
export const TRANSITION_S = 5;
export const MIN_BLOCK_S = 30;
const MUSICAL_EFFORT_S = 12;
/** Recovery left shorter than this after making room for a sprint is not worth announcing. */
const MIN_RECOVERY_S = 8;
/** Work slivers shorter than this (e.g. the last seconds of a build before its drop) fold into a neighbour. */
const MIN_SLIVER_S = 6;

/** Rhythm-driven challenges need reliable analysis throughout their countdown and effort. */
export function reliableRhythm(tl: MediaTimeline, t0: number, t1: number): boolean {
  if (tl.coverage === undefined) return true;
  const spans = [...tl.coverage].sort((a, b) => a.t0 - b.t0);
  if (spans.some((s) => s.t0 < t1 && s.t1 > t0 && !(s.rhythm >= 0.6))) return false;
  let end = Math.max(0, t0);
  for (const s of spans) {
    if (s.t0 > end) break;
    if (s.rhythm >= 0.6) end = Math.max(end, s.t1);
    if (end >= t1) return true;
  }
  return false;
}

export const rideTarget = (phase: Phase, d: RideConfig): ZoneTarget => {
  switch (phase) {
    case 'recover': return { min: 1, max: 2, label: 'Break', source: 'power' };
    case 'sprint': return { min: d.dropZone, max: 5, label: 'Sprint!', source: 'power' };
    case 'climb': return { min: d.buildZone, max: (d.buildZone + 1) as 4 | 5, label: 'Climb', source: 'power' };
    case 'hold': return { min: d.holdZone, max: (d.holdZone + 1) as 4 | 5, label: 'Hold Steady', source: 'power' };
    default: return { min: 2, max: 3, label: 'Cruise', source: 'power' };
  }
};

type Window = { t0: number; t1: number };
function mergeWindows(windows: Window[], duration: number): Window[] {
  const result: Window[] = [];
  for (const w of [...windows].sort((a, b) => a.t0 - b.t0)) {
    const t0 = Math.max(0, w.t0), t1 = Math.min(duration, w.t1);
    if (t1 <= t0) continue;
    const prev = result.at(-1);
    // Join overlapping breaks, without swallowing the build between them.
    if (prev && t0 - prev.t1 <= 3) prev.t1 = Math.max(prev.t1, t1);
    else result.push({ t0, t1 });
  }
  return result;
}
/** Recovery never covers a sprint: the drop is the payoff, so rest is trimmed to end where it starts (the countdown runs in the rest). */
function around(windows: Window[], sprints: Window[]): Window[] {
  const out: Window[] = [];
  for (const w of windows) {
    let pieces = [w];
    for (const s of sprints) pieces = pieces.flatMap((p) => (s.t1 <= p.t0 || s.t0 >= p.t1 ? [p] : [{ t0: p.t0, t1: s.t0 }, { t0: s.t1, t1: p.t1 }]));
    out.push(...pieces.filter((p) => p.t1 - p.t0 >= MIN_RECOVERY_S));
  }
  return out;
}

/**
 * The rider's plan: drops open with a sprint (difficulty-capped, at most one per `sprintEveryS`), breaks / outros / song
 * handovers become recovery around them, and long stretches of work get a periodic rest. Short wobbles in the music
 * are smoothed toward ≥ 30 s portions, keeping meaningful builds and post-drop holds.
 */
export function planRide(tl: MediaTimeline, d: RideConfig): RideBlock[] {
  const duration = Math.max(0.1, tl.durationS);
  const sections = [...tl.sections].sort((a, b) => a.t0 - b.t0);

  const sprints: Window[] = [];
  let lastSprint = -Infinity;
  for (const s of sections) {
    if (s.kind !== 'drop') continue;
    const t0 = Math.max(0, s.t0), t1 = Math.min(duration, s.t1, t0 + d.sprintS);
    if (t1 - t0 < 3 || t0 - lastSprint < d.sprintEveryS) continue; // a skipped drop is ridden as a hold
    if (!reliableRhythm(tl, t0 - COUNTDOWN_S, t1)) continue; // effort-only hold in uncertain or unanalysed music
    sprints.push({ t0, t1 }); lastSprint = t0;
  }

  const natural: Window[] = [];
  for (const s of sections) if (s.kind === 'break' || s.kind === 'outro') natural.push({ t0: s.t0, t1: Math.max(s.t1, s.t0 + d.restS) });
  for (const song of tl.songs.slice(1)) natural.push({ t0: song.t0 - d.mixRestS / 2, t1: song.t0 + d.mixRestS / 2 });
  let recoveries = around(mergeWindows(natural, duration), sprints);
  // Even a long mix with no detected breaks needs periodic recovery.
  const periodic: Window[] = [];
  let cursor = 0;
  for (const w of [...recoveries, { t0: duration, t1: duration }]) {
    while (w.t0 - cursor > d.maxWorkS) {
      let t0 = cursor + d.maxWorkS;
      const s = sprints.find((x) => x.t0 - COUNTDOWN_S < t0 && x.t1 > t0);
      if (s) t0 = s.t1; // finish the sprint first
      const t1 = Math.min(w.t0, t0 + d.periodicRestS);
      if (t1 - t0 >= MIN_RECOVERY_S) periodic.push({ t0, t1 });
      cursor = Math.max(t1, cursor + 1);
    }
    cursor = Math.max(cursor, w.t1);
  }
  recoveries = around(mergeWindows([...recoveries, ...periodic], duration), sprints);

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
    const phase: Phase = sprints[pi] && p >= sprints[pi].t0 ? 'sprint'
      : recoveries[ri] && p >= recoveries[ri].t0 ? 'recover'
      : kind === 'build' ? 'climb' : kind === 'drop' ? 'hold' : 'cruise';
    blocks.push({ t0, t1, phase, target: rideTarget(phase, d) });
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
  const become = (b: RideBlock, as: RideBlock) => { b.phase = as.phase; b.target = as.target; };
  blocks = coalesce(blocks);
  // Smooth small fluctuations, but retain meaningful builds and post-drop effort.
  // Work may merge into other work, never into a neighboring break.
  for (;;) {
    const i = blocks.findIndex((b, i) => b.phase !== 'sprint' && b.phase !== 'recover' && b.t1 - b.t0 < MIN_BLOCK_S
      && !((b.phase === 'climb' || b.phase === 'hold') && b.t1 - b.t0 >= MUSICAL_EFFORT_S)
      && [blocks[i - 1], blocks[i + 1]].some((x) => x && x.phase !== 'sprint' && x.phase !== 'recover'));
    if (i < 0) break;
    const neighbors = [blocks[i - 1], blocks[i + 1]].filter((x) => x && x.phase !== 'sprint' && x.phase !== 'recover');
    const chosen = neighbors.sort((a, c) => (c.t1 - c.t0) - (a.t1 - a.t0))[0];
    become(blocks[i], chosen); blocks = coalesce(blocks);
  }
  // A few seconds of work wedged between rest and a sprint (or two rests) would only flash a cue: fold it into the rest.
  for (let i = 0; i < blocks.length; i++) {
    const b = blocks[i], prev = blocks[i - 1], next = blocks[i + 1];
    if (b.phase === 'sprint' || b.phase === 'recover' || b.t1 - b.t0 >= MIN_SLIVER_S) continue;
    const into = prev && prev.phase !== 'sprint' ? prev : next && next.phase !== 'sprint' ? next : null;
    if (into) become(b, into);
  }
  return coalesce(blocks);
}

export function rideIndexAt(blocks: RideBlock[], p: number): number {
  let lo = 0, hi = blocks.length - 1;
  while (lo < hi) { const m = (lo + hi + 1) >> 1; if (blocks[m].t0 <= p + 1e-6) lo = m; else hi = m - 1; }
  return lo;
}
