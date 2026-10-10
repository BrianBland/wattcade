// Pure HUD layout for the run screen: a control dock above the shell HUD inset holds the weapon card
// (left) and the fill-up action buttons (right); the play view is everything above the dock.
export interface Rect { x: number; y: number; w: number; h: number }
export interface RunLayout { playH: number; dock: Rect; card: Rect; buttons: Rect[]; stance: Rect }

export function runLayout(W: number, H: number, insetBottom: number, u: number, nButtons = 4): RunLayout {
  const pad = 10 * u, base = H - insetBottom;
  const gap = 8 * u, avail = W - 2 * pad;
  const cardW = Math.min(280 * u, avail * 0.42), cardH = 64 * u;
  let bw = 74 * u;
  const bAvail = avail - cardW - 2 * gap;
  if (nButtons * bw + (nButtons - 1) * gap > bAvail) bw = Math.max(40 * u, (bAvail - (nButtons - 1) * gap) / nButtons);
  const bh = Math.max(cardH, bw * 0.86);
  const dockH = Math.max(cardH, bh) + 2 * pad;
  const dock = { x: 0, y: base - dockH, w: W, h: dockH };
  const card = { x: pad, y: dock.y + (dockH - cardH) / 2, w: cardW, h: cardH };
  const x0 = W - pad - nButtons * bw - (nButtons - 1) * gap;
  const buttons = Array.from({ length: nButtons }, (_, i) => ({ x: x0 + i * (bw + gap), y: dock.y + (dockH - bh) / 2, w: bw, h: bh }));
  const sx = card.x + card.w + gap, sw = Math.max(0, x0 - gap - sx);
  const stance = { x: sx, y: card.y, w: Math.min(sw, 260 * u), h: cardH };
  return { playH: dock.y, dock, card, buttons, stance };
}
