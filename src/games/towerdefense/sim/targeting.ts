// Turret auto-targeting (#120). Pure: no rng, no ctx. The turret always aims itself; the rider can only nudge it.
import { AIM_LIMIT, type Element } from './defs';

export interface TargetCand {
  id: number; lane: number; element: Element;
  /** 0 at the spawn gate .. 1 at the base */ progress: number;
  dist: number; angle: number; dmg: number;
}
/** A lane bias from the paddles / D-pad; `k` decays 1 → 0. */
export interface Nudge { lane: number; k: number }
export interface TargetOpts {
  /** the brood weapon's colour: the turret only "beats" these */ element: Element;
  /** max distance from the base (the Flamer's is short) */ reach: number;
  nudge: Nudge | null;
  /** nudged lane's threat x (1 + bias * k) */ nudgeBias: number;
  /** current target, kept while its lane scores >= `stick` x the best lane */ current: number;
  stick: number;
}

/** How dangerous an alien is right now: its base damage, weighted up sharply as it nears the base. */
export const threatOf = (c: TargetCand): number => c.dmg * (0.3 + c.progress) ** 2;

/** Threat per lane (3 lanes) from every alien on the field, whatever its colour. */
export function laneThreats(cands: readonly TargetCand[]): number[] {
  const out = [0, 0, 0];
  for (const c of cands) out[c.lane] += threatOf(c);
  return out;
}

/** Lane scores with the nudge applied (a tiny floor so a nudged empty lane still outranks other empty lanes). */
export function laneScores(cands: readonly TargetCand[], nudge: Nudge | null, bias: number): number[] {
  return laneThreats(cands).map((v, l) => (nudge && nudge.lane === l ? (v + 1e-3) * (1 + bias * nudge.k) : v));
}

/**
 * Picks the turret's target: the lead alien (furthest along) of the brood colour on the most threatened lane
 * that has one in reach. Falls back to the lead alien of any colour on the most threatened lane, so the turret
 * never idles while something is coming. Returns 0 when nothing is in reach.
 */
export function chooseTarget(cands: readonly TargetCand[], o: TargetOpts): number {
  const scores = laneScores(cands, o.nudge, o.nudgeBias);
  const usable = cands.filter((c) => c.dist < 96 && c.dist <= o.reach && Math.abs(c.angle) <= AIM_LIMIT);
  const pick = (ok: (c: TargetCand) => boolean): TargetCand | null => {
    let best: TargetCand | null = null;
    for (const c of usable) {
      if (!ok(c)) continue;
      if (!best || scores[c.lane] > scores[best.lane] || (scores[c.lane] === scores[best.lane] && c.progress > best.progress)) best = c;
    }
    return best;
  };
  const good = pick((c) => c.element === o.element);
  if (good) {
    const cur = usable.find((c) => c.id === o.current && c.element === o.element);
    // stick with the current target unless another lane has clearly become the bigger threat (no aim twitching)
    if (cur && cur.lane !== good.lane && scores[cur.lane] >= o.stick * scores[good.lane]) return cur.id;
    return good.id;
  }
  return pick(() => true)?.id ?? 0;
}
