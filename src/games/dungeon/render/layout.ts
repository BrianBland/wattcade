// Pure HUD layout for the run screen. The shell owns action indicators and touch controls.
// One slim row sits bottom-left above the shell HUD, beside floating actions when space permits:
// the active stance + weapon (`card`), then tiny chips for the other stances (`stance`).
export interface Rect { x: number; y: number; w: number; h: number }
export interface RunLayout { playH: number; card: Rect; stance: Rect }

/** Small screens put the boss below the status/minimap row instead of squeezing its name beside it. */
export function bossHudLayout(W: number, H: number, insetBottom: number, hu: number): Rect {
  const pad = 14 * hu, compact = W < 700 * hu;
  const w = compact ? W - 2 * pad : Math.min(W * 0.4, 420 * hu);
  const x = compact ? pad : Math.max(W / 2 - w / 2, pad + 162 * hu);
  const h = 48 * hu, y = Math.max(0, Math.min(pad + (compact ? 80 * hu : 0), H - insetBottom - h));
  return { x, y, w: Math.max(0, Math.min(w, W - pad - x)), h };
}

/** Shrine then curse. Compact widths drop both below the status/toast band, clear of the top-right minimap. */
export function shrineBannerLayout(W: number, H: number, insetBottom: number, u: number, hu: number, n: 1 | 2): Rect[] {
  const pad = 14 * hu, compact = W < 700 * hu, gap = 50 * hu, h = 14 * u;
  const bw = compact ? W - 2 * pad : Math.min(W * 0.4, 420 * u);
  const x = compact ? pad : W / 2 - bw / 2;
  // 8*hu below the reserved minimap (top L, height 80*u) so the bar does not sit on its bottom edge.
  const y0 = Math.max(0, Math.min(compact ? pad + 88 * hu : pad + 28 * hu, H - insetBottom - h));
  const w = Math.max(0, Math.min(bw, W - pad - x));
  return Array.from({ length: n }, (_, i) => ({ x, y: Math.min(y0 + i * gap, H - insetBottom - h), w, h }));
}

export function runLayout(W: number, H: number, insetBottom: number, u: number, nChips = 2, occlusions?: readonly Rect[]): RunLayout {
  const pad = 8 * u, base = H - insetBottom, h = 24 * u, chip = 30 * u, gap = 3 * u;
  const chipsW = nChips > 0 ? nChips * chip + (nChips - 1) * gap : 0;
  const cardW = Math.min(200 * u, Math.max(0, W - 2 * pad - chipsW - gap));
  // Use the free space beside floating actions, but stay above any HUD that spans the inventory.
  const rowRight = pad + cardW + gap + chipsW;
  const occupied = occlusions?.filter(r => r.x < rowRight + pad && r.x + r.w > 0);
  const rowBase = occupied?.length ? Math.min(...occupied.map(r => r.y)) : base;
  const y = rowBase - pad - h;
  const card = { x: pad, y, w: cardW, h };
  const stance = { x: pad + cardW + gap, y, w: chipsW, h };
  return { playH: Math.min(base - pad - h, y) - 4 * u, card, stance };
}
