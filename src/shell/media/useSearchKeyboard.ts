import type { RefObject } from 'preact';
import { useEffect, useState } from 'preact/hooks';

interface SearchViewport { top: number; left: number; width: number; height: number }

/** iPad keyboards shrink the visual viewport without necessarily resizing the page. */
export function useSearchKeyboard(input: RefObject<HTMLInputElement | null>) {
  const [viewport, setViewport] = useState<SearchViewport | null>(null);
  useEffect(() => {
    const field = input.current;
    if (!field) return;
    const visual = window.visualViewport;
    let fullHeight = Math.max(window.innerHeight, document.documentElement.clientHeight);
    let fullWidth = window.innerWidth;
    let searching = false;
    const update = () => {
      if (Math.abs(window.innerWidth - fullWidth) > 100) {
        // Rotation changes the unoccluded height, too; do not mistake it for a keyboard.
        fullWidth = window.innerWidth;
        fullHeight = Math.max(window.innerHeight, document.documentElement.clientHeight);
      }
      const height = visual?.height ?? window.innerHeight;
      const scale = visual?.scale ?? 1;
      const shrunk = fullHeight - height > 120 && Math.abs(scale - 1) < 0.05;
      const touch = navigator.maxTouchPoints > 0 || window.matchMedia?.('(pointer: coarse)').matches;
      if (searching && shrunk && touch) {
        setViewport({ top: visual?.offsetTop ?? 0, left: visual?.offsetLeft ?? 0, width: visual?.width ?? window.innerWidth, height });
      } else {
        setViewport(null);
        if (document.activeElement !== field) {
          searching = false;
          fullHeight = Math.max(window.innerHeight, document.documentElement.clientHeight);
        }
      }
    };
    const focus = () => { searching = true; update(); };
    field.addEventListener('focus', focus);
    field.addEventListener('blur', update);
    visual?.addEventListener('resize', update);
    visual?.addEventListener('scroll', update);
    window.addEventListener('resize', update);
    if (document.activeElement === field) focus();
    return () => {
      field.removeEventListener('focus', focus);
      field.removeEventListener('blur', update);
      visual?.removeEventListener('resize', update);
      visual?.removeEventListener('scroll', update);
      window.removeEventListener('resize', update);
    };
  }, [input]);
  return viewport;
}
