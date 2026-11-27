import { describe, expect, it } from 'vitest';
import { LiveStore } from './store';

const mem = () => { const m = new Map<string, string>(); return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), removeItem: (k: string) => void m.delete(k) }; };

describe('LiveStore', () => {
  it('keeps pins, skips and backups per profile and game', () => {
    const s = mem();
    const a = new LiveStore('p1', s), b = new LiveStore('p2', s);
    expect(a.game('td').pins).toEqual({ sim: null, render: null, tuning: null });
    a.setPins('td', { sim: 'x', render: 'y', tuning: null });
    a.skipSim('td', 'h');
    expect(a.game('td')).toEqual({ pins: { sim: 'x', render: 'y', tuning: null }, skippedSim: 'h' });
    expect(b.game('td').pins.sim).toBeNull();
    expect(a.lastStartedSim('td')).toBeUndefined();
    a.setStartedSim('td', null);
    expect(a.lastStartedSim('td')).toBeNull();
    for (let i = 0; i < 7; i++) a.backup('td', { time: i, beforeSim: null, afterSim: 'x', data: { i } });
    expect(a.backups('td').map((x) => x.time)).toEqual([6, 5, 4, 3, 2]);
    a.setPendingRestore('td', 1); expect(a.pendingRestore('td')).toBe(1);
    a.setPendingRestore('td', null); expect(a.pendingRestore('td')).toBeNull();
  });
});
