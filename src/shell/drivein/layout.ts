// Where the Drive-In screen goes (pure). The renderer draws the frame here and the shell positions the <video> over it.

export interface Rect { x: number; y: number; w: number; h: number }

export const MIN_W = 320, MIN_H = 180;
/** Marquee above and channel bar below the screen, CSS px. */
export const MARQUEE_H = 34, BAR_H = 54;
/** Fraction of the usable height (above the HUD) the screen's bottom edge stays above: the horizon and ridge. */
export const HORIZON = 0.58;
/** Lower limit used when an awake menu leaves too little room above the horizon. */
const HORIZON_LOW = 0.7;

export interface ScreenOpts {
  /** Awake menu panels (everything from the top of the page to this box's bottom is taken). Null when the menus are asleep. */
  menuBox?: Rect | null;
  margin?: number; barH?: number; marqueeH?: number;
}

/**
 * 16:9, as large as fits above the HUD (`insetBottom`), clear of the awake menu, the marquee and channel bar,
 * and above the horizon so the rider and road stay visible. At least 320x180 when there is room; null when an awake
 * menu leaves none (the video hides until the menus sleep). Asleep, it is always placed.
 */
export function screenRect(W: number, H: number, insetBottom: number, o: ScreenOpts = {}): Rect | null {
  const margin = o.margin ?? 60, bar = o.barH ?? BAR_H, mq = o.marqueeH ?? MARQUEE_H;
  const usable = Math.max(0, H - insetBottom);
  const top = Math.max(margin, o.menuBox ? o.menuBox.y + o.menuBox.h + 10 : 0) + mq;
  const fit = (bottom: number) => {
    const availH = Math.max(0, bottom - top - bar), availW = Math.max(0, W - 2 * margin);
    const h = Math.min(availH, (availW * 9) / 16, 0.72 * W * 9 / 16);
    return { w: (h * 16) / 9, h };
  };
  // prefer clearing the horizon; if that leaves less than 320x180, accept a lower limit, then the minimum size (it may overlap the scenery, never the HUD or menu)
  let size = fit(usable * HORIZON);
  if (size.h < MIN_H) { const alt = fit(usable * HORIZON_LOW); if (alt.h > size.h) size = alt; }
  if (size.h < MIN_H) { if (o.menuBox) return null; size = { w: MIN_W, h: MIN_H }; } // no room beside awake menus: the screen steps aside
  const w = Math.min(size.w, Math.max(0, W - 2 * margin)), h = (w * 9) / 16;
  return { x: Math.round((W - w) / 2), y: Math.round(top), w: Math.round(w), h: Math.round(h) };
}

/** Frame-rate independent ease of the displayed rect toward its target, so the screen glides when the menus wake/sleep. */
export function easeRect(cur: Rect | null, target: Rect, dt: number, rate = 9): Rect {
  if (!cur) return target;
  const k = 1 - Math.exp(-rate * dt), l = (a: number, b: number) => (Math.abs(b - a) < 0.5 ? b : a + (b - a) * k);
  return { x: l(cur.x, target.x), y: l(cur.y, target.y), w: l(cur.w, target.w), h: l(cur.h, target.h) };
}
