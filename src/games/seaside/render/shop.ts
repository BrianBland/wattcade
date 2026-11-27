// Lou's counter and the pier stand, over the shop diorama: all pixel art from the HUD kit (`pixelHud.ts`), like the
// road signs and the monologue: a painted shop sign, a card price tag with a punched hole, a till receipt, Lou's line
// on a dark board, and pixel buttons. No soft UI cards, no system fonts.
import type { ShopView } from '../sim/economy';
import { money } from '../sim/economy';
import type { Box } from './layout';
import type { ShopLayout } from './shopLayout';
import { FONT_DESC, FONT_H, PAPER, type PanelStyle, pixelLabel, pixelPanel, pixelText, textCells, wrapCells } from './pixelHud';
export interface ShopTarget { box: Box; action: 'prev' | 'next' | 'buy' | 'leave' | 'bonus' }

const INK = '#2a2622', RED = '#b43c2b', CREAM = '#fbf4e2', GOLD = '#f3dc9a';
/** The shop sign: painted boards, a cream rule (the shop's own colours, not the highway's). */
const BOARD: PanelStyle = { fill: '#23473c', ink: '#0f231d', shadow: 'rgba(14,20,16,.4)', inner: '#d9c98f' };
const TAG: PanelStyle = { fill: '#f8edcf', ink: '#6b5a3a', shadow: 'rgba(24,28,23,.35)' };
const SLATE: PanelStyle = { fill: 'rgba(21,40,34,.92)', ink: '#0b1a15', shadow: 'rgba(14,20,16,.35)' };
const BUTTON: PanelStyle = { fill: CREAM, ink: '#3e5145', shadow: 'rgba(14,20,16,.35)' };
const PRIMARY: PanelStyle = { fill: '#f7df9b', ink: '#5a4520', shadow: 'rgba(14,20,16,.35)' };

/** Line height of the pixel font in font pixels (caps + descenders + a gap). */
const LINE = FONT_H + FONT_DESC + 2;

/** The biggest whole font pixel (≤ maxU, ≥ 1) at which `text` fits `w` CSS px. */
export const unitToFit = (text: string, w: number, maxU: number) => Math.max(1, Math.min(maxU, Math.floor(w / Math.max(1, textCells(text)))));

/** Receipt rows for `lines` in a paper `cells` font pixels wide: label and amount on one row when both fit (with a
 *  4-pixel gap), else the label (wrapped) and the amount right-aligned under it. */
export function receiptRows(lines: ReadonlyArray<{ label: string; amount: string }>, cells: number): Array<{ left: string; right: string }> {
  const rows: Array<{ left: string; right: string }> = [];
  for (const l of lines) {
    if (textCells(l.label) + 4 + textCells(l.amount) <= cells) { rows.push({ left: l.label, right: l.amount }); continue; }
    const wrapped = wrapCells(l.label, cells);
    wrapped.forEach((w) => rows.push({ left: w, right: '' }));
    rows.push({ left: '', right: l.amount });
  }
  return rows;
}

export function drawShop(g: CanvasRenderingContext2D, s: ShopView, L: ShopLayout): ShopTarget[] {
  g.save();
  // the sign over the counter: shop name big, cash under it
  const title = L.title, name = s.id === 'shop1' ? "LOU'S BAIT & TACKLE" : 'THE PIER STAND';
  const cash = `Cash ${money(s.cash)}${s.debt ? ` · On account ${money(s.debt)}` : ''}`;
  const sign = pixelPanel(g, title, 2, BOARD), inner = sign.w - 32;
  const uName = unitToFit(name, inner, 3), uCash = Math.min(2, uName);
  if (textCells(name) * uName + 24 + textCells(cash) * uCash <= inner) { // one line: name left, cash right
    const y = sign.y + (sign.h - FONT_H * uName) / 2;
    pixelText(g, name, sign.x + 16, y, uName, CREAM);
    pixelText(g, cash, sign.x + sign.w - 16, y + FONT_H * (uName - uCash), uCash, GOLD, 'right');
  } else { // narrow: stacked, smaller
    const u = Math.min(2, uName), y = sign.y + (sign.h - FONT_H * u * 2 - 4) / 2;
    pixelText(g, name, sign.x + 16, y, u, CREAM);
    pixelText(g, cash, sign.x + 16, y + FONT_H * u + 4, Math.min(u, unitToFit(cash, inner, 2)), GOLD);
  }

  // the price tag: a card with a punched hole, the item in big pixels, its price in red
  const selected = s.items[s.index], bonusSelected = !selected;
  const tag = pixelPanel(g, L.tag, 2, TAG);
  g.fillStyle = '#6b5a3a'; g.fillRect(tag.x + tag.w - 20, tag.y + 10, 8, 8); // the punched hole, a ring of card round it
  g.fillStyle = 'rgba(40,30,20,.55)'; g.fillRect(tag.x + tag.w - 18, tag.y + 12, 4, 4);
  const tx = tag.x + 12, tw = tag.w - 24;
  const itemName = bonusSelected ? 'One more turnout' : selected.name;
  const price = bonusSelected ? '+3 min' : selected.owned ? 'In your bag' : money(selected.cents);
  const uItem = unitToFit(itemName, tw - 14, 3), uPrice = unitToFit(price, tw, 5);
  let y = tag.y + 14;
  pixelText(g, itemName, tx, y, uItem, INK); y += FONT_H * uItem + 10;
  pixelText(g, price, tx, y, uPrice, RED); y += FONT_H * uPrice + 12;
  const note = bonusSelected ? 'Try for a little more.' : selected.note;
  const uNote = tw >= 200 ? 2 : 1, noteLines = wrapCells(note, Math.floor(tw / uNote));
  const browse = `${s.index + 1} / ${s.items.length + (s.bonusAvailable ? 1 : 0)} · ◀ ▶ browse`, browseY = tag.y + tag.h - 12 - FONT_H * uNote;
  for (const l of noteLines) { if (y + FONT_H * uNote > browseY - 8) break; pixelText(g, l, tx, y, uNote, INK); y += LINE * uNote; }
  if (tag.h > 120) pixelText(g, browse, tx, browseY, uNote, '#78735f');

  // the till receipt: a header, a dashed rule, the newest lines that fit, the net
  const r = pixelPanel(g, L.receipt, 2, PAPER), rx = r.x + 10, rw = r.w - 20, uR = rw >= 230 ? 2 : 1, lh = LINE * uR;
  pixelText(g, s.id === 'shop1' ? "LOU'S / RECEIPT" : 'PIER STAND / RECEIPT', rx, r.y + 10, uR, INK);
  const ruleY = r.y + 12 + FONT_H * uR + 6;
  g.fillStyle = '#b4aa91'; for (let x = rx; x < rx + rw; x += 3 * uR) g.fillRect(x, ruleY, 2 * uR - (uR > 1 ? 1 : 0), uR);
  const footH = r.h > 90 ? FONT_H * uR + 8 + FONT_H + 12 : 0;
  const rows = receiptRows(s.receipt.lines.map((l) => ({ label: l.label, amount: `${l.cents >= 0 ? '+' : '-'}${money(Math.abs(l.cents))}` })), Math.floor(rw / uR));
  const cap = Math.max(0, Math.floor((r.h - (ruleY - r.y) - 10 - footH) / lh));
  rows.slice(-cap || rows.length).slice(0, cap).forEach((row, i) => {
    const ry = ruleY + 8 + i * lh;
    if (row.left) pixelText(g, row.left, rx, ry, uR, INK);
    if (row.right) pixelText(g, row.right, rx + rw, ry, uR, INK, 'right');
  });
  if (!s.receipt.lines.length) pixelText(g, 'No fish on the scale.', rx, ruleY + 8, uR, '#78735f');
  if (footH) {
    pixelText(g, `NET ${money(s.receipt.lines.reduce((n, l) => n + l.cents, 0))}`, rx, r.y + r.h - footH + 2, uR, INK);
    pixelText(g, `${s.receipt.lines.length} LINES · KEEP FOR THE ROAD`, rx, r.y + r.h - FONT_H - 10, 1, '#78735f');
  }

  // Lou's line, chalk on a dark board
  const msg = pixelPanel(g, L.message, 2, SLATE);
  const uMsg = unitToFit(s.message, msg.w - 28, 3);
  pixelLabel(g, s.message, msg, uMsg, CREAM, 'left', Math.ceil(12 / uMsg));

  const targets: ShopTarget[] = [];
  const button = (box: Box, label: string, action: ShopTarget['action'], st = BUTTON) => {
    const b = pixelPanel(g, box, 2, st);
    pixelLabel(g, label, b, unitToFit(label, b.w - 16, 3), INK);
    targets.push({ box, action });
  };
  if (s.bonusAvailable) button(L.bonus, '+3 min fishing · try another turnout', 'bonus', PRIMARY);
  else {
    const t = `Back on the road in ${Math.ceil(s.autoIn)}s · rod packed automatically`, u = unitToFit(t, L.bonus.w - 8, 2);
    const ty = L.bonus.y + (L.bonus.h - FONT_H * u) / 2;
    pixelText(g, t, L.bonus.x + 2 + u, ty + u, u, 'rgba(10,14,12,.6)'); pixelText(g, t, L.bonus.x + 2, ty, u, CREAM);
  }
  button(L.prev, '◀', 'prev'); button(L.next, '▶', 'next');
  button(L.buy, bonusSelected ? 'Ⓐ Fish' : selected.owned ? 'Ⓐ Packed' : s.short && selected.id === s.items[0].id ? 'Ⓐ Pay later' : 'Ⓐ Buy', 'buy', PRIMARY);
  button(L.leave, 'Ⓑ Road', 'leave');
  g.restore(); return targets;
}
