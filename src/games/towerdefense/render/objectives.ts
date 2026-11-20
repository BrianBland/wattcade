import { BOSS_ESCALATION } from '../sim/boss';
import type { FlowStage, TdSnapshot } from '../sim/types';

export interface RideObjective { label: string; title: string; target: string; detail: string; progress?: number }
const seconds = (n: number) => `${Math.ceil(Math.max(0, n))}s`;
/** The rider-facing name of each flow stage (the code's build/peak/trough are internal words). */
export const STAGE_NAME: Record<FlowStage, string> = { 'warm-up': 'Warm-up', build: 'Rising wave', peak: 'Heavy wave', boss: 'Boss wave', trough: 'Light wave' };
const nextName = (r: string) => r === 'boss' ? 'boss' : r === 'easy' ? 'light wave' : 'heavier wave';

/** Where the ride is, for labels: "Round 2/4 · Heavy wave". */
export function flowLabel(s: TdSnapshot): string {
  const f = s.flow;
  if (!f) return '';
  return f.stage === 'warm-up' ? 'Warm-up' : `Round ${f.set}${f.sets ? `/${f.sets}` : ''} · ${STAGE_NAME[f.stage]}`;
}

/** The ride's current job, from the flow stage and the boss; the radar shows what's coming and the power card how hard to ride. */
export function rideObjective(s: TdSnapshot): RideObjective {
  const f = s.flow, label = ''; // the status plate above already names the round
  const lead = s.radar?.lead ? `${cap(s.radar.lead)} leads` : 'Mixed colours';
  const left = f ? seconds(f.leftS) : '';
  if (s.lull > 0) return { label, title: 'Get ready', target: 'Pick a first tower · A on a pad', detail: `Starts in ${seconds(s.lull)}` };
  const b = s.boss;
  if (b && f?.stage === 'boss') {
    const phase = `${b.name} · phase ${b.phase}/${b.phaseCount}`;
    if (b.pending) return { label: phase, title: `Phase ${b.phase + 1} next`, target: BOSS_ESCALATION[b.color], detail: `Starts in ${seconds(b.countdownS)}` };
    if (b.exposed) return { label: phase, title: 'Exposed', target: 'Shift to V · damage window open', detail: `${seconds(b.windowLeftS)} left` };
    if (b.telegraph) return { label: phase, title: 'Get ready to sprint', target: 'Shift to V · sprint for ×1.5 damage', detail: `Opening in ${seconds(b.windowLeftS)}` };
    if (b.charge) return { label: phase, title: b.charge === 'warn' ? 'Ram charge incoming' : 'Ram charging', target: 'Tier IV+ fire bogs the charge down', detail: 'Fireball counters red' };
    if (b.shield > 0) return { label: phase, title: 'Shield plates up', target: 'Tier IV+ Railgun cracks them', detail: `${Math.round(b.shield * 100)}% plates left` };
    return { label: phase, title: 'Boss wave', target: 'Mount its counter weapon', detail: 'Watch for the sprint window' };
  }
  const next = `then a ${nextName(s.forecast.role)}`;
  switch (f?.stage) {
    case 'warm-up': return { label, title: 'Warm-up', target: 'Build your first towers', detail: `${left} · ${next}` };
    case 'trough': return { label, title: 'Light wave', target: 'Ride easy and build', detail: `No leaks heals the base · ${left}` };
    case 'peak': return { label, title: 'Heavy wave', target: lead, detail: `${left} · ${next}` };
    default: return { label, title: 'Rising wave', target: lead, detail: `${left} · ${next}` };
  }
}
const cap = (w: string) => w.charAt(0).toUpperCase() + w.slice(1);

export function constructionStatus(s: TdSnapshot): { title: string; detail: string } {
  return s.lull > 0 || s.flow?.stage === 'trough'
    ? { title: 'Build now', detail: `${s.scrap} scrap · D-pad a pad · A builds` }
    : { title: 'Construction', detail: `${s.scrap} scrap · build any time with A` };
}
