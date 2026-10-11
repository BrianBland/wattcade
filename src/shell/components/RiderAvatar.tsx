import { FrameGate } from '../warmup/frameGate';
import { useEffect, useRef } from 'preact/hooks';
import type { Profile } from '../../contracts';
import type { Item, RiderLook } from '../../cosmetics/types';
import { riderLook, withItem } from '../../cosmetics/unlocks';
import { drawRider } from '../../cosmetics/draw/rider';
import { drawShip } from '../../cosmetics/draw/ships';

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
/** Ship-space box for `ship` art (draw/ships.ts). */
const SHIP_BOX = { x0: -1.05, x1: 1.05, y0: -0.6, y1: 1.0 };

/** Backing-store cap (device px per side): a canvas never allocates more than this, whatever its box says. */
const MAX_PX = 640;

/**
 * The rider on their bike, pedalling gently: the profile's loadout, or an explicit `look` (Locker previews).
 * Sized by CSS (`.rider-av.<size>`, on a wrapper); `still` draws one frame, `lazy` defers still previews until visible; `silhouette`
 * draws it as a dark shape (locked items). With `ship`, draws that Cadenza ship (in the look's colour) instead of the rider.
 *
 * The canvas is absolutely positioned inside the wrapper so its backing size can never feed back into layout: in
 * WebKit a canvas's width attribute is its intrinsic size, so a `width: 100%` canvas in a `1fr` grid column that
 * sized itself from `clientWidth` grew the column, which grew the canvas, and froze the Locker.
 */
export function RiderAvatar({ profile, look, ship, size = 'big', still, lazy = false, road = true, silhouette, class: cls = '' }: {
  profile?: Pick<Profile, 'level' | 'achievements' | 'cosmetics' | 'color'>; look?: RiderLook; ship?: string;
  size?: 'small' | 'big' | 'hero' | 'thumb'; still?: boolean; lazy?: boolean; road?: boolean; silhouette?: boolean; class?: string;
}) {
  const ref = useRef<HTMLCanvasElement>(null);
  const resolved = look ?? riderLook(profile ?? { level: 1, achievements: [], color: '#00f0ff' });
  const key = JSON.stringify(resolved) + (ship ?? '');
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
        const box = ship ? SHIP_BOX : BOX, s = Math.min(w / (box.x1 - box.x0), h / (box.y1 - box.y0));
        g.setTransform(1, 0, 0, 1, 0, 0); g.clearRect(0, 0, w, h);
        g.translate(w / 2 - ((box.x0 + box.x1) / 2) * s, h - box.y1 * s); g.scale(s, s);
        if (road && !ship) { g.fillStyle = '#ffffff22'; g.fillRect(BOX.x0, 0, BOX.x1 - BOX.x0, 0.8); }
        try { if (ship) drawShip(g, ship, resolved.color, t); else drawRider(g, resolved, t * 0.8, t * 4.5, { t, speed: 6 }); } catch { /* art must never break a menu */ }
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

/** Art for a cosmetic `it` on top of `base`: the rider wearing it, or for ships, the ship itself. */
export function ItemArt({ it, base, ...rest }: { it: Item; base: RiderLook } & Omit<Parameters<typeof RiderAvatar>[0], 'look' | 'ship' | 'profile'>) {
  return it.slot === 'ship' ? <RiderAvatar look={base} ship={it.id} {...rest} /> : <RiderAvatar look={withItem(base, it)} {...rest} />;
}
