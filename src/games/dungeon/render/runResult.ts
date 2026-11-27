import { planFor, tierOf, type RunResult } from '../sim/descent';

const clock = (s: number) => `${Math.floor(s / 60)}:${String(Math.max(0, Math.round(s)) % 60).padStart(2, '0')}`;

/** The camp's one-line summary of the last descent (a win or a death). Pure. */
export function runResultLine(r: RunResult, compact: boolean): string {
  const tier = tierOf(r.tier).name;
  if (r.won) {
    const from = r.startFloor > 1 ? ` from ${planFor(r.startFloor).name}` : '';
    const unlock = r.unlocked ? ` ${r.unlocked} unlocked!` : '';
    return compact ? `Finished ${tier} in ${clock(r.timeS)}.${unlock}`
      : `Descent finished${from} in ${clock(r.timeS)} · ${tier} · ${r.bosses} bosses · ${r.perks} SP · ● ${r.banked} banked.${unlock}`;
  }
  return compact ? `Fell on floor ${r.floor} (${planFor(r.floor).name}). Coins banked.`
    : `Fell on floor ${r.floor}, ${planFor(r.floor).name}, after ${clock(r.timeS)} · ${r.kills} kills · ${r.perks} SP · ● ${r.banked} banked.`;
}
