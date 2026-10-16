import { describe, it, expect } from 'vitest';
import { NullInput, createGameSession, testProfile } from '../../../core';
import { module } from '../index';
import { KINDS } from '../sim/defs';
import type { EnemyView, Fx, TdSnapshot } from '../sim/types';
import { BUDGET, HitFeedback, MULTIKILL_N, isBigHit } from '../render/hitFeedback';

const enemy = (id: number, over: Partial<EnemyView> = {}): EnemyView => ({
  id, kind: 'mini', lane: 0, x: 10, y: 10, angle: 0, dist: 50, radius: KINDS.mini.radius, element: 'blue', gold: false, hp: 10, maxHp: 10,
  hurt: 0, charging: false, shiftIn: 0, next: null, progress: 0.3, bossPhase: 0, telegraph: false, exposed: false, staggerS: 0,
  hitT: -1, hitCls: 'neutral', hitDmg: 0, ...over,
});

describe('hit feedback', () => {
  it('reports each new hit once, with its matchup class', () => {
    const fb = new HitFeedback();
    const a = [enemy(1, { hitT: 1, hitCls: 'strong', hitDmg: 1 }), enemy(2, { hitT: 1, hitCls: 'resisted', hitDmg: 0.5 })];
    const ev = fb.hits(a, 1);
    expect(ev.map((e) => e.cls).sort()).toEqual(['resisted', 'strong']);
    expect(fb.hits(a, 1.05)).toEqual([]); // same hits: nothing new
  });
  it('rate-limits a swarm per class and per enemy, but always passes big hits', () => {
    const fb = new HitFeedback();
    const swarm = Array.from({ length: 80 }, (_, i) => enemy(i + 1, { hitT: 2, hitCls: 'strong', hitDmg: 0.5 }));
    expect(fb.hits(swarm, 2).length).toBe(BUDGET.strong);
    const fb2 = new HitFeedback();
    const bigs = Array.from({ length: 30 }, (_, i) => enemy(i + 1, { kind: 'brute', hitT: 2, hitCls: 'resisted', hitDmg: 5 }));
    expect(fb2.hits(bigs, 2).length).toBe(30);
    expect(isBigHit(enemy(1, { kind: 'boss', hitDmg: 1, maxHp: 100, exposed: true, hitCls: 'strong' }))).toBe(true);
    expect(isBigHit(enemy(1, { kind: 'mini', hitDmg: 9, maxHp: 10 }))).toBe(false); // swarm: never
    expect(isBigHit(enemy(1, { hitDmg: 1, maxHp: 100 }))).toBe(false);
  });
  it('counts ignition chains up in place from the third burst, and calls out multikills', () => {
    const fb = new HitFeedback();
    fb.callouts([], 0); // first call skips history
    const burst = (id: number, ordinal: number): Fx => ({ id, t0: 1, life: 0.5, kind: 'burst', x: 20, y: 20, r: 6, chain: 7, ordinal });
    expect(fb.callouts([burst(1, 1), burst(2, 2)], 1)).toEqual([]);
    const c = fb.callouts([burst(3, 3), burst(4, 4)], 1.1);
    expect(c.at(-1)?.text).toBe('CHAIN ×4');
    expect(new Set(c.map((x) => x.key)).size).toBe(1);
    const deaths: Fx[] = Array.from({ length: MULTIKILL_N }, (_, i) => ({ id: 10 + i, t0: 2, life: 0.4, kind: 'death', x: 1, y: 1, color: 'blue', big: false, eid: i + 1, ekind: 'mini', fire: false }));
    expect(fb.callouts(deaths, 2).some((x) => x.text.startsWith('MULTIKILL'))).toBe(true);
  });
});

describe('sim exposes hit classes', () => {
  it('a ride produces strong and resisted hits on enemies, and bursts carry their chain', () => {
    const s = createGameSession({ game: module, profile: testProfile(), input: new NullInput(), fake: { script: 'sprints' }, seed: 4, simOpts: { autopilot: true, skipGarage: true } });
    const classes = new Set<string>(); let chained = false;
    for (let i = 0; i < 30 * 60 * 8 && !(classes.has('strong') && classes.has('resisted') && chained); i++) {
      s.step(1);
      const snap = s.sim.snapshot() as TdSnapshot;
      for (const e of snap.enemies) if (e.hitT >= 0) classes.add(e.hitCls);
      for (const f of snap.fx) if (f.kind === 'burst' && f.chain > 0 && f.ordinal >= 1) chained = true;
    }
    expect(classes.has('strong')).toBe(true);
    expect(classes.has('resisted')).toBe(true);
    expect(chained).toBe(true);
  });
});
