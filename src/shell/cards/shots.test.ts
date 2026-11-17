import { describe, expect, it } from 'vitest';
import { games } from '../../games/registry';
import { SCRIPTS } from '../../core';
import { CARD_SHOTS, shotQuery, STAGE_H, STAGE_W } from './shots';

describe('arcade card shots', () => {
  it('every arcade game has a clip shot on a real script, cropped inside the stage', () => {
    for (const g of games) {
      const s = CARD_SHOTS[g.id];
      expect(s, g.id).toBeDefined();
      expect(SCRIPTS[s.script], `${g.id}: script ${s.script}`).toBeDefined();
      const [x, y, w, h] = s.crop ?? [0, 0, STAGE_W, STAGE_H];
      expect(x >= 0 && y >= 0 && x + w <= STAGE_W && y + h <= STAGE_H, g.id).toBe(true);
      expect(Math.abs(w / h - 16 / 9), `${g.id}: crop ~16:9`).toBeLessThan(0.02);
    }
  });
  it('shotQuery carries the shot for dev/capture.html', () => {
    const q = new URLSearchParams(shotQuery(CARD_SHOTS.watershed));
    expect(q.get('sec')).toBe('1500');
    expect(JSON.parse(q.get('opts')!)).toEqual({ autopilot: true });
    expect(new URLSearchParams(shotQuery(CARD_SHOTS.cadenza)).get('media')).toBe('edm');
  });
});
