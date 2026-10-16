// One square world transform, compact controls, and foreground above the shell HUD.
export interface Box { x: number; y: number; w: number; h: number }
export interface TdLayout {
  UH: number; wide: boolean;
  field: { x: number; y: number; s: number };
  left: Box; right: Box; workshop: Box;
  banner: { x: number; y: number; w: number };
  brood: Box; garage: Box; u: number;
  dock: { construct: Box; workshop: Box; actions: Box[] };
}
export function layout(W: number, H: number, insetB: number, hudControls = false): TdLayout {
  const UH = Math.max(1, H - Math.max(0, insetB));
  const u = Math.max(0.7, Math.min(1.5, Math.min(W, UH) / 640));
  const pad = Math.min(Math.round(10 * u), W / 10, UH / 10);
  const gap = 6, actionH = Math.min(62, Math.max(44, UH * 0.1)), buildH = 44;
  const dockTop = UH - pad - actionH - gap - buildH;
  const contentH = hudControls ? UH : dockTop - pad;
  const workshopW = Math.min(140, W * 0.3), buildW = W - 2 * pad - gap - workshopW;
  const aw = (W - 2 * pad - 2 * gap) / 3;
  const dock = {
    construct: { x: pad, y: dockTop, w: buildW, h: buildH },
    workshop: { x: pad + buildW + gap, y: dockTop, w: workshopW, h: buildH },
    actions: [0, 1, 2].map(i => ({ x: pad + i * (aw + gap), y: dockTop + buildH + gap, w: aw, h: actionH })),
  };
  const wide = W / UH >= 1.3;
  const header = Math.min(94 * u, contentH * 0.24);
  const panelW = wide ? Math.min(330 * u, (W - 4 * pad) / 3) : (W - 3 * pad) / 2;
  const left = { x: pad, y: pad, w: panelW, h: header };
  const right = { x: W - pad - panelW, y: pad, w: panelW, h: header };
  const top = wide ? pad : header + 2 * pad;
  const s = Math.max(1, Math.min(W - 2 * pad, (contentH - top - pad) / 1.04));
  const field = { x: (W - s) / 2, y: top + (contentH - top - pad - s * 1.04) / 2, s };
  const ww = Math.min(W - 2 * pad, 420 * u), wh = Math.min(UH - 2 * pad, 280 * u);
  const workshop = { x: (W - ww) / 2, y: Math.min(UH - pad - wh, field.y + s * 0.15), w: ww, h: wh };
  const gw = Math.min(W - 2 * pad, 620 * u), gh = UH - 2 * pad;
  const bw = Math.min(s * 0.92, 460 * u), bh = Math.min(s * 0.3, 104 * u);
  const brood = { x: field.x + (s - bw) / 2, y: field.y + s * 0.4, w: bw, h: bh };
  return { UH, wide, field, left, right, workshop, u, brood, dock,
    banner: { x: field.x + s / 2, y: field.y + s * 0.3, w: s },
    garage: { x: (W - gw) / 2, y: pad, w: gw, h: gh },
  };
}
