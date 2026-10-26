import { describe, expect, it } from 'vitest';
import { runLayout, bossHudLayout } from '../render/layout';

describe('run layout', () => {
  it('shares the bottom row with right-aligned actions at either pixel density', () => {
    for (const dpr of [1, 2]) {
      const scale = (r: { x: number; y: number; w: number; h: number }) =>
        ({ x: r.x * dpr, y: r.y * dpr, w: r.w * dpr, h: r.h * dpr });
      const bar = scale({ x: 0, y: 730, w: 1280, h: 70 });
      const actions = scale({ x: 800, y: 690, w: 468, h: 32 });
      const L = runLayout(1280 * dpr, 800 * dpr, 110 * dpr, dpr, 2, [bar, actions]);
      expect(L.card.y + L.card.h).toBe(722 * dpr);
      expect(L.stance.x + L.stance.w).toBeLessThan(actions.x);
      expect(L.playH).toBeLessThan(actions.y);
      const crowded = runLayout(1280 * dpr, 800 * dpr, 110 * dpr, dpr, 2,
        [bar, { ...actions, x: 200 * dpr, w: 1068 * dpr }]);
      expect(crowded.card.y + crowded.card.h).toBeLessThan(actions.y);
    }
  });
  for (const [W, H, inset, u] of [[1180, 820, 90, 1.2], [820, 1180, 120, 1.2], [2360, 1640, 180, 2.4], [640, 480, 60, 1]]) {
    it(`${W}x${H} inset ${inset}: one slim stance row above the HUD inset, chips right of the card`, () => {
      const L = runLayout(W, H, inset, u);
      for (const r of [L.card, L.stance]) {
        expect(r.y + r.h).toBeLessThanOrEqual(H - inset + 1e-6);
        expect(r.x).toBeGreaterThanOrEqual(0); expect(r.x + r.w).toBeLessThanOrEqual(W + 1e-6);
        expect(r.h).toBeLessThanOrEqual(30 * u); // slim
      }
      expect(L.stance.x).toBeGreaterThanOrEqual(L.card.x + L.card.w);
      expect(L.playH).toBeLessThanOrEqual(L.card.y);
      expect((L.card.w + L.stance.w) * L.card.h / (W * H)).toBeLessThan(0.03); // under 3% of the screen
    });
  }
});

describe('boss HUD readability',()=>{
  for(const [W,H,inset,hu]of [[390,844,100,1],[1280,800,100,1.25],[2048,1536,200,2.5]]){
    it(`${W}px keeps the whole boss panel above the HUD`,()=>{
      const r=bossHudLayout(W,H,inset,hu);expect(r.y+r.h).toBeLessThanOrEqual(H-inset);expect(r.x+r.w).toBeLessThanOrEqual(W);expect(r.w).toBeGreaterThan(W<700*hu?W*.8:W*.25);
      if(W<700*hu)expect(r.y).toBeGreaterThanOrEqual(50*hu);
    });
  }
});
