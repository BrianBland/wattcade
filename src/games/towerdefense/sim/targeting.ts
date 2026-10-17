// Turret auto-targeting (#120), single road. Pure: no rng, no ctx. The turret always aims itself; the rider can
// step a temporary lock one alien closer or further along the queue.
import { AIM_LIMIT, type Element } from './defs';

export interface TargetCand {
  id: number; element: Element;
  /** seconds until it reaches the turret at its current speed */ eta: number;
  dist: number; angle: number; dmg: number; flying: boolean;
}
/** A rider's lock on one alien; `k` decays 1 → 0. */
export interface Lock { id: number; k: number }
export interface TargetOpts {
  /** the brood weapon's colour: the turret only "beats" these */ element: Element;
  /** max distance from the base */ reach: number;
  /** fireballs land on the road: Gliders can't be targeted */ groundOnly: boolean;
  lock: Lock | null;
  /** current target, kept while it arrives within `stickS` seconds of the best one (no aim twitching) */
  current: number; stickS: number;
}

/** How dangerous an alien is right now: its damage, weighted up sharply as it nears the turret. */
export const threatOf = (c: Pick<TargetCand, 'dmg' | 'eta'>): number => c.dmg / (1 + c.eta / 20) ** 2;

/** Aliens the turret can aim at, soonest arrival first. */
export function targetQueue(cands: readonly TargetCand[], o: Pick<TargetOpts, 'reach' | 'groundOnly'>): TargetCand[] {
  return cands.filter((c) => c.dist <= o.reach && Math.abs(c.angle) <= AIM_LIMIT && !(o.groundOnly && c.flying))
    .sort((a, b) => a.eta - b.eta || a.id - b.id);
}

/**
 * Picks the turret's target: a live lock if it's still in reach, otherwise the soonest-arriving alien of the brood
 * colour, otherwise the soonest of any colour, so the turret never idles while something is coming. 0 = nothing.
 */
export function chooseTarget(cands: readonly TargetCand[], o: TargetOpts): number {
  const queue = targetQueue(cands, o);
  if (o.lock && queue.some((c) => c.id === o.lock!.id)) return o.lock.id;
  const good = queue.find((c) => c.element === o.element);
  if (good) {
    const cur = queue.find((c) => c.id === o.current && c.element === o.element);
    return cur && cur.eta <= good.eta + o.stickS ? cur.id : good.id;
  }
  return queue[0]?.id ?? 0;
}

/** The alien one step closer (dir -1) or further (dir +1) along the queue from `from`; the ends stay put. */
export function stepTarget(cands: readonly TargetCand[], o: Pick<TargetOpts, 'reach' | 'groundOnly'>, from: number, dir: -1 | 1): number {
  const queue = targetQueue(cands, o);
  if (!queue.length) return 0;
  const i = queue.findIndex((c) => c.id === from);
  if (i < 0) return queue[dir < 0 ? 0 : Math.min(1, queue.length - 1)].id;
  return queue[Math.max(0, Math.min(queue.length - 1, i + dir))].id;
}
