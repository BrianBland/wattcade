// Pure HUD layout for the run screen. No control dock: the shell's controller-overlay diamond is the action
// and cooldown display (and the touch target). One slim row sits bottom-left above the shell HUD inset:
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

export function runLayout(W: number, H: number, insetBottom: number, u: number, nChips = 2): RunLayout {
  const pad = 8 * u, base = H - insetBottom, h = 24 * u, chip = 30 * u, gap = 3 * u;
  const chipsW = nChips > 0 ? nChips * chip + (nChips - 1) * gap : 0;
  const cardW = Math.min(200 * u, Math.max(0, W - 2 * pad - chipsW - gap));
  const y = base - pad - h;
  const card = { x: pad, y, w: cardW, h };
  const stance = { x: pad + cardW + gap, y, w: chipsW, h };
  return { playH: y - 4 * u, card, stance };
}
