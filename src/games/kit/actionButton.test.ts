import { describe, expect, it } from 'vitest';
import { desaturate, effortFlourish, effortTint, fillEdgeY } from './actionButton';

describe('fill-up action button helpers', () => {
  it('fills bottom to top', () => {
    expect(fillEdgeY({ y: 100, h: 50, fill: 0 })).toBe(150);
    expect(fillEdgeY({ y: 100, h: 50, fill: 0.5 })).toBe(125);
    expect(fillEdgeY({ y: 100, h: 50, fill: 1.4 })).toBe(100);
  });
  it('tints by effort and only adds flourish above zone 1', () => {
    expect(effortTint(2)).not.toBe(effortTint(4));
    expect(effortFlourish(1)).toBe(0); expect(effortFlourish(5)).toBe(1);
    expect(effortFlourish(4)).toBeGreaterThan(effortFlourish(3));
  });
  it('desaturates toward grey', () => {
    expect(desaturate('#ff0000', 1)).toBe('rgb(77,77,77)');
    expect(desaturate('#ff0000', 0)).toBe('rgb(255,0,0)');
  });
});
