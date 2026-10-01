import { describe, expect, it } from 'vitest';
import { navReduce } from './nav';

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
