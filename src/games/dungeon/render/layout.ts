// Pure HUD layout for the run screen. No control dock: the shell's controller-overlay diamond is the action
// and cooldown display (and the touch target). One slim row sits bottom-left above the shell HUD inset:
// the active stance + weapon (`card`), then tiny chips for the other stances (`stance`).
export interface Rect { x: number; y: number; w: number; h: number }
export interface RunLayout { playH: number; card: Rect; stance: Rect }

export function runLayout(W: number, H: number, insetBottom: number, u: number, nChips = 2): RunLayout {
  const pad = 8 * u, base = H - insetBottom, h = 24 * u, chip = 30 * u, gap = 3 * u;
  const chipsW = nChips > 0 ? nChips * chip + (nChips - 1) * gap : 0;
  const cardW = Math.min(112 * u, Math.max(0, W - 2 * pad - chipsW - gap));
  const y = base - pad - h;
  const card = { x: pad, y, w: cardW, h };
  const stance = { x: pad + cardW + gap, y, w: chipsW, h };
  return { playH: y - 4 * u, card, stance };
}
