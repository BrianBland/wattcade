import type { ShopView } from '../sim/economy';
import { money } from '../sim/economy';
import type { Box } from './layout';
import type { ShopLayout } from './shopLayout';
export interface ShopTarget { box: Box; action: 'prev' | 'next' | 'buy' | 'leave' | 'bonus' }
const INK = '#2b302d', PAPER = '#fff9e9';
const HAND = "'Marker Felt','Bradley Hand','Segoe Print',cursive";
export function drawShop(g: CanvasRenderingContext2D, s: ShopView, L: ShopLayout): ShopTarget[] {
  g.save(); g.textBaseline = 'middle';
  const paper = (r: Box, color = PAPER) => {
    g.fillStyle = 'rgba(24,28,23,.22)'; g.fillRect(r.x + 3, r.y + 4, r.w, r.h);
    g.fillStyle = color; g.fillRect(r.x, r.y, r.w, r.h);
  };
  const text = (v: string, r: Box, y: number, size: number, font = 'monospace', color = INK) => {
    g.textAlign = 'left'; g.fillStyle = color; g.font = `${font === HAND ? 'italic ' : ''}${size}px ${font}`;
    g.fillText(v, r.x + 12, y, Math.max(0, r.w - 24));
  };
  const title = L.title;
  g.fillStyle = 'rgba(23,44,39,.9)'; g.fillRect(title.x, title.y, title.w, title.h);
  text(s.id === 'shop1' ? "LOU’S BAIT & TACKLE" : 'THE PIER STAND', title, title.y + 18, Math.min(23, title.w / 18), 'Georgia,serif', PAPER);
  text(`Cash ${money(s.cash)}${s.debt ? ` · On account ${money(s.debt)}` : ''}`, title, title.y + 39, 14, 'monospace', '#e4d9ae');

  const tag = L.tag, selected = s.items[s.index];
  paper(tag, '#f8edcf');
  g.fillStyle = '#c5b68c'; g.beginPath(); g.arc(tag.x + tag.w - 14, tag.y + 14, 4, 0, Math.PI * 2); g.fill();
  const bonusSelected = !selected;
  text(bonusSelected ? 'One more turnout' : selected.name, tag, tag.y + 30, Math.min(28, tag.w / 6), HAND);
  text(bonusSelected ? '+3 min' : selected.owned ? 'In your bag' : money(selected.cents), tag, tag.y + 68, Math.min(36, tag.w / 4.8), HAND, '#b43c2b');
  if (tag.h > 100) text(bonusSelected ? 'Try for a little more.' : selected.note, tag, tag.y + 104, 15, HAND);
  if (tag.h > 135) text(`${s.index + 1} / ${s.items.length + (s.bonusAvailable ? 1 : 0)} · ◀ ▶ browse`, tag, tag.y + tag.h - 24, 13);

  const r = L.receipt; paper(r);
  text('LOU’S / RECEIPT', r, r.y + 20, 14);
  g.strokeStyle = '#b4aa91'; g.setLineDash([3, 3]);
  g.beginPath(); g.moveTo(r.x + 12, r.y + 35); g.lineTo(r.x + r.w - 12, r.y + 35); g.stroke(); g.setLineDash([]);
  const narrow = r.w < 230, rowH = narrow ? 32 : 19;
  const cap = Math.max(0, Math.floor((r.h - (narrow ? 76 : 98)) / rowH));
  const lines = cap > 0 ? s.receipt.lines.slice(-cap) : [];
  lines.forEach((l, i) => {
    const y = r.y + 47 + i * rowH;
    const sign = l.cents >= 0 ? '+' : '−';
    const amount = `${sign}${money(Math.abs(l.cents))}`;
    if (narrow) {
      const fish = /^(.*?) ([0-9.]+ kg)(.*)$/.exec(l.label);
      text(fish ? fish[1] : l.label, r, y, 12);
      text(`${fish ? fish[2] + (fish[3] ? ' ½' : '') + ' · ' : ''}${amount}`, r, y + 15, 12);
      return;
    }
    const amountW = Math.min(82, r.w * 0.43);
    text(l.label, { ...r, w: r.w - amountW }, y, 12);
    g.fillStyle = INK; g.textAlign = 'right'; g.font = '12px monospace'; g.fillText(amount, r.x + r.w - 10, y, amountW);
  });
  if (!s.receipt.lines.length) text('No fish on the scale.', r, r.y + 54, 12);
  if (r.h > 75) {
    text(`NET ${money(s.receipt.lines.reduce((n, l) => n + l.cents, 0))}`, r, r.y + r.h - 35, 14);
    text(`${s.receipt.lines.length} LINES · KEEP FOR THE ROAD`, r, r.y + r.h - 15, 10, 'monospace', '#78735f');
  }
  g.fillStyle = 'rgba(23,44,39,.92)'; g.fillRect(L.message.x, L.message.y, L.message.w, L.message.h);
  text(s.message, L.message, L.message.y + 22, 16, 'Georgia,serif', PAPER);
  const targets: ShopTarget[] = [];
  const button = (box: Box, label: string, action: ShopTarget['action'], color = PAPER) => {
    g.fillStyle = color; g.fillRect(box.x, box.y, box.w, box.h);
    g.strokeStyle = '#4e6252'; g.lineWidth = 1; g.strokeRect(box.x, box.y, box.w, box.h);
    g.fillStyle = INK; g.textAlign = 'center'; g.font = '15px Georgia,serif'; g.fillText(label, box.x + box.w / 2, box.y + box.h / 2, box.w - 10);
    targets.push({ box, action });
  };
  if (s.bonusAvailable) button(L.bonus, '+3 min fishing · try another turnout', 'bonus', '#f7df9b');
  else text(`Back on the road in ${Math.ceil(s.autoIn)}s · rod packed automatically`, L.bonus, L.bonus.y + 22, 13, 'monospace', '#fff9e9');
  button(L.prev, '◀', 'prev'); button(L.next, '▶', 'next');
  button(L.buy, bonusSelected ? 'Ⓐ Fish' : selected.owned ? 'Ⓐ Packed' : s.short && selected.id === s.items[0].id ? 'Ⓐ Pay later' : 'Ⓐ Buy', 'buy', '#f7df9b');
  button(L.leave, 'Ⓑ Road', 'leave');
  g.restore(); return targets;
}
