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
