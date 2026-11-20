// Big, inset-aware touch targets; the controller operates the very same WorkshopView.
import type { TdSnapshot } from '../sim/types';
import type { Box, TdLayout } from './layout';
import { geoOf } from '../sim/level';
import { toScreen } from './fieldView';
import { drawActionButton, effortFlourish, effortTint } from '../../kit/actionButton';
import type { Hit } from './panels';
import { TD, TOWER_TINT } from './theme';

/** A riveted gunmetal plate with a bronze rim (theme.ts), shared by the workshop body and the fallback dock. */
export function plate(g: CanvasRenderingContext2D, b: Box, r: number, rivets = true) {
  const fill = g.createLinearGradient(0, b.y, 0, b.y + b.h);
  fill.addColorStop(0, TD.plateHi); fill.addColorStop(0.4, TD.plate); fill.addColorStop(1, TD.plateLo);
  g.save(); g.shadowColor = '#000a'; g.shadowBlur = 18; g.shadowOffsetY = 6;
  g.fillStyle = fill; g.beginPath(); g.roundRect(b.x, b.y, b.w, b.h, r); g.fill(); g.restore();
  g.strokeStyle = TD.edge; g.lineWidth = 1; g.beginPath(); g.roundRect(b.x + 0.5, b.y + 0.5, b.w - 1, b.h - 1, r); g.stroke();
  g.strokeStyle = '#c99a4e22'; g.beginPath(); g.roundRect(b.x + 4, b.y + 4, b.w - 8, b.h - 8, Math.max(1, r - 3)); g.stroke();
  if (!rivets) return;
  for (const [x, y] of [[b.x + 8, b.y + 8], [b.x + b.w - 8, b.y + 8], [b.x + 8, b.y + b.h - 8], [b.x + b.w - 8, b.y + b.h - 8]]) {
    const rv = g.createRadialGradient(x - 0.6, y - 0.6, 0, x, y, 2.6);
    rv.addColorStop(0, TD.brassHi); rv.addColorStop(0.55, TD.brassLo); rv.addColorStop(1, '#0000');
    g.fillStyle = rv; g.beginPath(); g.arc(x, y, 2.6, 0, Math.PI * 2); g.fill();
  }
}

/**
 * A workshop plate. `tint` colour-codes a tower's rows: a lit lamp strip down the left edge, a wash of that colour
 * behind the label, a tinted rim and a tinted name, so each tower reads by colour before its name is read.
 */
function button(g: CanvasRenderingContext2D, b: Box, label: string, sub: string, selected = false, enabled = true, tint?: string) {
  const font = getComputedStyle(g.canvas).fontFamily;
  g.save(); g.globalAlpha = enabled ? 1 : 0.5;
  const fill = g.createLinearGradient(0, b.y, 0, b.y + b.h);
  fill.addColorStop(0, selected ? '#3a2d18' : '#211c16'); fill.addColorStop(1, TD.plateLo);
  if (selected) { g.shadowColor = tint ? tint + '99' : '#e8b24a88'; g.shadowBlur = 14; }
  g.fillStyle = fill; g.beginPath(); g.roundRect(b.x, b.y, b.w, b.h, 5); g.fill(); g.shadowBlur = 0;
  const lamp = tint ? 6 : 0;
  if (tint) {
    g.save(); g.beginPath(); g.roundRect(b.x, b.y, b.w, b.h, 5); g.clip();
    const wash = g.createLinearGradient(b.x, 0, b.x + b.w, 0);
    wash.addColorStop(0, tint + (selected ? '40' : '2a')); wash.addColorStop(0.7, tint + '00');
    g.fillStyle = wash; g.fillRect(b.x, b.y, b.w, b.h);
    const bar = g.createLinearGradient(0, b.y, 0, b.y + b.h);
    bar.addColorStop(0, tint); bar.addColorStop(1, tint + 'aa');
    g.shadowColor = tint; g.shadowBlur = 8; g.fillStyle = bar; g.fillRect(b.x, b.y, lamp, b.h);
    g.restore();
  }
  g.strokeStyle = selected ? TD.brass : tint ? tint + '77' : TD.edgeDim; g.lineWidth = selected ? 2 : 1;
  g.beginPath(); g.roundRect(b.x + 0.5, b.y + 0.5, b.w - 1, b.h - 1, 5); g.stroke();
  g.strokeStyle = '#ffdca014'; g.lineWidth = 1; g.beginPath(); g.moveTo(b.x + 5 + lamp, b.y + 1.5); g.lineTo(b.x + b.w - 5, b.y + 1.5); g.stroke();
  g.textAlign = 'center'; g.textBaseline = 'middle';
  const cx = b.x + (b.w + lamp) / 2, room = b.w - 12 - lamp;
  g.font = `bold 13px ${font}`; g.fillStyle = tint ?? (selected ? TD.brassHi : TD.text);
  if (tint) { g.shadowColor = '#000'; g.shadowOffsetY = 1; }
  g.fillText(label, cx, b.y + b.h * (sub ? 0.35 : 0.5), room); g.shadowColor = '#0000'; g.shadowOffsetY = 0;
  if (sub) { g.font = `11px ${font}`; g.fillStyle = selected ? TD.text : TD.dim; g.fillText(sub, cx, b.y + b.h * 0.73, room); }
  g.restore();
}

const WEAPON_KEYS = [['Y', 'gatling', 'Gatling', '#55baff'], ['B', 'flame', 'Fireball', '#ff7855'], ['Z', 'rail', 'Railgun', '#c790ff']] as const;

export function drawDock(g: CanvasRenderingContext2D, s: TdSnapshot, L: TdLayout, powerZone: number): Hit[] {
  const hits: Hit[] = [], d = L.dock;
  button(g, d.construct, 'A · Construction', `${s.scrap} scrap · build · upgrade · repair`, false, !s.workshop && !s.over);
  hits.push({ ...d.construct, action: s.workshop || s.over ? null : { type: 'construct', epoch: s.inputEpoch } });
  button(g, d.workshop, s.workshop ? 'Exit' : 'Workshop', s.workshop ? 'Close the build menu' : 'Build · upgrade · repair', !!s.workshop, !s.over);
  hits.push({ ...d.workshop, action: s.over ? null : { type: s.workshop ? 'close' : 'pad', pad: -1, epoch: s.inputEpoch } });
  // Y / B / Z mount the turret's weapons: the mounted one is lit, and fills while it mounts.
  WEAPON_KEYS.forEach(([glyph, w, label, color], i) => {
    const b = d.actions[i], on = s.weapon === w, fill = on && s.swapLeft > 0 ? 1 - s.swapLeft / s.swapS : 1;
    drawActionButton(g, { ...b, label: on ? (fill < 1 ? `${label} · mounting` : `${label} · mounted`) : label,
      glyph, fill: on ? fill : 1, ready: on && fill >= 1, usable: !s.over, readyColor: color,
      effortTint: effortTint(powerZone), flourish: effortFlourish(powerZone), t: s.t, scale: Math.min(1, b.h / 60) });
    hits.push({ ...b, action: s.over || on ? null : { type: 'weapon', weapon: w, epoch: s.inputEpoch } });
  });
  return hits;
}

export function radialLayout(W: number, UH: number, anchor: { x: number; y: number }, count: number): { body: Box; options: Box[]; close: Box } {
  const gap = 8, w = Math.min(154, (W - 3 * gap) / 2), h = 48;
  // A two-column grid the D-pad walks (the four towers read as a 2x2), with Exit across the bottom. A lone option
  // on the last row is centred.
  const rows = Math.ceil(count / 2), bw = w * 2 + gap, bh = 48 + rows * (h + gap) + 48;
  const body = { x: Math.max(gap, Math.min(W - gap - bw, anchor.x - bw / 2)), y: Math.max(gap, Math.min(UH - gap - bh, anchor.y - bh / 2)), w: bw, h: bh };
  const options = Array.from({ length: count }, (_, i) => ({
    x: body.x + (i === count - 1 && count % 2 ? (w + gap) / 2 : (i % 2) * (w + gap)),
    y: body.y + 48 + Math.floor(i / 2) * (h + gap), w, h,
  }));
  return { body, options, close: { x: body.x, y: body.y + bh - 44, w: bw, h: 44 } };
}

export function drawConstruction(g: CanvasRenderingContext2D, s: TdSnapshot, L: TdLayout, W: number): Hit[] {
  const ws = s.workshop!;
  const geo = geoOf(s), p = ws.pad < geo.basePad ? geo.pads[ws.pad] : { ...geo.base, name: 'Base' };
  const r = radialLayout(W, L.UH, toScreen(L.field, p), ws.rows.length);
  const font = getComputedStyle(g.canvas).fontFamily, cx = r.body.x + r.body.w / 2;
  g.save(); plate(g, { x: r.body.x - 4, y: r.body.y - 4, w: r.body.w + 8, h: r.body.h + 8 }, 7);
  g.fillStyle = TD.brass; g.font = `800 13px ${font}`; g.textAlign = 'center';
  g.fillText(`${p.name.toUpperCase()} · ${s.scrap} SCRAP`, cx, r.body.y + 19, r.body.w - 24);
  g.strokeStyle = TD.edgeDim; g.beginPath(); g.moveTo(r.body.x + 14, r.body.y + 25.5); g.lineTo(r.body.x + r.body.w - 14, r.body.y + 25.5); g.stroke();
  g.font = `11px ${font}`; g.fillStyle = TD.dim; g.fillText('D-pad choose · A confirm', cx, r.body.y + 38);
  // Swallow the body before adding actionable targets; hits are searched front-to-back.
  const hits: Hit[] = [{ ...r.body, action: null }];
  ws.rows.forEach((row, i) => {
    button(g, r.options[i], row.label, row.cost ? `${row.cost} scrap${row.affordable ? '' : ' · need more'}` : row.desc, ws.row === i, row.affordable, row.tower && TOWER_TINT[row.tower]);
    hits.push({ ...r.options[i], action: row.affordable ? { type: 'row', row: i, pad: ws.pad, revision: ws.revision, epoch: s.inputEpoch } : null });
  });
  button(g, r.close, 'Exit', 'Back to the field', ws.row >= ws.rows.length);
  hits.push({ ...r.close, action: { type: 'close', epoch: s.inputEpoch } });
  g.restore(); return hits;
}
