// Big, inset-aware touch targets; the controller operates the very same WorkshopView.
import type { TdSnapshot } from '../sim/types';
import type { Box, TdLayout } from './layout';
import { geoOf } from '../sim/level';
import { toScreen } from './fieldView';
import { drawActionButton, effortFlourish, effortTint } from '../../kit/actionButton';
import type { Hit } from './panels';
import { TD } from './theme';

/** Bevelled steel edges: lit top and left, shaded bottom and right (theme.ts BEVEL). */
function bevel(g: CanvasRenderingContext2D, b: Box, w: number, lit = '#7a6650', shade = '#15100c') {
  g.fillStyle = lit; g.fillRect(b.x, b.y, b.w, w); g.fillRect(b.x, b.y, w, b.h);
  g.fillStyle = shade; g.fillRect(b.x, b.y + b.h - w, b.w, w); g.fillRect(b.x + b.w - w, b.y, w, b.h);
  g.strokeStyle = '#000'; g.lineWidth = 1; g.strokeRect(b.x + 0.5, b.y + 0.5, b.w - 1, b.h - 1); g.strokeRect(b.x + w + 0.5, b.y + w + 0.5, b.w - 2 * w - 1, b.h - 2 * w - 1);
}
function bolt(g: CanvasRenderingContext2D, x: number, y: number, r = 4.4) {
  g.fillStyle = '#000'; g.beginPath(); g.arc(x, y, r + 0.8, 0, Math.PI * 2); g.fill();
  const d = g.createRadialGradient(x - r * 0.3, y - r * 0.35, 0, x, y, r);
  d.addColorStop(0, TD.brassHi); d.addColorStop(0.45, TD.brass); d.addColorStop(1, TD.brassLo);
  g.fillStyle = d; g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill();
}
/** A strip of yellow and black hazard stripes. */
export function hazard(g: CanvasRenderingContext2D, b: Box) {
  g.save(); g.beginPath(); g.rect(b.x, b.y, b.w, b.h); g.clip();
  g.fillStyle = '#16110b'; g.fillRect(b.x, b.y, b.w, b.h); g.fillStyle = TD.brass;
  for (let x = b.x - b.h; x < b.x + b.w + b.h; x += 14) { g.beginPath(); g.moveTo(x, b.y + b.h); g.lineTo(x + b.h, b.y); g.lineTo(x + b.h + 7, b.y); g.lineTo(x + 7, b.y + b.h); g.fill(); }
  g.restore(); g.strokeStyle = '#000'; g.lineWidth = 1; g.strokeRect(b.x - 0.5, b.y - 0.5, b.w + 1, b.h + 1);
}

/** A bevelled, bolted tread plate (theme.ts), shared by the workshop body and the fallback dock. */
export function plate(g: CanvasRenderingContext2D, b: Box, bolts = true) {
  const fill = g.createLinearGradient(0, b.y, 0, b.y + b.h);
  fill.addColorStop(0, TD.plateHi); fill.addColorStop(0.45, TD.plate); fill.addColorStop(1, TD.plateLo);
  g.save(); g.shadowColor = '#000c'; g.shadowBlur = 20; g.shadowOffsetY = 8;
  g.fillStyle = fill; g.fillRect(b.x, b.y, b.w, b.h); g.restore();
  g.save(); g.beginPath(); g.rect(b.x, b.y, b.w, b.h); g.clip(); g.lineWidth = 2; // diamond tread
  g.strokeStyle = '#ffffff07';
  for (let x = b.x - b.h; x < b.x + b.w; x += 9) { g.beginPath(); g.moveTo(x, b.y + b.h); g.lineTo(x + b.h, b.y); g.stroke(); }
  g.strokeStyle = '#00000026';
  for (let x = b.x; x < b.x + b.w + b.h; x += 9) { g.beginPath(); g.moveTo(x, b.y + b.h); g.lineTo(x - b.h, b.y); g.stroke(); }
  g.restore();
  bevel(g, b, 3, '#7a6650', '#15100c');
  if (!bolts) return;
  for (const [x, y] of [[b.x + 11, b.y + 11], [b.x + b.w - 11, b.y + 11], [b.x + 11, b.y + b.h - 11], [b.x + b.w - 11, b.y + b.h - 11]]) bolt(g, x, y);
}

function button(g: CanvasRenderingContext2D, b: Box, label: string, sub: string, selected = false, enabled = true) {
  const font = getComputedStyle(g.canvas).fontFamily;
  g.save(); g.globalAlpha = enabled ? 1 : 0.5;
  g.fillStyle = '#000'; g.fillRect(b.x, b.y + 3, b.w, b.h); // the key's depth
  if (selected) { g.shadowColor = '#e8b24aaa'; g.shadowBlur = 16; }
  const fill = g.createLinearGradient(0, b.y, 0, b.y + b.h);
  fill.addColorStop(0, selected ? '#4a3a22' : '#3a3128'); fill.addColorStop(0.45, selected ? '#2a2116' : '#221c16'); fill.addColorStop(1, '#17120e');
  g.fillStyle = fill; g.fillRect(b.x, b.y, b.w, b.h); g.shadowBlur = 0;
  bevel(g, b, 2, selected ? TD.brassHi : '#7a6650', selected ? TD.brassLo : '#15100c');
  if (selected) { // the lamp
    const x = b.x + b.w - 10, y = b.y + 10, lamp = g.createRadialGradient(x - 1, y - 1, 0, x, y, 4.5);
    lamp.addColorStop(0, '#fff6d0'); lamp.addColorStop(0.45, '#ffb020'); lamp.addColorStop(1, '#8a4f00');
    g.shadowColor = '#ffb020'; g.shadowBlur = 8; g.fillStyle = lamp; g.beginPath(); g.arc(x, y, 4.5, 0, Math.PI * 2); g.fill(); g.shadowBlur = 0;
  }
  g.textAlign = 'center'; g.textBaseline = 'middle';
  g.font = `800 13px ${font}`; g.fillStyle = selected ? TD.brassHi : TD.text; g.fillText(label, b.x + b.w / 2, b.y + b.h * (sub ? 0.36 : 0.5), b.w - 24);
  if (sub) { g.font = `11px ${font}`; g.fillStyle = TD.dim; g.fillText(sub, b.x + b.w / 2, b.y + b.h * 0.72, b.w - 16); }
  g.restore();
}

export function drawDock(g: CanvasRenderingContext2D, s: TdSnapshot, L: TdLayout, powerZone: number): Hit[] {
  const hits: Hit[] = [], d = L.dock;
  button(g, d.construct, 'A · Construction', `${s.scrap} scrap · build · upgrade · repair`, false, !s.workshop && !s.over);
  hits.push({ ...d.construct, action: s.workshop || s.over ? null : { type: 'construct', epoch: s.inputEpoch } });
  const boost = !s.workshop && s.boss?.weapon === 'rail' && (s.boss.telegraph || s.boss.exposed);
  button(g, d.workshop, boost ? '▲ Sprint boost' : '▼ Workshop', boost ? 'Hold for ERG push' : 'Build · upgrade · repair',
    boost ? s.boss!.sprintBoost : !!s.workshop, !s.over);
  hits.push({ ...d.workshop, action: s.over ? null : boost ? { type: 'boostHold', epoch: s.inputEpoch } : { type: s.workshop ? 'close' : 'pad', pad: -1, epoch: s.inputEpoch } });
  const labels = { overcharge: ['B', 'Overcharge', '#ff7855'], slow: ['Y', 'Slow field', '#55baff'], rail: ['Z', `Rail · ${s.railCharges}/${s.railMaxCharges}`, '#c790ff'] };
  s.actions.forEach((a, i) => {
    const [glyph, label, color] = labels[a.id], b = d.actions[i];
    drawActionButton(g, { ...b, label: a.activeS > 0 ? `${label} · ${Math.ceil(a.activeS)}s` : label,
      glyph, fill: a.fill, ready: a.ready, usable: a.usable, readyColor: color,
      effortTint: effortTint(powerZone), flourish: effortFlourish(powerZone), t: s.t, scale: Math.min(1, b.h / 60) });
    if (a.id === 'rail' && s.zHold > 0) {
      g.fillStyle = '#eee0ff'; g.fillRect(b.x + 4, b.y + b.h - 5, (b.w - 8) * Math.min(1, s.zHold / s.railDumpHoldS), 3);
    }
    hits.push({ ...b, action: !a.usable || !a.ready ? null : { type: a.id === 'rail' ? 'railHold' : 'action', id: a.id, epoch: s.inputEpoch } });
  });
  return hits;
}

export function radialLayout(W: number, UH: number, anchor: { x: number; y: number }, count: number): { body: Box; options: Box[]; close: Box } {
  const gap = 8, w = Math.min(154, (W - 3 * gap) / 2), h = 48;
  const radial = UH >= 300 && count <= 4;
  const rows = radial ? (count === 4 ? 3 : 2) : Math.ceil(count / 2), bw = w * 2 + gap, bh = 48 + rows * (h + gap) + 48;
  const body = { x: Math.max(gap, Math.min(W - gap - bw, anchor.x - bw / 2)), y: Math.max(gap, Math.min(UH - gap - bh, anchor.y - bh / 2)), w: bw, h: bh };
  // Four quadrants around the selected pad, with a two-column fallback for extra options.
  const positions = [[(w + gap) / 2, 0], [0, h + gap], [w + gap, h + gap], [(w + gap) / 2, 2 * (h + gap)]];
  const options = Array.from({ length: count }, (_, i) => ({
    x: body.x + (radial ? positions[i][0] : (i % 2) * (w + gap)),
    y: body.y + 48 + (radial ? positions[i][1] : Math.floor(i / 2) * (h + gap)), w, h,
  }));
  return { body, options, close: { x: body.x, y: body.y + bh - 44, w: bw, h: 44 } };
}

export function drawConstruction(g: CanvasRenderingContext2D, s: TdSnapshot, L: TdLayout, W: number): Hit[] {
  const ws = s.workshop!;
  const geo = geoOf(s), p = ws.pad < geo.basePad ? geo.pads[ws.pad] : { ...geo.base, name: 'Base' };
  const r = radialLayout(W, L.UH, toScreen(L.field, p), ws.rows.length);
  const font = getComputedStyle(g.canvas).fontFamily, cx = r.body.x + r.body.w / 2;
  g.save(); plate(g, { x: r.body.x - 6, y: r.body.y - 6, w: r.body.w + 12, h: r.body.h + 12 });
  g.fillStyle = TD.brass; g.font = `900 13px ${font}`; g.textAlign = 'center';
  g.fillText(`${p.name.toUpperCase()} · ${s.scrap} SCRAP`, cx, r.body.y + 19, r.body.w - 24);
  hazard(g, { x: r.body.x + 20, y: r.body.y + 25, w: r.body.w - 40, h: 4 });
  g.font = `11px ${font}`; g.fillStyle = TD.dim; g.fillText('◀▶ pad · ▲▼ option · A confirm', cx, r.body.y + 40);
  // Swallow the body before adding actionable targets; hits are searched front-to-back.
  const hits: Hit[] = [{ ...r.body, action: null }];
  ws.rows.forEach((row, i) => {
    button(g, r.options[i], row.label, row.cost ? `${row.cost} scrap${row.affordable ? '' : ' · need more'}` : row.desc, ws.row === i, row.affordable);
    hits.push({ ...r.options[i], action: row.affordable ? { type: 'row', row: i, pad: ws.pad, revision: ws.revision, epoch: s.inputEpoch } : null });
  });
  button(g, r.close, 'B · Close', '◀▶ selects pads and the base');
  hits.push({ ...r.close, action: { type: 'close', epoch: s.inputEpoch } });
  g.restore(); return hits;
}
