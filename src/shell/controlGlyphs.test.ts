import { describe, expect, it } from 'vitest';
import { controlGlyph, controlRows } from './controlGlyphs';

describe('control glyphs', () => {
  it('maps Ride buttons and groups', () => {
    expect(controlGlyph('a').glyph).toBe('A');
    expect(controlGlyph('shiftersL').glyph).toBe('L±');
    expect(controlGlyph('paddles').glyph).toBe('⇕');
  });
  it('merges identical labels and puts active first', () => {
    const rows = controlRows([{ button: 'shiftUpL', label: 'Fire' }, { button: 'a', label: 'Build', active: true }, { button: 'shiftUpR', label: 'Fire' }]);
    expect(rows.map((r) => r.label)).toEqual(['Build', 'Fire']);
    expect(rows[1].glyphs.map((g) => g.glyph)).toEqual(['L+', 'R+']);
  });
});
