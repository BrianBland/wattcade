// Era scenes + Gerald. Pure Canvas 2D drawing; all state comes in via SceneState.
import type { HamsterSnapshot } from '../sim/sim';

export interface Box { x: number; y: number; w: number; h: number }
export interface SceneState {
  s: HamsterSnapshot; time: number; spin: number; vibes: Set<string>; strikeOn: boolean; stopped: boolean; hue: number;
}
type G = CanvasRenderingContext2D;

const TAU = Math.PI * 2;
const hash = (n: number) => { const x = Math.sin(n * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); };

// ---------- primitives ----------
export function wheel(g: G, x: number, y: number, r: number, ang: number, st: SceneState, color = '#b8c2d8', idx = 0) {
  const rgb = st.vibes.has('rgb');
  const rim = rgb ? `hsl(${(st.hue + idx * 37) % 360},95%,60%)` : color;
  g.save(); g.translate(x, y);
  g.strokeStyle = rim; g.lineWidth = Math.max(1, r * 0.08);
  if (rgb) { g.shadowColor = rim; g.shadowBlur = r * 0.4; }
  g.beginPath(); g.arc(0, 0, r, 0, TAU); g.stroke();
  g.shadowBlur = 0;
  g.lineWidth = Math.max(0.5, r * 0.025);
  const n = r > 30 ? 16 : 8;
  for (let i = 0; i < n; i++) { const a = ang + (i / n) * TAU; g.beginPath(); g.moveTo(Math.cos(a) * r * 0.15, Math.sin(a) * r * 0.15); g.lineTo(Math.cos(a) * r, Math.sin(a) * r); g.stroke(); }
  // rungs
  if (r > 20) { g.lineWidth = Math.max(1, r * 0.05); for (let i = 0; i < 24; i++) { const a = ang * 1 + (i / 24) * TAU; g.beginPath(); g.arc(0, 0, r * 0.93, a, a + 0.04); g.stroke(); } }
  g.fillStyle = rim; g.beginPath(); g.arc(0, 0, r * 0.1, 0, TAU); g.fill();
  g.restore();
  // stand
  if (r > 12) { g.strokeStyle = '#5a6278'; g.lineWidth = Math.max(1, r * 0.07); g.beginPath(); g.moveTo(x, y); g.lineTo(x - r * 0.6, y + r * 1.12); g.moveTo(x, y); g.lineTo(x + r * 0.6, y + r * 1.12); g.stroke(); }
}

export interface HamsterLook { swole?: number; shades?: boolean; rage?: boolean; halo?: boolean; bigHead?: boolean; golden?: boolean; sign?: string; sleep?: boolean; color?: string; flip?: boolean }
/** A hamster, facing right, feet at (x, y). `size` ≈ body length. `phase` drives the legs. */
export function hamster(g: G, x: number, y: number, size: number, phase: number, look: HamsterLook = {}, time = 0) {
  const s = size, sw = look.swole ?? 0;
  g.save(); g.translate(x, y); if (look.flip) g.scale(-1, 1);
  const body = look.golden ? '#ffd23a' : look.rage ? '#e0603a' : look.color ?? '#e3a35e';
  const bob = look.sleep ? 0 : Math.abs(Math.sin(phase * 2)) * s * 0.05;
  g.translate(0, -bob);
  // legs
  g.strokeStyle = '#c47a3a'; g.lineCap = 'round'; g.lineWidth = Math.max(1, s * (0.08 + sw * 0.05));
  for (let i = 0; i < 4; i++) {
    const lx = (i < 2 ? -0.22 : 0.22) * s, ph = phase * 2 + i * Math.PI * 0.5;
    const swing = look.sleep ? 0 : Math.sin(ph) * s * 0.14;
    g.beginPath(); g.moveTo(lx, -s * 0.12); g.lineTo(lx + swing, 0); g.stroke();
  }
  // tail
  g.fillStyle = '#f2c9a0'; g.beginPath(); g.arc(-s * 0.48, -s * 0.28, s * 0.05, 0, TAU); g.fill();
  // body
  g.fillStyle = body; g.beginPath(); g.ellipse(0, -s * 0.3, s * (0.5 + sw * 0.08), s * (0.27 + sw * 0.1), 0, 0, TAU); g.fill();
  g.fillStyle = '#fbe8d2'; g.beginPath(); g.ellipse(s * 0.05, -s * 0.2, s * 0.32, s * 0.12, 0, 0, TAU); g.fill();
  if (sw > 0.05) { // shoulders + biceps + six-pack
    g.fillStyle = body;
    g.beginPath(); g.arc(s * 0.22, -s * 0.36, s * (0.12 + sw * 0.16), 0, TAU); g.fill();
    g.beginPath(); g.arc(s * 0.3, -s * 0.18, s * (0.06 + sw * 0.12), 0, TAU); g.fill();
    g.strokeStyle = '#b5703a'; g.lineWidth = Math.max(0.8, s * 0.015);
    for (let i = 0; i < 3; i++) { g.beginPath(); g.moveTo(-s * 0.05 + i * s * 0.09, -s * 0.24); g.lineTo(-s * 0.05 + i * s * 0.09, -s * 0.15); g.stroke(); }
    if (sw > 0.5 || look.rage) { g.strokeStyle = '#c0204a'; g.lineWidth = Math.max(0.8, s * 0.012); g.beginPath(); g.moveTo(s * 0.15, -s * 0.45); g.quadraticCurveTo(s * 0.25, -s * 0.38, s * 0.2, -s * 0.3); g.quadraticCurveTo(s * 0.32, -s * 0.24, s * 0.28, -s * 0.12); g.stroke(); }
  }
  // head
  const hs = look.bigHead ? 2.1 : 1;
  g.save(); g.translate(s * 0.42, -s * 0.38); g.scale(hs, hs);
  g.fillStyle = body; g.beginPath(); g.ellipse(0, 0, s * 0.2, s * 0.18, 0.2, 0, TAU); g.fill();
  g.fillStyle = '#f4a6b8'; g.beginPath(); g.arc(-s * 0.06, -s * 0.16, s * 0.06, 0, TAU); g.fill();
  g.beginPath(); g.arc(s * 0.19, s * 0.02, s * 0.03, 0, TAU); g.fill();
  if (look.sleep) { g.strokeStyle = '#222'; g.lineWidth = Math.max(1, s * 0.02); g.beginPath(); g.moveTo(s * 0.02, -s * 0.03); g.lineTo(s * 0.1, -s * 0.03); g.stroke(); }
  else { g.fillStyle = look.rage ? '#ff1a1a' : '#111'; g.beginPath(); g.arc(s * 0.07, -s * 0.04, s * 0.035, 0, TAU); g.fill(); }
  if (look.shades) { g.fillStyle = '#050505'; g.fillRect(-s * 0.02, -s * 0.09, s * 0.2, s * 0.08); g.fillRect(-s * 0.1, -s * 0.07, s * 0.1, s * 0.02); }
  if (look.rage) { g.fillStyle = '#ff2a2a'; g.font = `${s * 0.25}px sans-serif`; g.fillText('💢', -s * 0.2, -s * 0.2); }
  g.restore();
  if (look.halo) { g.strokeStyle = '#fff6a0'; g.lineWidth = Math.max(1, s * 0.04); g.shadowColor = '#fff6a0'; g.shadowBlur = 10; g.beginPath(); g.ellipse(s * 0.42, -s * (0.62 + (hs - 1) * 0.35), s * 0.17, s * 0.05, 0, 0, TAU); g.stroke(); g.shadowBlur = 0; }
  if (look.sign) {
    g.strokeStyle = '#7a5a3a'; g.lineWidth = Math.max(1, s * 0.04); g.beginPath(); g.moveTo(s * 0.1, -s * 0.3); g.lineTo(s * 0.1, -s * 1.2); g.stroke();
    g.fillStyle = '#f4f0e0'; g.fillRect(-s * 0.35, -s * 1.5, s * 0.9, s * 0.38);
    g.fillStyle = '#c01a1a'; g.font = `bold ${Math.max(6, s * 0.14)}px sans-serif`; g.textAlign = 'center'; g.fillText(look.sign, s * 0.1, -s * 1.27); g.textAlign = 'left';
  }
  if (look.sleep) { g.fillStyle = '#fff'; g.font = `${s * 0.25}px sans-serif`; g.fillText('z', s * 0.6, -s * 0.7 - (time % 1) * s * 0.3); g.fillText('Z', s * 0.75, -s * 0.95 - (time % 1) * s * 0.3); }
  g.restore();
}

/** Gerald running in a wheel centred at (x, y) radius r. */
export function geraldWheel(g: G, x: number, y: number, r: number, st: SceneState) {
  const s = st.s, dir = s.rage ? -1 : 1;
  wheel(g, x, y, r, st.spin * dir, st, '#c8d2ea');
  const swole = Math.min(1, s.pepUses / 40);
  hamster(g, x - (s.giant ? r * 0.4 : 0), y + r * 0.9, r * 0.8 * (s.giant ? 2.2 : 1), st.spin * 3 * dir, {
    swole, shades: st.vibes.has('shades'), rage: !!s.rage, halo: st.vibes.has('halo'), bigHead: st.vibes.has('bighead'),
    sleep: st.stopped || s.effects.some((e) => e.id === 'crash'), flip: !!s.rage, sign: st.strikeOn ? 'NO SEEDS NO WHEELS' : undefined,
  }, st.time);
}

// ---------- backgrounds ----------
function stars(g: G, b: Box, n: number, time: number, seed = 1) {
  for (let i = 0; i < n; i++) {
    const x = b.x + hash(i * 3 + seed) * b.w, y = b.y + hash(i * 7 + seed) * b.h, tw = 0.5 + 0.5 * Math.sin(time * 2 + i);
    g.fillStyle = `rgba(255,255,255,${0.3 + 0.6 * tw * hash(i + 9)})`; g.fillRect(x, y, 1.5, 1.5);
  }
}
function vapor(g: G, b: Box, time: number) {
  const gr = g.createLinearGradient(0, b.y, 0, b.y + b.h);
  gr.addColorStop(0, '#2b0a4a'); gr.addColorStop(0.5, '#ff4fa3'); gr.addColorStop(0.62, '#ffb36b'); gr.addColorStop(0.62, '#1a0630'); gr.addColorStop(1, '#0a0220');
  g.fillStyle = gr; g.fillRect(b.x, b.y, b.w, b.h);
  const cx = b.x + b.w / 2, hy = b.y + b.h * 0.62, sr = b.h * 0.22;
  g.fillStyle = '#ffd36b'; g.beginPath(); g.arc(cx, hy, sr, Math.PI, 0); g.fill();
  g.fillStyle = '#ff4fa3'; for (let i = 0; i < 5; i++) g.fillRect(cx - sr, hy - sr * 0.15 - i * sr * 0.17, sr * 2, sr * 0.04 + i * 0.6);
  g.strokeStyle = '#ff4fd8aa'; g.lineWidth = 1;
  for (let i = 0; i < 12; i++) { const y = hy + Math.pow((i + (time * 0.5) % 1) / 12, 2) * (b.y + b.h - hy); g.beginPath(); g.moveTo(b.x, y); g.lineTo(b.x + b.w, y); g.stroke(); }
  for (let i = -10; i <= 10; i++) { g.beginPath(); g.moveTo(cx + i * 8, hy); g.lineTo(cx + i * b.w * 0.15, b.y + b.h); g.stroke(); }
}
function hypno(g: G, b: Box, time: number) {
  const cx = b.x + b.w / 2, cy = b.y + b.h / 2, R = Math.hypot(b.w, b.h) / 2;
  g.save(); g.globalAlpha = 0.18;
  for (let i = 0; i < 12; i++) {
    g.fillStyle = i % 2 ? '#ffffff' : '#7a2aff';
    g.beginPath(); g.moveTo(cx, cy);
    for (let r = 0; r < R; r += 8) { const a = time * 1.5 + (i / 12) * TAU + r * 0.02; g.lineTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r); }
    for (let r = R; r > 0; r -= 8) { const a = time * 1.5 + ((i + 1) / 12) * TAU + r * 0.02; g.lineTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r); }
    g.fill();
  }
  g.restore();
}
function sky(g: G, b: Box, top: string, bot: string, st: SceneState) {
  if (st.vibes.has('vapor')) { vapor(g, b, st.time); }
  else { const gr = g.createLinearGradient(0, b.y, 0, b.y + b.h); gr.addColorStop(0, top); gr.addColorStop(1, bot); g.fillStyle = gr; g.fillRect(b.x, b.y, b.w, b.h); }
  if (st.vibes.has('hypno')) hypno(g, b, st.time);
}

// ---------- eras ----------
const own = (st: SceneState, i: number) => st.s.gens[i]?.owned ?? 0;
const cap = (n: number, m: number) => Math.min(m, n);

function shoebox(g: G, b: Box, st: SceneState) {
  sky(g, b, '#3a2a1c', '#5a4028', st);
  // box walls
  g.fillStyle = '#b48a5a'; g.fillRect(b.x + b.w * 0.04, b.y + b.h * 0.18, b.w * 0.92, b.h * 0.78);
  g.fillStyle = '#9c7446'; g.fillRect(b.x + b.w * 0.04, b.y + b.h * 0.18, b.w * 0.92, b.h * 0.06);
  g.fillStyle = '#c99d68'; g.beginPath(); g.moveTo(b.x + b.w * 0.04, b.y + b.h * 0.18); g.lineTo(b.x - b.w * 0.02, b.y + b.h * 0.06); g.lineTo(b.x + b.w * 0.3, b.y + b.h * 0.06); g.lineTo(b.x + b.w * 0.34, b.y + b.h * 0.18); g.fill();
  g.fillStyle = '#7a5530'; g.font = `bold ${b.h * 0.035}px sans-serif`; g.fillText('THIS SIDE UP ↑   FRAGILE   GERALD', b.x + b.w * 0.4, b.y + b.h * 0.22);
  // shavings
  for (let i = 0; i < 120; i++) { g.fillStyle = hash(i) > 0.5 ? '#e8d4a0' : '#d4b878'; g.fillRect(b.x + b.w * (0.05 + hash(i * 3) * 0.9), b.y + b.h * (0.9 + hash(i * 5) * 0.06), 6, 2); }
  const fy = b.y + b.h * 0.9;
  const R = Math.min(b.w, b.h) * 0.2;
  geraldWheel(g, b.x + b.w * 0.33, fy - R * 1.12, R, st);
  // little ones: hamsters, gerbils, guinea pigs
  const kinds: Array<[number, string]> = [[0, '#e3a35e'], [1, '#d8c39a'], [2, '#8a5a3a']];
  let slot = 0;
  for (const [i, col] of kinds) for (let k = 0; k < cap(own(st, i), 10); k++, slot++) {
    const col2 = slot % 6, row = Math.floor(slot / 6), r = R * 0.22;
    const x = b.x + b.w * (0.6 + col2 * 0.065), y = fy - r * 1.12 - row * r * 2.6;
    if (y < b.y + b.h * 0.3) continue;
    wheel(g, x, y, r, st.spin * 1.6 + slot, st, '#9aa4bc', slot);
    hamster(g, x, y + r * 0.9, r * (i === 2 ? 1 : 0.8), st.spin * 5 + slot, { color: col, sleep: st.stopped, sign: st.strikeOn && slot % 3 === 0 ? 'STRIKE' : undefined }, st.time);
  }
}

function garage(g: G, b: Box, st: SceneState) {
  sky(g, b, '#2a2f3a', '#40485a', st);
  g.fillStyle = '#5a6070'; g.fillRect(b.x, b.y + b.h * 0.86, b.w, b.h * 0.14);
  // pegboard
  g.fillStyle = '#a0875a'; g.fillRect(b.x + b.w * 0.55, b.y + b.h * 0.1, b.w * 0.4, b.h * 0.3);
  g.fillStyle = '#6b5a3a'; for (let i = 0; i < 60; i++) g.fillRect(b.x + b.w * (0.56 + (i % 12) * 0.032), b.y + b.h * (0.12 + Math.floor(i / 12) * 0.055), 2, 2);
  const fy = b.y + b.h * 0.86, R = Math.min(b.w, b.h) * 0.17;
  // ferret tubes
  const tubes = cap(own(st, 4), 4);
  for (let k = 0; k < tubes; k++) {
    const y = b.y + b.h * (0.48 + k * 0.07);
    g.strokeStyle = '#7ad0ffaa'; g.lineWidth = 10; g.beginPath(); g.moveTo(b.x, y); g.bezierCurveTo(b.x + b.w * 0.3, y - 40, b.x + b.w * 0.6, y + 40, b.x + b.w, y - 10); g.stroke();
    const p = (st.time * 0.3 + k * 0.27) % 1;
    g.fillStyle = '#f0e0c0'; g.beginPath(); g.arc(b.x + p * b.w, y + Math.sin(p * 6) * 14, 5, 0, TAU); g.fill();
  }
  // gyms: dumbbell racks with lifting hamsters
  for (let k = 0; k < cap(own(st, 3), 6); k++) {
    const x = b.x + b.w * (0.58 + k * 0.065), y = b.y + b.h * 0.52, lift = Math.abs(Math.sin(st.time * 3 + k)) * 12;
    hamster(g, x, y, 22, 0, { swole: 0.7, sleep: st.stopped }, st.time);
    g.strokeStyle = '#333'; g.lineWidth = 3; g.beginPath(); g.moveTo(x - 6, y - 26 - lift); g.lineTo(x + 18, y - 26 - lift); g.stroke();
    g.fillStyle = '#222'; g.fillRect(x - 10, y - 32 - lift, 5, 12); g.fillRect(x + 17, y - 32 - lift, 5, 12);
  }
  // capybaras in a hot tub
  const capys = cap(own(st, 5), 6);
  if (capys) {
    const tx = b.x + b.w * 0.62, ty = fy - 30, tw = b.w * 0.33;
    g.fillStyle = '#4a90c0'; g.fillRect(tx, ty, tw, 30); g.fillStyle = '#8a6a4a'; g.fillRect(tx - 4, ty + 26, tw + 8, 8);
    for (let k = 0; k < capys; k++) {
      const cx = tx + 20 + k * (tw - 40) / Math.max(1, capys - 1);
      g.fillStyle = '#8a5f3a'; g.beginPath(); g.ellipse(cx, ty + 2, 18, 12, 0, Math.PI, 0); g.fill();
      g.fillStyle = '#ff9a1a'; g.beginPath(); g.arc(cx + 2, ty - 12, 6, 0, TAU); g.fill();
      g.fillStyle = '#111'; g.fillRect(cx + 8, ty - 4, 2, 2);
      for (let s2 = 0; s2 < 2; s2++) { g.strokeStyle = '#ffffff55'; g.lineWidth = 1; g.beginPath(); g.moveTo(cx - 6 + s2 * 8, ty - 20 - (st.time * 10 + k * 5) % 15); g.lineTo(cx - 4 + s2 * 8, ty - 30 - (st.time * 10 + k * 5) % 15); g.stroke(); }
    }
  }
  // a row of small wheels for the shoebox crew
  const small = cap(own(st, 0) + own(st, 1) + own(st, 2), 14);
  for (let k = 0; k < small; k++) { const r = R * 0.18, x = b.x + b.w * (0.05 + k * 0.035), y = b.y + b.h * 0.3; wheel(g, x, y, r, st.spin * 2 + k, st, '#8a94ac', k); }
  geraldWheel(g, b.x + b.w * 0.27, fy - R * 1.12, R, st);
}

function startup(g: G, b: Box, st: SceneState) {
  sky(g, b, '#101828', '#1c2a44', st);
  // windows
  for (let i = 0; i < 4; i++) { g.fillStyle = '#2a3a5a'; g.fillRect(b.x + b.w * (0.05 + i * 0.235), b.y + b.h * 0.08, b.w * 0.2, b.h * 0.34); g.fillStyle = '#0a1020'; for (let k = 0; k < 6; k++) g.fillRect(b.x + b.w * (0.06 + i * 0.235 + k * 0.03), b.y + b.h * (0.3 - hash(k + i * 6) * 0.15), b.w * 0.025, b.h * 0.2); }
  // neon sign
  g.save(); g.shadowColor = '#ff4fd8'; g.shadowBlur = 18; g.fillStyle = '#ff9af0'; g.font = `bold ${b.h * 0.07}px sans-serif`; g.fillText('WheelWork™', b.x + b.w * 0.5, b.y + b.h * 0.52); g.restore();
  // chart going up
  g.strokeStyle = '#3aff8a'; g.lineWidth = 3; g.beginPath();
  for (let i = 0; i <= 30; i++) { const x = b.x + b.w * (0.52 + i * 0.015), y = b.y + b.h * (0.75 - i * 0.006 - 0.04 * Math.sin(i * 1.7 + st.time)); if (i) g.lineTo(x, y); else g.moveTo(x, y); }
  g.stroke();
  g.fillStyle = '#3aff8a'; g.font = `bold ${b.h * 0.035}px sans-serif`; g.fillText('$GERALD ▲ ' + (420 + Math.floor(st.time * 7) % 600) + '%', b.x + b.w * 0.55, b.y + b.h * 0.6);
  // desks with wheels
  const fy = b.y + b.h * 0.9, n = cap(own(st, 6) * 2 + own(st, 7) + own(st, 8), 16);
  g.fillStyle = '#3a4258'; g.fillRect(b.x, fy, b.w, b.h * 0.1);
  for (let k = 0; k < n; k++) {
    const r = Math.min(b.w, b.h) * 0.045, x = b.x + b.w * (0.5 + (k % 8) * 0.06), y = fy - r * 1.12 - Math.floor(k / 8) * r * 3.2 - (Math.floor(k / 8) ? 0 : 0);
    if (Math.floor(k / 8)) { g.fillStyle = '#556080'; g.fillRect(x - r * 1.2, y + r * 1.12, r * 2.4, 4); }
    wheel(g, x, y, r, st.spin * 1.8 + k, st, '#a0aac8', k);
    hamster(g, x, y + r * 0.9, r * 0.8, st.spin * 5 + k, { color: k % 3 === 1 ? '#f0d8ff' : undefined, shades: k % 4 === 0, sleep: st.stopped }, st.time);
  }
  // influencer ring light
  if (own(st, 7)) { const x = b.x + b.w * 0.12, y = b.y + b.h * 0.55; g.strokeStyle = '#fff8e0'; g.lineWidth = 6; g.shadowColor = '#fff'; g.shadowBlur = 20; g.beginPath(); g.arc(x, y, 30, 0, TAU); g.stroke(); g.shadowBlur = 0; hamster(g, x - 10, y + 16, 26, 0, { shades: true }); }
  const R = Math.min(b.w, b.h) * 0.16;
  geraldWheel(g, b.x + b.w * 0.27, fy - R * 1.12, R, st);
}

function city(g: G, b: Box, st: SceneState) {
  sky(g, b, '#0a0f2a', '#3a2050', st);
  stars(g, { x: b.x, y: b.y, w: b.w, h: b.h * 0.4 }, 50, st.time);
  // skyline
  const base = b.y + b.h * 0.78;
  for (let i = 0; i < 26; i++) {
    const w = b.w * 0.04, h = b.h * (0.1 + hash(i) * 0.3), x = b.x + i * b.w * 0.039;
    g.fillStyle = '#141a30'; g.fillRect(x, base - h, w, h);
    for (let k = 0; k < 8; k++) { const on = hash(i * 13 + k + Math.floor(st.time * 0.2)) > 0.4 && !st.stopped; g.fillStyle = on ? '#ffd86a' : '#232a44'; g.fillRect(x + 3 + (k % 2) * w * 0.45, base - h + 6 + Math.floor(k / 2) * 12, w * 0.3, 6); }
  }
  // wind turbines
  for (let k = 0; k < cap(own(st, 11) + 2, 7); k++) {
    const x = b.x + b.w * (0.62 + k * 0.055), y = b.y + b.h * 0.35, L = b.h * 0.08;
    g.strokeStyle = '#d0d8e8'; g.lineWidth = 2; g.beginPath(); g.moveTo(x, y); g.lineTo(x, base); g.stroke();
    for (let a = 0; a < 3; a++) { const an = st.spin * 1.3 + k + (a * TAU) / 3; g.beginPath(); g.moveTo(x, y); g.lineTo(x + Math.cos(an) * L, y + Math.sin(an) * L); g.stroke(); }
  }
  // dam
  if (own(st, 10)) { g.fillStyle = '#7a8090'; g.beginPath(); g.moveTo(b.x, base - b.h * 0.25); g.lineTo(b.x + b.w * 0.12, base - b.h * 0.25); g.lineTo(b.x + b.w * 0.17, base); g.lineTo(b.x, base); g.fill(); g.fillStyle = '#3a7ad0'; for (let i = 0; i < 6; i++) g.fillRect(b.x + b.w * (0.12 + i * 0.008), base - b.h * 0.2 + ((st.time * 80 + i * 20) % (b.h * 0.2)), 3, 10); }
  // power lines with sparks
  g.strokeStyle = '#555'; g.lineWidth = 1.5;
  for (let l = 0; l < 3; l++) { g.beginPath(); g.moveTo(b.x + b.w * 0.27, base - b.h * 0.33); g.quadraticCurveTo(b.x + b.w * 0.6, base - b.h * (0.18 - l * 0.03), b.x + b.w, base - b.h * (0.35 - l * 0.04)); g.stroke(); }
  if (!st.stopped) for (let k = 0; k < 8; k++) { const p = (st.time * 0.6 + k / 8) % 1; const x = b.x + b.w * (0.27 + p * 0.73), y = base - b.h * (0.33 - Math.sin(p * Math.PI) * 0.12); g.fillStyle = '#9af'; g.shadowColor = '#9af'; g.shadowBlur = 8; g.beginPath(); g.arc(x, y, 3, 0, TAU); g.fill(); g.shadowBlur = 0; }
  g.fillStyle = '#0c1020'; g.fillRect(b.x, base, b.w, b.y + b.h - base);
  const R = Math.min(b.w, b.h) * 0.2;
  geraldWheel(g, b.x + b.w * 0.27, base - R * 0.9, R, st);
  g.fillStyle = '#ffd86a'; g.font = `bold ${b.h * 0.03}px sans-serif`; g.fillText('GERALD GENERATING STATION', b.x + b.w * 0.12, base + b.h * 0.08);
}

function mega(g: G, b: Box, st: SceneState) {
  sky(g, b, '#0a1a12', '#1a3a22', st);
  const cx = b.x + b.w * 0.55, cy = b.y + b.h * 0.55;
  // hadron ring
  g.strokeStyle = '#4ad0ff'; g.lineWidth = 6; g.shadowColor = '#4ad0ff'; g.shadowBlur = 16;
  g.beginPath(); g.ellipse(cx, cy, b.w * 0.38, b.h * 0.25, 0, 0, TAU); g.stroke(); g.shadowBlur = 0;
  if (!st.stopped) for (let k = 0; k < 6; k++) { const a = st.spin * 2 + (k * TAU) / 6; g.fillStyle = '#fff'; g.beginPath(); g.arc(cx + Math.cos(a) * b.w * 0.38, cy + Math.sin(a) * b.h * 0.25, 4, 0, TAU); g.fill(); }
  // cooling towers
  for (let k = 0; k < cap(own(st, 12) + 1, 4); k++) {
    const x = b.x + b.w * (0.6 + k * 0.1), y = b.y + b.h * 0.86, w = b.w * 0.035;
    g.fillStyle = '#c8ccd4'; g.beginPath(); g.moveTo(x - w, y); g.quadraticCurveTo(x - w * 0.4, y - b.h * 0.15, x - w * 0.7, y - b.h * 0.25); g.lineTo(x + w * 0.7, y - b.h * 0.25); g.quadraticCurveTo(x + w * 0.4, y - b.h * 0.15, x + w, y); g.fill();
    for (let s = 0; s < 4; s++) { const p = (st.time * 0.2 + s / 4 + k * 0.1) % 1; g.fillStyle = `rgba(240,240,250,${0.5 * (1 - p)})`; g.beginPath(); g.arc(x + p * 20, y - b.h * 0.27 - p * b.h * 0.2, 10 + p * 20, 0, TAU); g.fill(); }
  }
  // tokamak donut
  if (own(st, 14)) {
    const tx = cx, ty = cy, pulse = 0.7 + 0.3 * Math.sin(st.time * 6);
    g.strokeStyle = '#555c6a'; g.lineWidth = 26; g.beginPath(); g.ellipse(tx, ty, 70, 30, 0, 0, TAU); g.stroke();
    g.strokeStyle = `rgba(255,120,255,${pulse})`; g.lineWidth = 10; g.shadowColor = '#f6f'; g.shadowBlur = 24; g.beginPath(); g.ellipse(tx, ty, 70, 30, 0, 0, TAU); g.stroke(); g.shadowBlur = 0;
    for (let k = 0; k < 5; k++) { const a = st.spin * 3 + (k * TAU) / 5; hamster(g, tx + Math.cos(a) * 70, ty + Math.sin(a) * 30 + 6, 14, st.spin * 6, { color: '#ffb0ff' }); }
  }
  const R = Math.min(b.w, b.h) * 0.13;
  geraldWheel(g, b.x + b.w * 0.17, b.y + b.h * 0.86 - R * 1.12, R, st);
}

function planet(g: G, b: Box, st: SceneState) {
  sky(g, b, '#02030a', '#060a1a', st);
  stars(g, b, 140, st.time, 3);
  const cx = b.x + b.w * 0.5, cy = b.y + b.h * 0.55, R = Math.min(b.w, b.h) * 0.27;
  // earth
  const gr = g.createRadialGradient(cx - R * 0.3, cy - R * 0.3, R * 0.1, cx, cy, R);
  gr.addColorStop(0, '#4aa0ff'); gr.addColorStop(1, '#0a3070');
  g.fillStyle = gr; g.beginPath(); g.arc(cx, cy, R, 0, TAU); g.fill();
  g.save(); g.beginPath(); g.arc(cx, cy, R, 0, TAU); g.clip();
  g.fillStyle = '#3aa050';
  for (let k = 0; k < 7; k++) { const x = cx + (((hash(k) * 2 - 1) * R + st.spin * R * 0.15 + k * R * 0.6) % (R * 2.4)) - R * 0.2, y = cy + (hash(k + 4) * 2 - 1) * R * 0.7; g.beginPath(); g.ellipse(x, y, R * (0.15 + hash(k + 1) * 0.2), R * 0.12, hash(k) * 3, 0, TAU); g.fill(); }
  g.restore();
  // wheel band around earth
  g.strokeStyle = '#c8d2ea'; g.lineWidth = 5; g.beginPath(); g.ellipse(cx, cy, R * 1.35, R * 0.35, -0.3, 0, TAU); g.stroke();
  g.lineWidth = 1.5; for (let k = 0; k < 20; k++) { const a = st.spin * 0.5 + (k * TAU) / 20; const ex = Math.cos(a) * R * 1.35, ey = Math.sin(a) * R * 0.35, c = Math.cos(-0.3), s = Math.sin(-0.3); g.beginPath(); g.moveTo(cx, cy); g.lineTo(cx + ex * c - ey * s, cy + ex * s + ey * c); g.globalAlpha = 0.3; g.stroke(); g.globalAlpha = 1; }
  // moon with colony
  const ma = st.time * 0.3, mx = cx + Math.cos(ma) * R * 1.9, my = cy + Math.sin(ma) * R * 0.6, mr = R * 0.22;
  g.fillStyle = '#c8c8c0'; g.beginPath(); g.arc(mx, my, mr, 0, TAU); g.fill();
  if (own(st, 17)) wheel(g, mx, my - mr * 1.4, mr * 0.5, st.spin * 2, st, '#ffffff');
  // orbital ring
  if (own(st, 18)) { g.strokeStyle = '#ffd86a88'; g.lineWidth = 3; g.beginPath(); g.ellipse(cx, cy, R * 1.7, R * 0.5, 0.2, 0, TAU); g.stroke(); }
  gerCam(g, b, st);
}

function star(g: G, b: Box, st: SceneState) {
  sky(g, b, '#050208', '#0a0410', st);
  stars(g, b, 160, st.time, 5);
  const cx = b.x + b.w * 0.5, cy = b.y + b.h * 0.5, R = Math.min(b.w, b.h) * 0.13;
  const cor = g.createRadialGradient(cx, cy, R * 0.5, cx, cy, R * 3);
  cor.addColorStop(0, '#fff6c0'); cor.addColorStop(0.3, '#ffb02a88'); cor.addColorStop(1, '#ff600000');
  g.fillStyle = cor; g.beginPath(); g.arc(cx, cy, R * 3, 0, TAU); g.fill();
  g.fillStyle = '#fff2b0'; g.beginPath(); g.arc(cx, cy, R, 0, TAU); g.fill();
  // swarm
  const n = Math.min(600, 40 + (own(st, 18) + own(st, 19) + own(st, 20) * 4) * 3);
  for (let k = 0; k < n; k++) {
    const rr = R * (1.6 + hash(k) * 2.2), tilt = hash(k + 3) * Math.PI, sp = 0.6 / Math.sqrt(rr / R), a = st.time * sp + hash(k + 7) * TAU;
    const ex = Math.cos(a) * rr, ey = Math.sin(a) * rr * 0.35, c = Math.cos(tilt), s = Math.sin(tilt);
    const x = cx + ex * c - ey * s, y = cy + ex * s + ey * c;
    const behind = Math.sin(a) < 0 && Math.hypot(x - cx, y - cy) < R;
    if (behind) continue;
    g.strokeStyle = st.vibes.has('rgb') ? `hsl(${(st.hue + k * 3) % 360},90%,65%)` : '#c8d8ff';
    g.lineWidth = 1; g.beginPath(); g.arc(x, y, 2.5, 0, TAU); g.stroke();
  }
  // mercury being eaten
  if (own(st, 19)) { const a = st.time * 0.8, x = cx + Math.cos(a) * R * 1.4, y = cy + Math.sin(a) * R * 0.5; g.fillStyle = '#a08070'; g.beginPath(); g.arc(x, y, 7, 0.6, TAU - 0.6); g.lineTo(x, y); g.fill(); }
  gerCam(g, b, st);
}

function galaxy(g: G, b: Box, st: SceneState) {
  sky(g, b, '#020104', '#05020a', st);
  stars(g, b, 120, st.time, 8);
  const cx = b.x + b.w * 0.5, cy = b.y + b.h * 0.5, R = Math.min(b.w, b.h) * 0.42;
  const core = g.createRadialGradient(cx, cy, 2, cx, cy, R * 0.35);
  core.addColorStop(0, '#fff4d0'); core.addColorStop(0.3, '#ffb86a66'); core.addColorStop(1, '#ff6a0000');
  g.fillStyle = core; g.beginPath(); g.ellipse(cx, cy, R * 0.35, R * 0.2, 0, 0, TAU); g.fill();
  for (let k = 0; k < 1400; k++) {
    const arm = k % 3, d = 0.05 + 0.95 * Math.pow(hash(k), 0.7), spread = (hash(k + 1) - 0.5) * (0.25 + 0.6 * (1 - d));
    const a = st.spin * 0.15 + arm * (TAU / 3) + Math.log(1 + d * 8) * 2.2 + spread, rr = d * R * (1 + (hash(k + 2) - 0.5) * 0.12);
    const x = cx + Math.cos(a) * rr, y = cy + Math.sin(a) * rr * 0.55;
    g.fillStyle = st.vibes.has('rgb') ? `hsl(${(st.hue + d * 300) % 360},90%,70%)` : d < 0.2 ? '#fff0c0' : arm === 0 ? '#a0c0ff' : '#e0b0ff';
    g.fillRect(x, y, 1.6, 1.6);
  }
  // black hole
  if (own(st, 21)) {
    const bx = cx + R * 0.55, by = cy - R * 0.35;
    g.strokeStyle = '#ff9a3a'; g.lineWidth = 4; g.shadowColor = '#ff9a3a'; g.shadowBlur = 14; g.beginPath(); g.ellipse(bx, by, 32, 9, 0.2, 0, TAU); g.stroke(); g.shadowBlur = 0;
    g.fillStyle = '#000'; g.beginPath(); g.arc(bx, by, 13, 0, TAU); g.fill();
  }
  // the big spin: universe spokes
  if (own(st, 23)) { g.strokeStyle = '#ffffff22'; g.lineWidth = 2; g.beginPath(); g.arc(cx, cy, R * 1.1, 0, TAU); g.stroke(); for (let k = 0; k < 12; k++) { const a = st.spin * 0.05 + (k * TAU) / 12; g.beginPath(); g.moveTo(cx, cy); g.lineTo(cx + Math.cos(a) * R * 1.1, cy + Math.sin(a) * R * 1.1); g.stroke(); } }
  gerCam(g, b, st);
}

/** Picture-in-picture: Gerald is still down there, powering all of it. */
function gerCam(g: G, b: Box, st: SceneState) {
  const w = Math.min(180, b.w * 0.24), h = w * 0.75, x = b.x + 12, y = b.y + b.h - h - 40;
  g.fillStyle = '#000c'; g.fillRect(x, y, w, h); g.strokeStyle = '#ff3a3a'; g.lineWidth = 2; g.strokeRect(x, y, w, h);
  g.save(); g.beginPath(); g.rect(x, y, w, h); g.clip();
  g.fillStyle = '#5a4028'; g.fillRect(x, y, w, h);
  geraldWheel(g, x + w / 2, y + h * 0.45, h * 0.33, st);
  g.restore();
  g.fillStyle = '#ff3a3a'; g.font = 'bold 11px sans-serif'; g.fillText(`● GERALD CAM`, x + 6, y + 14);
}

export const SCENES = [shoebox, garage, startup, city, mega, planet, star, galaxy];
