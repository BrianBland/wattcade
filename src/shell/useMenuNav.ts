import { useEffect, useRef, useState } from 'preact/hooks';
import { navReduce, type NavKey } from './nav';
import { onMenuPress } from './menuInput';

/** D-pad / A / B / keyboard menu navigation. Presses come from the shared menu input (see menuInput.ts). */
export function useMenuNav(count: number, cols: number, onSelect: (i: number) => void, onBack?: () => void, enabled = true) {
  const [index, setIndex] = useState(0);
  const ref = useRef({ index, count, cols, onSelect, onBack });
  ref.current = { index, count, cols, onSelect, onBack };
  useEffect(() => { if (index >= count) setIndex(Math.max(0, count - 1)); }, [count]);
  useEffect(() => {
    if (!enabled) return;
    const move = (k: NavKey) => setIndex((i) => navReduce({ index: i }, k, ref.current.count, ref.current.cols).index);
    const off = onMenuPress((p) => {
      for (const k of ['up', 'down', 'left', 'right'] as const) if (p.has(k)) move(k);
      if (p.has('a')) ref.current.onSelect(ref.current.index);
      if (p.has('b')) ref.current.onBack?.();
    });
    const key = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.tagName === 'INPUT' || (e.target as HTMLElement)?.tagName === 'SELECT') return;
      if (e.key === 'Enter') ref.current.onSelect(ref.current.index);
      else if (e.key === 'Escape' || e.key === 'Backspace') ref.current.onBack?.();
    };
    window.addEventListener('keydown', key);
    return () => { off(); window.removeEventListener('keydown', key); };
  }, [enabled]);
  return [index, setIndex] as const;
}
