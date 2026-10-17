// Foreground boxes in CSS pixels; the shell owns everything below UH.
import { FIELD_H, FIELD_W } from '../sim/road';
import { fieldRect, type FieldView } from './fieldView';

export interface Box { x: number; y: number; w: number; h: number }
export interface TdLayout {
  UH: number; wide: boolean; u: number;
  /** Status rows stacked in a left column (landscape), so the field gets the full height. */
  column: boolean;
  field: FieldView;
  status: Box; current: Box; workshop: Box; brood: Box; garage: Box;
  /** Standalone renderer fallback only; the shell supplies controls in normal play. */
  dock: { construct: Box; workshop: Box; actions: Box[] };
  banner: { x: number; y: number; w: number };
}
/** World units of hive kept visible beyond the spawn edge in landscape, so the enemy side reads. */
export const HIVE_SHOW = 20;

export function layout(W: number, H: number, insetB: number, hudControls = false): TdLayout {
  const UH = Math.max(0, H - Math.max(0, insetB));
  const u = Math.max(0.7, Math.min(1.5, Math.min(W, UH) / 640));
  const pad = Math.min(12, W / 30, UH / 30);
  const wide = W >= 760 && W > UH;
  const column = wide && UH >= 360;
  const short = UH < 400;
  const gap = 6, actionH = Math.min(62, Math.max(44, UH * 0.1)), buildH = 44;
  const dockTop = UH - pad - actionH - gap - buildH;
  const workshopW = Math.min(140, W * 0.3), buildW = W - 2 * pad - gap - workshopW;
  const aw = (W - 2 * pad - 2 * gap) / 3;
  const dock = {
    construct: { x: pad, y: dockTop, w: buildW, h: buildH },
    workshop: { x: pad + buildW + gap, y: dockTop, w: workshopW, h: buildH },
    actions: [0, 1, 2].map(i => ({ x: pad + i * (aw + gap), y: dockTop + buildH + gap, w: aw, h: actionH })),
  };
  const bottom = hudControls ? UH : dockTop;
  let status: Box, current: Box, area: Box;
  if (column) {
    // Landscape: status rows stack behind the turret; the field runs from them to the right edge.
    const colW = Math.round(Math.max(220, Math.min(300, W * 0.24)));
    status = { x: pad, y: pad, w: colW, h: Math.min(150, (bottom - 3 * pad) * 0.45) };
    current = { x: pad, y: status.y + status.h + pad, w: colW, h: Math.min(190, bottom - 3 * pad - status.h) };
    area = { x: 2 * pad + colW, y: pad, w: Math.max(0, W - 3 * pad - colW), h: Math.max(0, bottom - 2 * pad) };
  } else {
    const statusH = Math.min(short ? 48 : 64, UH * 0.19);
    const currentH = Math.min(W < 560 ? 88 : 60, UH * 0.23);
    status = { x: pad, y: pad, w: W - 2 * pad, h: statusH };
    current = { x: pad, y: status.y + status.h + pad, w: W - 2 * pad, h: currentH };
    const top = current.y + current.h + pad;
    area = { x: pad, y: top, w: W - 2 * pad, h: Math.max(0, bottom - pad - top) };
  }
  // One uniform scale. Turned: the turret sits at the area's left and some hive shows on the right.
  // Upright: the turret sits just above the HUD, the spawn edge just under the status rows.
  const turned = wide;
  const k = Math.max(0.01, turned ? Math.min(area.h / FIELD_W, area.w / (FIELD_H + HIVE_SHOW)) : Math.min(area.w / FIELD_W, area.h / FIELD_H));
  const field: FieldView = turned
    ? { x: area.x, y: area.y + (area.h - FIELD_W * k) / 2, k, turned }
    : { x: area.x + (area.w - FIELD_W * k) / 2, y: area.y + area.h - FIELD_H * k, k, turned };
  // Announcements and menus share the free region over the field, never the status rows or dock.
  const bw = Math.min(area.w, 520), bh = Math.min(area.h, 280);
  const brood = { x: area.x + (area.w - bw) / 2, y: area.y + (area.h - bh) / 2, w: bw, h: bh };
  const ww = Math.min(area.w, 480);
  const workshop = { x: area.x + (area.w - ww) / 2, y: area.y, w: ww, h: area.h };
  const gw = Math.min(W - 2 * pad, 620 * u);
  return {
    UH, wide, u, column, field, status, current, dock, workshop, brood,
    banner: { x: area.x + area.w / 2, y: area.y + area.h / 2, w: area.w },
    garage: { x: (W - gw) / 2, y: pad, w: gw, h: Math.max(0, UH - 2 * pad) },
  };
}

/** The field rectangle as a Box (tests and hit areas). */
export const fieldBox = (L: TdLayout): Box => fieldRect(L.field);
