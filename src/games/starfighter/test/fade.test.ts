import { describe, expect, it } from 'vitest';
import { clearFade, inView, viewFade } from '../render/fade';

describe('scenery fades', () => {
  it('reaches zero at every view cut-off, so nothing pops at the edge', () => {
    for (const [lx, ah] of [[0, 999.9], [0, -179.9], [209.9, 0], [-519.9, 500], [612.9, 650]]) {
      expect(inView(lx, ah)).toBe(true);
      expect(viewFade(lx, ah)).toBeLessThan(0.002);
    }
    expect(viewFade(0, 400)).toBe(1);
  });
  it('changes smoothly along a ship sailing across the view', () => {
    let prev = viewFade(-700, 900), maxStep = 0;
    for (let x = -700; x <= 700; x += 0.5) { const f = inView(x, 900) ? viewFade(x, 900) : 0; maxStep = Math.max(maxStep, Math.abs(f - prev)); prev = f; }
    expect(maxStep).toBeLessThan(0.02);
  });
  it('dissolves a hull as it nears the route instead of cutting it', () => {
    expect(clearFade(16, 16)).toBe(0);
    expect(clearFade(16 + 45, 16)).toBe(1);
    let prev = 0, maxStep = 0;
    for (let d = 0; d <= 120; d += 0.5) { const f = clearFade(d, 16); maxStep = Math.max(maxStep, Math.abs(f - prev)); prev = f; }
    expect(maxStep).toBeLessThan(0.02);
  });
});
