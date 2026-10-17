// Foreground boxes in CSS pixels; the shell owns everything below UH.
export interface Box { x: number; y: number; w: number; h: number }
export interface TdLayout {
  UH: number; wide: boolean; u: number;
  /** Square in portrait. Landscape is wider than tall: world y runs left, so width reaches the hive. `drop` starts world-x below the field top; `sy` is the world-x scale, smaller than `s` so the turret stays centered. */
  field: { x: number; y: number; s: number; w: number; drop: number; sy: number };
  status: Box; current: Box; workshop: Box; brood: Box; garage: Box;
  /** Standalone renderer fallback only; the shell supplies controls in normal play. */
  dock: { construct: Box; workshop: Box; actions: Box[] };
  banner: { x: number; y: number; w: number };
}

export function layout(W: number, H: number, insetB: number, hudControls = false): TdLayout {
  const UH = Math.max(0, H - Math.max(0, insetB));
  const u = Math.max(0.7, Math.min(1.5, Math.min(W, UH) / 640));
  const pad = Math.min(12, W / 30, UH / 30);
  const wide = W >= 760 && W > UH;
  const short = UH < 400;
  const statusH = Math.min(short ? 48 : 64, UH * 0.19);
  const currentH = Math.min(W < 560 ? 88 : 60, UH * 0.23);
  const gap = 6, actionH = Math.min(62, Math.max(44, UH * 0.1)), buildH = 44;
  const dockTop = UH - pad - actionH - gap - buildH;
  const workshopW = Math.min(140, W * 0.3), buildW = W - 2 * pad - gap - workshopW;
  const aw = (W - 2 * pad - 2 * gap) / 3;
  const dock = {
    construct: { x: pad, y: dockTop, w: buildW, h: buildH },
    workshop: { x: pad + buildW + gap, y: dockTop, w: workshopW, h: buildH },
    actions: [0, 1, 2].map(i => ({ x: pad + i * (aw + gap), y: dockTop + buildH + gap, w: aw, h: actionH })),
  };
  const status = { x: pad, y: pad, w: W - 2 * pad, h: statusH };
  const current = { x: pad, y: status.y + status.h + pad, w: W - 2 * pad, h: currentH };
  const top = current.y + current.h + pad;
  const available = Math.max(0, (hudControls ? UH : dockTop) - pad - top);
  // Portrait fits a square between the status rows and the HUD. Landscape turns that square
  // clockwise and stretches world-y so the hive reaches the right edge while the lanes stay
  // inside the gap under the status rows. The turret stays left of center.
  const fit = Math.min(W - 2 * pad, available / 1.04);
  // The side lanes sit near world x 0 and 100, so the field has to be about as tall as the screen
  // or they fall off it. The status rows then cover rock above the top lane, not the lane itself.
  const s = Math.max(0, wide && hudControls ? Math.min(UH - 2 * pad, W * 0.72) : fit);
  const span = wide && hudControls ? Math.max(s, (W - pad) / 0.78) : s;
  const fieldY = wide && hudControls ? pad : top + (available - s * 1.04) / 2;
  // One scale for world-x: the top lane mouth (world x ≈ 0) clears the status rows and the turret
  // (world x 50) lands on the screen's vertical center. The drop is whatever that scale leaves over.
  const laneTop = wide && hudControls ? top + s * 0.02 : 0;
  const sy = wide && hudControls ? Math.min(s / 100, (H / 2 - laneTop) / 50) : 0;
  const drop = wide && hudControls ? Math.max(0, laneTop - fieldY) : 0;
  const field = {
    x: wide && hudControls ? pad : (W - s) / 2,
    y: fieldY,
    s, w: span, drop, sy: wide && hudControls ? sy : s / 100,
  };
  // Announcements and menus share the free center region, never the status or dock.
  const bw = Math.min(W - 2 * pad, 520), bh = Math.min(available, 280);
  const brood = { x: (W - bw) / 2, y: top + (available - bh) / 2, w: bw, h: bh };
  const workshop = { x: (W - Math.min(W - 2 * pad, 480)) / 2, y: top, w: Math.min(W - 2 * pad, 480), h: available };
  const cover = wide && hudControls;
  const gw = Math.min(W - 2 * pad, cover ? Math.max(620 * u, W * 0.72) : 620 * u);
  return {
    UH, wide, u, field, status, current, dock, workshop, brood,
    banner: { x: W / 2, y: top + available / 2, w: W - 2 * pad },
    garage: { x: (W - gw) / 2, y: cover ? top : pad, w: gw, h: Math.max(0, (cover ? Math.min(UH - 108, top + 520 * u) : UH) - (cover ? top : pad) - pad) },
  };
}
