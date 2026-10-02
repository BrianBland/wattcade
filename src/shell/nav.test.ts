import { describe, expect, it } from 'vitest';
import { navReduce, navRows } from './nav';

describe('navReduce', () => {
  it('moves in a list', () => {
    expect(navReduce({ index: 0 }, 'down', 3).index).toBe(1);
    expect(navReduce({ index: 2 }, 'down', 3).index).toBe(2);
    expect(navReduce({ index: 0 }, 'up', 3).index).toBe(0);
  });
  it('moves in a grid', () => {
    expect(navReduce({ index: 0 }, 'right', 5, 3).index).toBe(1);
    expect(navReduce({ index: 1 }, 'down', 5, 3).index).toBe(4);
    expect(navReduce({ index: 4 }, 'up', 5, 3).index).toBe(1);
    expect(navReduce({ index: 4 }, 'right', 5, 3).index).toBe(4);
  });
  it('handles empty and out-of-range', () => {
    expect(navReduce({ index: 5 }, 'left', 0).index).toBe(0);
    expect(navReduce({ index: 9 }, 'left', 3).index).toBe(1);
  });
});

describe('navRows', () => {
  const rows = [4, 5]; // buttons 0..3, cards 4..8
  it('moves within a row', () => {
    expect(navRows(0, 'right', rows)).toBe(1);
    expect(navRows(3, 'right', rows)).toBe(3);
    expect(navRows(4, 'left', rows)).toBe(4);
  });
  it('jumps between rows by relative position', () => {
    expect(navRows(4, 'up', rows)).toBe(0);
    expect(navRows(8, 'up', rows)).toBe(3);
    expect(navRows(3, 'down', rows)).toBe(8);
    expect(navRows(6, 'up', rows)).toBe(2);
    expect(navRows(0, 'up', rows)).toBe(0);
    expect(navRows(8, 'down', rows)).toBe(8);
  });
  it('skips empty rows and clamps', () => {
    expect(navRows(0, 'down', [1, 0, 2])).toBe(1);
    expect(navRows(9, 'left', [2])).toBe(0);
    expect(navRows(0, 'down', [])).toBe(0);
  });
});
