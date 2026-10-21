// Readable matchups: turns the sim's per-enemy last hit into rate-limited feedback events, and counts ignition chains and
// multikills for callouts. Pure (no DOM), unit-tested; the renderer turns events into particles and sounds.
import { KINDS, type Element } from '../sim/defs';
import type { EnemyView, Fx, HitClass } from '../sim/types';

export interface HitEvent { id: number; x: number; y: number; cls: HitClass; element: Element; dmg: number; big: boolean }
export interface Callout { key: string; x: number; y: number; text: string; size: number; color: string }

/** A hit on a heavy alien or the boss counts as big at this fraction of max HP, or when a strong hit lands on an Exposed
 *  boss. Small aliens never show numbers (any hit is a big fraction of their HP, and a swarm would bury the field). */
export const BIG_HIT_FRAC = 0.18;
/** Per-class event budget per 100 ms, and the per-enemy minimum gap, so a 150-alien swarm stays readable. */
export const BUDGET: Record<HitClass, number> = { strong: 10, resisted: 6, neutral: 4 };
export const PER_ENEMY_GAP = 0.08;
/** Deaths within this window that make a multikill callout. */
export const MULTIKILL_N = 8, MULTIKILL_S = 1;

export const isBigHit = (e: Pick<EnemyView, 'kind' | 'hitDmg' | 'maxHp' | 'exposed' | 'hitCls'>) =>
  KINDS[e.kind].heavy && (e.hitDmg >= e.maxHp * BIG_HIT_FRAC || (e.exposed && e.hitCls === 'strong'));

export class HitFeedback {
  private seen = new Map<number, number>();
  private shown = new Map<number, number>();
  private window = { t: -1, counts: { strong: 0, resisted: 0, neutral: 0 } as Record<HitClass, number> };
  private chains = new Map<number, { n: number; x: number; y: number; t: number }>();
  private deaths: number[] = [];
  private lastFx = -1;
  private multiShownAt = -99;

  /** New hits since the last frame, within budget. Big hits always pass (they're rare by definition). */
  hits(enemies: readonly EnemyView[], t: number): HitEvent[] {
    if (t - this.window.t >= 0.1 || t < this.window.t) this.window = { t, counts: { strong: 0, resisted: 0, neutral: 0 } };
    const out: HitEvent[] = [], live = new Set<number>();
    for (const e of enemies) {
      live.add(e.id);
      if (e.hitT < 0 || this.seen.get(e.id) === e.hitT) continue;
      this.seen.set(e.id, e.hitT);
      const big = isBigHit(e);
      if (!big) {
        if (t - (this.shown.get(e.id) ?? -99) < PER_ENEMY_GAP) continue;
        if (this.window.counts[e.hitCls] >= BUDGET[e.hitCls]) continue;
      }
      this.window.counts[e.hitCls]++; this.shown.set(e.id, t);
      out.push({ id: e.id, x: e.x, y: e.y, cls: e.hitCls, element: e.element, dmg: e.hitDmg, big });
    }
    for (const id of this.seen.keys()) if (!live.has(id)) { this.seen.delete(id); this.shown.delete(id); }
    return out;
  }

  /** Chain and multikill callouts from new fx. Chains count up in place ("CHAIN ×7") from their 3rd burst. */
  callouts(fx: readonly Fx[], t: number): Callout[] {
    const out: Callout[] = [], first = this.lastFx < 0;
    for (const f of fx) {
      if (f.id <= this.lastFx) continue;
      this.lastFx = Math.max(this.lastFx, f.id);
      if (first) continue;
      if (f.kind === 'burst') {
        const c = this.chains.get(f.chain) ?? { n: 0, x: f.x, y: f.y, t };
        c.n = Math.max(c.n, f.ordinal); c.t = t;
        this.chains.set(f.chain, c);
        if (c.n >= 3) out.push({ key: `chain${f.chain}`, x: c.x, y: c.y - 4, text: `CHAIN ×${c.n}`, size: Math.min(1.6, 1 + c.n * 0.06), color: '#ffb050' });
      } else if (f.kind === 'death') this.deaths.push(t);
    }
    if (first) this.lastFx = Math.max(this.lastFx, 0);
    this.deaths = this.deaths.filter((d) => t - d <= MULTIKILL_S && d <= t);
    if (this.deaths.length >= MULTIKILL_N && t - this.multiShownAt > MULTIKILL_S) {
      this.multiShownAt = t;
      out.push({ key: `multi${Math.round(t * 10)}`, x: 50, y: 30, text: `MULTIKILL ×${this.deaths.length}`, size: 1.3, color: '#ffe27a' });
    }
    for (const [id, c] of this.chains) if (t - c.t > 3) this.chains.delete(id);
    return out;
  }
}
