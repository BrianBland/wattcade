import { describe, expect, it } from 'vitest';
import { createGameSession, testProfile, TuningRegistry } from '../../../core';
import type { Button, InputState } from '../../../contracts';
import { module } from '../index';
import {
  ARCHETYPE_STRIKE,
  arcanePulseProc,
  onKillElementProc,
  stormChainTargets,
  type ProcTarget,
} from '../sim/elementProcs';
import { bossTelegraphSpec } from '../render/combatFx';
import type { DungeonSnapshot } from '../sim/types';

class PadInput {
  private queued = new Set<Button>();
  private st: InputState = { held: new Set(), pressed: new Set(), released: new Set(), paddleL: 0, paddleR: 0, paddleIdleS: 99, source: 'script' };
  press(b: Button) { this.queued.add(b); }
  beginTick() {
    this.st = { ...this.st, pressed: new Set(this.queued), held: new Set(this.queued), released: new Set() };
    this.queued.clear();
  }
  state(): InputState { return this.st; }
}

const mk = (id: number, x: number, y: number, overrides: Partial<ProcTarget> = {}): ProcTarget => ({
  id, x, y, r: 0.4, alive: true, kind: 'chaser', slowT: 0, dotT: 0, dotDps: 0, ...overrides,
});

describe('elemental combat procs & archetype Strike specs (pure)', () => {
  it('chains Storm lightning across nearby enemies without revisiting origin', () => {
    const e0 = mk(1, 0, 0);
    const pool = [e0, mk(2, 2, 0), mk(3, 4.5, 0), mk(4, 15, 0)];
    const res = stormChainTargets(e0, pool, 2, 4.2);
    expect(res.targets.map((t) => t.id)).toEqual([2, 3]);
    expect(res.pts.length).toBe(3);
  });

  it('triggers Frost shatter, Fire death ignition, and Venom spore cloud only on primed kills', () => {
    const pool = [mk(1, 5, 5, { slowT: 1.5, dotT: 2 }), mk(2, 6.2, 5), mk(3, 12, 5)];
    const frost = onKillElementProc(pool[0], 'frost', pool);
    expect(frost?.kind).toBe('frost');
    expect(frost?.targets.map((t) => t.id)).toEqual([2]);
    expect(frost?.applySlowS).toBeGreaterThan(0);

    const fire = onKillElementProc(pool[0], 'fire', pool);
    expect(fire?.kind).toBe('fire');
    expect(fire?.targets.map((t) => t.id)).toEqual([2]);

    const venom = onKillElementProc(pool[0], 'venom', pool);
    expect(venom?.kind).toBe('venom');
    expect(venom?.applyDotS).toBeGreaterThan(0);

    // Unprimed kill produces no proc
    const unprimed = mk(9, 5, 5, { slowT: 0, dotT: 0 });
    expect(onKillElementProc(unprimed, 'frost', pool)).toBeNull();
    expect(onKillElementProc(unprimed, 'fire', pool)).toBeNull();
  });

  it('computes Arcane gravity pulse targets and distinct boss ground telegraph shapes', () => {
    const pool = [mk(1, 5, 5), mk(2, 6.5, 5), mk(3, 11, 5)];
    const ap = arcanePulseProc(5, 5, 1, pool, 2.8);
    expect(ap.targets.map((t) => t.id)).toEqual([2]);
    expect(ap.pullTiles).toBeGreaterThan(0);

    expect(bossTelegraphSpec(0).shape).toBe('slam');
    expect(bossTelegraphSpec(2).shape).toBe('sweep');
    expect(bossTelegraphSpec(6).shape).toBe('cone');
    expect(ARCHETYPE_STRIKE.rouleur.knockbackMult).toBeGreaterThan(1.2);
    expect(ARCHETYPE_STRIKE.puncheur.shardCount).toBe(5);
    expect(ARCHETYPE_STRIKE.grimpeur.knockbackMult).toBeGreaterThan(1.1);
  });
});

describe('Ward Parry counter-bolts & archetype-flavored Strike (sim)', () => {
  it('fires golden counter-bolts and shockwave when Ward parries a boss big attack', () => {
    const reg = new TuningRegistry({ profileId: 'combat-parry' });
    reg.scoped('dungeon').num('bossBigEveryS', 20, 6, 60, 1);
    reg.set('dungeon.bossBigEveryS', 6);
    const pad = new PadInput();
    const s = createGameSession({
      game: module, profile: testProfile(), input: pad, fake: { script: 'z2' },
      seed: 5, simOpts: { skipCamp: true, invulnerable: true }, tuningRegistry: reg,
    });

    let parried = false, sawShockwave = false;
    for (let i = 0; i < 30 * 60 * 10 && !parried; i++) {
      const pre = s.sim.snapshot() as DungeonSnapshot;
      if (pre.boss?.active && pre.boss.cycle === 'windup' && !pre.player.warded) {
        pad.press('b');
      }
      s.step(1);
      const cur = s.sim.snapshot() as DungeonSnapshot;
      if (cur.boss?.active && cur.boss.cycle === 'exposed' && cur.fx.some((f) => f.kind === 'banner' && f.text?.includes('PARRIED'))) {
        parried = true;
        sawShockwave = cur.fx.some((f) => f.kind === 'boom' && f.color === '#ffe08a');
      }
    }
    expect(parried).toBe(true);
    expect(sawShockwave).toBe(true);
  });

  it('fires Puncheur piercing Strike shards and emits archetype-colored Strike rings', () => {
    const pad = new PadInput();
    const s = createGameSession({
      game: module, profile: testProfile(), input: pad, fake: { script: 'z2' },
      seed: 5, simOpts: { skipCamp: true, invulnerable: true, archetype: 'puncheur' },
    });

    let struck = false;
    for (let i = 0; i < 30 * 90 && !struck; i++) {
      const pre = s.sim.snapshot() as DungeonSnapshot;
      const strikeAct = pre.actions.find((a) => a.id === 'strike');
      if (strikeAct?.usable) {
        const beforeBullets = pre.bullets.length;
        pad.press('a');
        s.step(1);
        const cur = s.sim.snapshot() as DungeonSnapshot;
        const stColor = ARCHETYPE_STRIKE[cur.archetype.id].color;
        expect(cur.fx.some((f) => f.kind === 'boom' && f.color === stColor)).toBe(true);
        expect(cur.bullets.length).toBeGreaterThanOrEqual(beforeBullets + 4);
        struck = true;
      } else {
        s.step(1);
      }
    }
    expect(struck).toBe(true);
  });
});
