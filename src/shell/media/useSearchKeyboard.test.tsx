// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render } from 'preact';
import { useRef } from 'preact/hooks';
import { act } from 'preact/test-utils';
import { useSearchKeyboard } from './useSearchKeyboard';

class Viewport extends EventTarget {
  height = 768; width = 1024; offsetTop = 0; offsetLeft = 0; scale = 1;
  resize(height: number) { this.height = height; this.dispatchEvent(new Event('resize')); }
}
let root: HTMLDivElement, visual: Viewport;
function Harness() {
  const ref = useRef<HTMLInputElement>(null), viewport = useSearchKeyboard(ref);
  return <><input ref={ref} /><output>{JSON.stringify(viewport)}</output></>;
}
const state = () => JSON.parse(root.querySelector('output')!.textContent!);
const field = () => root.querySelector('input')!;
beforeEach(() => {
  visual = new Viewport();
  vi.stubGlobal('visualViewport', visual); vi.stubGlobal('innerHeight', 768); vi.stubGlobal('innerWidth', 1024);
  vi.stubGlobal('navigator', { maxTouchPoints: 5 });
  root = document.createElement('div'); document.body.append(root);
  act(() => render(<Harness />, root));
});
afterEach(() => { act(() => render(null, root)); root.remove(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe('search keyboard viewport', () => {
  it('keeps the normal layout for a hardware keyboard, then fits the visible area as the onscreen keyboard opens and pans', () => {
    act(() => field().focus()); expect(state()).toBeNull();
    act(() => visual.resize(300)); expect(state()).toEqual({ top: 0, left: 0, width: 1024, height: 300 });
    act(() => { visual.offsetTop = 64; visual.dispatchEvent(new Event('scroll')); });
    expect(state().top).toBe(64);
    act(() => field().blur()); expect(state().height).toBe(300); // Keep results visible throughout keyboard dismissal.
    act(() => visual.resize(768)); expect(state()).toBeNull();
  });
  it('does not hide other UI for a viewport change outside search or for pinch zoom', () => {
    act(() => visual.resize(300)); expect(state()).toBeNull();
    act(() => { field().focus(); visual.scale = 2; visual.resize(300); }); expect(state()).toBeNull();
  });
  it('restores after rotation and can open the keyboard again in the new orientation', () => {
    act(() => { field().focus(); visual.resize(300); });
    act(() => { field().blur(); vi.stubGlobal('innerWidth', 768); vi.stubGlobal('innerHeight', 1024); visual.width = 768; visual.resize(1024); });
    expect(state()).toBeNull();
    act(() => { field().focus(); visual.resize(500); }); expect(state().height).toBe(500);
  });
  it('removes viewport listeners when the picker unmounts', () => {
    const remove = vi.spyOn(visual, 'removeEventListener');
    act(() => render(null, root));
    expect(remove.mock.calls.map(([event]) => event)).toEqual(['resize', 'scroll']);
  });
});
