import { describe, expect, it } from 'vitest';
import { createGameSession, makeRng, NullInput, testProfile, TuningRegistry } from '../../../core';
import type { Button, InputState } from '../../../contracts';
import { module } from '../index';
import { makeGear, makeUnique, makeWeapon, starterWeapon } from '../sim/loot';
import { describeGearDelta, describeWeaponDelta, evaluateLootOffer } from '../sim/lootOffer';
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

describe('lootOffer (pure)', () => {
  it('computes stat deltas for weapons and gear', () => {
    const base = starterWeapon(1);
    const strong = makeWeapon(makeRng(7), 5, 3, 'arrow');
    const deltas = describeWeaponDelta(strong, base);
    expect(deltas.some((d) => d.text.startsWith('PWR +') && d.tone === 'good')).toBe(true);

    const g0 = makeGear(makeRng(3), 1, 0, 'armor');
    const g1 = makeGear(makeRng(4), 6, 3, 'armor');
    const gd = describeGearDelta(g1, g0);
    expect(gd.some((d) => d.text.startsWith('HP +') && d.tone === 'good')).toBe(true);
  });

  it('defaults upgrades to equip, interesting sidegrades/uniques to drop, and auto-sells weak trash', () => {
    const cur = makeWeapon(makeRng(9), 6, 3, 'bolt');
    const upg = makeWeapon(makeRng(10), 8, 4, 'bolt');
    const junk = makeWeapon(makeRng(11), 1, 0, 'bolt');
    const uniq = makeUnique(makeRng(12), 4);

    const upgOffer = evaluateLootOffer(upg, cur, 50, 'ranger');
    expect(upgOffer?.defaultChoice).toBe('equip');

    expect(evaluateLootOffer(junk, cur, 10, 'ranger')).toBeNull();

    const uniqOffer = evaluateLootOffer(uniq, upg, 80, 'ranger');
    expect(uniqOffer).not.toBeNull();
    expect(uniqOffer!.deltas.length).toBeGreaterThan(0);
  });
});

describe('Loot Choice UX & contextual Y (sim)', () => {
  function setupHuman(seed = 5) {
    const reg = new TuningRegistry({ profileId: `loot-ux-${seed}` });
    reg.scoped('dungeon').num('itemDropPct', 10, 0, 100, 1);
    reg.set('dungeon.itemDropPct', 100);
    reg.scoped('dungeon').num('lootPromptS', 8, 2, 20, 0.5);
    reg.set('dungeon.lootPromptS', 4);
    const pad = new PadInput();
    const s = createGameSession({ game: module, profile: testProfile(), input: pad, fake: { script: 'z2' }, seed, simOpts: { skipCamp: true, invulnerable: true }, tuningRegistry: reg });
    return { s, pad, snap: () => s.sim.snapshot() as DungeonSnapshot };
  }

  it('opens a non-blocking Loot Choice card with stat deltas, switches Y HUD label, and lets Y flip the default choice', () => {
    const { s, pad, snap } = setupHuman(5);
    let offer: NonNullable<DungeonSnapshot['lootOffer']> | null = null;
    for (let i = 0; i < 30 * 120 && !offer; i++) {
      s.step(1);
      offer = snap().lootOffer ?? null;
    }
    expect(offer).not.toBeNull();
    expect(offer!.deltas.length).toBeGreaterThan(0);
    expect(offer!.leftS).toBeGreaterThan(0);

    // Contextual Y button reflects the opposite of the default choice
    const hudY = s.sim.hud!().controls!.find((c) => c.button === 'y')!;
    expect(hudY.active).toBe(true);
    expect(hudY.shortLabel).toBe(offer!.defaultChoice === 'equip' ? 'Drop' : 'Equip');

    const coinsBefore = snap().player.coins;
    const defEquip = offer!.defaultChoice === 'equip';

    // Pressing Y chooses the alternate (non-default) option and closes the offer without firing Rally
    pad.press('y');
    s.step(1);
    expect(snap().lootOffer).toBeNull();
    expect(snap().player.rallied).toBe(false);
    if (defEquip) expect(snap().player.coins).toBeGreaterThan(coinsBefore);
  });

  it('automatically takes the default choice when the countdown expires, and accepts direct touch lootChoice', () => {
    const { s, snap } = setupHuman(7);
    let offer: NonNullable<DungeonSnapshot['lootOffer']> | null = null;
    for (let i = 0; i < 30 * 120 && !offer; i++) {
      s.step(1);
      offer = snap().lootOffer ?? null;
    }
    expect(offer).not.toBeNull();
    const offerId = offer!.id;

    // Wait out the 4 s countdown -> auto-resolves
    s.step(30 * 5);
    expect(snap().lootOffer?.id).not.toBe(offerId);

    // Wait for next offer and resolve via direct receive({ type: 'lootChoice' })
    let offer2: NonNullable<DungeonSnapshot['lootOffer']> | null = null;
    for (let i = 0; i < 30 * 120 && !offer2; i++) {
      s.step(1);
      offer2 = snap().lootOffer ?? null;
    }
    expect(offer2).not.toBeNull();
    s.sim.receive?.({ type: 'lootChoice', choice: 'drop' });
    s.step(1);
    expect(snap().lootOffer).toBeNull();
  });
});
