import { FrameGate } from '../warmup/frameGate';
import { useEffect, useRef } from 'preact/hooks';
import type { Profile } from '../../contracts';
import type { RiderLook } from '../../cosmetics/types';
import { riderLook } from '../../cosmetics/unlocks';
import { drawRider } from '../../cosmetics/draw/rider';

/** One rAF loop for every animated avatar on screen. */
const live = new Set<(t: number) => void>();
let raf = 0;
const draws = new FrameGate();
function loop(now: number) {
  raf = live.size ? requestAnimationFrame(loop) : 0;
  if (document.visibilityState !== 'hidden' && draws.ready(now)) for (const f of live) f(now / 1000);
}
function animate(f: (t: number) => void): () => void {
  live.add(f); if (!raf) raf = requestAnimationFrame(loop);
  return () => { live.delete(f); };
}

/** Rider-space box that holds every bike (x −16..14, y −32..2), a pet ahead (to x 19), with headroom for tall hats. */
const BOX = { x0: -20, x1: 20, y0: -36, y1: 3 };

/** Backing-store cap (device px per side): a canvas never allocates more than this, whatever its box says. */
const MAX_PX = 640;

/**
 * The rider on their bike, pedalling gently: the profile's loadout, or an explicit `look` (Locker previews).
 * Sized by CSS (`.rider-av.<size>`, on a wrapper); `still` draws one frame, `lazy` defers still previews until visible; `silhouette`
 * draws it as a dark shape (locked items).
 *
 * The canvas is absolutely positioned inside the wrapper so its backing size can never feed back into layout: in
 * WebKit a canvas's width attribute is its intrinsic size, so a `width: 100%` canvas in a `1fr` grid column that
 * sized itself from `clientWidth` grew the column, which grew the canvas, and froze the Locker.
 */
export function RiderAvatar({ profile, look, size = 'big', still, lazy = false, road = true, silhouette, class: cls = '' }: {
  profile?: Pick<Profile, 'level' | 'achievements' | 'cosmetics' | 'color'>; look?: RiderLook;
  size?: 'small' | 'big' | 'hero' | 'thumb'; still?: boolean; lazy?: boolean; road?: boolean; silhouette?: boolean; class?: string;
}) {
  const ref = useRef<HTMLCanvasElement>(null);
  const resolved = look ?? riderLook(profile ?? { level: 1, achievements: [], color: '#00f0ff' });
  const key = JSON.stringify(resolved);
  useEffect(() => {
    const c = ref.current; if (!c) return;
    let stop = () => {};
    let ro: ResizeObserver | undefined;
    let started = false, disposed = false;
    const start = () => {
      if (started || disposed) return;
      started = true;
      const g = c.getContext('2d'); if (!g) return;
      let w = 1, h = 1;
      const resize = () => {
        const dpr = Math.min(2, globalThis.devicePixelRatio || 1);
        w = Math.min(MAX_PX, Math.max(1, Math.round(c.clientWidth * dpr)));
        h = Math.min(MAX_PX, Math.max(1, Math.round(c.clientHeight * dpr)));
        const changed = c.width !== w || c.height !== h;
        if (changed) { c.width = w; c.height = h; }
        return changed;
      };
      resize();
      const draw = (t: number) => {
        const s = Math.min(w / (BOX.x1 - BOX.x0), h / (BOX.y1 - BOX.y0));
        g.setTransform(1, 0, 0, 1, 0, 0); g.clearRect(0, 0, w, h);
        g.translate(w / 2 - ((BOX.x0 + BOX.x1) / 2) * s, h - BOX.y1 * s); g.scale(s, s);
        if (road) { g.fillStyle = '#ffffff22'; g.fillRect(BOX.x0, 0, BOX.x1 - BOX.x0, 0.8); }
        try { drawRider(g, resolved, t * 0.8, t * 4.5, { t, speed: 6 }); } catch { /* art must never break a menu */ }
        if (silhouette) {
          g.setTransform(1, 0, 0, 1, 0, 0); g.globalCompositeOperation = 'source-in';
          g.fillStyle = 'rgba(0, 0, 0, 0.45)'; g.fillRect(0, 0, w, h); g.globalCompositeOperation = 'source-over';
        }
      };
      ro = new ResizeObserver(() => { if (resize() && still) draw(1.2); });
      ro.observe(c);
      stop = still ? (draw(1.2), () => {}) : animate(draw);
    };
    // A large Locker tab must not allocate and paint every offscreen thumbnail at once.
    let io: IntersectionObserver | undefined;
    if (lazy && still && typeof IntersectionObserver !== 'undefined') {
      io = new IntersectionObserver((entries) => {
        if (!entries.some((entry) => entry.isIntersecting)) return;
        io?.disconnect();
        start();
      });
      io.observe(c);
    } else start();
    return () => { disposed = true; io?.disconnect(); stop(); ro?.disconnect(); c.width = c.height = 1; };

  }, [key, still, lazy, road, silhouette]);
  return <div class={`rider-av ${size}${cls ? ` ${cls}` : ''}`}><canvas ref={ref} width={1} height={1} /></div>;
}
