import { describe, expect, it } from 'vitest';
import { generateWorld, TILE } from '../sim/world';
import { makeRng } from '../../../core';
import { floorInfo } from '../render/world32';

describe('room dressing', () => {
  for (const fl of [1, 2, 3, 4]) it(`floor ${fl}: props stand on open floor away from doors, and rooms get centrepieces and lit props`, () => {
    const w = generateWorld(makeRng(fl * 7), fl), info = floorInfo(w), at = (x: number, y: number) => w.tiles[y * w.w + x];
    for (const d of info.decor) {
      expect(at(d.x, d.y)).toBe(TILE.FLOOR);
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) expect(at(d.x + dx, d.y + dy)).not.toBe(TILE.DOOR);
    }
    const pieces = info.decals.filter((d) => ['carpet', 'rosette', 'ledger', 'ledger2', 'mosaic', 'rune', 'fissure'].includes(d.name));
    expect(pieces.length).toBeGreaterThanOrEqual(Math.floor(w.rooms.length / 2));
    expect(info.lit.length).toBeGreaterThan(w.rooms.length);
    const again = floorInfo(w);
    expect(again.decor).toEqual(info.decor);   // deterministic: same world, same dressing
  });
});
