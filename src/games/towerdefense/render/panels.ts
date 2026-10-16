// Canvas HUD panels for Dynamo Defense: weapons / rail / dynamo (left), wave / base / forecast (right),
// workshop, garage, banners. Each draw fn returns tap regions.
import { LANE_NAMES, PADS, TOWERS, WEAPONS, WEAPON_BUTTON, type Weapon } from '../sim/defs';
import type { TdSnapshot, WorkshopView, GarageView } from '../sim/types';
import { COL, TOWER_ICON_COLOR, WEAPON_COLOR } from './sprites';
import type { Box } from './layout';

export interface Hit { x: number; y: number; w: number; h: number; action: unknown }
const TAU = Math.PI * 2;
const WEAPON_NAME: Record<Weapon, string> = { gatling: 'GATLING', flame: 'FLAMER', rail: 'RAILGUN' };
const WEAPON_HINT: Record<Weapon, string> = { gatling: 'fires with your cadence', flame: 'burns with your watts', rail: 'laser + stored charges' };
const BTN_COLOR: Record<string, string> = { a: '#3fd07a', b: '#ff5a5a', y: '#ffd24a', z: '#5ab0ff' };

function font(g: CanvasRenderingContext2D, px: number, weight = 600) { g.font = `${weight} ${Math.round(px)}px system-ui, -apple-system, "Segoe UI", sans-serif`; }
function panel(g: CanvasRenderingContext2D, b: Box, r: number, accent?: string) {
  g.fillStyle = 'rgba(10,14,22,0.78)'; g.beginPath(); g.roundRect(b.x, b.y, b.w, b.h, r); g.fill();
  g.strokeStyle = accent ?? 'rgba(120,150,200,0.18)'; g.lineWidth = accent ? 2 : 1; g.beginPath(); g.roundRect(b.x + 0.5, b.y + 0.5, b.w - 1, b.h - 1, r); g.stroke();
}
function bar(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, f: number, color: string, back = 'rgba(255,255,255,0.08)') {
  g.fillStyle = back; g.beginPath(); g.roundRect(x, y, w, h, h / 2); g.fill();
  if (f > 0) { g.fillStyle = color; g.beginPath(); g.roundRect(x, y, Math.max(h, w * Math.min(1, f)), h, h / 2); g.fill(); }
}
export function btnGlyph(g: CanvasRenderingContext2D, b: string, x: number, y: number, r: number) {
  g.fillStyle = BTN_COLOR[b] ?? '#8894aa'; g.beginPath(); g.arc(x, y, r, 0, TAU); g.fill();
  g.fillStyle = '#0b0f17'; font(g, r * 1.25, 800); g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText(b.toUpperCase(), x, y + r * 0.05);
  g.textAlign = 'left'; g.textBaseline = 'alphabetic';
}
function label(g: CanvasRenderingContext2D, s: string, x: number, y: number, px: number, color = 'rgba(200,215,240,0.6)') {
  font(g, px, 700); g.fillStyle = color; g.fillText(s, x, y);
}
/** Lower bound of each Coggan power zone (% FTP); surges count power zone, not the HR-led effort zone. */
const ZONE_FTP: Record<number, number> = { 2: 56, 3: 76, 4: 91, 5: 106 };
const MODE: Record<Weapon, string> = { gatling: 'SIM', flame: 'RES', rail: 'ERG' };
const TIPS = [
  'Match colors: blue = Gatling, red = Flamer, purple = Rail.',
  'Towers run on your watts: 65% FTP = full speed.',
  'Press ▼ to open the workshop and build towers.',
  'Hold Z to fire every rail charge in a spread.',
  'Sprint for Overdrive: x1.5 damage and tower speed.',
  'Power Surge: ride the asked zone to fire an EMP.',
  'Gold bosses shift shield color; swap to match.',
  'Clear a wave early to repair the base.',
  'Prisms change color every 4 s: watch the outline.',
  'Spin-up: high cadence in an easy effort overclocks the Gatling.',
  'Parts bank between runs; spend them in the Garage.',
];
function wrap(g: CanvasRenderingContext2D, text: string, x: number, y: number, w: number, lh: number, maxLines = 3): number {
  const words = text.split(' '); let line = '', n = 0;
  for (const wd of words) {
    const tryLine = line ? `${line} ${wd}` : wd;
    if (g.measureText(tryLine).width > w && line) { g.fillText(line, x, y + n * lh); line = wd; if (++n >= maxLines) return n; } else line = tryLine;
  }
  if (line) { g.fillText(line, x, y + n * lh); n++; }
  return n;
}

/** Left panel: weapons, railgun, dynamo, scrap. */
export function drawLeft(g: CanvasRenderingContext2D, s: TdSnapshot, b: Box, u: number, t: number, compact: boolean, modeVal: Record<Weapon, string>): Hit[] {
  const hits: Hit[] = [];
  panel(g, b, 10 * u);
  const p = 10 * u, x = b.x + p, w = b.w - 2 * p;
  let y = b.y + p;
  if (compact) {
    // one row of weapon chips, then rail pips + tower power bar
    const cw = (w - 2 * 6 * u) / 3, ch = Math.min(34 * u, b.h * 0.4);
    WEAPONS.forEach((wp, i) => {
      const cx = x + i * (cw + 6 * u), act = s.weapon === wp;
      g.fillStyle = act ? WEAPON_COLOR[wp] + '33' : 'rgba(255,255,255,0.04)'; g.beginPath(); g.roundRect(cx, y, cw, ch, 6 * u); g.fill();
      if (act) { g.strokeStyle = WEAPON_COLOR[wp]; g.lineWidth = 2; g.beginPath(); g.roundRect(cx + 1, y + 1, cw - 2, ch - 2, 6 * u); g.stroke(); }
      btnGlyph(g, WEAPON_BUTTON[wp], cx + ch * 0.45, y + ch / 2, ch * 0.28);
      font(g, Math.min(12 * u, cw / 7), 800); g.fillStyle = act ? '#fff' : 'rgba(220,230,250,0.6)'; g.fillText(WEAPON_NAME[wp], cx + ch * 0.85, y + ch / 2 + 4 * u);
      if (act && s.swapLeft > 0) bar(g, cx + 4 * u, y + ch - 5 * u, cw - 8 * u, 3 * u, 1 - s.swapLeft / s.swapS, '#ffd24a');
      hits.push({ x: cx, y, w: cw, h: ch, action: { type: 'weapon', w: wp } });
    });
    y += ch + 8 * u;
    const pr = 6 * u;
    for (let i = 0; i < s.railMaxCharges; i++) { g.fillStyle = i < s.railCharges ? COL.purple : 'rgba(255,255,255,0.1)'; g.beginPath(); g.arc(x + pr + i * pr * 2.6, y + pr, pr, 0, TAU); g.fill(); }
    hits.push({ x, y: y - 4 * u, w: s.railMaxCharges * pr * 2.6, h: pr * 2 + 8 * u, action: { type: 'rail' } });
    const bx = x + s.railMaxCharges * pr * 2.6 + 8 * u;
    label(g, `TOWERS ${Math.round(s.grid * 100)}%${s.overdrive ? ' · OVERDRIVE' : ''}`, bx, y + pr * 0.4, 10 * u, s.overdrive ? '#ffb050' : undefined);
    bar(g, bx, y + pr + 2 * u, x + w - bx, 5 * u, s.grid / 1.6, s.overdrive ? '#ff9a2a' : '#7df9ff');
    return hits;
  }
  // --- weapons
  label(g, 'WEAPONS', x, y + 10 * u, 11 * u); y += 18 * u;
  const rh = 40 * u;
  for (const wp of WEAPONS) {
    const act = s.weapon === wp, c = WEAPON_COLOR[wp];
    g.fillStyle = act ? c + '2a' : 'rgba(255,255,255,0.03)'; g.beginPath(); g.roundRect(x, y, w, rh, 8 * u); g.fill();
    if (act) { g.strokeStyle = c; g.lineWidth = 2; g.beginPath(); g.roundRect(x + 1, y + 1, w - 2, rh - 2, 8 * u); g.stroke(); }
    btnGlyph(g, WEAPON_BUTTON[wp], x + 18 * u, y + rh / 2, 11 * u);
    font(g, 15 * u, 800); g.fillStyle = act ? '#fff' : 'rgba(220,230,250,0.75)'; g.fillText(WEAPON_NAME[wp], x + 36 * u, y + 18 * u);
    const oc = wp === 'gatling' && s.overclock > 0;
    font(g, 10.5 * u, oc ? 800 : 600); g.fillStyle = oc ? '#8fd8ff' : 'rgba(200,215,240,0.55)';
    g.fillText(oc ? `OVERCLOCKED x2 · ${Math.ceil(s.overclock)}s` : WEAPON_HINT[wp], x + 36 * u, y + 32 * u);
    font(g, 10 * u, 800); g.fillStyle = c; g.textAlign = 'right'; g.fillText(`${MODE[wp]} ${modeVal[wp]}`, x + w - 8 * u, y + 18 * u); g.textAlign = 'left';
    if (act && s.swapLeft > 0) bar(g, x + 36 * u, y + rh - 6 * u, w - 44 * u, 3 * u, 1 - s.swapLeft / s.swapS, '#ffd24a');
    hits.push({ x, y, w, h: rh, action: { type: 'weapon', w: wp } });
    y += rh + 5 * u;
  }
  y += 8 * u;
  // --- railgun
  label(g, 'RAILGUN CHARGES', x, y + 10 * u, 11 * u); y += 18 * u;
  const pr = 9 * u;
  for (let i = 0; i < s.railMaxCharges; i++) {
    const cx = x + pr + i * pr * 2.5, cy = y + pr, full = i < s.railCharges;
    g.fillStyle = full ? COL.purple : 'rgba(255,255,255,0.08)'; g.beginPath(); g.arc(cx, cy, pr, 0, TAU); g.fill();
    if (full) { g.fillStyle = '#efe0ff'; g.beginPath(); g.arc(cx, cy, pr * 0.4, 0, TAU); g.fill(); }
    else if (i === s.railCharges) { g.strokeStyle = COL.purple; g.lineWidth = 3 * u; g.beginPath(); g.arc(cx, cy, pr - 1.5 * u, -Math.PI / 2, -Math.PI / 2 + TAU * s.railProgress); g.stroke(); }
  }
  hits.push({ x, y, w: s.railMaxCharges * pr * 2.5, h: pr * 2, action: { type: 'rail' } });
  btnGlyph(g, 'z', x + w - 10 * u, y + pr, 9 * u);
  y += pr * 2 + 14 * u;
  const full = s.railCharges >= s.railMaxCharges;
  font(g, 11 * u, 600);
  g.fillStyle = full ? '#e6d0ff' : s.railCharging ? '#7dffb0' : 'rgba(200,215,240,0.55)';
  g.fillText(full ? 'Full! Tap Z = 1 · hold Z = all' : s.railCharging ? 'Charging…' : 'Charges at ≥ 75% FTP', x, y);
  if (s.zHold > 0) bar(g, x, y + 5 * u, w, 3 * u, s.zHold / s.railDumpHoldS, COL.purple);
  y += 20 * u;
  // --- dynamo
  label(g, 'DYNAMO · TOWER POWER', x, y + 10 * u, 11 * u); y += 18 * u;
  const gf = s.grid / 1.6, gc = s.overdrive ? '#ff9a2a' : s.grid >= 1 ? '#7df9ff' : s.grid > 0.5 ? '#5ab0ff' : '#ff7a5a';
  bar(g, x, y, w, 12 * u, gf, gc);
  g.fillStyle = 'rgba(255,255,255,0.7)'; g.fillRect(x + w / 1.6, y - 2 * u, 2, 16 * u);
  y += 30 * u;
  font(g, 22 * u, 800); g.fillStyle = gc; g.fillText(`${Math.round(s.grid * 100)}%`, x, y);
  font(g, 11 * u, 600); g.fillStyle = s.overdrive ? '#ffb050' : 'rgba(200,215,240,0.55)';
  g.fillText(s.overdrive ? `OVERDRIVE!` : 'Sprint = Overdrive', x + 66 * u, y - 3 * u);
  y += 22 * u;
  // --- scrap
  if (y + 40 * u <= b.y + b.h) {
    label(g, 'SCRAP', x, y + 10 * u, 11 * u);
    font(g, 26 * u, 800); g.fillStyle = '#ffd24a'; g.fillText(`${s.scrap}`, x, y + 38 * u);
    font(g, 11 * u, 600); g.fillStyle = 'rgba(200,215,240,0.55)'; g.fillText(`+${s.partsRun} parts this run`, x + w * 0.45, y + 34 * u);
    y += 54 * u;
  }
  // --- this run + a rotating tip, if there is room
  if (y + 46 * u <= b.y + b.h - 60 * u) {
    label(g, 'THIS RUN', x, y + 10 * u, 11 * u); y += 22 * u;
    const kc: Array<[string, number]> = [[COL.blue, s.kills.blue], [COL.red, s.kills.red], [COL.purple, s.kills.purple], [COL.gold, s.kills.gold]];
    let kx = x;
    for (const [c, n] of kc) { g.fillStyle = c; g.beginPath(); g.arc(kx + 5 * u, y - 4 * u, 5 * u, 0, TAU); g.fill(); font(g, 12 * u, 800); g.fillStyle = '#e6eeff'; g.fillText(`${n}`, kx + 13 * u, y); kx += Math.max(44 * u, g.measureText(`${n}`).width + 24 * u); }
    y += 18 * u;
    font(g, 11 * u, 600); g.fillStyle = 'rgba(200,215,240,0.6)'; g.fillText(`${s.towers.length} towers · ${s.wavesSurvived} waves`, x, y);
  }
  const tipY = b.y + b.h - p - 30 * u;
  if (tipY > y + 12 * u) {
    font(g, 11 * u, 600); g.fillStyle = 'rgba(255,210,74,0.75)';
    wrap(g, `Tip: ${TIPS[Math.floor(t / 9) % TIPS.length]}`, x, tipY, w, 14 * u, 3);
  }
  return hits;
}

/** Right panel: wave, base, surge, next-wave forecast (or the workshop when open, drawn separately). */
export function drawRight(g: CanvasRenderingContext2D, s: TdSnapshot, b: Box, u: number, t: number, compact: boolean, workshopBox: Box | null): Hit[] {
  const hits: Hit[] = [];
  panel(g, b, 10 * u);
  const p = 10 * u, x = b.x + p, w = b.w - 2 * p;
  let y = b.y + p;
  const hpF = s.baseHp / s.baseMaxHp, hpC = hpF > 0.5 ? '#7dffb0' : hpF > 0.25 ? '#ffd24a' : '#ff5a3c';
  if (compact) {
    font(g, 18 * u, 800); g.fillStyle = '#fff'; g.fillText(`WAVE ${s.wave}`, x, y + 16 * u);
    font(g, 13 * u, 800); g.fillStyle = '#ffd24a'; g.textAlign = 'right'; g.fillText(`${s.scrap} scrap`, x + w, y + 15 * u); g.textAlign = 'left';
    y += 24 * u;
    bar(g, x, y, w, 4 * u, s.waveElapsed / s.waveMaxS, '#5ab0ff'); y += 10 * u;
    bar(g, x, y, w * 0.7, 8 * u, hpF, hpC);
    y += 16 * u;
    if (s.spin?.state === 'active') { label(g, `SPIN ${s.spin.rpm}+ rpm ${Math.ceil(s.spin.leftS)}s`, x, y + 9 * u, 11 * u, '#8fd8ff'); bar(g, x + w * 0.5, y + 3 * u, w * 0.5, 6 * u, s.spin.held / s.spin.needS, '#8fd8ff'); }
    else if (s.surge?.state === 'active') { label(g, `SURGE ≥${ZONE_FTP[s.surge.zone] ?? 91}% FTP ${Math.ceil(s.surge.leftS)}s`, x, y + 9 * u, 11 * u, '#7df9ff'); bar(g, x + w * 0.5, y + 3 * u, w * 0.5, 6 * u, s.surge.progress, '#7df9ff'); }
    else { label(g, `NEXT ${s.forecast.boss ? 'BOSS' : `W${s.forecast.wave}`}: ${LANE_NAMES[s.forecast.mainLane]} heavy · ▼ workshop`, x, y + 9 * u, 10 * u); }
    hits.push({ x: b.x, y: b.y, w: b.w, h: b.h, action: { type: 'pad', pad: -1 } });
    return hits;
  }
  // --- wave
  label(g, s.lull > 0 ? 'LULL' : 'WAVE', x, y + 10 * u, 11 * u); y += 14 * u;
  font(g, 34 * u, 800); g.fillStyle = '#fff'; g.fillText(`${s.wave}`, x, y + 30 * u);
  font(g, 11 * u, 600); g.fillStyle = 'rgba(200,215,240,0.6)'; g.textAlign = 'right';
  g.fillText(`survived ${s.wavesSurvived} · best ${s.bestWave}`, x + w, y + 14 * u); g.textAlign = 'left';
  y += 38 * u;
  bar(g, x, y, w, 5 * u, s.waveElapsed / s.waveMaxS, '#5ab0ff'); y += 16 * u;
  // --- base
  label(g, 'BASE', x, y + 10 * u, 11 * u);
  y += 18 * u;
  bar(g, x, y, w, 12 * u, hpF, hpC);
  font(g, 10 * u, 800); g.fillStyle = '#0b0f17'; g.fillText(`${Math.ceil(s.baseHp)} / ${Math.round(s.baseMaxHp)}`, x + 6 * u, y + 9.5 * u);
  y += 26 * u;
  // --- surge
  if (s.surge) {
    const sv = s.surge, act = sv.state === 'active', c = act ? '#7df9ff' : sv.state === 'won' ? '#7dffb0' : '#ff7a5a';
    const bh = 58 * u;
    g.fillStyle = act ? `rgba(60,200,255,${0.12 + 0.06 * Math.sin(t * 6)})` : 'rgba(255,255,255,0.04)'; g.beginPath(); g.roundRect(x, y, w, bh, 8 * u); g.fill();
    g.strokeStyle = c; g.lineWidth = 2; g.beginPath(); g.roundRect(x + 1, y + 1, w - 2, bh - 2, 8 * u); g.stroke();
    font(g, 14 * u, 800); g.fillStyle = c; g.fillText(act ? 'POWER SURGE' : sv.state === 'won' ? 'SURGE WON' : 'SURGE MISSED', x + 10 * u, y + 20 * u);
    font(g, 11 * u, 600); g.fillStyle = 'rgba(220,235,255,0.8)';
    g.fillText(act ? `≥${ZONE_FTP[sv.zone] ?? 91}% FTP for ${Math.ceil(sv.needS * (1 - sv.progress))}s more · ${Math.ceil(sv.leftS)}s left` : sv.state === 'won' ? 'EMP fired' : 'Next time!', x + 10 * u, y + 36 * u);
    bar(g, x + 10 * u, y + 44 * u, w - 20 * u, 6 * u, sv.progress, c);
    y += bh + 10 * u;
  }
  // --- spin-up (cadence drill)
  if (s.spin) {
    const sv = s.spin, act = sv.state === 'active', c = act ? '#8fd8ff' : sv.state === 'won' ? '#7dffb0' : '#ff7a5a';
    const bh = 58 * u, f = Math.min(1, sv.held / sv.needS);
    g.fillStyle = act ? `rgba(120,200,255,${0.1 + 0.05 * Math.sin(t * 8)})` : 'rgba(255,255,255,0.04)'; g.beginPath(); g.roundRect(x, y, w, bh, 8 * u); g.fill();
    g.strokeStyle = c; g.lineWidth = 2; g.beginPath(); g.roundRect(x + 1, y + 1, w - 2, bh - 2, 8 * u); g.stroke();
    font(g, 14 * u, 800); g.fillStyle = c; g.fillText(act ? 'SPIN UP' : sv.state === 'won' ? 'OVERCLOCKED' : 'SPIN-UP MISSED', x + 10 * u, y + 20 * u);
    font(g, 11 * u, 600); g.fillStyle = 'rgba(220,235,255,0.8)';
    g.fillText(act ? `${sv.rpm}+ rpm for ${Math.ceil(sv.needS - sv.held)}s more · ${Math.ceil(sv.leftS)}s left` : sv.state === 'won' ? 'Gatling fires x2' : 'Next time!', x + 10 * u, y + 36 * u);
    bar(g, x + 10 * u, y + 44 * u, w - 20 * u, 6 * u, f, c);
    y += bh + 10 * u;
  }
  // --- forecast (hidden under the workshop when it is open)
  const bottom = workshopBox ? workshopBox.y - 8 * u : b.y + b.h - p;
  if (y + 70 * u <= bottom) {
    label(g, `NEXT · WAVE ${s.forecast.wave}${s.forecast.boss ? ' · BOSS' : ''}`, x, y + 10 * u, 11 * u, s.forecast.boss ? '#ffd24a' : undefined); y += 18 * u;
    const cw = (w - 12 * u) / 3;
    s.forecast.lanes.forEach((ln, i) => {
      const cx = x + i * (cw + 6 * u), main = i === s.forecast.mainLane;
      g.fillStyle = main ? 'rgba(255,120,90,0.12)' : 'rgba(255,255,255,0.04)'; g.beginPath(); g.roundRect(cx, y, cw, 50 * u, 6 * u); g.fill();
      font(g, 10 * u, 800); g.fillStyle = main ? '#ffb09a' : 'rgba(200,215,240,0.6)'; g.fillText(LANE_NAMES[i].toUpperCase(), cx + 6 * u, y + 13 * u);
      let dy = y + 26 * u, dx = cx + 9 * u;
      for (const key of ['red', 'purple', 'blue', 'prism', 'gold'] as const) {
        const n = ln[key]; if (!n) continue;
        g.fillStyle = key === 'prism' ? COL.purple : COL[key]; g.beginPath(); g.arc(dx, dy, 4 * u, 0, TAU); g.fill();
        if (key === 'prism') { g.fillStyle = COL.blue; g.beginPath(); g.arc(dx, dy, 4 * u, 0, Math.PI); g.fill(); }
        font(g, 10 * u, 800); g.fillStyle = '#dfe8ff'; g.fillText(`${n}`, dx + 6 * u, dy + 3.5 * u);
        dx += 26 * u; if (dx > cx + cw - 16 * u) { dx = cx + 9 * u; dy += 14 * u; }
      }
    });
    y += 58 * u;
  }
  // colour -> weapon legend
  const legendH = 4 * 17 * u + 16 * u;
  if (!workshopBox && y + legendH + 44 * u <= b.y + b.h - p) {
    label(g, 'WEAKNESSES', x, y + 10 * u, 11 * u); y += 22 * u;
    const rows: Array<[string, string, string]> = [[COL.blue, 'a', 'Swarm, darts → Gatling'], [COL.red, 'b', 'Brutes, chargers → Flamer'], [COL.purple, 'y', 'Bastions, carriers → Rail'], [COL.gold, '', 'Boss: match its shield']];
    for (const [c, btn, txt] of rows) {
      g.fillStyle = c; g.beginPath(); g.arc(x + 6 * u, y, 5 * u, 0, TAU); g.fill();
      font(g, 11 * u, 600); g.fillStyle = 'rgba(220,235,255,0.8)'; g.fillText(txt, x + 18 * u, y + 4 * u);
      if (btn) btnGlyph(g, btn, x + w - 8 * u, y, 7 * u);
      y += 17 * u;
    }
  }
  if (!workshopBox && y + 24 * u <= b.y + b.h) {
    const hb = { x, y: b.y + b.h - p - 30 * u, w, h: 30 * u };
    g.fillStyle = 'rgba(255,210,74,0.1)'; g.beginPath(); g.roundRect(hb.x, hb.y, hb.w, hb.h, 6 * u); g.fill();
    font(g, 12 * u, 700); g.fillStyle = '#ffd24a'; g.fillText(`▼ Workshop · ${s.scrap} scrap`, hb.x + 10 * u, hb.y + 19 * u);
    hits.push({ ...hb, action: { type: 'pad', pad: -1 } });
  }
  return hits;
}
function poly4(g: CanvasRenderingContext2D, x: number, y: number, r: number) {
  g.beginPath(); g.moveTo(x, y - r); g.lineTo(x + r, y); g.lineTo(x, y + r); g.lineTo(x - r, y); g.closePath(); g.fill();
}

export function drawWorkshop(g: CanvasRenderingContext2D, s: TdSnapshot, ws: WorkshopView, b: Box, u: number): Hit[] {
  const hits: Hit[] = [];
  panel(g, b, 10 * u, '#ffd24a88');
  const p = 10 * u, x = b.x + p, w = b.w - 2 * p;
  let y = b.y + p;
  const pad = ws.pad < 6 ? PADS[ws.pad] : null;
  font(g, 14 * u, 800); g.fillStyle = '#ffd24a'; g.fillText('WORKSHOP', x, y + 13 * u);
  font(g, 12 * u, 800); g.textAlign = 'right'; g.fillText(`${s.scrap} scrap`, x + w, y + 13 * u); g.textAlign = 'left';
  y += 20 * u;
  const tw = pad ? s.towers.find((q) => q.pad === ws.pad) : null;
  font(g, 11 * u, 600); g.fillStyle = 'rgba(220,235,255,0.75)';
  g.fillText(pad ? `${LANE_NAMES[pad.lane]} lane · ${pad.near ? 'near' : 'far'} pad${tw ? ` · ${TOWERS[tw.kind].name} Lv ${tw.level}` : ' · empty'}` : 'Dynamo base', x, y + 10 * u);
  y += 18 * u;
  const footer = 18 * u, rh = Math.max(26 * u, Math.min(42 * u, (b.y + b.h - p - footer - y) / Math.max(3, ws.rows.length) - 4 * u));
  ws.rows.forEach((r, i) => {
    const sel = i === ws.row, c = r.tower ? TOWER_ICON_COLOR[r.tower] : '#7dffb0';
    g.fillStyle = sel ? 'rgba(255,210,74,0.16)' : 'rgba(255,255,255,0.04)'; g.beginPath(); g.roundRect(x, y, w, rh, 7 * u); g.fill();
    if (sel) { g.strokeStyle = '#ffd24a'; g.lineWidth = 2; g.beginPath(); g.roundRect(x + 1, y + 1, w - 2, rh - 2, 7 * u); g.stroke(); }
    g.fillStyle = c; g.beginPath(); g.arc(x + 12 * u, y + rh / 2, 5 * u, 0, TAU); g.fill();
    g.globalAlpha = r.affordable ? 1 : 0.45;
    font(g, 13 * u, 800); g.fillStyle = '#fff'; g.fillText(r.label, x + 24 * u, y + rh / 2 - (rh > 34 * u ? 2 * u : -4 * u));
    if (rh > 34 * u) { font(g, 10 * u, 600); g.fillStyle = 'rgba(200,215,240,0.65)'; g.fillText(r.desc, x + 24 * u, y + rh / 2 + 12 * u); }
    if (r.cost) { font(g, 12 * u, 800); g.fillStyle = r.affordable ? '#ffd24a' : '#ff8a7a'; g.textAlign = 'right'; g.fillText(`${r.cost}`, x + w - 8 * u, y + rh / 2 + 4 * u); g.textAlign = 'left'; }
    g.globalAlpha = 1;
    hits.push({ x, y, w, h: rh, action: { type: 'row', row: i } });
    y += rh + 4 * u;
  });
  font(g, 10 * u, 600); g.fillStyle = 'rgba(200,215,240,0.55)';
  g.fillText(`◀▶ pad · ▲▼ option · A build · B close (${Math.ceil(ws.idleLeft)})`, x, b.y + b.h - p);
  hits.push({ x: b.x, y: b.y, w: b.w, h: b.h, action: null }); // swallow taps on the panel body
  return hits;
}

export function drawGarage(g: CanvasRenderingContext2D, gv: GarageView, b: Box, u: number, t: number): Hit[] {
  const hits: Hit[] = [];
  g.fillStyle = 'rgba(4,6,12,0.6)'; g.fillRect(0, 0, g.canvas.width, g.canvas.height);
  panel(g, b, 14 * u, '#ffd24a66');
  const p = 18 * u, x = b.x + p, w = b.w - 2 * p;
  let y = b.y + p;
  font(g, 26 * u, 800); g.fillStyle = '#ffd24a'; g.fillText('GARAGE', x, y + 24 * u);
  font(g, 12 * u, 600); g.fillStyle = 'rgba(220,235,255,0.7)';
  g.fillText(`Best wave ${gv.bestWave} · run ${gv.runs + 1}`, x + 130 * u, y + 22 * u);
  font(g, 20 * u, 800); g.fillStyle = '#ffe9a0'; g.textAlign = 'right'; g.fillText(`${gv.bank} parts`, x + w, y + 24 * u); g.textAlign = 'left';
  y += 40 * u;
  // auto-start bar
  bar(g, x, y, w, 6 * u, 1 - gv.autoLeft / gv.autoS, '#7dffb0');
  font(g, 11 * u, 600); g.fillStyle = 'rgba(200,215,240,0.65)';
  g.fillText(gv.breatherLeft > 0 ? `Take a breather · ${Math.ceil(gv.breatherLeft)}s · B start now` : `Keep pedaling: the run starts in ${Math.max(0, Math.ceil(gv.autoLeft))}s · ▲▼ choose · A buy · B start now`, x, y + 22 * u);
  y += 34 * u;
  const rh = Math.max(30 * u, Math.min(44 * u, (b.y + b.h - p - y) / gv.rows.length - 4 * u));
  const fit = Math.max(3, Math.floor((b.y + b.h - p - y) / (rh + 4 * u)));
  const first = Math.max(0, Math.min(gv.rows.length - fit, gv.sel - Math.floor(fit / 2)));
  gv.rows.slice(first, first + fit).forEach((r, j) => {
    const i = first + j, sel = i === gv.sel;
    g.fillStyle = sel ? 'rgba(255,210,74,0.16)' : 'rgba(255,255,255,0.04)'; g.beginPath(); g.roundRect(x, y, w, rh, 8 * u); g.fill();
    if (sel) { g.strokeStyle = '#ffd24a'; g.lineWidth = 2; g.beginPath(); g.roundRect(x + 1, y + 1, w - 2, rh - 2, 8 * u); g.stroke(); }
    const dim = r.kind === 'upgrade' && !r.affordable;
    g.globalAlpha = dim ? 0.55 : 1;
    font(g, 14 * u, 800); g.fillStyle = r.kind === 'start' ? '#7dffb0' : '#fff'; g.fillText(r.name, x + 12 * u, y + rh / 2 - 1 * u);
    font(g, 10.5 * u, 600); g.fillStyle = 'rgba(200,215,240,0.65)'; g.fillText(r.desc, x + 12 * u, y + rh / 2 + 12 * u);
    if (r.kind === 'upgrade') {
      const pips = Math.min(r.max ?? 0, 20), pw = Math.min(8 * u, (w * 0.32) / Math.max(1, pips));
      for (let k = 0; k < pips; k++) { g.fillStyle = k < (r.level ?? 0) ? '#ffd24a' : 'rgba(255,255,255,0.12)'; g.fillRect(x + w * 0.5 + k * pw, y + rh / 2 - 3 * u, pw - 2, 6 * u); }
      font(g, 13 * u, 800); g.textAlign = 'right';
      g.fillStyle = r.cost == null ? '#7dffb0' : r.affordable ? '#ffe9a0' : '#ff8a7a';
      g.fillText(r.cost == null ? 'MAX' : `${r.cost}`, x + w - 10 * u, y + rh / 2 + 5 * u); g.textAlign = 'left';
    }
    g.globalAlpha = 1;
    hits.push({ x, y, w, h: rh, action: { type: 'garageRow', row: i } });
    y += rh + 4 * u;
  });
  void t;
  return hits;
}

export function drawBanner(g: CanvasRenderingContext2D, s: TdSnapshot, x: number, y: number, w: number, u: number) {
  const bn = s.banner; if (!bn) return;
  const age = s.t - bn.t0, a = Math.min(1, age / 0.2) * Math.min(1, (4 - age) / 0.6);
  if (a <= 0) return;
  const pop = 1 + Math.max(0, 0.25 - age) * 1.2;
  g.save(); g.globalAlpha = a; g.translate(x, y); g.scale(pop, pop);
  g.textAlign = 'center';
  const size = Math.min(w / Math.max(6, bn.text.length * 0.62), (bn.big ? 44 : 32) * u);
  font(g, size, 900);
  g.lineWidth = Math.max(3, size * 0.14); g.strokeStyle = 'rgba(0,0,0,0.75)'; g.strokeText(bn.text.toUpperCase(), 0, 0);
  g.fillStyle = bn.color; g.fillText(bn.text.toUpperCase(), 0, 0);
  if (bn.sub) { font(g, Math.min(15 * u, w / Math.max(10, bn.sub.length * 0.55)), 700); g.lineWidth = 4; g.strokeText(bn.sub, 0, size * 0.75); g.fillStyle = 'rgba(235,242,255,0.92)'; g.fillText(bn.sub, 0, size * 0.75); }
  g.restore(); g.textAlign = 'left';
}
