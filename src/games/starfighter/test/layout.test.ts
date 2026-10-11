import { describe, expect, it } from 'vitest';
import { layout } from '../render/layout';
describe('Squadron foreground fits actual shell insets', () => {
  for (const [w, h, bottom] of [[1180, 820, 150], [820, 1180, 150], [390, 844, 160], [800, 600, 100], [320, 300, 180]]) {
    it(`${w}x${h}`, () => {
      const l = layout(w, h, { top: 12, right: 10, bottom, left: 10 });
      expect(l.safe.y + l.safe.h).toBeLessThanOrEqual(h - bottom);
      expect(l.field.y + l.field.h + l.footer).toBeLessThanOrEqual(h - bottom);
      expect(l.field.x + l.field.w).toBeLessThanOrEqual(w - 10);
      expect(l.field.h).toBeGreaterThanOrEqual(0);
    });
  }
});
