import { describe, expect, it } from 'vitest';
import { MonologueQueue } from '../sim/monologue';

const DT = 1 / 30;
const run = (q: MonologueQueue, t0: number, secs: number, blocked = false) => {
  let t = t0; const seen: string[] = [];
  for (let i = 0; i < Math.round(secs / DT); i++) { t += DT; q.tick(t, DT, blocked); const v = q.view(); if (v && seen[seen.length - 1] !== v.text) seen.push(v.text); }
  return { t, seen };
};

describe('monologue queue', () => {
  it('shows one line at a time for its life, in order', () => {
    const q = new MonologueQueue(() => ({ lifeS: 4, gapS: 1, staleS: 30 }));
    q.push('one', 0); q.push('two', 0);
    q.tick(DT, DT, false);
    expect(q.view()?.text).toBe('one');
    let r = run(q, DT, 3.8); expect(q.view()?.text).toBe('one');
    r = run(q, r.t, 0.4); expect(q.view()).toBeNull();
    r = run(q, r.t, 1.2); expect(q.view()?.text).toBe('two');
    expect(q.shown).toBe(2);
  });
  it('never shows during a sprint, and resumes after', () => {
    const q = new MonologueQueue(() => ({ lifeS: 4, gapS: 1, staleS: 30 }));
    q.push('one', 0); q.tick(DT, DT, false);
    expect(q.view()).not.toBeNull();
    q.push('two', 0);
    const r = run(q, DT, 5, true);
    expect(r.seen).toEqual([]);
    expect(q.view()).toBeNull();
    run(q, r.t, 2);
    expect(q.view()?.text).toBe('two');
  });
  it('drops stale lines', () => {
    const q = new MonologueQueue(() => ({ lifeS: 4, gapS: 1, staleS: 10 }));
    q.push('old', 0);
    run(q, 0, 12, true);
    expect(q.pending()).toBe(0);
  });
});
