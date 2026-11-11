// Pure: which one-shot sounds a frame should fire (by diffing two snapshots) and what the continuous voices are doing.
// Kept apart from the WebAudio glue so it runs (and is tested) in Node.
import type { FullSendSnapshot } from '../sim/sim';

export type Cue =
  | 'land' | 'landHard' | 'perfect' | 'clean' | 'crash' | 'launch' | 'moonShot' | 'arrive' | 'edge' | 'reentry'
  | 'splash' | 'breach' | 'ring' | 'star' | 'smash' | 'roar' | 'rumble' | 'snap' | 'caught' | 'tick' | 'go'
  | 'medal' | 'miss' | 'jetOn' | 'jetWeak' | 'fork' | 'forkPick' | 'menuMove' | 'menuPick' | 'trick';

type S = FullSendSnapshot;

/** One-shots for the step from `a` to `b` (a = null on the first frame: nothing fires). */
export function soundCues(a: S | null, b: S): Cue[] {
  if (!a) return [];
  const out: Cue[] = [];
  if (b.menu || a.menu) {
    if (a.menu && b.menu && (a.menu.row !== b.menu.row || a.menu.tour !== b.menu.tour || a.menu.reducedFlash !== b.menu.reducedFlash)) out.push('menuMove');
    if (a.menu && !b.menu) out.push('menuPick');
    return out;
  }
  if (b.landAt !== a.landAt) {
    if (b.landGrade === 'perfect' && b.crashAt !== b.landAt) out.push('perfect');
    else if (b.landGrade === 'good') out.push('clean');
    out.push(b.landImpact > 12 ? 'landHard' : 'land');
  }
  if (b.crashAt !== a.crashAt) out.push('crash');
  if (b.toTier && b.toTier !== a.toTier) {
    out.push(b.toTier === 'sea' ? 'edge' : b.toTier === 'moon' ? 'moonShot' : b.fromTier === 'sea' ? 'breach' : 'launch');
  }
  if (!b.toTier && a.toTier && a.toTier !== 'sea') out.push('arrive');
  if (b.fromTier === 'moon' && b.toTier === 'sea' && b.vy < -12 && !(a.fromTier === 'moon' && a.vy < -12)) out.push('reentry');
  if (b.splashAt !== a.splashAt && b.splashAt > 0) out.push(b.fromTier === 'sea' ? 'breach' : 'splash');
  for (const g of b.got) if (!a.got.some((q) => q.id === g.id && q.at === g.at)) out.push(g.kind === 'ring' ? 'ring' : 'star');
  if (b.trick && !a.trick) out.push('trick');
  if (b.jet === 'on' && a.jet !== 'on') out.push('jetOn');
  if (b.jet === 'weak' && a.jet !== 'weak') out.push('jetWeak');
  if (b.fork && !a.fork) out.push('fork');
  if (b.fork && a.fork && b.fork.pick !== a.fork.pick) out.push('forkPick');
  const p = b.piece, q = a.piece;
  if (p && q && p.kind === q.kind) {
    if (p.hitAt.length > q.hitAt.length) out.push('smash');
    if (p.caughtAt !== q.caughtAt && p.caughtAt > 0) out.push(p.chaser === 'shark' ? 'snap' : 'caught');
  }
  // the chaser announces itself as the run starts
  if (p?.kind === 'outrun' && b.phase === 'effort' && a.phase !== 'effort') out.push(p.chaser === 'trex' ? 'roar' : p.chaser === 'shark' ? 'snap' : 'rumble');
  // countdown: 3, 2, 1, GO
  if (b.phase === 'approach' && a.phase === 'approach') {
    const la = Math.ceil(a.phaseS - a.phaseT), lb = Math.ceil(b.phaseS - b.phaseT);
    if (lb !== la && lb >= 1 && lb <= 3) out.push('tick');
  }
  if (b.phase === 'effort' && a.phase === 'approach') out.push('go');
  if (b.results.length > a.results.length) out.push(b.results[b.results.length - 1].medal > 0 ? 'medal' : 'miss');
  return out;
}

/** Continuous layers: rocket roar (0..1 + pitch), wind (0..1), jet burn, re-entry roar, and the music layer. */
export function soundBeds(s: S) {
  const rocket = s.menu ? 0 : Math.min(1, 0.15 + 0.6 * Math.min(1.6, s.ftpFrac) / 1.6 + (s.jet === 'on' ? 0.3 : 0));
  const wind = s.menu ? 0 : Math.min(1, s.v / 90) * (s.tier === 'moon' ? 0.1 : s.tier === 'sea' ? 0.3 : 1) + Math.abs(s.wind) * 0.3;
  const reentry = s.fromTier === 'moon' && s.toTier === 'sea' ? Math.min(1, Math.max(0, (-s.vy - 12) / 30)) : 0;
  const music: 'menu' | 'ground' | 'sky' | 'moon' | 'sea' | 'sprint' | 'done' = s.menu ? 'menu' : s.phase === 'done' ? 'done'
    : s.phase === 'effort' ? 'sprint' : (s.toTier ?? s.tier) === 'sky' ? 'sky' : (s.toTier ?? s.tier) === 'moon' ? 'moon' : s.tier === 'sea' ? 'sea' : 'ground';
  return { rocket, rocketHz: 55 + 70 * Math.min(1.6, s.ftpFrac) + (s.jet === 'on' ? 40 : 0), wind, windHz: 300 + s.v * 9, jet: s.jet === 'on' ? 1 : 0, reentry, muffled: s.tier === 'sea', music };
}
