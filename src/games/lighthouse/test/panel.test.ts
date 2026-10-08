import { describe, expect, it } from 'vitest';
import { CHROME_PX, ROW_PX, rowWindow } from '../render/panel';

describe('build menu row window', () => {
  it('never needs more height than is available, and always contains the selection', () => {
    for (const H of [320, 480, 600, 768, 1000]) for (let sel = 0; sel < 13; sel++) {
      const w = rowWindow(13, sel, H);
      expect(w.start).toBeLessThanOrEqual(sel);
      expect(sel).toBeLessThan(w.start + w.count);
      expect(w.start + w.count).toBeLessThanOrEqual(13);
      if (w.count > 3) expect(CHROME_PX + w.count * ROW_PX).toBeLessThanOrEqual(H);
    }
  });
  it('shows everything when there is room', () => {
    expect(rowWindow(13, 12, 1200)).toEqual({ start: 0, count: 13 });
  });
});
