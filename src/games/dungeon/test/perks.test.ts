import { describe, expect, it } from 'vitest';
import { makeRng } from '../../../core';
import { PERKS, PERK_IDS, kitOf, perkMods, rollOffer, styleWeights, suggestPerk, type PerkRanks } from '../sim/perks';
import { perkPickLayout } from '../render/perks32';

const CTX = { stance: 'ranger' as const, stances: ['vanguard', 'ranger', 'skirmisher'] as const, style: { steady: 1, spinner: 1, sprinter: 1, climber: 1 } };
describe('perk offers', () => {
  it('deals a stance card, a ride card and a wildcard: distinct, never maxed, never a locked stance', () => {
    const rng = makeRng(7); let pity = 0;
    const ranks: PerkRanks = { musette: 2 };
    for (let i = 0; i < 400; i++) {
      const r = rollOffer(rng, ranks, pity, CTX); pity = r.pity;
      expect(new Set(r.ids).size).toBe(3);
      expect(r.ids[0]).toBe('aero');
      expect(PERKS[r.ids[1]].slot).toBe('ride');
      expect(r.ids).not.toContain('musette'); expect(r.ids).not.toContain('headlamp');
      expect(r.ids.filter((id) => PERKS[id].rarity === 2).length).toBeLessThanOrEqual(1);
    }
  });
  it('moves to another stance line once yours is maxed', () => {
    const r = rollOffer(makeRng(2), { aero: 3 }, 0, CTX);
    expect(['discs', 'tailwind']).toContain(r.ids[0]);
  });
  it('weights the ride card by how the floor was ridden', () => {
    const count = (style: Parameters<typeof styleWeights>[0]) => { const rng = makeRng(5), w = styleWeights(style); let n = 0; for (let i = 0; i < 1000; i++) if (rollOffer(rng, {}, 0, { ...CTX, style: w }).ids[1] === 'lube') n++; return n; };
    const steady = { t: 400, z2: 380, spin: 0, sprints: 0, bossT: 100, surge: 0 }, spinner = { t: 400, z2: 100, spin: 200, sprints: 0, bossT: 100, surge: 0 };
    expect(count(spinner)).toBeGreaterThan(count(steady) * 2);
    expect(styleWeights(steady).steady).toBeGreaterThan(styleWeights(spinner).steady);
  });
  it('is seeded: the same rng gives the same offers', () => {
    const a = makeRng(3), b = makeRng(3);
    for (let i = 0; i < 20; i++) expect(rollOffer(a, {}, i % 4, CTX).ids).toEqual(rollOffer(b, {}, i % 4, CTX).ids);
  });
  it('pity makes a legendary likelier after dry offers', () => {
    const count = (pity: number) => { const rng = makeRng(11); let n = 0; for (let i = 0; i < 2000; i++) if (rollOffer(rng, {}, pity, CTX).ids.some((id) => PERKS[id].rarity === 2)) n++; return n; };
    expect(count(4)).toBeGreaterThan(count(0) * 1.6);
  });
  it('deals fewer cards only when almost everything is maxed', () => {
    const all = Object.fromEntries(PERK_IDS.map((id) => [id, PERKS[id].max])) as PerkRanks;
    expect(rollOffer(makeRng(1), all, 0, CTX).ids).toEqual([]);
    delete all.lube; expect(rollOffer(makeRng(1), all, 0, CTX).ids).toEqual(['lube']);
  });
  it('stance lines work only in their stance; rank 3 evolves', () => {
    const ranks: PerkRanks = { aero: 3, discs: 2 };
    const ranger = perkMods(ranks, 1, { stance: 'ranger', cadence: 95, zone2: true }), van = perkMods(ranks, 1, { stance: 'vanguard', cadence: 75, zone2: false });
    expect(ranger.dmg).toBeCloseTo(0.36); expect(ranger.pierce).toBe(1); expect(ranger.taken).toBe(1);
    expect(van.dmg).toBeCloseTo(0.2); expect(van.taken).toBeCloseTo(0.88 * 0.88); expect(van.pierce).toBe(0);
    expect(perkMods({ discs: 3 }, 1, { stance: 'vanguard', cadence: 75, zone2: false }).dmg).toBeCloseTo(0.45);
    expect(perkMods({ lube: 1 }, 1, { stance: 'ranger', cadence: 100, zone2: false }).fireRate).toBeCloseTo(0.25);
    expect(perkMods({ sealant: 1 }, 1, { stance: 'ranger', cadence: 90, zone2: true }).regen).toBeCloseTo(0.01);
    expect(perkMods({}).taken).toBe(1);
  });
  it('wears the most prestigious jersey held', () => {
    expect(kitOf({ green: 1, polka: 1 })).toBe('polka');
    expect(kitOf({ green: 1, yellow: 1, rainbow: 1 })).toBe('rainbow');
    expect(kitOf({ aero: 1 })).toBeNull();
  });
  it('suggests defense to a hurt hero, and favours your stance line otherwise', () => {
    expect(suggestPerk(['aero', 'sealant', 'domestique'], {}, { hpFrac: 0.3, bossFightS: 60, deaths: 0, stance: 'skirmisher' })).toBe(1);
    expect(suggestPerk(['aero', 'lube', 'domestique'], { aero: 2 }, { hpFrac: 0.9, bossFightS: 60, deaths: 0, stance: 'ranger' })).toBe(0);
    expect(suggestPerk(['aero', 'lube', 'yellow'], {}, { hpFrac: 0.9, bossFightS: 60, deaths: 0, stance: 'ranger' })).toBe(2);
  });
});

describe('perk picker layout', () => {
  const sizes: Array<[number, number, number]> = [[1024, 768, 90], [2048, 1536, 180], [390, 844, 120], [844, 390, 80], [1366, 1024, 110], [320, 568, 100]];
  for (const [W, H, inset] of sizes) it(`keeps every card and the timer above the HUD inset at ${W}x${H}`, () => {
    const u = Math.max(1, Math.min(W, H) / 600) * 0.75 + 0.25, L = perkPickLayout(W, H, inset, u);
    expect(L.cards).toHaveLength(3);
    for (const c of L.cards) {
      expect(c.y + c.h).toBeLessThanOrEqual(H - inset);
      expect(c.x).toBeGreaterThanOrEqual(0); expect(c.x + c.w).toBeLessThanOrEqual(W);
      expect(c.h).toBeGreaterThan(40);
      expect(c.y).toBeGreaterThan(L.subY);
    }
    expect(L.hintY).toBeLessThanOrEqual(H - inset);
    for (let i = 1; i < 3; i++) { const a = L.cards[i - 1], b = L.cards[i]; expect(L.stacked ? b.y >= a.y + a.h : b.x >= a.x + a.w).toBe(true); }
    expect(L.cards.at(-1)!.y + L.cards.at(-1)!.h).toBeLessThan(L.hintY - 20 * u);
  });
});
