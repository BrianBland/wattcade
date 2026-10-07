import { useEffect, useRef } from 'preact/hooks';
import type { Profile } from '../../contracts';
import type { RiderLook } from '../../cosmetics/types';
import { riderLook } from '../../cosmetics/unlocks';
import { drawRider } from '../../cosmetics/draw/rider';

/** One rAF loop for every animated avatar on screen. */
const live = new Set<(t: number) => void>();
let raf = 0;
function loop(now: number) {
  raf = live.size ? requestAnimationFrame(loop) : 0;
  for (const f of live) f(now / 1000);
}
function animate(f: (t: number) => void): () => void {
  live.add(f); if (!raf) raf = requestAnimationFrame(loop);
  return () => { live.delete(f); };
}

/** Rider-space box that holds every bike (x −16..14, y −32..2), a pet ahead (to x 19), with headroom for tall hats. */
const BOX = { x0: -20, x1: 20, y0: -36, y1: 3 };

/**
 * The rider on their bike, pedalling gently: the profile's loadout, or an explicit `look` (Locker previews).
 * Sized by CSS (`.rider-av.<size>`); `still` draws one frame (grids of thumbnails).
 */
export function RiderAvatar({ profile, look, size = 'big', still, road = true, class: cls = '' }: {
  profile?: Pick<Profile, 'level' | 'achievements' | 'cosmetics' | 'color'>; look?: RiderLook;
  size?: 'small' | 'big' | 'hero' | 'thumb'; still?: boolean; road?: boolean; class?: string;
}) {
  const ref = useRef<HTMLCanvasElement>(null);
  const resolved = look ?? riderLook(profile ?? { level: 1, achievements: [], color: '#00f0ff' });
  const key = JSON.stringify(resolved);
  useEffect(() => {
    const c = ref.current; if (!c) return;
    const g = c.getContext('2d'); if (!g) return;
    const draw = (t: number) => {
      const dpr = Math.min(2, globalThis.devicePixelRatio || 1);
      const w = Math.max(1, Math.round(c.clientWidth * dpr)), h = Math.max(1, Math.round(c.clientHeight * dpr));
      if (c.width !== w || c.height !== h) { c.width = w; c.height = h; }
      const s = Math.min(w / (BOX.x1 - BOX.x0), h / (BOX.y1 - BOX.y0));
      g.setTransform(1, 0, 0, 1, 0, 0); g.clearRect(0, 0, w, h);
      g.translate(w / 2 - ((BOX.x0 + BOX.x1) / 2) * s, h - BOX.y1 * s); g.scale(s, s);
      if (road) { g.fillStyle = '#ffffff22'; g.fillRect(BOX.x0, 0, BOX.x1 - BOX.x0, 0.8); }
      try { drawRider(g, resolved, t * 0.8, t * 4.5, { t, speed: 6 }); } catch { /* art must never break a menu */ }
    };
    if (still) {
      draw(1.2);
      const ro = new ResizeObserver(() => draw(1.2)); ro.observe(c);
      return () => ro.disconnect();
    }
    return animate(draw);
  }, [key, still, road]);
  return <canvas class={`rider-av ${size}${cls ? ` ${cls}` : ''}`} ref={ref} />;
}
