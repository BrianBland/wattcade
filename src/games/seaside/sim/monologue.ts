// Monologue bubbles: one line at a time, held for a few seconds, never during a sprint.
import type { MonologueView } from './types';

export interface MonologueTuning { lifeS: number; gapS: number; staleS: number }

export class MonologueQueue {
  private queue: Array<{ id: number; text: string; queuedAt: number }> = [];
  private cur: { id: number; text: string; age: number } | null = null;
  private gap = 0;
  private nextId = 1;
  shown = 0;
  constructor(private tun: () => MonologueTuning) {}

  push(text: string, now: number): void { this.queue.push({ id: this.nextId++, text, queuedAt: now }); }

  /** `blocked` (a sprint) hides the bubble at once and holds the queue. */
  tick(now: number, dt: number, blocked: boolean): void {
    const { lifeS, gapS, staleS } = this.tun();
    this.queue = this.queue.filter((q) => now - q.queuedAt <= staleS);
    if (blocked) { if (this.cur) { this.cur = null; this.gap = gapS; } return; }
    if (this.cur) {
      this.cur.age += dt;
      if (this.cur.age >= lifeS) { this.cur = null; this.gap = gapS; }
      return;
    }
    if (this.gap > 0) { this.gap -= dt; return; }
    const next = this.queue.shift();
    if (next) { this.cur = { id: next.id, text: next.text, age: 0 }; this.shown++; }
  }

  view(): MonologueView | null {
    return this.cur ? { id: this.cur.id, text: this.cur.text, age: this.cur.age, life: this.tun().lifeS } : null;
  }

  pending(): number { return this.queue.length; }
}
