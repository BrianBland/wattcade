// Big, inset-aware touch targets; the controller operates the very same WorkshopView.
import type { TdSnapshot } from '../sim/types';
import type { Box, TdLayout } from './layout';
import { LANE_NAMES, PADS } from '../sim/defs';
import { drawActionButton, effortFlourish, effortTint } from '../../kit/actionButton';
import type { Hit } from './panels';

function button(g: CanvasRenderingContext2D, b: Box, label: string, sub: string, selected = false, enabled = true) {
  g.save(); g.globalAlpha = enabled ? 1 : 0.5;
  g.fillStyle = selected ? '#394b34' : '#15202e'; g.strokeStyle = selected ? '#c0f07a' : '#5c7187';
  g.lineWidth = selected ? 2 : 1; g.beginPath(); g.roundRect(b.x, b.y, b.w, b.h, 8); g.fill(); g.stroke();
  g.textAlign = 'center'; g.textBaseline = 'middle';
  g.font = 'bold 13px system-ui'; g.fillStyle = '#f6f9ff'; g.fillText(label, b.x + b.w / 2, b.y + b.h * (sub ? 0.35 : 0.5), b.w - 12);
  if (sub) { g.font = '11px system-ui'; g.fillStyle = '#bac9d6'; g.fillText(sub, b.x + b.w / 2, b.y + b.h * 0.73, b.w - 12); }
  g.restore();
}

export function drawDock(g: CanvasRenderingContext2D, s: TdSnapshot, L: TdLayout, powerZone: number): Hit[] {
  const hits: Hit[] = [], d = L.dock;
  const suggestion = s.suggestion;
  button(g, d.construct, suggestion ? `A · ${suggestion.label}` : 'A · Construction',
    suggestion ? `${suggestion.cost} scrap · ${s.autoCrew ? 'crew accepts when lull ends' : 'tap to accept'}` : `${s.scrap} scrap · Auto-crew ${s.autoCrew ? 'ON' : 'OFF'}`, false, !s.workshop && !s.over);
  hits.push({ ...d.construct, action: s.workshop || s.over ? null : { type: 'construct', ...(suggestion ? { suggestion } : {}), epoch: s.inputEpoch } });
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
  const p = ws.pad < 6 ? PADS[ws.pad] : { x: 50, y: 90, lane: -1, near: false };
  const r = radialLayout(W, L.UH, { x: L.field.x + p.x * L.field.s / 100, y: L.field.y + p.y * L.field.s / 100 }, ws.rows.length);
  g.save(); g.fillStyle = 'rgba(4,9,16,0.96)'; g.beginPath(); g.roundRect(r.body.x - 4, r.body.y - 4, r.body.w + 8, r.body.h + 8, 12); g.fill();
  g.fillStyle = '#f5d67a'; g.font = 'bold 13px system-ui'; g.textAlign = 'center';
  g.fillText(ws.pad < 6 ? `${LANE_NAMES[p.lane]} ${p.near ? 'Near' : 'Far'} · ${s.scrap} scrap` : `Base · ${s.scrap} scrap`, r.body.x + r.body.w / 2, r.body.y + 19);
  g.font = '11px system-ui'; g.fillStyle = '#aabdd0'; g.fillText('◀▶ pad · ▲▼ option · A confirm', r.body.x + r.body.w / 2, r.body.y + 36);
  // Swallow the body before adding actionable targets; hits are searched front-to-back.
  const hits: Hit[] = [{ ...r.body, action: null }];
  ws.rows.forEach((row, i) => {
    button(g, r.options[i], row.label, row.kind === 'crew' ? 'Tap to toggle' : row.cost ? `${row.cost} scrap${row.affordable ? '' : ' · need more'}` : row.desc, ws.row === i, row.affordable);
    hits.push({ ...r.options[i], action: row.affordable ? { type: 'row', row: i, pad: ws.pad, revision: ws.revision, epoch: s.inputEpoch } : null });
  });
  button(g, r.close, 'B · Close', '◀▶ selects pads and the base');
  hits.push({ ...r.close, action: { type: 'close', epoch: s.inputEpoch } });
  g.restore(); return hits;
}
