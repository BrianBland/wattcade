import { expect, it, vi } from 'vitest';
import { aboveHud, drawButton, hitTest, progressRect } from './canvas';
it('keeps foreground bounds above every supplied edge inset', () => {
  expect(aboveHud(390, 844, {
    top: 12,
    left: 8,
    right: 8,
    bottom: 110
  })).toEqual({
    x: 8,
    y: 12,
    w: 374,
    h: 722
  });
  expect(aboveHud(40, 40, {
    top: 30,
    left: 30,
    right: 30,
    bottom: 30
  })).toEqual({
    x: 30,
    y: 30,
    w: 0,
    h: 0
  });
});
it('clamps progress and excludes disabled actions from hit testing', () => {
  const r = {
    x: 4,
    y: 4,
    w: 100,
    h: 44
  };
  expect(progressRect(r, 2).w).toBe(100);
  expect(progressRect(r, -1).w).toBe(0);
  expect(progressRect(r, NaN).w).toBe(0);
  expect(hitTest(r, 5, 5)).toBe(true);
  expect(hitTest(r, 5, 5, true)).toBe(false);
  expect(hitTest(r, 200, 5)).toBe(false);
});
it('isolates canvas drawing state and omits focus on disabled actions', () => {
  const g = {
    save: vi.fn(),
    restore: vi.fn(),
    fillRect: vi.fn(),
    strokeRect: vi.fn(),
    fillText: vi.fn(),
    measureText: (s: string) => ({
      width: s.length * 7
    })
  } as unknown as CanvasRenderingContext2D;
  drawButton(g, {
    x: 8,
    y: 8,
    w: 120,
    h: 44
  }, 'Long action label', {
    disabled: true,
    focused: true
  });
  expect(g.restore).toHaveBeenCalledOnce();
  expect(g.strokeRect).not.toHaveBeenCalled();
  expect(g.fillText).toHaveBeenCalledWith(expect.stringContaining('…'), 20, 30);
});
