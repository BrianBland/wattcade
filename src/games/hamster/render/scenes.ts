// Era scenes. Pure Canvas 2D drawing; all state comes in via SceneState.
import type { HamsterSnapshot } from '../sim/sim';
import { FONT, FURS, STEEL, TAU, glow, hamster, hash, rr, shadow, wheelWith, type Fur, type Look, type WheelStyle } from './draw';

export interface Box { x: number; y: number; w: number; h: number }
export interface SceneState {
  s: HamsterSnapshot; time: number; spin: number; speed: number; vibes: Set<string>; strikeOn: boolean; stopped: boolean; hue: number;
}
type G = CanvasRenderingContext2D;

const own = (st: SceneState, i: number) => st.s.gens[i]?.owned ?? 0;
function style(st: SceneState, idx = 0, base: WheelStyle = STEEL): WheelStyle {
  if (!st.vibes.has('rgb')) return base;
  const h = (st.hue + idx * 37) % 360;
  return { rim: `hsl(${h},100%,70%)`, rimDark: `hsl(${h},80%,40%)`, glow: `hsl(${h},100%,60%)` };
}

// ---------- runners ----------
function geraldLook(st: SceneState): Look {
  const s = st.s;
  return {
    swole: Math.min(1, s.pepUses / 40), shades: st.vibes.has('shades'), rage: !!s.rage, halo: st.vibes.has('halo'), bigHead: st.vibes.has('bighead'),
    sleep: st.stopped || s.effects.some((e) => e.id === 'crash'), flip: !!s.rage, sign: st.strikeOn ? 'NO SEEDS NO WHEELS' : undefined,
    fur: s.rage ? FURS.rage : s.glow ? FURS.golden : FURS.gerald, sweat: st.speed > 1.4, noShadow: true,
  };
}
/** Gerald in his wheel; (x, y) is the wheel centre. */
export function geraldWheel(g: G, x: number, y: number, r: number, st: SceneState) {
  const dir = st.s.rage ? -1 : 1, giant = st.s.giant ? 2.1 : 1;
  if (st.s.glow) glow(g, x, y, r * 1.8, 'rgba(255,210,80,A)', 0.35);
  const run = (fx: number, fy: number) => hamster(g, fx - (giant > 1 ? r * 0.35 : 0), fy, r * 0.78 * giant, st.spin * 4 * dir, geraldLook(st), st.time);
  // a giant Gerald no longer fits inside the wheel, so he's drawn over it
  wheelWith(g, x, y, r, st.spin * dir, style(st, 0, { rim: '#f4f8ff', rimDark: '#8a94b0' }), st.speed, giant > 1 ? undefined : run);
  if (giant > 1) run(x, y + r * 0.94);
}
function minion(g: G, x: number, y: number, r: number, st: SceneState, idx: number, fur: Fur, extra: Look = {}) {
  wheelWith(g, x, y, r, st.spin * 1.4 + idx, style(st, idx), st.speed * 1.4, (fx, fy) =>
    hamster(g, fx, fy, r * 0.75, st.spin * 5 + idx, { fur, sleep: st.stopped, noShadow: true, sign: st.strikeOn && idx % 3 === 0 ? 'STRIKE!' : undefined, ...extra }, st.time));
}

// ---------- shared backgrounds ----------
function stars(g: G, b: Box, n: number, time: number, seed = 1) {
  for (let i = 0; i < n; i++) {
    const x = b.x + hash(i * 3 + seed) * b.w, y = b.y + hash(i * 7 + seed) * b.h, tw = 0.5 + 0.5 * Math.sin(time * (1 + hash(i) * 3) + i);
    const sz = hash(i + 50) > 0.92 ? 2.2 : 1.3;
    g.fillStyle = `rgba(255,255,255,${0.25 + 0.7 * tw * hash(i + 9)})`; g.fillRect(x, y, sz, sz);
  }
}
function vapor(g: G, b: Box, time: number) {
  const gr = g.createLinearGradient(0, b.y, 0, b.y + b.h);
  gr.addColorStop(0, '#2b0a4a'); gr.addColorStop(0.5, '#ff4fa3'); gr.addColorStop(0.62, '#ffb36b'); gr.addColorStop(0.62, '#1a0630'); gr.addColorStop(1, '#0a0220');
  g.fillStyle = gr; g.fillRect(b.x, b.y, b.w, b.h);
  const cx = b.x + b.w / 2, hy = b.y + b.h * 0.62, sr = b.h * 0.22;
  const sg = g.createLinearGradient(0, hy - sr, 0, hy); sg.addColorStop(0, '#ffe66b'); sg.addColorStop(1, '#ff4f8a');
  g.fillStyle = sg; g.beginPath(); g.arc(cx, hy, sr, Math.PI, 0); g.fill();
  g.fillStyle = '#ff4fa3'; for (let i = 0; i < 5; i++) g.fillRect(cx - sr, hy - sr * 0.15 - i * sr * 0.17, sr * 2, sr * 0.04 + i * 0.6);
  g.strokeStyle = '#ff4fd8aa'; g.lineWidth = 1;
  for (let i = 0; i < 12; i++) { const y = hy + Math.pow((i + (time * 0.5) % 1) / 12, 2) * (b.y + b.h - hy); g.beginPath(); g.moveTo(b.x, y); g.lineTo(b.x + b.w, y); g.stroke(); }
  for (let i = -10; i <= 10; i++) { g.beginPath(); g.moveTo(cx + i * 8, hy); g.lineTo(cx + i * b.w * 0.15, b.y + b.h); g.stroke(); }
}
function hypno(g: G, b: Box, time: number) {
  const cx = b.x + b.w / 2, cy = b.y + b.h / 2, R = Math.hypot(b.w, b.h) / 2;
  g.save(); g.globalAlpha = 0.16;
  for (let i = 0; i < 12; i++) {
    g.fillStyle = i % 2 ? '#ffffff' : '#7a2aff';
    g.beginPath(); g.moveTo(cx, cy);
    for (let r = 0; r < R; r += 8) { const a = time * 1.5 + (i / 12) * TAU + r * 0.02; g.lineTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r); }
    for (let r = R; r > 0; r -= 8) { const a = time * 1.5 + ((i + 1) / 12) * TAU + r * 0.02; g.lineTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r); }
    g.fill();
  }
  g.restore();
}
/** Sky gradient unless a vibe replaces it. Returns true when the vapor vibe took over. */
function sky(g: G, b: Box, stops: string[], st: SceneState): boolean {
  if (st.vibes.has('vapor')) { vapor(g, b, st.time); if (st.vibes.has('hypno')) hypno(g, b, st.time); return true; }
  const gr = g.createLinearGradient(0, b.y, 0, b.y + b.h);
  stops.forEach((c, i) => gr.addColorStop(i / (stops.length - 1), c));
  g.fillStyle = gr; g.fillRect(b.x, b.y, b.w, b.h);
  if (st.vibes.has('hypno')) hypno(g, b, st.time);
  return false;
}
function motes(g: G, b: Box, t: number, n: number, color = '255,240,200') {
  for (let i = 0; i < n; i++) {
    const x = b.x + ((hash(i) * b.w + t * (6 + hash(i + 3) * 10)) % b.w), y = b.y + b.h * (0.15 + 0.7 * hash(i + 7)) + Math.sin(t * 0.7 + i) * 12;
    g.fillStyle = `rgba(${color},${0.15 + 0.35 * hash(i + 11) * (0.5 + 0.5 * Math.sin(t + i))})`;
    g.beginPath(); g.arc(x, y, 1 + hash(i + 2) * 1.5, 0, TAU); g.fill();
  }
}
function crowd(g: G, list: Array<[number, Fur]>, st: SceneState, place: (k: number) => { x: number; y: number; r: number } | null, limit: number) {
  let k = 0;
  for (const [i, fur] of list) for (let n = 0; n < own(st, i); n++, k++) {
    if (k >= limit) return k;
    const p = place(k); if (!p) return k;
    minion(g, p.x, p.y, p.r, st, k, fur);
  }
  return k;
}
function plusMore(g: G, x: number, y: number, n: number) {
  if (n <= 0) return;
  g.font = `800 14px ${FONT}`; const t = `+${n} more`, w = g.measureText(t).width + 16;
  g.fillStyle = 'rgba(0,0,0,0.5)'; rr(g, x - w / 2, y - 12, w, 22, 11); g.fill();
  g.fillStyle = '#fff'; g.textAlign = 'center'; g.fillText(t, x, y + 4); g.textAlign = 'left';
}

// ---------- era 0: the shoebox ----------
function shoebox(g: G, b: Box, st: SceneState) {
  const { x, y, w, h } = b;
  g.fillStyle = '#140d10'; g.fillRect(x, y, w, h);
  const bw = { x: x + w * 0.1, y: y + h * 0.14, w: w * 0.8, h: h * 0.5 };
  const floorY = bw.y + bw.h;
  const wall = (pts: number[], c1: string, c2: string, gx0: number, gx1: number) => {
    const gr = g.createLinearGradient(gx0, 0, gx1, 0); gr.addColorStop(0, c1); gr.addColorStop(1, c2);
    g.fillStyle = gr; g.beginPath(); g.moveTo(pts[0], pts[1]); for (let i = 2; i < pts.length; i += 2) g.lineTo(pts[i], pts[i + 1]); g.closePath(); g.fill();
  };
  wall([x - w * 0.05, y, bw.x, bw.y, bw.x, floorY, x - w * 0.05, y + h], '#8a5f34', '#b1824e', x, bw.x);
  wall([x + w * 1.05, y, bw.x + bw.w, bw.y, bw.x + bw.w, floorY, x + w * 1.05, y + h], '#8a5f34', '#a87a48', x + w, bw.x + bw.w);
  const back = g.createLinearGradient(0, bw.y, 0, floorY); back.addColorStop(0, '#d2a46c'); back.addColorStop(1, '#b8874f');
  g.fillStyle = back; g.fillRect(bw.x, bw.y, bw.w, bw.h);
  g.strokeStyle = 'rgba(90,55,20,0.12)'; g.lineWidth = 2; for (let i = 0; i < 40; i++) { const lx = bw.x + (i / 40) * bw.w; g.beginPath(); g.moveTo(lx, bw.y); g.lineTo(lx, floorY); g.stroke(); }
  // stamp
  g.save(); g.translate(bw.x + bw.w * 0.62, bw.y + bw.h * 0.2); g.rotate(-0.06);
  g.strokeStyle = 'rgba(120,40,20,0.45)'; g.lineWidth = 3; rr(g, -110, -22, 220, 44, 6); g.stroke();
  g.fillStyle = 'rgba(120,40,20,0.45)'; g.font = `900 18px ${FONT}`; g.textAlign = 'center'; g.fillText('GERALD ENERGY CO.', 0, -1); g.font = `700 11px ${FONT}`; g.fillText('THIS SIDE UP ↑  ·  FRAGILE  ·  KEEP PEDALING', 0, 14); g.textAlign = 'left';
  g.restore();
  // top flap
  g.fillStyle = '#d9ad74'; g.globalAlpha = 0.35; g.beginPath(); g.moveTo(bw.x, bw.y); g.lineTo(bw.x + bw.w * 0.1, y - h * 0.02); g.lineTo(bw.x + bw.w * 0.9, y - h * 0.02); g.lineTo(bw.x + bw.w, bw.y); g.closePath(); g.fill(); g.globalAlpha = 1;
  // floor bedding
  const fl = g.createLinearGradient(0, floorY, 0, y + h); fl.addColorStop(0, '#d8c08c'); fl.addColorStop(1, '#f2e2b8');
  g.fillStyle = fl; g.beginPath(); g.moveTo(bw.x, floorY); g.lineTo(bw.x + bw.w, floorY); g.lineTo(x + w * 1.05, y + h); g.lineTo(x - w * 0.05, y + h); g.closePath(); g.fill();
  for (let i = 0; i < 220; i++) {
    const k = hash(i * 5), fy = floorY + Math.pow(k, 0.8) * (y + h - floorY), fx = x + w * (0.5 + (hash(i * 3) - 0.5) * (0.8 + k * 0.4));
    g.fillStyle = hash(i) > 0.5 ? 'rgba(250,240,210,0.9)' : 'rgba(190,160,110,0.7)';
    g.save(); g.translate(fx, fy); g.rotate(hash(i + 1) * 3); g.fillRect(-3 - k * 3, -1, 6 + k * 6, 2 + k); g.restore();
  }
  g.save(); g.globalCompositeOperation = 'lighter'; glow(g, x + w * 0.45, y + h * 0.1, h * 0.9, 'rgba(255,200,120,A)', 0.18); g.restore();
  // water bottle
  const wx = bw.x + bw.w * 0.9, wy = bw.y + bw.h * 0.12;
  g.fillStyle = 'rgba(200,230,255,0.35)'; rr(g, wx - 14, wy, 28, bw.h * 0.5, 10); g.fill();
  g.fillStyle = 'rgba(90,170,255,0.55)'; rr(g, wx - 12, wy + bw.h * 0.15, 24, bw.h * 0.34, 8); g.fill();
  g.fillStyle = 'rgba(255,255,255,0.5)'; g.fillRect(wx - 8, wy + 6, 3, bw.h * 0.42);
  g.fillStyle = '#9aa4b8'; g.fillRect(wx - 3, wy + bw.h * 0.5, 6, 26);
  const drip = (st.time * 0.7) % 1; g.fillStyle = `rgba(120,190,255,${1 - drip})`; g.beginPath(); g.arc(wx, wy + bw.h * 0.5 + 30 + drip * 20, 2.5, 0, TAU); g.fill();
  // food bowl
  const fx = x + w * 0.83, fy = y + h * 0.9;
  shadow(g, fx, fy + 10, 54, 10);
  g.fillStyle = '#2a50a8'; g.beginPath(); g.ellipse(fx, fy, 46, 14, 0, 0, Math.PI); g.lineTo(fx - 46, fy); g.fill();
  g.fillStyle = '#2a50a8'; rr(g, fx - 46, fy - 2, 92, 14, 6); g.fill();
  g.fillStyle = '#4a7ae0'; g.beginPath(); g.ellipse(fx, fy - 2, 46, 14, 0, 0, TAU); g.fill();
  g.fillStyle = '#5a3a20'; g.beginPath(); g.ellipse(fx, fy - 3, 40, 10, 0, 0, TAU); g.fill();
  for (let i = 0; i < 24; i++) { g.save(); g.translate(fx + (hash(i) - 0.5) * 70, fy - 4 + (hash(i + 4) - 0.5) * 12); g.rotate(hash(i + 9) * 3); g.fillStyle = '#2a2420'; g.beginPath(); g.ellipse(0, 0, 4, 2, 0, 0, TAU); g.fill(); g.fillStyle = '#ddd'; g.fillRect(-3, -0.5, 6, 1); g.restore(); }
  // the crew: two rows on the floor
  const crewList: Array<[number, Fur]> = [[0, FURS.gerald], [1, FURS.gerbil], [2, FURS.guinea]];
  const total = own(st, 0) + own(st, 1) + own(st, 2);
  const drawn = crowd(g, crewList, st, (k) => {
    const row = k < 6 ? 0 : 1, col = row ? k - 6 : k;
    if (col >= 6) return null;
    const r = row ? h * 0.05 : h * 0.04;
    return { x: x + w * (0.5 + col * (row ? 0.075 : 0.062) + (row ? -0.01 : 0.02)), y: row ? y + h * 0.84 - r * 1.12 : floorY + h * 0.03 - r * 1.12, r };
  }, 12);
  plusMore(g, x + w * 0.7, floorY - h * 0.1, total - drawn);
  const R = Math.min(w, h) * 0.21;
  geraldWheel(g, x + w * 0.26, y + h * 0.9 - R * 1.12, R, st);
  motes(g, b, st.time, 30);
}

// ---------- era 1: the garage ----------
function garage(g: G, b: Box, st: SceneState) {
  const { x, y, w, h } = b;
  const wallH = h * 0.7;
  if (!sky(g, { x, y, w, h: wallH }, ['#3a3f4c', '#4a505e', '#555b68'], st)) {
    g.strokeStyle = 'rgba(0,0,0,0.18)'; g.lineWidth = 1;
    for (let r = 0; r < 14; r++) { const ly = y + r * wallH / 14; g.beginPath(); g.moveTo(x, ly); g.lineTo(x + w, ly); g.stroke(); for (let c = 0; c < 10; c++) { const lx = x + ((c + (r % 2) * 0.5) / 10) * w; g.beginPath(); g.moveTo(lx, ly); g.lineTo(lx, ly + wallH / 14); g.stroke(); } }
  }
  // window with dusk
  const wx = x + w * 0.62, wy = y + h * 0.12, ww = w * 0.3, wh = h * 0.22;
  const dg = g.createLinearGradient(0, wy, 0, wy + wh); dg.addColorStop(0, '#2a2a6a'); dg.addColorStop(1, '#ff8a5a');
  g.fillStyle = '#20232c'; rr(g, wx - 6, wy - 6, ww + 12, wh + 12, 4); g.fill();
  g.fillStyle = dg; g.fillRect(wx, wy, ww, wh);
  g.fillStyle = '#20232c'; g.fillRect(wx + ww / 2 - 3, wy, 6, wh); g.fillRect(wx, wy + wh / 2 - 3, ww, 6);
  g.save(); g.globalCompositeOperation = 'lighter'; glow(g, wx + ww / 2, wy + wh, ww * 0.9, 'rgba(255,140,90,A)', 0.12); g.restore();
  // floor
  const fy = y + wallH;
  const fl = g.createLinearGradient(0, fy, 0, y + h); fl.addColorStop(0, '#4c525e'); fl.addColorStop(1, '#2c3038');
  g.fillStyle = fl; g.fillRect(x, fy, w, h - wallH);
  g.fillStyle = 'rgba(255,255,255,0.05)'; g.fillRect(x, fy, w, 3);
  // shelves of small wheels (the shoebox crew moved in)
  for (let sh = 0; sh < 2; sh++) { const sy = y + h * (0.3 + sh * 0.2); g.fillStyle = '#7a5a3a'; g.fillRect(x + w * 0.03, sy, w * 0.52, 8); g.fillStyle = 'rgba(0,0,0,0.3)'; g.fillRect(x + w * 0.03, sy + 8, w * 0.52, 5); }
  const crewList: Array<[number, Fur]> = [[0, FURS.gerald], [1, FURS.gerbil], [2, FURS.guinea]];
  const total = own(st, 0) + own(st, 1) + own(st, 2);
  const drawn = crowd(g, crewList, st, (k) => {
    const row = Math.floor(k / 8), col = k % 8; if (row > 1) return null;
    const r = h * 0.035; return { x: x + w * (0.07 + col * 0.063), y: y + h * (0.3 + row * 0.2) - r * 1.12, r };
  }, 16);
  plusMore(g, x + w * 0.3, y + h * 0.56, total - drawn);
  // ferret tubes
  for (let k = 0; k < Math.min(4, own(st, 4)); k++) {
    const ty = y + h * (0.6 + k * 0.03), cy1 = ty - 50, cy2 = ty + 40, ey = ty - 20;
    const path = (dy: number) => { g.beginPath(); g.moveTo(x, ty + dy); g.bezierCurveTo(x + w * 0.35, cy1 + dy, x + w * 0.6, cy2 + dy, x + w, ey + dy); };
    g.strokeStyle = 'rgba(150,220,255,0.28)'; g.lineWidth = 16; path(0); g.stroke();
    g.strokeStyle = 'rgba(255,255,255,0.35)'; g.lineWidth = 2; path(-6); g.stroke();
    const p = (st.time * (st.stopped ? 0 : 0.25) + k * 0.27) % 1, q = 1 - p, bx = x + (3 * q * q * p * 0.35 + 3 * q * p * p * 0.6 + p ** 3) * w;
    const by = q ** 3 * ty + 3 * q * q * p * cy1 + 3 * q * p * p * cy2 + p ** 3 * ey;
    g.fillStyle = '#f4ead8'; g.beginPath(); g.ellipse(bx, by, 14, 5, 0, 0, TAU); g.fill(); g.fillStyle = '#222'; g.fillRect(bx + 9, by - 2, 2, 2);
  }
  // gym corner
  for (let k = 0; k < Math.min(5, own(st, 3)); k++) {
    const gx = x + w * (0.6 + k * 0.075), gy = fy + h * 0.06, lift = st.stopped ? 0 : Math.abs(Math.sin(st.time * 3 + k)) * 14;
    shadow(g, gx, gy, 24, 5);
    hamster(g, gx, gy, 30, 0, { swole: 0.8, sleep: st.stopped, noShadow: true, fur: k % 2 ? FURS.gerald : FURS.grey }, st.time);
    g.strokeStyle = '#ccd'; g.lineWidth = 3; g.beginPath(); g.moveTo(gx - 10, gy - 34 - lift); g.lineTo(gx + 24, gy - 34 - lift); g.stroke();
    g.fillStyle = '#222'; rr(g, gx - 16, gy - 42 - lift, 7, 16, 2); g.fill(); rr(g, gx + 21, gy - 42 - lift, 7, 16, 2); g.fill();
  }
  // capybara hot tub
  const capys = Math.min(5, own(st, 5));
  if (capys) {
    const tx = x + w * 0.58, ty = y + h * 0.88, tw = w * 0.38;
    shadow(g, tx + tw / 2, ty + 18, tw * 0.6, 12);
    g.fillStyle = '#7a4f2a'; rr(g, tx, ty - 20, tw, 38, 8); g.fill();
    g.strokeStyle = '#5a3a1e'; g.lineWidth = 2; for (let i = 1; i < 8; i++) { g.beginPath(); g.moveTo(tx + (i / 8) * tw, ty - 20); g.lineTo(tx + (i / 8) * tw, ty + 18); g.stroke(); }
    const wg = g.createLinearGradient(0, ty - 26, 0, ty - 14); wg.addColorStop(0, '#6ad0ff'); wg.addColorStop(1, '#2a8ad0');
    g.fillStyle = wg; g.beginPath(); g.ellipse(tx + tw / 2, ty - 20, tw / 2 - 4, 8, 0, 0, TAU); g.fill();
    for (let k = 0; k < capys; k++) {
      const cx = tx + 26 + k * (tw - 52) / Math.max(1, capys - 1), cy = ty - 22;
      g.fillStyle = '#9a6a40'; g.beginPath(); g.ellipse(cx, cy - 4, 20, 14, 0, Math.PI, TAU); g.fill();
      g.fillStyle = '#8a5a34'; g.beginPath(); g.ellipse(cx + 12, cy - 12, 11, 9, 0.2, 0, TAU); g.fill();
      g.fillStyle = '#111'; g.beginPath(); g.arc(cx + 16, cy - 14, 1.6, 0, TAU); g.fill();
      g.strokeStyle = '#111'; g.lineWidth = 1.2; g.beginPath(); g.moveTo(cx + 12, cy - 15); g.lineTo(cx + 18, cy - 16); g.stroke();
      const og = g.createRadialGradient(cx + 8, cy - 26, 1, cx + 9, cy - 25, 7); og.addColorStop(0, '#ffc060'); og.addColorStop(1, '#ff8a1a');
      g.fillStyle = og; g.beginPath(); g.arc(cx + 9, cy - 25, 6.5, 0, TAU); g.fill(); g.fillStyle = '#3a8a2a'; g.fillRect(cx + 8, cy - 33, 3, 3);
    }
    for (let s2 = 0; s2 < 6; s2++) { const p = (st.time * 0.3 + s2 / 6) % 1; g.fillStyle = `rgba(255,255,255,${0.25 * (1 - p)})`; g.beginPath(); g.arc(tx + tw * (0.15 + hash(s2) * 0.7) + Math.sin(p * 6) * 6, ty - 30 - p * 60, 6 + p * 12, 0, TAU); g.fill(); }
  }
  const R = Math.min(w, h) * 0.19;
  geraldWheel(g, x + w * 0.24, y + h * 0.93 - R * 1.12, R, st);
  motes(g, b, st.time, 20, '220,230,255');
}

// ---------- era 2: the startup ----------
function skyline(g: G, x: number, w: number, base: number, h: number, n: number, color: string, lit: number, seed: number) {
  for (let i = 0; i < n; i++) {
    const bw2 = w / n * (0.7 + hash(i + seed) * 0.5), bh = h * (0.3 + hash(i * 3 + seed) * 0.7), bx = x + (i / n) * w;
    g.fillStyle = color; g.fillRect(bx, base - bh, bw2, bh);
    if (lit > 0) for (let k = 0; k < bh / 14 - 1; k++) for (let c = 0; c < bw2 / 9 - 1; c++) {
      if (hash(i * 31 + k * 7 + c * 3 + seed) > lit) continue;
      g.fillStyle = 'rgba(255,214,120,0.85)'; g.fillRect(bx + 4 + c * 9, base - bh + 6 + k * 14, 4, 6);
    }
  }
}
function startup(g: G, b: Box, st: SceneState) {
  const { x, y, w, h } = b;
  const vib = sky(g, b, ['#070a1a', '#141c3a', '#2a2050'], st);
  if (!vib) { stars(g, { x, y, w, h: h * 0.3 }, 40, st.time, 2); skyline(g, x, w, y + h * 0.62, h * 0.35, 14, '#10142a', 0, 3); skyline(g, x, w, y + h * 0.62, h * 0.25, 20, '#181c38', 0.35, 9); }
  g.fillStyle = 'rgba(160,200,255,0.06)'; g.fillRect(x, y, w, h * 0.62);
  g.fillStyle = '#0c0f1e'; for (let i = 0; i <= 5; i++) g.fillRect(x + (i / 5) * w - 4, y, 8, h * 0.62);
  const fy = y + h * 0.62;
  const fl = g.createLinearGradient(0, fy, 0, y + h); fl.addColorStop(0, '#2a2438'); fl.addColorStop(1, '#3a3050');
  g.fillStyle = fl; g.fillRect(x, fy, w, h - h * 0.62);
  g.fillStyle = 'rgba(255,79,216,0.07)'; g.fillRect(x, fy, w, h * 0.1);
  // neon sign
  g.save(); g.font = `900 ${Math.round(h * 0.075)}px ${FONT}`; g.textAlign = 'center';
  const flick = st.stopped ? 0.35 : hash(Math.floor(st.time * 8)) > 0.97 ? 0.4 : 1;
  g.shadowColor = '#ff4fd8'; g.shadowBlur = 24; g.fillStyle = `rgba(255,160,240,${flick})`; g.fillText('WheelWork™', x + w * 0.62, y + h * 0.3);
  g.shadowBlur = 0; g.font = `700 ${Math.round(h * 0.025)}px ${FONT}`; g.fillStyle = '#ffb0f0aa'; g.fillText('disrupting the circle since this morning', x + w * 0.62, y + h * 0.35);
  g.restore();
  // wall monitor with $GERALD chart
  const mx = x + w * 0.5, my = y + h * 0.39, mw = w * 0.3, mh = h * 0.17;
  g.fillStyle = '#05060c'; rr(g, mx - 6, my - 6, mw + 12, mh + 12, 6); g.fill();
  g.fillStyle = '#0a1a14'; g.fillRect(mx, my, mw, mh);
  g.strokeStyle = 'rgba(58,255,138,0.15)'; g.lineWidth = 1; for (let i = 1; i < 4; i++) { g.beginPath(); g.moveTo(mx, my + (i / 4) * mh); g.lineTo(mx + mw, my + (i / 4) * mh); g.stroke(); }
  g.beginPath(); const N = 40;
  for (let i = 0; i <= N; i++) { const px = mx + (i / N) * mw, py = my + mh * (0.9 - (i / N) * 0.7 - 0.08 * Math.sin(i * 1.3 + st.time * 2) * hash(i)); if (i) g.lineTo(px, py); else g.moveTo(px, py); }
  g.strokeStyle = '#3aff8a'; g.lineWidth = 2.5; g.stroke();
  g.lineTo(mx + mw, my + mh); g.lineTo(mx, my + mh); g.closePath(); const cg = g.createLinearGradient(0, my, 0, my + mh); cg.addColorStop(0, 'rgba(58,255,138,0.35)'); cg.addColorStop(1, 'rgba(58,255,138,0)'); g.fillStyle = cg; g.fill();
  g.fillStyle = '#3aff8a'; g.font = `800 ${Math.round(h * 0.03)}px ${FONT}`; g.fillText(`$GERALD ▲ ${420 + Math.floor(st.time * 7) % 600}%`, mx + 10, my + 24);
  // desks with wheels
  const n = Math.min(12, own(st, 6) * 2 + own(st, 7) + own(st, 8));
  for (let k = 0; k < n; k++) {
    const row = Math.floor(k / 6), col = k % 6, r = h * (row ? 0.055 : 0.045);
    const dx = x + w * (0.45 + col * 0.088), dy = row ? y + h * 0.93 : y + h * 0.73;
    minion(g, dx, dy - r * 1.12, r, st, k, k % 3 === 1 ? FURS.white : k % 3 === 2 ? FURS.grey : FURS.gerald, { shades: k % 4 === 0 });
  }
  // plant
  const px = x + w * 0.95, py = y + h * 0.95;
  for (let i = 0; i < 7; i++) { g.save(); g.translate(px, py - 30); g.rotate(-1.2 + i * 0.4 + Math.sin(st.time + i) * 0.05); g.fillStyle = i % 2 ? '#3a9a5a' : '#2a7a4a'; g.beginPath(); g.ellipse(0, -26, 7, 26, 0, 0, TAU); g.fill(); g.restore(); }
  g.fillStyle = '#c8b8e0'; rr(g, px - 16, py - 30, 32, 30, 4); g.fill();
  // influencer + ring light
  if (own(st, 7)) {
    const ix = x + w * 0.1, iy = y + h * 0.5;
    g.save(); g.globalCompositeOperation = 'lighter'; glow(g, ix, iy, 90, 'rgba(255,250,230,A)', 0.25); g.restore();
    g.save(); g.strokeStyle = '#fffbe8'; g.lineWidth = 7; g.shadowColor = '#fff'; g.shadowBlur = 18; g.beginPath(); g.arc(ix, iy, 34, 0, TAU); g.stroke(); g.restore();
    g.strokeStyle = '#555'; g.lineWidth = 3; g.beginPath(); g.moveTo(ix, iy + 34); g.lineTo(ix, fy + 10); g.stroke();
    hamster(g, ix - 8, iy + 18, 30, 0, { shades: true, fur: FURS.pink, noShadow: true }, st.time);
  }
  const R = Math.min(w, h) * 0.17;
  geraldWheel(g, x + w * 0.24, y + h * 0.95 - R * 1.12, R, st);
}

// ---------- era 3: the utility ----------
function city(g: G, b: Box, st: SceneState) {
  const { x, y, w, h } = b;
  const vib = sky(g, b, ['#060a22', '#1a1a4a', '#5a2a5a', '#c8604a'], st);
  if (!vib) {
    stars(g, { x, y, w, h: h * 0.45 }, 70, st.time);
    glow(g, x + w * 0.82, y + h * 0.16, 60, 'rgba(255,250,230,A)', 0.4); g.fillStyle = '#fff8e0'; g.beginPath(); g.arc(x + w * 0.82, y + h * 0.16, 18, 0, TAU); g.fill();
  }
  const base = y + h * 0.78;
  skyline(g, x, w, base, h * 0.45, 18, '#1a1636', 0.2, 1);
  skyline(g, x, w, base, h * 0.32, 26, '#0e0c22', st.stopped ? 0.05 : 0.45, 7);
  for (let k = 0; k < Math.min(6, own(st, 11) + 2); k++) {
    const tx = x + w * (0.6 + k * 0.065), ty = y + h * (0.32 + (k % 2) * 0.05), L = h * 0.085;
    g.strokeStyle = '#e8eef8'; g.lineWidth = 3; g.beginPath(); g.moveTo(tx, ty); g.lineTo(tx, base); g.stroke();
    g.fillStyle = '#e8eef8';
    for (let a = 0; a < 3; a++) { const an = st.spin * 1.2 + k + (a * TAU) / 3; g.save(); g.translate(tx, ty); g.rotate(an); g.beginPath(); g.moveTo(0, -2); g.quadraticCurveTo(L * 0.5, -6, L, 0); g.quadraticCurveTo(L * 0.5, 3, 0, 2); g.fill(); g.restore(); }
    if (Math.sin(st.time * 3 + k) > 0.6) { g.fillStyle = '#ff3a3a'; g.beginPath(); g.arc(tx, ty - 3, 2, 0, TAU); g.fill(); }
  }
  if (own(st, 10)) {
    const dx = x, dw = w * 0.16, dt = base - h * 0.26;
    g.fillStyle = '#2a5aa0'; g.fillRect(dx, dt - 8, dw * 0.7, 10);
    const dg = g.createLinearGradient(dx, 0, dx + dw, 0); dg.addColorStop(0, '#8a90a0'); dg.addColorStop(1, '#5a6070');
    g.fillStyle = dg; g.beginPath(); g.moveTo(dx, dt); g.lineTo(dx + dw * 0.7, dt); g.lineTo(dx + dw, base); g.lineTo(dx, base); g.fill();
    for (let i = 0; i < 8; i++) { g.fillStyle = `rgba(140,200,255,${0.4 + 0.3 * hash(i)})`; g.fillRect(dx + dw * (0.72 + i * 0.03), dt + ((st.time * 90 + i * 23) % (base - dt)), 3, 14); }
  }
  const towerX = [x + w * 0.38, x + w * 0.62, x + w * 0.86];
  for (const tx of towerX) { g.strokeStyle = '#5a5a6a'; g.lineWidth = 2; g.beginPath(); g.moveTo(tx - 10, base); g.lineTo(tx, base - h * 0.34); g.lineTo(tx + 10, base); g.moveTo(tx - 16, base - h * 0.3); g.lineTo(tx + 16, base - h * 0.3); g.stroke(); }
  const pts = [[x + w * 0.26, base - h * 0.34], ...towerX.map((tx) => [tx, base - h * 0.3]), [x + w, base - h * 0.28]];
  for (let i = 0; i < pts.length - 1; i++) {
    const [ax, ay] = pts[i], [bx, by] = pts[i + 1], my = Math.max(ay, by) + 24;
    g.strokeStyle = '#3a3a48'; g.lineWidth = 1.5; g.beginPath(); g.moveTo(ax, ay); g.quadraticCurveTo((ax + bx) / 2, my, bx, by); g.stroke();
    if (!st.stopped) for (let k = 0; k < 3; k++) {
      const p = (st.time * 0.8 + k / 3 + i * 0.13) % 1, q = 1 - p;
      const px = q * q * ax + 2 * q * p * (ax + bx) / 2 + p * p * bx, py = q * q * ay + 2 * q * p * my + p * p * by;
      g.save(); g.globalCompositeOperation = 'lighter'; glow(g, px, py, 10, 'rgba(120,180,255,A)', 0.9); g.restore();
    }
  }
  const gg = g.createLinearGradient(0, base, 0, y + h); gg.addColorStop(0, '#12101e'); gg.addColorStop(1, '#06050c');
  g.fillStyle = gg; g.fillRect(x, base, w, y + h - base);
  const R = Math.min(w, h) * 0.2, cx = x + w * 0.26, cy = base - R * 1.12;
  g.fillStyle = '#2a2a3a'; rr(g, cx - R * 1.2, base - 6, R * 2.4, 34, 6); g.fill();
  g.save(); g.globalCompositeOperation = 'lighter'; glow(g, cx, cy, R * 1.6, 'rgba(120,170,255,A)', st.stopped ? 0.05 : 0.18); g.restore();
  geraldWheel(g, cx, cy, R, st);
  g.save(); g.font = `900 ${Math.round(h * 0.028)}px ${FONT}`; g.textAlign = 'center';
  g.shadowColor = '#ffd86a'; g.shadowBlur = st.stopped ? 0 : 12; g.fillStyle = st.stopped ? '#6a5a30' : '#ffd86a';
  g.fillText('GERALD GENERATING STATION', cx, base + 20); g.restore();
}

// ---------- era 4: the megaproject ----------
function mega(g: G, b: Box, st: SceneState) {
  const { x, y, w, h } = b;
  const vib = sky(g, b, ['#04060e', '#0a1a22', '#123028'], st);
  if (!vib) stars(g, { x, y, w, h: h * 0.4 }, 60, st.time, 4);
  const hz = y + h * 0.42;
  const ground = g.createLinearGradient(0, hz, 0, y + h); ground.addColorStop(0, '#0e2a1e'); ground.addColorStop(1, '#1a3a24');
  g.fillStyle = ground; g.fillRect(x, hz, w, y + h - hz);
  g.strokeStyle = 'rgba(80,255,160,0.06)'; g.lineWidth = 1;
  for (let i = 0; i < 14; i++) { const ly = hz + Math.pow(i / 14, 2) * (y + h - hz); g.beginPath(); g.moveTo(x, ly); g.lineTo(x + w, ly); g.stroke(); }
  const cx = x + w * 0.55, cy = y + h * 0.62, rx = w * 0.4, ry = h * 0.2;
  g.save(); g.shadowColor = '#4ad0ff'; g.shadowBlur = 20; g.strokeStyle = '#2a9ad0'; g.lineWidth = 9; g.beginPath(); g.ellipse(cx, cy, rx, ry, 0, 0, TAU); g.stroke(); g.restore();
  g.strokeStyle = '#a8f0ff'; g.lineWidth = 2; g.beginPath(); g.ellipse(cx, cy, rx, ry, 0, 0, TAU); g.stroke();
  if (!st.stopped) for (let k = 0; k < 8; k++) {
    const a = st.spin * 2.2 + (k * TAU) / 8;
    g.save(); g.globalCompositeOperation = 'lighter'; glow(g, cx + Math.cos(a) * rx, cy + Math.sin(a) * ry, 14, 'rgba(160,240,255,A)', 1); g.restore();
  }
  for (let k = 0; k < Math.min(4, own(st, 12) + 1); k++) {
    const tx = x + w * (0.66 + k * 0.085), ty = y + h * 0.58, tw = w * 0.032, th = h * 0.22;
    for (let s = 0; s < 5; s++) { const p = (st.time * 0.15 + s / 5 + k * 0.17) % 1; g.fillStyle = `rgba(230,236,245,${0.45 * (1 - p)})`; g.beginPath(); g.arc(tx + p * 30, ty - th - p * h * 0.25, 12 + p * 30, 0, TAU); g.fill(); }
    const tg = g.createLinearGradient(tx - tw, 0, tx + tw, 0); tg.addColorStop(0, '#8a909c'); tg.addColorStop(0.4, '#e8ecf2'); tg.addColorStop(1, '#7a808c');
    g.fillStyle = tg; g.beginPath(); g.moveTo(tx - tw * 1.3, ty); g.quadraticCurveTo(tx - tw * 0.5, ty - th * 0.6, tx - tw * 0.85, ty - th); g.lineTo(tx + tw * 0.85, ty - th); g.quadraticCurveTo(tx + tw * 0.5, ty - th * 0.6, tx + tw * 1.3, ty); g.fill();
  }
  if (own(st, 14)) {
    const pulse = 0.75 + 0.25 * Math.sin(st.time * 6);
    g.strokeStyle = '#3a404c'; g.lineWidth = 30; g.beginPath(); g.ellipse(cx, cy, 80, 30, 0, 0, TAU); g.stroke();
    g.strokeStyle = '#5a6270'; g.lineWidth = 2; for (let i = 0; i < 16; i++) { const a = (i / 16) * TAU; g.beginPath(); g.ellipse(cx + Math.cos(a) * 80, cy + Math.sin(a) * 30, 4, 15, 0, 0, TAU); g.stroke(); }
    g.save(); g.globalCompositeOperation = 'lighter';
    g.strokeStyle = `rgba(255,110,255,${pulse})`; g.lineWidth = 10; g.shadowColor = '#f6f'; g.shadowBlur = 26; g.beginPath(); g.ellipse(cx, cy, 80, 30, 0, 0, TAU); g.stroke();
    g.restore();
    for (let k = 0; k < 5; k++) { const a = st.spin * 3 + (k * TAU) / 5; hamster(g, cx + Math.cos(a) * 80, cy + Math.sin(a) * 30 + 6, 16, st.spin * 6, { fur: FURS.pink, noShadow: true }, st.time); }
  } else { g.fillStyle = '#ffd86a'; g.font = `800 14px ${FONT}`; g.textAlign = 'center'; g.fillText('SITE OF FUTURE TOKAMAK', cx, cy + 5); g.textAlign = 'left'; }
  const R = Math.min(w, h) * 0.14;
  geraldWheel(g, x + w * 0.18, y + h * 0.94 - R * 1.12, R, st);
}

// ---------- era 5: the planet ----------
function planet(g: G, b: Box, st: SceneState) {
  const { x, y, w, h } = b;
  sky(g, b, ['#010208', '#05081a'], st);
  stars(g, b, 160, st.time, 3);
  const cx = x + w * 0.52, cy = y + h * 0.54, R = Math.min(w, h) * 0.26, tilt = -0.32;
  const ring = (front: boolean) => {
    const rx = R * 1.45, ry = R * 0.36;
    g.save(); g.translate(cx, cy); g.rotate(tilt);
    g.beginPath(); g.ellipse(0, 0, rx, ry, 0, front ? 0 : Math.PI, front ? Math.PI : TAU);
    g.strokeStyle = front ? '#e8eef8' : '#6a7490'; g.lineWidth = R * 0.05; g.stroke();
    g.beginPath(); g.ellipse(0, -R * 0.07, rx, ry, 0, front ? 0 : Math.PI, front ? Math.PI : TAU); g.strokeStyle = front ? '#b8c2d8' : '#4a5470'; g.lineWidth = R * 0.03; g.stroke();
    for (let k = 0; k < 40; k++) { const a = st.spin * 0.4 + (k / 40) * TAU, s = Math.sin(a); if ((s > 0) !== front) continue; const px = Math.cos(a) * rx, py = s * ry; g.strokeStyle = front ? '#c8d2e8' : '#5a6480'; g.lineWidth = 1.5; g.beginPath(); g.moveTo(px, py); g.lineTo(px, py - R * 0.07); g.stroke(); }
    g.restore();
  };
  ring(false);
  if (own(st, 18)) { g.strokeStyle = 'rgba(255,216,106,0.5)'; g.lineWidth = 3; g.beginPath(); g.ellipse(cx, cy, R * 1.8, R * 0.5, 0.25, Math.PI, TAU); g.stroke(); }
  glow(g, cx, cy, R * 1.25, 'rgba(90,170,255,A)', 0.35);
  const eg = g.createRadialGradient(cx - R * 0.35, cy - R * 0.35, R * 0.1, cx, cy, R);
  eg.addColorStop(0, '#5ab8ff'); eg.addColorStop(0.7, '#1a5ab0'); eg.addColorStop(1, '#0a2a60');
  g.fillStyle = eg; g.beginPath(); g.arc(cx, cy, R, 0, TAU); g.fill();
  g.save(); g.beginPath(); g.arc(cx, cy, R, 0, TAU); g.clip();
  for (let k = 0; k < 8; k++) {
    const px = cx - R * 1.4 + ((hash(k) * R * 2.8 + st.spin * R * 0.05) % (R * 2.8)), py = cy + (hash(k + 4) * 2 - 1) * R * 0.7;
    g.fillStyle = k % 3 ? '#3a9a4a' : '#c8b070'; g.beginPath(); g.ellipse(px, py, R * (0.14 + hash(k + 1) * 0.22), R * (0.08 + hash(k + 2) * 0.12), hash(k) * 3, 0, TAU); g.fill();
  }
  g.fillStyle = 'rgba(255,255,255,0.5)';
  for (let k = 0; k < 10; k++) { const px = cx - R * 1.4 + ((hash(k + 20) * R * 2.8 + st.time * R * 0.03) % (R * 2.8)), py = cy + (hash(k + 24) * 2 - 1) * R * 0.85; g.beginPath(); g.ellipse(px, py, R * 0.18, R * 0.04, 0, 0, TAU); g.fill(); }
  const ng = g.createLinearGradient(cx - R, cy - R, cx + R, cy + R); ng.addColorStop(0.45, 'rgba(0,0,20,0)'); ng.addColorStop(0.75, 'rgba(0,0,20,0.75)');
  g.fillStyle = ng; g.fillRect(cx - R, cy - R, R * 2, R * 2);
  for (let k = 0; k < 40; k++) { const a = hash(k) * TAU, d = Math.sqrt(hash(k + 3)) * R; const px = cx + Math.cos(a) * d, py = cy + Math.sin(a) * d; if (px + py - cx - cy < R * 0.5) continue; g.fillStyle = 'rgba(255,210,120,0.8)'; g.fillRect(px, py, 1.5, 1.5); }
  g.restore();
  ring(true);
  if (own(st, 18)) { g.strokeStyle = 'rgba(255,216,106,0.8)'; g.lineWidth = 3; g.beginPath(); g.ellipse(cx, cy, R * 1.8, R * 0.5, 0.25, 0, Math.PI); g.stroke(); }
  const ma = st.time * 0.25, mx = cx + Math.cos(ma) * R * 2.05, my = cy + Math.sin(ma) * R * 0.55, mr = R * 0.2;
  const mg = g.createRadialGradient(mx - mr * 0.3, my - mr * 0.3, 1, mx, my, mr); mg.addColorStop(0, '#f0f0e8'); mg.addColorStop(1, '#8a8a84');
  g.fillStyle = mg; g.beginPath(); g.arc(mx, my, mr, 0, TAU); g.fill();
  g.fillStyle = 'rgba(0,0,0,0.15)'; for (let k = 0; k < 5; k++) { g.beginPath(); g.arc(mx + (hash(k) - 0.5) * mr, my + (hash(k + 1) - 0.5) * mr, mr * 0.15 * (0.5 + hash(k + 2)), 0, TAU); g.fill(); }
  if (own(st, 17)) wheelWith(g, mx, my - mr * 1.35, mr * 0.45, st.spin * 2, style(st, 3), st.speed, undefined, false);
  gerCam(g, b, st);
}

// ---------- era 6: the star ----------
function star(g: G, b: Box, st: SceneState) {
  const { x, y, w, h } = b;
  sky(g, b, ['#040108', '#0a0412'], st);
  stars(g, b, 180, st.time, 5);
  const cx = x + w * 0.5, cy = y + h * 0.5, R = Math.min(w, h) * 0.12;
  const n = Math.min(700, 60 + (own(st, 18) + own(st, 19) + own(st, 20) * 4) * 3);
  const swarm = (front: boolean) => {
    for (let k = 0; k < n; k++) {
      const r2 = R * (1.7 + hash(k) * 2.3), tilt = (hash(k + 3) - 0.5) * 1.6, sp = 0.5 / Math.sqrt(r2 / R), a = st.time * sp + hash(k + 7) * TAU;
      if ((Math.sin(a) > 0) !== front) continue;
      const ex = Math.cos(a) * r2, ey = Math.sin(a) * r2 * 0.3, c = Math.cos(tilt), s = Math.sin(tilt);
      const px = cx + ex * c - ey * s, py = cy + ex * s + ey * c;
      const glint = Math.max(0, Math.cos(a * 3 + st.time)) ** 8;
      g.strokeStyle = st.vibes.has('rgb') ? `hsl(${(st.hue + k * 3) % 360},90%,65%)` : `rgba(${Math.round(200 + glint * 55)},${Math.round(210 + glint * 45)},255,${front ? 0.9 : 0.4})`;
      g.lineWidth = 1; g.beginPath(); g.arc(px, py, front ? 2.6 : 2, 0, TAU); g.stroke();
      if (glint > 0.5 && front) { g.fillStyle = '#fff'; g.fillRect(px - 0.5, py - 4, 1, 8); g.fillRect(px - 4, py - 0.5, 8, 1); }
    }
  };
  swarm(false);
  g.save(); g.globalCompositeOperation = 'lighter';
  glow(g, cx, cy, R * 4, 'rgba(255,140,40,A)', 0.35); glow(g, cx, cy, R * 2, 'rgba(255,220,120,A)', 0.6);
  for (let i = 0; i < 12; i++) {
    const a = st.time * 0.1 + (i / 12) * TAU, L = R * (1.6 + hash(i) * 0.8), wob = Math.sin(st.time + i) * R * 0.3;
    g.save(); g.translate(cx, cy); g.rotate(a);
    const fl = g.createLinearGradient(R, 0, L, 0); fl.addColorStop(0, 'rgba(255,200,100,0.22)'); fl.addColorStop(1, 'rgba(255,120,40,0)');
    g.fillStyle = fl; g.beginPath(); g.moveTo(R * 0.8, -R * 0.15); g.quadraticCurveTo(R * 2, wob, L, 0); g.quadraticCurveTo(R * 2, -wob, R * 0.8, R * 0.15); g.fill(); g.restore();
  }
  g.restore();
  const sg = g.createRadialGradient(cx - R * 0.2, cy - R * 0.2, 1, cx, cy, R); sg.addColorStop(0, '#ffffff'); sg.addColorStop(0.6, '#fff0a0'); sg.addColorStop(1, '#ffb030');
  g.fillStyle = sg; g.beginPath(); g.arc(cx, cy, R, 0, TAU); g.fill();
  swarm(true);
  if (own(st, 19)) { const a = st.time * 0.7, mx = cx + Math.cos(a) * R * 1.4, my = cy + Math.sin(a) * R * 0.4; g.fillStyle = '#a08070'; g.beginPath(); g.arc(mx, my, 8, 0.7, TAU - 0.7); g.lineTo(mx, my); g.fill(); for (let k = 0; k < 6; k++) g.fillRect(mx + 8 + k * 6, my + Math.sin(k + st.time * 3) * 3, 2, 2); }
  gerCam(g, b, st);
}

// ---------- era 7: the galaxy ----------
function galaxy(g: G, b: Box, st: SceneState) {
  const { x, y, w, h } = b;
  sky(g, b, ['#020104', '#06020c'], st);
  stars(g, b, 140, st.time, 8);
  const cx = x + w * 0.5, cy = y + h * 0.5, R = Math.min(w, h) * 0.44;
  g.save(); g.globalCompositeOperation = 'lighter';
  for (let i = 0; i < 6; i++) glow(g, x + w * hash(i + 40), y + h * hash(i + 41), 120, i % 2 ? 'rgba(120,60,200,A)' : 'rgba(40,120,200,A)', 0.12);
  glow(g, cx, cy, R * 0.45, 'rgba(255,200,120,A)', 0.45);
  for (let k = 0; k < 1600; k++) {
    const arm = k % 3, d = 0.05 + 0.95 * Math.pow(hash(k), 0.7), spread = (hash(k + 1) - 0.5) * (0.25 + 0.6 * (1 - d));
    const a = st.spin * 0.12 + arm * (TAU / 3) + Math.log(1 + d * 8) * 2.2 + spread, r2 = d * R * (1 + (hash(k + 2) - 0.5) * 0.12);
    g.fillStyle = st.vibes.has('rgb') ? `hsla(${(st.hue + d * 300) % 360},90%,70%,0.8)` : d < 0.25 ? 'rgba(255,230,180,0.8)' : arm === 0 ? 'rgba(160,190,255,0.7)' : 'rgba(220,170,255,0.7)';
    g.fillRect(cx + Math.cos(a) * r2, cy + Math.sin(a) * r2 * 0.55, 1.7, 1.7);
  }
  g.restore();
  if (own(st, 21)) {
    const bx = cx + R * 0.55, by = cy - R * 0.35;
    g.save(); g.globalCompositeOperation = 'lighter'; glow(g, bx, by, 50, 'rgba(255,150,60,A)', 0.4); g.restore();
    g.strokeStyle = '#ffb05a'; g.lineWidth = 5; g.beginPath(); g.ellipse(bx, by, 36, 9, 0.2, 0, TAU); g.stroke();
    g.fillStyle = '#000'; g.beginPath(); g.arc(bx, by, 13, 0, TAU); g.fill();
    g.strokeStyle = '#ffd09a'; g.lineWidth = 2; g.beginPath(); g.ellipse(bx, by, 36, 9, 0.2, Math.PI * 0.05, Math.PI * 0.95); g.stroke();
  }
  if (own(st, 23)) {
    g.strokeStyle = 'rgba(255,255,255,0.12)'; g.lineWidth = 3; g.beginPath(); g.arc(cx, cy, R * 1.12, 0, TAU); g.stroke();
    for (let k = 0; k < 12; k++) { const a = st.spin * 0.05 + (k * TAU) / 12; g.lineWidth = 1.5; g.beginPath(); g.moveTo(cx, cy); g.lineTo(cx + Math.cos(a) * R * 1.12, cy + Math.sin(a) * R * 1.12); g.stroke(); }
  }
  gerCam(g, b, st);
}

/** Picture-in-picture: Gerald is still down there, powering all of it. */
function gerCam(g: G, b: Box, st: SceneState) {
  const w = Math.min(190, b.w * 0.26), h = w * 0.72, x = b.x + 14, y = b.y + b.h - h - 46;
  g.save();
  g.shadowColor = 'rgba(0,0,0,0.6)'; g.shadowBlur = 16; g.fillStyle = '#000'; rr(g, x, y, w, h, 10); g.fill(); g.shadowBlur = 0;
  rr(g, x, y, w, h, 10); g.clip();
  const bg = g.createLinearGradient(0, y, 0, y + h); bg.addColorStop(0, '#c49762'); bg.addColorStop(1, '#8a6034');
  g.fillStyle = bg; g.fillRect(x, y, w, h);
  g.fillStyle = '#e8d8b0'; g.fillRect(x, y + h * 0.82, w, h * 0.18);
  geraldWheel(g, x + w / 2, y + h * 0.45, h * 0.32, st);
  g.fillStyle = 'rgba(0,0,0,0.18)'; for (let ly = y; ly < y + h; ly += 3) g.fillRect(x, ly, w, 1);
  g.restore();
  g.strokeStyle = 'rgba(255,255,255,0.25)'; g.lineWidth = 1.5; rr(g, x, y, w, h, 10); g.stroke();
  g.fillStyle = Math.floor(st.time * 1.5) % 2 ? '#ff3a3a' : '#7a1a1a'; g.beginPath(); g.arc(x + 14, y + 14, 4, 0, TAU); g.fill();
  g.fillStyle = '#fff'; g.font = `800 10px ${FONT}`; g.fillText('GERALD CAM · LIVE', x + 24, y + 18);
  const tt = Math.floor(st.s.t); g.font = `600 9px ${FONT}`; g.fillStyle = 'rgba(255,255,255,0.7)';
  g.fillText(`${String(Math.floor(tt / 3600)).padStart(2, '0')}:${String(Math.floor(tt / 60) % 60).padStart(2, '0')}:${String(tt % 60).padStart(2, '0')}`, x + w - 52, y + h - 8);
}

export const SCENES = [shoebox, garage, startup, city, mega, planet, star, galaxy];
