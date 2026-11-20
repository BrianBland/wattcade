import { BOSS_ESCALATION } from '../sim/boss';
import { roman } from '../sim/tiers';
import type { FlowStage, TdSnapshot } from '../sim/types';

export interface RideObjective { label: string; title: string; target: string; detail: string; progress?: number }
const seconds = (n: number) => `${Math.ceil(Math.max(0, n))}s`;
export const STAGE_NAME: Record<FlowStage, string> = { 'warm-up': 'Warm-up', build: 'Build', peak: 'Peak', boss: 'Boss peak', trough: 'Trough' };
const nextName = (r: string) => r === 'boss' ? 'boss peak' : r === 'easy' ? 'trough' : 'more flow';

/** Where the ride is in its set (and the level), for labels: "Set 2/4 · Build". */
export function flowLabel(s: TdSnapshot): string {
  const f = s.flow;
  if (!f) return '';
  return f.stage === 'warm-up' ? 'Warm-up' : `Set ${f.set}${f.sets ? `/${f.sets}` : ''} · ${STAGE_NAME[f.stage]}`;
}

/** The ride's current job, from the flow stage and the boss; there are no called efforts, the radar shows what's coming. */
export function rideObjective(s: TdSnapshot): RideObjective {
  const label = `${s.run ? `${s.run.name} · ` : ''}${flowLabel(s)}`;
  const want = `Tier ${roman(s.suggestedTier)}`, lead = s.radar?.lead ? `${s.radar.lead} leads` : 'mixed flow';
  const f = s.flow, left = f ? seconds(f.leftS) : '';
  if (s.lull > 0) return { label, title: 'Get ready', target: 'Pick a first tower · A on a pad', detail: `The flow starts in ${seconds(s.lull)}` };
  const b = s.boss;
  if (b && f?.stage === 'boss') {
    const phase = `${b.name} · phase ${b.phase}/${b.phaseCount}`;
    if (b.pending) return { label: phase, title: `Phase ${b.phase + 1} next`, target: BOSS_ESCALATION[b.color], detail: `Starts in ${seconds(b.countdownS)}` };
    if (b.exposed) return { label: phase, title: 'Exposed', target: 'Shift to V · damage window open', detail: `${seconds(b.windowLeftS)} remaining` };
    if (b.telegraph) return { label: phase, title: 'Prepare to sprint', target: 'Shift to tier V · sprint for ×1.5 damage', detail: `Opening in ${seconds(b.windowLeftS)}` };
    if (b.charge) return { label: phase, title: b.charge === 'warn' ? 'Ram charge incoming' : 'Ram charging', target: 'Tier IV+ ground fire bogs the charge down', detail: `${want} · Fireball counters red` };
    if (b.shield > 0) return { label: phase, title: 'Shield plates up', target: 'Railgun pulses at tier IV+ crack them', detail: `${Math.round(b.shield * 100)}% plates left · openings break them fast` };
    return { label: phase, title: 'Boss peak', target: `${want} · counter its colour`, detail: 'Watch for the next sprint window' };
  }
  const next = `then ${nextName(s.forecast.role)}`;
  switch (f?.stage) {
    case 'warm-up': return { label, title: 'Warm-up', target: `${want} · build your first towers`, detail: `${left} · ${next}` };
    case 'trough': return { label, title: 'Trough', target: `${want} · ride easy and build`, detail: `A clean trough heals the base · ${left} left` };
    case 'peak': return { label, title: 'Peak', target: `${want} · ${lead}`, detail: `${left} · ${next}` };
    default: return { label, title: 'Build', target: `${want} · ${lead}`, detail: `${left} · ${next}` };
  }
}

export function constructionStatus(s: TdSnapshot): { title: string; detail: string } {
  return s.lull > 0 || s.flow?.stage === 'trough'
    ? { title: 'Build now', detail: `${s.scrap} scrap · D-pad a pad · A builds` }
    : { title: 'Construction', detail: `${s.scrap} scrap · build any time with A` };
}
