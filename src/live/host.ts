// One running game's side of live updates: which layers it is running, and applying a version (tunables and
// renderer now, logic on the next start). GameHost supplies the two swaps it can do mid-ride.
import type { GameModule } from '../contracts';
import { BUILD_SHA, live } from './client';
import { BUILT_IN, findVersion, gameHistory, pendingFor, planApply, shellPending, type Kind, type Layers } from './feed';
import { LiveStore } from './store';
import type { LiveVersion, TuneDefault } from './types';

export interface LiveOps {
  /** Unmount the current renderer and draw the running sim with `mod`'s renderer instead. */
  swapRenderer(mod: GameModule): Promise<void>;
  /** Move tunables to these defaults (null = the built-in ones). */
  applyTuning(defaults: Record<string, TuneDefault> | null): void;
}

export class LiveHost {
  readonly store: LiveStore;
  /** What is running right now (the sim can't change mid-ride). */
  running: Layers;
  busy = false;
  private listeners = new Set<() => void>();

  constructor(readonly game: GameModule, profileId: string, start: Layers | null, private ops: LiveOps) {
    this.store = new LiveStore(profileId);
    this.running = { ...(start ?? BUILT_IN) };
  }

  subscribe(cb: () => void) { this.listeners.add(cb); const off = live.subscribe(cb); return () => { this.listeners.delete(cb); off(); }; }
  private emit() { this.listeners.forEach((l) => l()); }

  get pins(): Layers { return this.store.game(this.game.id).pins; }
  history() { return live.feed ? gameHistory(live.feed, this.game.id).reverse() : []; }
  pending() {
    const s = this.store.game(this.game.id);
    return live.feed ? pendingFor(live.feed, this.game.id, s.pins, BUILD_SHA, s.skippedSim) : [];
  }
  shellPending() { return live.feed ? shellPending(live.feed, BUILD_SHA) : []; }

  /** What applying `to` would do (without doing it). */
  preview(to: LiveVersion | null, skipLogic = false) {
    return live.feed ? planApply(live.feed, this.game.id, this.pins, BUILD_SHA, to, { skipLogic, liveSim: this.running.sim, builtInSnapshot: this.game.snapshotFormat }) : null;
  }

  /** Move to version `to` (null = built-in). Returns what happened, for a toast. */
  async apply(to: LiveVersion | null, skipLogic = false): Promise<string> {
    const feed = live.feed; if (!feed || this.busy) return '';
    const id = this.game.id;
    const plan = planApply(feed, id, this.pins, BUILD_SHA, to, { skipLogic, liveSim: this.running.sim, builtInSnapshot: this.game.snapshotFormat });
    this.busy = true; this.emit();
    const done: string[] = [];
    try {
      if (plan.tuningNow) {
        this.ops.applyTuning(to ? await live.tuning(to, id) : null);
        this.running.tuning = plan.next.tuning; done.push('tuning');
      }
      if (plan.renderNow) {
        await this.ops.swapRenderer(to ? await live.module(to, id) : this.game);
        this.running.render = plan.next.render; done.push('art');
      }
      this.store.setPins(id, plan.next);
      const target = to?.games[id];
      if (skipLogic && target) this.store.skipSim(id, target.sim);
      else if (plan.simNextStart) this.store.skipSim(id, null);
    } catch (e) {
      return `Couldn't apply ${to?.short ?? 'built-in'}: ${e instanceof Error ? e.message : e}`;
    } finally { this.busy = false; this.emit(); }
    const parts = [done.length ? `${cap(done.join(' and '))} now on ${to?.short ?? 'built-in'}` : `Now on ${to?.short ?? 'built-in'}`];
    if (plan.simNextStart) parts.push('logic applies next start');
    if (plan.renderWaitsForSim && !plan.renderNow) parts.push(plan.next.render === plan.next.sim ? 'its art comes with the logic' : 'its art needs the logic change');
    if (skipLogic) parts.push('logic skipped');
    return parts.join(' · ');
  }

  /** Which layers sit at `sha` (running now, or queued for the next start). */
  marks(sha: string | null): string[] {
    const m: string[] = [];
    const pins = this.pins;
    if (this.running.sim === sha) m.push('logic');
    else if (pins.sim === sha) m.push('logic next start');
    if (this.running.render === sha) m.push('art');
    else if (pins.render === sha) m.push('art next start');
    if (this.running.tuning === sha) m.push('tuning');
    return m;
  }

  builtInVersion(): LiveVersion | null { return findVersion(live.feed, BUILD_SHA); }

  /** Rider asked to restore a save backup: it is written when the game next starts. */
  restoreNextStart(i: number | null) { this.store.setPendingRestore(this.game.id, i); this.emit(); }
}

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
export const kindLabel: Record<Kind, string> = { tuning: 'tuning', art: 'art', logic: 'logic', shell: 'app' };
