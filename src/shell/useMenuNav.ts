import { useEffect, useRef, useState } from 'preact/hooks';
import { navReduce, navRows, type NavKey } from './nav';
import { onMenuPress } from './menuInput';
import { play } from '../audio/sfx';

export interface MenuNavOpts {
  /** Start focused here. */
  initial?: number;
  /** Disabled entries are skipped by directional navigation. */
  isDisabled?: (i: number) => boolean;
  /** Left/right on item i: return true if it adjusted a value (the focus then stays put). */
  onAdjust?: (i: number, dir: -1 | 1) => boolean;
  /** Y on item i (e.g. "edit this profile"). */
  onY?: (i: number) => void;
}

/**
 * D-pad / A / B / Y / keyboard menu navigation. Presses come from the shared menu input (see menuInput.ts).
 * `layout` is a column count (grid) or a list of row lengths (rows of different sizes, see navRows).
 */
export function useMenuNav(count: number, layout: number | readonly number[], onSelect: (i: number) => void, onBack?: () => void, enabled = true, opts: MenuNavOpts = {}) {
  const [index, setIndex] = useState(() => Math.min(Math.max(0, opts.initial ?? 0), Math.max(0, count - 1)));
  const ref = useRef({ index, count, layout, onSelect, onBack, opts });
  ref.current = { index, count, layout, onSelect, onBack, opts };
  useEffect(() => { if (index >= count) setIndex(Math.max(0, count - 1)); }, [count]);
  useEffect(() => {
    if (!enabled) return;
    const move = (k: NavKey) => {
      const r = ref.current;
      if ((k === 'left' || k === 'right') && r.opts.onAdjust?.(r.index, k === 'left' ? -1 : 1)) { play('uiTick'); return; }
      const step = (i: number) => typeof r.layout === 'number' ? navReduce({ index: i }, k, r.count, r.layout).index : navRows(i, k, r.layout);
      let next = step(r.index);
      const visited = new Set<number>([r.index]);
      while (r.opts.isDisabled?.(next)) {
        if (visited.has(next)) return;
        visited.add(next);
        // A vertical move may land in a locked column of an otherwise usable row.
        if ((k === 'up' || k === 'down') && typeof r.layout !== 'number') {
          let start = 0;
          for (const length of r.layout) {
            if (next >= start && next < start + length) {
              const candidates = Array.from({ length }, (_, j) => start + j)
                .filter((i) => !r.opts.isDisabled?.(i))
                .sort((a, b) => Math.abs(a - next) - Math.abs(b - next));
              if (candidates.length) { next = candidates[0]; break; }
            }
            start += length;
          }
          if (!r.opts.isDisabled?.(next)) break;
        }
        next = step(next);
      }
      if (next !== r.index) { play('uiMove'); ref.current.index = next; setIndex(next); }
    };
    const select = () => { play('uiSelect'); if (!ref.current.opts.isDisabled?.(ref.current.index)) ref.current.onSelect(ref.current.index); };
    const back = () => { if (ref.current.onBack) { play('uiBack'); ref.current.onBack(); } };
    const off = onMenuPress((p) => {
      for (const k of ['up', 'down', 'left', 'right'] as const) if (p.has(k)) move(k);
      if (p.has('a')) select();
      if (p.has('b')) back();
      if (p.has('y')) ref.current.opts.onY?.(ref.current.index);
    });
    const key = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA') return;
      if (e.key === 'Enter') select();
      else if (e.key === 'Escape' || e.key === 'Backspace') back();
    };
    window.addEventListener('keydown', key);
    return () => { off(); window.removeEventListener('keydown', key); };
  }, [enabled]);
  return [index, setIndex] as const;
}
