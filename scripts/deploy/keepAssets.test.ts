import { describe, expect, it } from 'vitest';
import { planKeep } from './keepAssets';

const DAY = 86_400_000;

describe('planKeep (earlier deploys stay loadable)', () => {
  it('keeps the current files and earlier ones inside the window, drops the stale ones', () => {
    const now = 100 * DAY;
    const p = planKeep({ 'a-old.js': now - 20 * DAY, 'b-recent.js': now - 2 * DAY, 'c.js': now - 30 * DAY }, ['c.js', 'd-new.js'], now, 10, 100);
    expect(p.restore).toEqual(['b-recent.js']);
    expect(p.index).toEqual({ 'c.js': now, 'd-new.js': now, 'b-recent.js': now - 2 * DAY });
    expect(p.dropped).toEqual(['a-old.js']);
  });

  it('caps the total, keeping the newest earlier files', () => {
    const now = 10 * DAY;
    const p = planKeep({ x: now - 3 * DAY, y: now - DAY, z: now - 2 * DAY }, ['cur'], now, 10, 3);
    expect(p.restore).toEqual(['y', 'z']);
    expect(p.dropped).toEqual(['x']);
  });

  it('starts from nothing on the first deploy', () => {
    expect(planKeep({}, ['a.js'], 5, 10, 10)).toEqual({ index: { 'a.js': 5 }, restore: [], dropped: [] });
  });
});
