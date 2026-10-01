import type { Button, Seconds } from '../contracts';

export interface ScriptEvent { t: Seconds; press?: Button; release?: Button; paddleL?: number; paddleR?: number }

/**
 * Timeline-driven input for tests. Clock starts at 0 when attached via InputHub.setScript and
 * advances by dt on each beginTick. Paddle values are -1..1 (final, no deadzone); values with
 * |v| > 1 are treated as raw -100..100 and divided by 100.
 */
export class ScriptedInput {
  readonly held = new Set<Button>();
  paddleL = 0; paddleR = 0;
  private i = 0; private clock = 0;
  private readonly timeline: ScriptEvent[];
  constructor(timeline: ScriptEvent[]) {
    this.timeline = timeline.map((e, idx) => ({ e, idx })).sort((a, b) => a.e.t - b.e.t || a.idx - b.idx).map((x) => x.e);
  }
  get time() { return this.clock; }
  get done() { return this.i >= this.timeline.length; }
  /** Advance the script clock and apply all due events. Returns true if anything changed. */
  advance(dt: Seconds): boolean {
    this.clock += dt;
    let changed = false;
    while (this.i < this.timeline.length && this.timeline[this.i].t <= this.clock + 1e-9) {
      const e = this.timeline[this.i++];
      if (e.press) this.held.add(e.press);
      if (e.release) this.held.delete(e.release);
      if (e.paddleL !== undefined) this.paddleL = norm(e.paddleL);
      if (e.paddleR !== undefined) this.paddleR = norm(e.paddleR);
      changed = true;
    }
    return changed;
  }
}
function norm(v: number) { const x = Math.abs(v) > 1 ? v / 100 : v; return Math.max(-1, Math.min(1, x)); }
