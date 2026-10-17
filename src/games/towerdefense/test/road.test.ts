import { describe, expect, it } from 'vitest';
import { distanceToRoad, FIELD_H, FIELD_W, PAD_R, paintSize, ROAD_HALF_WIDTH, ROAD_PADS, SHOULDER, TURRET, TURRET_R, walkedLength, worldToPaint } from '../sim/road';

describe('single road layout', () => {
  it('keeps every pad clear of the road, the turret, the field edge and each other', () => {
    for (const [i, p] of ROAD_PADS.entries()) {
      expect(distanceToRoad(p), `pad ${i} vs road`).toBeGreaterThanOrEqual(ROAD_HALF_WIDTH + SHOULDER + PAD_R + 1);
      expect(Math.hypot(p.x - TURRET.x, p.y - TURRET.y), `pad ${i} vs turret`).toBeGreaterThanOrEqual(TURRET_R + PAD_R + 2);
      expect(p.x - PAD_R).toBeGreaterThanOrEqual(0); expect(p.x + PAD_R).toBeLessThanOrEqual(FIELD_W);
      expect(p.y + PAD_R).toBeLessThanOrEqual(FIELD_H);
      for (const q of ROAD_PADS.slice(i + 1)) expect(Math.hypot(p.x - q.x, p.y - q.y)).toBeGreaterThan(PAD_R * 2 + 4);
    }
  });
  it('is a long road, roughly twice an old lane', () => {
    expect(walkedLength()).toBeGreaterThan(230);
    expect(walkedLength()).toBeLessThan(290);
  });
  it('maps the paint box onto 2:3 portrait and 3:2 landscape images', () => {
    expect(paintSize('portrait')).toMatchObject({ w: 1024, h: 1536 });
    expect(paintSize('landscape')).toMatchObject({ w: 1536, h: 1024 });
    const tp = worldToPaint('portrait', TURRET), tl = worldToPaint('landscape', TURRET);
    expect(tp.x).toBeCloseTo(512); expect(tl.y).toBeCloseTo(512);
    // Landscape: spawn edge (y = 0) right of the turret, with more hive overflow than behind the turret.
    expect(worldToPaint('landscape', { x: 40, y: 0 }).x).toBeGreaterThan(tl.x);
    expect(1536 - worldToPaint('landscape', { x: 40, y: 0 }).x).toBeGreaterThan(worldToPaint('landscape', { x: 40, y: FIELD_H }).x);
  });
});
