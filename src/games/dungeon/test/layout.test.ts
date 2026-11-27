import { describe, expect, it } from 'vitest';
import { runLayout, bossHudLayout, playerHudLayout } from '../render/layout';

describe('run layout', () => {
  it('shares the bottom row with right-aligned actions at either pixel density', () => {
    for (const dpr of [1, 2]) {
      const scale = (r: { x: number; y: number; w: number; h: number }) =>
        ({ x: r.x * dpr, y: r.y * dpr, w: r.w * dpr, h: r.h * dpr });
      const bar = scale({ x: 0, y: 730, w: 1280, h: 70 });
      const actions = scale({ x: 800, y: 690, w: 468, h: 32 });
      const L = runLayout(1280 * dpr, 800 * dpr, 110 * dpr, dpr, 2, [bar, actions]);
      expect(L.card.y + L.card.h).toBe(722 * dpr);
      expect(L.gear.x + L.gear.w).toBeLessThan(actions.x);
      expect(L.playH).toBeLessThan(actions.y);
      const crowded = runLayout(1280 * dpr, 800 * dpr, 110 * dpr, dpr, 2,
        [bar, { ...actions, x: 200 * dpr, w: 1068 * dpr }]);
      expect(crowded.card.y + crowded.card.h).toBeLessThan(actions.y);
    }
  });
  for (const [W, H, inset, u] of [[1180, 820, 90, 1.2], [820, 1180, 120, 1.2], [2360, 1640, 180, 2.4], [640, 480, 60, 1], [390, 844, 100, 1]]) {
    it(`${W}x${H} inset ${inset}: one slim stance row above the HUD inset, chips right of the card`, () => {
      const L = runLayout(W, H, inset, u);
      for (const r of [L.card, L.stance, L.gear]) {
        expect(r.y + r.h).toBeLessThanOrEqual(H - inset + 1e-6);
        expect(r.x).toBeGreaterThanOrEqual(0); expect(r.x + r.w).toBeLessThanOrEqual(W + 1e-6);
        expect(r.h).toBeLessThanOrEqual(30 * u); // slim
      }
      expect(L.stance.x).toBeGreaterThanOrEqual(L.card.x + L.card.w);
      expect(L.playH).toBeLessThanOrEqual(Math.min(L.card.y, L.gear.y));
      const overlap = (a: typeof L.card, b: typeof L.card) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
      expect(overlap(L.gear, L.card) || overlap(L.gear, L.stance)).toBe(false);
      expect((L.card.w + L.stance.w + L.gear.w) * L.card.h / (W * H)).toBeLessThan(0.04); // the whole inventory row stays under 4% of the screen
    });
  }
});

describe('boss & boxless player HUD readability',()=>{
  const overlap = (a: { x: number; y: number; w: number; h: number }, b: { x: number; y: number; w: number; h: number }) =>
    a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

  for(const [W,H,inset,hu]of [[390,844,100,1],[1280,800,100,1.25],[2048,1536,200,2.5]]){
    it(`${W}px keeps the whole boss panel above the HUD and clear of the player HUD`,()=>{
      const r=bossHudLayout(W,H,inset,hu);expect(r.y+r.h).toBeLessThanOrEqual(H-inset);expect(r.x+r.w).toBeLessThanOrEqual(W);expect(r.w).toBeGreaterThan(W<700*hu?W*.8:W*.25);
      if(W<700*hu)expect(r.y).toBeGreaterThanOrEqual(50*hu);
      const ph = playerHudLayout(W, H, hu, true, true);
      expect(ph.potionSize).toBeGreaterThanOrEqual(18 * hu);
      expect(ph.buffY).toBeGreaterThan(ph.perkY);
      expect(ph.toastY).toBeGreaterThan(ph.buffY);
      expect(overlap(ph.bounds, r)).toBe(false);
    });
  }
});
