export type NavKey = 'up' | 'down' | 'left' | 'right';
export interface NavState { index: number }

/** Row-major grid navigation (cols=1 is a plain list). Clamps at the edges; empty lists stay at 0. */
export function navReduce(state: NavState, key: NavKey, count: number, cols = 1): NavState {
  if (count <= 0) return { index: 0 };
  const c = Math.max(1, Math.min(cols, count));
  let i = Math.min(Math.max(state.index, 0), count - 1);
  if (key === 'left') i = i - 1;
  else if (key === 'right') i = i + 1;
  else if (key === 'up') i = i - c;
  else if (key === 'down') i = i + c;
  return { index: Math.min(Math.max(i, 0), count - 1) };
}

/**
 * Navigation over rows of different lengths (e.g. a button bar above a row of cards). Items are numbered row by row.
 * Left/right stay within the row; up/down jump to the item at the same relative position in the next row.
 */
export function navRows(index: number, key: NavKey, rows: readonly number[]): number {
  const lens = rows.filter((r) => r > 0);
  const total = lens.reduce((a, b) => a + b, 0);
  if (!total) return 0;
  let i = Math.min(Math.max(index, 0), total - 1), r = 0, start = 0;
  while (i >= start + lens[r]) { start += lens[r]; r++; }
  const col = i - start;
  if (key === 'left') return Math.max(start, i - 1);
  if (key === 'right') return Math.min(start + lens[r] - 1, i + 1);
  const nr = key === 'up' ? r - 1 : r + 1;
  if (nr < 0 || nr >= lens.length) return i;
  const nStart = lens.slice(0, nr).reduce((a, b) => a + b, 0);
  const frac = lens[r] > 1 ? col / (lens[r] - 1) : 0;
  return nStart + Math.round(frac * (lens[nr] - 1));
}
