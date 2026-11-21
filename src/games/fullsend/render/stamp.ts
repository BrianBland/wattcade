import type { FullSendSnapshot } from '../sim/sim';
import { MEDAL_NAMES } from '../sim/physics';

export interface Stamp {
  label: string; medal: number; title: string; detail: string; age: number;
}

/**
 * The medal stamp for this frame, or null.
 * A smash/leap/loop preview (`pending`, set at arrive) shows for 3.5s from the start of the payoff, so the miss is on
 * screen during the hay hit / the leap. Once `last` is written it takes over (rescued / rolled-back details only exist
 * then) and the preview must not draw again, or the two stamps stack into recovery.
 */
export function medalStamp(s: Pick<FullSendSnapshot, 'last' | 'pending' | 'phase' | 'phaseT' | 'piece'>): Stamp | null {
  if (s.last && s.last.age < 3.5) {
    return { label: stampLabel(s.last.medal, s.last.detail), medal: s.last.medal, title: s.last.title, detail: s.last.detail, age: s.last.age };
  }
  const p = s.pending;
  if (p && s.phase === 'payoff' && s.piece && s.piece.medal === -1 && s.phaseT < 3.5) {
    return { label: stampLabel(p.medal, p.detail), medal: p.medal, title: p.title, detail: p.detail, age: s.phaseT };
  }
  return null;
}

/** Medal 0 is MISSED (unless the gag was a rescue); the rest use the medal name. */
export function stampLabel(medal: number, detail: string): string {
  if (medal) return MEDAL_NAMES[medal].toUpperCase();
  return detail === 'rescued' ? 'RESCUED!' : 'MISSED';
}
