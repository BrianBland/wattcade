import { BOSS_ESCALATION } from '../sim/boss';
import type { TdSnapshot } from '../sim/types';

export interface RideObjective { label: string; title: string; target: string; detail: string; progress?: number }
const seconds = (n: number) => `${Math.ceil(Math.max(0, n))}s`;
const role = (r: string) => r === 'boss' ? 'Boss' : r === 'easy' ? 'Recovery' : 'Work wave';

/** Read the same live effort/boss state as the sim; recovery always takes priority over stale calls. */
export function rideObjective(s: TdSnapshot): RideObjective {
  const label = `Set ${s.set.set} · ${s.set.role === 'work' ? `Work ${s.set.pos}/3` : role(s.set.role)}`;
  const next = `Next: ${role(s.forecast.role).toLowerCase()}`;
  if (s.brood.countdownS > 0) return { label, title: 'Recover', target: 'Easy spin · catch your breath',
    detail: `${role(s.set.role)} starts in ${seconds(s.brood.countdownS)}` };
  if (s.set.role === 'easy') return { label, title: 'Recovery wave', target: 'Ride easy · no called efforts',
    detail: `${seconds(s.waveMaxS - s.waveElapsed)} remaining · ${next}` };
  const b = s.boss;
  if (b) {
    const phase = `${b.name} · phase ${b.phase}/${b.phaseCount}`;
    if (b.pending) return { label: phase, title: `Phase ${b.phase + 1} next`, target: `${BOSS_ESCALATION[b.color]} · same weapon`, detail: `Starts in ${seconds(b.countdownS)}` };
    if (b.exposed) return { label: phase, title: 'Exposed', target: 'Push now · damage window open', detail: `${seconds(b.windowLeftS)} remaining` };
    if (b.telegraph) return { label: phase, title: 'Prepare to sprint', target: b.weapon === 'rail' ? 'Hold ▲ for the ERG push' : 'Sprint for ×1.5 damage', detail: `Opening in ${seconds(b.windowLeftS)}` };
    if (b.charge) return { label: phase, title: b.charge === 'warn' ? 'Ram charge incoming' : 'Ram charging', target: 'Burn it down before it reaches the base', detail: s.brood.cue };
    if (b.shield > 0) return { label: phase, title: 'Shield plates up', target: 'Fire rail charges to break them', detail: `${Math.round(b.shield * 100)}% plates left · openings break them fast` };
    return { label: phase, title: 'Hold your rhythm', target: s.brood.cue, detail: 'Watch for the next sprint window' };
  }
  const e = s.effort;
  if (e) {
    const power = e.kind === 'hold' ? `${Math.round(e.minFtp * 100)}–${Math.round(e.maxFtp * 100)}% FTP` : `≥${Math.round(e.minFtp * 100)}% FTP`;
    const target = e.kind === 'spin' ? `${e.minRpm}+ rpm · ${power}` : e.kind === 'grind' ? `${e.minRpm}–${e.maxRpm} rpm · ${power}` : power;
    const title = `${e.kind} ${e.state === 'announced' ? `in ${seconds(e.countdownS)}` : e.state === 'active' ? 'effort' : e.state === 'won' ? 'complete' : 'missed'}`;
    return { label: 'Called effort', title, target,
      detail: e.state === 'active' ? `${seconds(e.needS - e.heldS)} more · ${seconds(e.leftS)} left` : e.state === 'announced' ? `Hold the target for ${seconds(e.needS)}` : 'Return to your wave rhythm',
      progress: e.state === 'active' || e.state === 'won' ? Math.max(0, Math.min(1, e.heldS / Math.max(0.01, e.needS))) : undefined };
  }
  return { label, title: 'Hold your rhythm', target: s.brood.cue, detail: next };
}

export function crewStatus(s: TdSnapshot): { title: string; detail: string } {
  const title = `Auto-crew ${s.autoCrew ? 'on' : 'off'}`;
  if (s.constructionDone) return { title, detail: 'Order complete · next order at recovery' };
  if (s.suggestion) return { title, detail: `${s.autoCrew ? 'Queued' : 'Suggested'}: ${s.suggestion.label} · ${s.suggestion.cost} scrap` };
  return { title, detail: s.autoCrew ? 'Plans the next order during recovery' : 'Accept a suggested order or use Workshop' };
}
