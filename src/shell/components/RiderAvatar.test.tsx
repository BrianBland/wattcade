// @vitest-environment jsdom
import { render } from 'preact';
import { act } from 'preact/test-utils';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { RiderAvatar } from './RiderAvatar';
import { drawRider } from '../../cosmetics/draw/rider';
import { testProfile } from '../../core';

vi.mock('../../cosmetics/draw/rider', () => ({ drawRider: vi.fn() }));

let host: HTMLDivElement;
let intersections: Array<{ callback: IntersectionObserverCallback; disconnect: ReturnType<typeof vi.fn> }>;
let resize: ResizeObserverCallback;
let disconnectResize: ReturnType<typeof vi.fn>;
let getContext: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  host = document.createElement('div'); document.body.appendChild(host);
  intersections = [];
  disconnectResize = vi.fn();
  vi.stubGlobal('IntersectionObserver', class {
    disconnect = vi.fn();
    constructor(callback: IntersectionObserverCallback) { intersections.push({ callback, disconnect: this.disconnect }); }
    observe() {}
  });
  vi.stubGlobal('ResizeObserver', class {
    disconnect = disconnectResize;
    constructor(callback: ResizeObserverCallback) { resize = callback; }
    observe() {}
  });
  vi.spyOn(HTMLCanvasElement.prototype, 'clientWidth', 'get').mockReturnValue(120);
  vi.spyOn(HTMLCanvasElement.prototype, 'clientHeight', 'get').mockReturnValue(76);
  getContext = vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({
    setTransform: vi.fn(), clearRect: vi.fn(), translate: vi.fn(), scale: vi.fn(), fillRect: vi.fn(),
  } as unknown as CanvasRenderingContext2D);
  vi.mocked(drawRider).mockClear();
});

afterEach(() => {
  act(() => render(null, host)); host.remove();
  vi.restoreAllMocks(); vi.unstubAllGlobals();
});

function visible(index: number, isIntersecting: boolean) {
  intersections[index].callback([{ isIntersecting } as IntersectionObserverEntry], {} as IntersectionObserver);
}

it('refreshes cosmetic previews when the player changes art mode', () => {
  const p = testProfile();
  act(() => render(<RiderAvatar profile={p} still road={false} />, host));
  expect(vi.mocked(drawRider).mock.lastCall?.[1].artMode).toBe('rich');
  act(() => render(<RiderAvatar profile={{ ...p, settings: { ...p.settings, overworldArt: 'legacy' } }} still road={false} />, host));
  expect(vi.mocked(drawRider).mock.lastCall?.[1].artMode).toBe('legacy');
  expect(drawRider).toHaveBeenCalledTimes(2);
});

it('allocates and draws lazy thumbnails only when visible, without duplicate resize paints', () => {
  act(() => render(<RiderAvatar still lazy road={false} />, host));
  const canvas = host.querySelector('canvas')!;
  expect(canvas.width).toBe(1); expect(getContext).not.toHaveBeenCalled();
  visible(0, false);
  expect(drawRider).not.toHaveBeenCalled();
  visible(0, true);
  expect(canvas.width).toBeGreaterThan(1); expect(drawRider).toHaveBeenCalledTimes(1);
  visible(0, true);
  expect(drawRider).toHaveBeenCalledTimes(1);
  resize([], {} as ResizeObserver);
  expect(drawRider).toHaveBeenCalledTimes(1);
  vi.spyOn(HTMLCanvasElement.prototype, 'clientWidth', 'get').mockReturnValue(160);
  resize([], {} as ResizeObserver);
  expect(drawRider).toHaveBeenCalledTimes(2);
  act(() => render(null, host));
  expect(canvas.width).toBe(1); expect(canvas.height).toBe(1);
  expect(intersections[0].disconnect).toHaveBeenCalled(); expect(disconnectResize).toHaveBeenCalled();
});

it('waits for visibility again when the preview changes, and cancels pending work on removal', () => {
  act(() => render(<RiderAvatar still lazy road={false} />, host));
  visible(0, true);
  act(() => render(<RiderAvatar still lazy road={false} silhouette />, host));
  expect(host.querySelector('canvas')!.width).toBe(1);
  expect(drawRider).toHaveBeenCalledTimes(1);
  visible(1, true);
  expect(drawRider).toHaveBeenCalledTimes(2);
  act(() => render(<RiderAvatar still lazy road={false} />, host));
  act(() => render(null, host));
  expect(intersections[2].disconnect).toHaveBeenCalled();
  visible(2, true);
  expect(drawRider).toHaveBeenCalledTimes(2);
});

it('draws still previews immediately when IntersectionObserver is unavailable', () => {
  vi.stubGlobal('IntersectionObserver', undefined);
  act(() => render(<RiderAvatar still lazy road={false} />, host));
  expect(drawRider).toHaveBeenCalledTimes(1);
});
