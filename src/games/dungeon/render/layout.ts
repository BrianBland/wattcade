// Pure HUD layout for the run screen: a control dock above the shell HUD inset holds the stance card
// (left: active stance + its weapon, with small chips for the other stances in `stance`) and the fill-up
// action buttons (right); the play view is everything above the dock.
export interface Rect { x: number; y: number; w: number; h: number }
export interface RunLayout { playH: number; dock: Rect; card: Rect; buttons: Rect[]; stance: Rect }

export function runLayout(W: number, H: number, insetBottom: number, u: number, nButtons = 4, nChips = 2): RunLayout {
  const pad = 10 * u, base = H - insetBottom;
  const gap = 8 * u, avail = W - 2 * pad;
  const cardH = 64 * u, chip = 30 * u, chipGap = 4 * u, chipsW = nChips > 0 ? nChips * chip + (nChips - 1) * chipGap : 0;
  const cardW = Math.min(300 * u + chipsW, avail * 0.5);
  let bw = 74 * u;
  const bAvail = avail - cardW - 2 * gap;
  if (nButtons * bw + (nButtons - 1) * gap > bAvail) bw = Math.max(40 * u, (bAvail - (nButtons - 1) * gap) / nButtons);
  const bh = Math.max(cardH, bw * 0.86);
  const dockH = Math.max(cardH, bh) + 2 * pad;
  const dock = { x: 0, y: base - dockH, w: W, h: dockH };
  const card = { x: pad, y: dock.y + (dockH - cardH) / 2, w: cardW, h: cardH };
  const x0 = W - pad - nButtons * bw - (nButtons - 1) * gap;
  const buttons = Array.from({ length: nButtons }, (_, i) => ({ x: x0 + i * (bw + gap), y: dock.y + (dockH - bh) / 2, w: bw, h: bh }));
  // other-stance chips: a strip in the card's top-right corner
  const cw = Math.min(chipsW, card.w * 0.4);
  const stance = { x: card.x + card.w - cw - 6 * u, y: card.y + 6 * u, w: cw, h: Math.min(chip, cw ? chip : 0) };
  return { playH: dock.y, dock, card, buttons, stance };
}
