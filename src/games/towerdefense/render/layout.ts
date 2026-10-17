// Foreground boxes in CSS pixels. UI stays above UH; the field may use the space between HUD components.
import type { Insets, HudOcclusion } from '../../../contracts';
import { FIELD_H, FIELD_W, ROAD, ROAD_PADS, FLYER_SPAWNS, TURRET, TURRET_R } from '../sim/road';
import { fieldRect, toScreen, type FieldView } from './fieldView';

export interface Box { x: number; y: number; w: number; h: number }
export interface TdLayout {
  UH: number; wide: boolean; u: number;
  /** Landscape status stays at upper left, with brood/forecast above the controls at lower left. */
  column: boolean;
  field: FieldView;
  status: Box; current: Box; workshop: Box; brood: Box; garage: Box;
  /** Persistent landscape objective/crew card; compact screens keep the transient field announcements. */
  objective: Box | null;
  /** Standalone renderer fallback only; the shell supplies controls in normal play. */
  dock: { construct: Box; workshop: Box; actions: Box[] };
  banner: { x: number; y: number; w: number };
}
/** World units of hive kept visible beyond the spawn edge in landscape, so the enemy side reads. */
export const HIVE_SHOW = 20;

export function layout(W: number, H: number, inset: number | Insets, hudControls = false): TdLayout {
  const shape = typeof inset === 'number' ? undefined : inset.occlusions;
  // The reserved CSS envelope is intentionally conservative. Only shaped renderers use actual coverage.
  const insetB = shape ? Math.max(0, ...shape.map(b => H - b.y)) : typeof inset === 'number' ? inset : inset.bottom;
  const UH = Math.max(0, H - Math.max(0, insetB));
  const u = Math.max(0.7, Math.min(1.5, Math.min(W, UH) / 640));
  const pad = Math.min(12, W / 30, UH / 30);
  const wide = W >= 760 && W > UH;
  const column = wide && UH >= 200;
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
    // Balance the landscape column between the top status and lower brood/forecast.
    // The field keeps its full height to the right; short screens naturally close the gap.
    const colW = Math.round(Math.max(220, Math.min(300, W * 0.24)));
    status = { x: pad, y: pad, w: colW, h: Math.min(150, (bottom - 3 * pad) * 0.45) };
    const currentH = Math.min(154, bottom - 3 * pad - status.h);
    current = { x: pad, y: bottom - pad - currentH, w: colW, h: currentH };
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
  let field: FieldView = turned
    ? { x: area.x, y: area.y + (area.h - FIELD_W * k) / 2, k, turned }
    : { x: area.x + (area.w - FIELD_W * k) / 2, y: area.y + area.h - FIELD_H * k, k, turned };
  if (hudControls && shape?.length) {
    // The end of the road is narrow: the turret fits between the hoods even when the painting's
    // empty lower corners extend beneath them. Keep the entire walking/flying route and every
    // build pad clear. Try the largest field first, falling back to the rectangular layout.
    const extra = Math.max(0, Math.max(...shape.map(b => b.y)) - UH);
    for (let step = 0; step < 96; step++) {
      const h = area.h + extra * (1 - step / 96);
      const scale = Math.max(0.01, turned ? Math.min(h / FIELD_W, area.w / (FIELD_H + HIVE_SHOW)) : Math.min(area.w / FIELD_W, h / FIELD_H));
      if (scale <= field.k + 0.001) break;
      const candidate: FieldView = turned
        ? { x: area.x, y: area.y + (h - FIELD_W * scale) / 2, k: scale, turned }
        : { x: area.x + (area.w - FIELD_W * scale) / 2, y: area.y + h - FIELD_H * scale, k: scale, turned };
      if (fieldClearsHud(candidate, shape)) { field = candidate; break; }
    }
  }
  // Announcements and menus share the free region over the field, never the status rows or dock.
  const bw = Math.min(area.w, 520), bh = Math.min(area.h, 280);
  const brood = { x: area.x + (area.w - bw) / 2, y: area.y + (area.h - bh) / 2, w: bw, h: bh };
  const ww = Math.min(area.w, 480);
  const workshop = { x: area.x + (area.w - ww) / 2, y: area.y, w: ww, h: area.h };
  const gw = Math.min(W - 2 * pad, 620 * u);
  const objectiveH = current.y - status.y - status.h - 2 * pad;
  const objective = column && objectiveH >= 240
    ? { x: status.x, y: status.y + status.h + pad, w: status.w, h: objectiveH }
    : null;
  return {
    UH, wide, u, column, field, status, current, dock, workshop, brood, objective,
    banner: { x: area.x + area.w / 2, y: area.y + area.h / 2, w: area.w },
    garage: { x: (W - gw) / 2, y: pad, w: gw, h: Math.max(0, UH - 2 * pad) },
  };
}

/** The field rectangle as a Box (tests and hit areas). */
export const fieldBox = (L: TdLayout): Box => fieldRect(L.field);

// Sprite clearance is deliberately broader than the painted road and pad discs (including bosses,
// upright tower heads and gliders). These points describe play focus, not full-bleed ground art.
const focus = [
  ...ROAD.filter(p => p.y >= -10).map(p => ({ ...p, r: 8 })),
  ...ROAD_PADS.map(p => ({ ...p, r: 9 })),
  { ...TURRET, r: TURRET_R },
  ...FLYER_SPAWNS.flatMap(spawn => Array.from({ length: 25 }, (_, i) => ({
    x: spawn.x + (TURRET.x - spawn.x) * i / 24, y: spawn.y + (TURRET.y - spawn.y) * i / 24, r: 7,
  }))),
];

/** True when all combat sprites fit clear of the actual HUD components (with a 4px gutter). */
export function fieldClearsHud(view: FieldView, shape: readonly HudOcclusion[]): boolean {
  return focus.every(p => {
    const q = toScreen(view, p), radius = p.r * view.k + 4;
    return shape.every(b => {
      const dx = Math.max(b.x - q.x, 0, q.x - b.x - b.w), dy = Math.max(b.y - q.y, 0, q.y - b.y - b.h);
      return dx * dx + dy * dy >= radius * radius;
    });
  });
}
