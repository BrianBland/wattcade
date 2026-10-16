// Foreground boxes in CSS pixels; the shell owns everything below UH.
export interface Box { x: number; y: number; w: number; h: number }
export interface TdLayout {
  UH: number; wide: boolean; u: number;
  field: { x: number; y: number; s: number };
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
  const s = Math.min(W - 2 * pad, available);
  const field = { x: (W - s) / 2, y: top + (available - s) / 2, s };
  // Announcements and menus share the free center region, never the status or dock.
  const bw = Math.min(W - 2 * pad, 520), bh = Math.min(available, 280);
  const brood = { x: (W - bw) / 2, y: top + (available - bh) / 2, w: bw, h: bh };
  const workshop = { x: (W - Math.min(W - 2 * pad, 480)) / 2, y: top, w: Math.min(W - 2 * pad, 480), h: available };
  const gw = Math.min(W - 2 * pad, 620 * u);
  return {
    UH, wide, u, field, status, current, dock, workshop, brood,
    banner: { x: W / 2, y: top + available / 2, w: W - 2 * pad },
    garage: { x: (W - gw) / 2, y: pad, w: gw, h: Math.max(0, UH - 2 * pad) },
  };
}
