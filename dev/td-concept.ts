// Concept sketch for the Dynamo Defense art pass: code-drawn bugs with procedural legs, the dynamo base, a lit battle.
//   /dev/td-concept.html?view=roster|scene|portrait&t=1.3
import { drawRider } from '../src/cosmetics/draw/rider';
import { riderLook } from '../src/cosmetics/unlocks';
import { defaultProfile } from '../src/progression';

type G = CanvasRenderingContext2D;
const TAU = Math.PI * 2;
const q = new URLSearchParams(location.search);
const view = q.get('view') ?? 'scene';
const T0 = Number(q.get('t') ?? 1.3);

interface Pal { base: string; dark: string; light: string; glow: string; edge: string }
const PAL: Record<'blue' | 'red' | 'purple' | 'gold', Pal> = {
  blue: { base: '#2c5f7e', dark: '#0e2232', light: '#a6d6f0', glow: '#45d2ff', edge: '#050d14' },
  red: { base: '#8c2f1c', dark: '#300c06', light: '#f29a72', glow: '#ff6a2a', edge: '#120402' },
  purple: { base: '#4e3778', dark: '#190d2e', light: '#c3a8f2', glow: '#b97cff', edge: '#08040f' },
  gold: { base: '#9c7420', dark: '#352306', light: '#ffe196', glow: '#ffcf3a', edge: '#120b02' },
};
const CHITIN = '#1d1714';

function rng(seed: number) { let s = seed >>> 0; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296); }

// ---------- primitives ----------
function shell(g: G, x: number, y: number, rx: number, ry: number, p: Pal, rot = 0, lw = 2) {
  g.save(); g.translate(x, y); g.rotate(rot);
  const gr = g.createRadialGradient(-rx * 0.35, -ry * 0.45, 0, 0, 0, Math.max(rx, ry) * 1.15);
  gr.addColorStop(0, p.light); gr.addColorStop(0.35, p.base); gr.addColorStop(1, p.dark);
  g.fillStyle = gr; g.beginPath(); g.ellipse(0, 0, rx, ry, 0, 0, TAU); g.fill();
  g.lineWidth = lw; g.strokeStyle = p.edge; g.stroke();
  g.fillStyle = 'rgba(255,255,255,0.28)'; g.beginPath(); g.ellipse(-rx * 0.35, -ry * 0.42, rx * 0.32, ry * 0.16, -0.5, 0, TAU); g.fill();
  g.restore();
}
function glowDot(g: G, x: number, y: number, r: number, c: string, a = 1) {
  g.save(); g.globalCompositeOperation = 'lighter'; g.globalAlpha = a;
  const gr = g.createRadialGradient(x, y, 0, x, y, r);
  gr.addColorStop(0, '#ffffff'); gr.addColorStop(0.15, c); gr.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = gr; g.beginPath(); g.arc(x, y, r, 0, TAU); g.fill(); g.restore();
}
/** Two-bone leg from hip to foot; bend = ±1 picks the knee side. */
function leg(g: G, hx: number, hy: number, fx: number, fy: number, l1: number, l2: number, bend: number, w: number, p: Pal) {
  const dx = fx - hx, dy = fy - hy, d = Math.min(Math.hypot(dx, dy), l1 + l2 - 0.01) || 0.01;
  const ux = dx / Math.hypot(dx, dy || 0.0001), uy = dy / Math.hypot(dx || 0.0001, dy);
  const a = (l1 * l1 - l2 * l2 + d * d) / (2 * d), h = Math.sqrt(Math.max(0, l1 * l1 - a * a));
  const kx = hx + ux * a - uy * h * bend, ky = hy + uy * a + ux * h * bend;
  const ex = hx + ux * d, ey = hy + uy * d;
  g.lineCap = 'round'; g.lineJoin = 'round';
  const seg = (x0: number, y0: number, x1: number, y1: number, ww: number) => {
    g.strokeStyle = p.edge; g.lineWidth = ww + 2; g.beginPath(); g.moveTo(x0, y0); g.lineTo(x1, y1); g.stroke();
    g.strokeStyle = p.dark; g.lineWidth = ww; g.stroke();
    g.strokeStyle = p.base; g.lineWidth = ww * 0.55; g.stroke();
    g.strokeStyle = p.light; g.globalAlpha = 0.55; g.lineWidth = Math.max(0.8, ww * 0.18); g.stroke(); g.globalAlpha = 1;
  };
  seg(kx, ky, ex, ey, w * 0.62);
  seg(hx, hy, kx, ky, w);
  g.strokeStyle = p.edge; g.lineWidth = 1.2; g.beginPath(); g.moveTo(ex, ey); g.lineTo(ex + ux * w * 0.9, ey + uy * w * 0.9); g.stroke();
  g.fillStyle = p.light; g.beginPath(); g.arc(kx, ky, w * 0.32, 0, TAU); g.fill();
}
/** A pair-symmetric set of legs with an alternating-tripod gait. hips/feet given for the right side (x > 0). */
function legs(g: G, set: Array<{ hip: [number, number]; foot: [number, number]; l1: number; l2: number; w: number }>, t: number, stride: number, p: Pal) {
  set.forEach((L, i) => {
    for (const side of [-1, 1]) {
      const ph = (t + (i % 2) * 0.5 + (side > 0 ? 0.5 : 0)) % 1;
      const stance = ph < 0.6; // foot planted and sliding back, then swings forward
      const k = stance ? ph / 0.6 : (ph - 0.6) / 0.4;
      const fy = L.foot[1] + (stance ? -1 + 2 * k : 1 - 2 * k) * stride;
      const lift = stance ? 0 : Math.sin(k * Math.PI) * stride * 0.35;
      leg(g, L.hip[0] * side, L.hip[1], (L.foot[0] - lift) * side, fy, L.l1, L.l2, side * (L.foot[1] < L.hip[1] ? -1 : 1), L.w, p);
    }
  });
}
function shadow(g: G, rx: number, ry: number, off = 0.12) {
  g.fillStyle = 'rgba(0,0,0,0.45)'; g.beginPath(); g.ellipse(rx * off, ry * off * 1.6, rx, ry, 0, 0, TAU); g.fill();
}
function antenna(g: G, x: number, y: number, len: number, side: number, t: number, p: Pal) {
  const sw = Math.sin(t * TAU * 1.3 + side) * 0.15;
  g.strokeStyle = p.edge; g.lineWidth = 2.2; g.lineCap = 'round';
  g.beginPath(); g.moveTo(x * side, y);
  g.quadraticCurveTo(x * side + side * len * 0.5, y - len * 0.5, x * side + side * len * (0.6 + sw), y - len); g.stroke();
  g.strokeStyle = p.light; g.lineWidth = 0.8; g.stroke();
}

// ---------- bugs (drawn at the origin, facing up, `s` = body length in px, `t` = gait phase in cycles) ----------
type BugFn = (g: G, s: number, t: number) => void;

const mite: BugFn = (g, s, t) => {
  const p = PAL.blue;
  shadow(g, s * 0.42, s * 0.46);
  legs(g, [
    { hip: [s * 0.14, -s * 0.12], foot: [s * 0.42, -s * 0.36], l1: s * 0.24, l2: s * 0.26, w: s * 0.06 },
    { hip: [s * 0.16, -s * 0.03], foot: [s * 0.48, -s * 0.08], l1: s * 0.24, l2: s * 0.26, w: s * 0.06 },
    { hip: [s * 0.16, s * 0.06], foot: [s * 0.46, s * 0.2], l1: s * 0.24, l2: s * 0.26, w: s * 0.06 },
    { hip: [s * 0.13, s * 0.14], foot: [s * 0.36, s * 0.42], l1: s * 0.22, l2: s * 0.24, w: s * 0.06 },
  ], t, s * 0.07, p);
  shell(g, 0, s * 0.08, s * 0.3, s * 0.34, p);
  shell(g, 0, -s * 0.26, s * 0.14, s * 0.12, p);
  for (const [x, y, r] of [[0, 0.05, 0.07], [-0.14, 0.12, 0.05], [0.14, 0.12, 0.05], [-0.08, 0.27, 0.04], [0.08, 0.27, 0.04]]) {
    g.fillStyle = p.glow; g.beginPath(); g.arc(x * s, y * s, r * s, 0, TAU); g.fill();
    glowDot(g, x * s, y * s, r * s * 3.2, p.glow, 0.55);
  }
  g.fillStyle = '#e8fbff'; for (const sx of [-1, 1]) { g.beginPath(); g.arc(sx * s * 0.06, -s * 0.33, s * 0.03, 0, TAU); g.fill(); }
};

const wasp: BugFn = (g, s, t) => {
  const p = PAL.blue;
  g.save(); g.translate(s * 0.5, s * 0.7); g.globalAlpha = 0.6; shadow(g, s * 0.3, s * 0.42, 0); g.restore();
  // wings (blurred flutter)
  for (const side of [-1, 1]) for (const [ox, oy, rx, ry, base] of [[0.32, -0.12, 0.34, 0.11, -0.35], [0.26, 0.02, 0.24, 0.08, 0.2]]) {
    for (let k = 0; k < 3; k++) {
      const a = base + Math.sin(t * TAU * 6 + k * 2.1) * 0.25;
      g.save(); g.translate(side * ox * s * 0.4, oy * s); g.rotate(side * a);
      g.fillStyle = `rgba(190,230,255,${0.12 + k * 0.04})`; g.strokeStyle = 'rgba(200,240,255,0.35)'; g.lineWidth = 1;
      g.beginPath(); g.ellipse(side * rx * s, 0, rx * s, ry * s, 0, 0, TAU); g.fill(); if (k === 2) g.stroke();
      g.restore();
    }
  }
  legs(g, [
    { hip: [s * 0.06, -s * 0.12], foot: [s * 0.16, -s * 0.2], l1: s * 0.1, l2: s * 0.1, w: s * 0.03 },
    { hip: [s * 0.06, -s * 0.06], foot: [s * 0.18, s * 0.02], l1: s * 0.1, l2: s * 0.1, w: s * 0.03 },
  ], 0, 0, p);
  // abdomen with bands
  g.save(); g.translate(0, s * 0.2);
  g.beginPath(); g.ellipse(0, 0, s * 0.13, s * 0.26, 0, 0, TAU); g.clip();
  shell(g, 0, 0, s * 0.13, s * 0.26, p);
  for (let i = 0; i < 4; i++) { g.fillStyle = i % 2 ? p.dark : p.glow; g.globalAlpha = i % 2 ? 0.9 : 0.7; g.fillRect(-s * 0.2, -s * 0.12 + i * s * 0.09, s * 0.4, s * 0.04); }
  g.restore(); g.globalAlpha = 1;
  g.fillStyle = p.edge; g.beginPath(); g.moveTo(-s * 0.025, s * 0.44); g.lineTo(0, s * 0.54); g.lineTo(s * 0.025, s * 0.44); g.fill();
  shell(g, 0, -s * 0.1, s * 0.1, s * 0.12, p);
  shell(g, 0, -s * 0.28, s * 0.09, s * 0.07, p);
  for (const sx of [-1, 1]) { g.fillStyle = p.glow; g.beginPath(); g.ellipse(sx * s * 0.065, -s * 0.29, s * 0.035, s * 0.05, sx * 0.4, 0, TAU); g.fill(); glowDot(g, sx * s * 0.065, -s * 0.29, s * 0.1, p.glow, 0.5); }
};

function beetleBody(g: G, s: number, t: number, p: Pal, horn: boolean) {
  shadow(g, s * 0.4, s * 0.5);
  legs(g, [
    { hip: [s * 0.12, -s * 0.16], foot: [s * 0.4, -s * 0.42], l1: s * 0.22, l2: s * 0.28, w: s * 0.07 },
    { hip: [s * 0.15, -s * 0.04], foot: [s * 0.48, -s * 0.02], l1: s * 0.22, l2: s * 0.3, w: s * 0.07 },
    { hip: [s * 0.14, s * 0.08], foot: [s * 0.44, s * 0.38], l1: s * 0.24, l2: s * 0.3, w: s * 0.07 },
  ], t, s * 0.09, p);
  // elytra
  for (const side of [-1, 1]) {
    g.save(); g.beginPath(); g.rect(side < 0 ? -s : 0, -s, s, s * 2); g.clip();
    shell(g, 0, s * 0.12, s * 0.27, s * 0.36, p, 0, 2.5);
    g.strokeStyle = 'rgba(0,0,0,0.35)'; g.lineWidth = 1.5;
    for (const k of [0.09, 0.17]) { g.beginPath(); g.ellipse(0, s * 0.14, s * k * side * side, s * 0.3, 0, -1.3, 1.3); g.stroke(); }
    g.restore();
  }
  // glowing seam (heat vents)
  g.strokeStyle = p.glow; g.lineWidth = s * 0.018; g.beginPath(); g.moveTo(0, -s * 0.16); g.lineTo(0, s * 0.46); g.stroke();
  for (let y = -0.1; y < 0.44; y += 0.11) glowDot(g, 0, y * s, s * 0.07, p.glow, 0.45);
  g.strokeStyle = p.edge; g.lineWidth = 2; g.beginPath(); g.moveTo(0, -s * 0.16); g.lineTo(0, s * 0.47); g.stroke();
  // pronotum + head
  shell(g, 0, -s * 0.2, s * 0.21, s * 0.11, p, 0, 2.5);
  shell(g, 0, -s * 0.33, s * 0.1, s * 0.07, p);
  g.strokeStyle = p.edge; g.lineWidth = s * 0.035; g.lineCap = 'round';
  for (const sx of [-1, 1]) { g.beginPath(); g.moveTo(sx * s * 0.05, -s * 0.38); g.quadraticCurveTo(sx * s * 0.12, -s * 0.48, sx * s * 0.02, -s * 0.5); g.stroke(); }
  if (horn) {
    const gr = g.createLinearGradient(0, -s * 0.3, 0, -s * 0.72);
    gr.addColorStop(0, p.base); gr.addColorStop(1, p.light);
    g.fillStyle = gr; g.strokeStyle = p.edge; g.lineWidth = 2.5;
    g.beginPath(); g.moveTo(-s * 0.06, -s * 0.3); g.quadraticCurveTo(-s * 0.04, -s * 0.6, s * 0.02, -s * 0.72);
    g.quadraticCurveTo(s * 0.03, -s * 0.55, s * 0.06, -s * 0.3); g.closePath(); g.fill(); g.stroke();
    shell(g, 0, -s * 0.2, s * 0.23, s * 0.12, p, 0, 2.5);
  }
  g.fillStyle = p.glow; for (const sx of [-1, 1]) { g.beginPath(); g.arc(sx * s * 0.07, -s * 0.35, s * 0.022, 0, TAU); g.fill(); }
}
const beetle: BugFn = (g, s, t) => beetleBody(g, s, t, PAL.red, false);
const rhino: BugFn = (g, s, t) => beetleBody(g, s, t, { ...PAL.red, base: '#6e2214', light: '#d9805c' }, true);

const isopod: BugFn = (g, s, t) => {
  const p = PAL.purple;
  shadow(g, s * 0.32, s * 0.52);
  const set = [];
  for (let i = 0; i < 7; i++) { const y = -s * 0.26 + i * s * 0.09; set.push({ hip: [s * 0.2, y] as [number, number], foot: [s * 0.33, y + s * 0.02] as [number, number], l1: s * 0.08, l2: s * 0.1, w: s * 0.04 }); }
  legs(g, set, t * 1.4, s * 0.035, p);
  antenna(g, s * 0.06, -s * 0.42, s * 0.3, -1, t, p); antenna(g, s * 0.06, -s * 0.42, s * 0.3, 1, t, p);
  // tail uropods
  for (const sx of [-1, 1]) { g.fillStyle = p.dark; g.strokeStyle = p.edge; g.lineWidth = 2; g.beginPath(); g.ellipse(sx * s * 0.1, s * 0.5, s * 0.04, s * 0.1, sx * 0.4, 0, TAU); g.fill(); g.stroke(); }
  for (let i = 6; i >= 0; i--) {
    const y = s * 0.4 - i * s * 0.12, w = s * (0.26 - Math.abs(i - 3.5) * 0.025);
    shell(g, 0, y, w, s * 0.085, p, 0, 2.5);
    g.strokeStyle = p.glow; g.globalAlpha = 0.85; g.lineWidth = s * 0.012;
    g.beginPath(); g.ellipse(0, y + s * 0.05, w * 0.85, s * 0.03, 0, 0.3, Math.PI - 0.3); g.stroke(); g.globalAlpha = 1;
    // rivet-like knobs
    g.fillStyle = p.light; for (const sx of [-0.55, 0.55]) { g.beginPath(); g.arc(sx * w, y - s * 0.01, s * 0.012, 0, TAU); g.fill(); }
  }
  shell(g, 0, -s * 0.4, s * 0.14, s * 0.07, p, 0, 2.5);
  glowDot(g, 0, s * 0.05, s * 0.25, p.glow, 0.25);
};

const brood: BugFn = (g, s, t) => {
  const p = PAL.purple;
  shadow(g, s * 0.44, s * 0.55);
  legs(g, [
    { hip: [s * 0.08, -s * 0.3], foot: [s * 0.3, -s * 0.48], l1: s * 0.2, l2: s * 0.22, w: s * 0.05 },
    { hip: [s * 0.1, -s * 0.24], foot: [s * 0.42, -s * 0.22], l1: s * 0.22, l2: s * 0.24, w: s * 0.05 },
    { hip: [s * 0.1, -s * 0.18], foot: [s * 0.44, s * 0.06], l1: s * 0.24, l2: s * 0.26, w: s * 0.05 },
  ], t * 0.7, s * 0.06, p);
  // bloated abdomen with veins and glowing sacs
  const pulse = 1 + Math.sin(t * TAU * 0.8) * 0.02;
  shell(g, 0, s * 0.14, s * 0.36 * pulse, s * 0.4 * pulse, { ...p, base: '#5b3f6e', light: '#d7b8e8' }, 0, 3);
  g.strokeStyle = 'rgba(30,8,40,0.6)'; g.lineWidth = 1.6;
  const r = rng(7);
  for (let i = 0; i < 9; i++) { const a = r() * TAU; g.beginPath(); g.moveTo(0, s * 0.14); g.quadraticCurveTo(Math.cos(a + 0.4) * s * 0.18, s * 0.14 + Math.sin(a + 0.4) * s * 0.2, Math.cos(a) * s * 0.33, s * 0.14 + Math.sin(a) * s * 0.37); g.stroke(); }
  for (const [x, y, rr] of [[-0.14, 0.04, 0.08], [0.13, 0.1, 0.09], [-0.04, 0.27, 0.085], [0.17, 0.3, 0.06], [-0.2, 0.25, 0.06], [0.03, 0.02, 0.06]]) {
    const gr = g.createRadialGradient(x * s - rr * s * 0.3, y * s - rr * s * 0.3, 0, x * s, y * s, rr * s);
    gr.addColorStop(0, '#fff2ff'); gr.addColorStop(0.4, p.glow); gr.addColorStop(1, '#3a1660');
    g.fillStyle = gr; g.beginPath(); g.arc(x * s, y * s, rr * s, 0, TAU); g.fill();
    g.strokeStyle = p.edge; g.lineWidth = 1.5; g.stroke();
    glowDot(g, x * s, y * s, rr * s * 2.4, p.glow, 0.4);
  }
  shell(g, 0, -s * 0.26, s * 0.13, s * 0.1, p, 0, 2.5);
  shell(g, 0, -s * 0.39, s * 0.08, s * 0.06, p);
  antenna(g, s * 0.03, -s * 0.43, s * 0.16, -1, t, p); antenna(g, s * 0.03, -s * 0.43, s * 0.16, 1, t, p);
};

const mantis: BugFn = (g, s, t) => {
  const hue = (t * 120) % 360;
  const p: Pal = { base: `hsl(${hue},55%,42%)`, dark: `hsl(${hue + 40},60%,14%)`, light: `hsl(${hue - 30},80%,78%)`, glow: `hsl(${hue},100%,62%)`, edge: '#07060a' };
  shadow(g, s * 0.3, s * 0.55);
  legs(g, [
    { hip: [s * 0.05, s * 0.0], foot: [s * 0.38, s * 0.05], l1: s * 0.26, l2: s * 0.3, w: s * 0.03 },
    { hip: [s * 0.05, s * 0.08], foot: [s * 0.34, s * 0.45], l1: s * 0.28, l2: s * 0.32, w: s * 0.03 },
  ], t, s * 0.08, p);
  // folded wings over abdomen, iridescent
  const gr = g.createLinearGradient(-s * 0.15, 0, s * 0.15, s * 0.5);
  gr.addColorStop(0, `hsla(${hue},90%,65%,0.75)`); gr.addColorStop(0.5, `hsla(${hue + 120},90%,60%,0.7)`); gr.addColorStop(1, `hsla(${hue + 240},90%,60%,0.75)`);
  g.fillStyle = gr; g.strokeStyle = p.edge; g.lineWidth = 2;
  g.beginPath(); g.ellipse(0, s * 0.24, s * 0.12, s * 0.3, 0, 0, TAU); g.fill(); g.stroke();
  g.strokeStyle = 'rgba(255,255,255,0.3)'; g.lineWidth = 1; g.beginPath(); g.moveTo(0, -s * 0.02); g.lineTo(0, s * 0.52); g.stroke();
  shell(g, 0, -s * 0.12, s * 0.05, s * 0.17, p);
  // raptorial forelegs, folded
  for (const sx of [-1, 1]) {
    g.strokeStyle = p.edge; g.lineWidth = s * 0.07; g.lineCap = 'round';
    g.beginPath(); g.moveTo(sx * s * 0.03, -s * 0.22); g.lineTo(sx * s * 0.14, -s * 0.36); g.lineTo(sx * s * 0.07, -s * 0.5); g.stroke();
    g.strokeStyle = p.base; g.lineWidth = s * 0.045; g.stroke();
    g.strokeStyle = p.light; g.lineWidth = 1.4;
    for (let k = 0; k < 4; k++) { const u = k / 4; const x = sx * s * (0.14 - u * 0.07), y = -s * (0.36 + u * 0.14); g.beginPath(); g.moveTo(x, y); g.lineTo(x - sx * s * 0.04, y + s * 0.01); g.stroke(); }
  }
  // triangular head with bulging eyes
  g.fillStyle = p.base; g.strokeStyle = p.edge; g.lineWidth = 2.5;
  g.beginPath(); g.moveTo(-s * 0.1, -s * 0.31); g.lineTo(s * 0.1, -s * 0.31); g.lineTo(0, -s * 0.4); g.closePath(); g.fill(); g.stroke();
  for (const sx of [-1, 1]) { g.fillStyle = p.glow; g.beginPath(); g.arc(sx * s * 0.1, -s * 0.32, s * 0.04, 0, TAU); g.fill(); g.stroke(); glowDot(g, sx * s * 0.1, -s * 0.32, s * 0.1, p.glow, 0.5); }
};

/** Centipede queen: a segmented body following a sine path behind the head. */
function centipede(g: G, s: number, t: number, segs = 14, bend = 1) {
  const p = PAL.gold;
  const pts: Array<[number, number, number]> = [];
  const step = s * 0.075;
  for (let i = 0; i < segs; i++) {
    const y = -s * 0.4 + i * step;
    const x = Math.sin(i * 0.45 - t * TAU * 0.5) * s * 0.06 * bend * (i / segs + 0.3);
    pts.push([x, y, 0]);
  }
  for (let i = 0; i < segs; i++) { const a = pts[Math.max(0, i - 1)], b = pts[Math.min(segs - 1, i + 1)]; pts[i][2] = Math.atan2(b[0] - a[0], b[1] - a[1]); }
  for (const [x, y] of pts) { g.fillStyle = 'rgba(0,0,0,0.45)'; g.beginPath(); g.ellipse(x + s * 0.03, y + s * 0.05, s * 0.13, s * 0.06, 0, 0, TAU); g.fill(); }
  for (let i = segs - 1; i >= 0; i--) {
    const [x, y, a] = pts[i];
    const w = s * (i === segs - 1 ? 0.08 : 0.12 - (i / segs) * 0.03);
    g.save(); g.translate(x, y); g.rotate(-a);
    const ph = (t * 1.8 + i * 0.13) % 1, sw = Math.sin(ph * TAU) * s * 0.035;
    for (const sx of [-1, 1]) leg(g, sx * w * 0.8, 0, sx * (w + s * 0.1), sw * sx + s * 0.01, s * 0.07, s * 0.08, sx, s * 0.025, p);
    shell(g, 0, 0, w, s * 0.05, p, 0, 2.5);
    g.fillStyle = p.glow; g.globalAlpha = 0.9; g.beginPath(); g.ellipse(0, s * 0.008, w * 0.35, s * 0.012, 0, 0, TAU); g.fill(); g.globalAlpha = 1;
    if (i % 3 === 1) glowDot(g, 0, 0, w * 1.1, p.glow, 0.25);
    g.restore();
  }
  if (true) { // tail forcipules
    const [x, y] = pts[segs - 1];
    g.strokeStyle = p.edge; g.lineWidth = s * 0.03; g.lineCap = 'round';
    for (const sx of [-1, 1]) { g.beginPath(); g.moveTo(x, y + s * 0.03); g.quadraticCurveTo(x + sx * s * 0.08, y + s * 0.1, x + sx * s * 0.03, y + s * 0.16); g.stroke(); }
  }
  // armoured head with mandibles
  const [hx, hy] = pts[0];
  g.save(); g.translate(hx, hy - s * 0.06);
  const open = 0.5 + Math.sin(t * TAU * 1.2) * 0.25;
  for (const sx of [-1, 1]) {
    g.fillStyle = p.dark; g.strokeStyle = p.edge; g.lineWidth = 2.5;
    g.beginPath(); g.moveTo(sx * s * 0.05, -s * 0.03);
    g.quadraticCurveTo(sx * s * (0.16 + open * 0.05), -s * 0.12, sx * s * 0.03 * (1 - open), -s * 0.2);
    g.quadraticCurveTo(sx * s * 0.1, -s * 0.1, sx * s * 0.02, -s * 0.04); g.closePath(); g.fill(); g.stroke();
  }
  shell(g, 0, 0, s * 0.14, s * 0.08, p, 0, 3);
  for (const sx of [-1, 1]) { g.fillStyle = '#fff4c0'; g.beginPath(); g.arc(sx * s * 0.07, -s * 0.03, s * 0.02, 0, TAU); g.fill(); glowDot(g, sx * s * 0.07, -s * 0.03, s * 0.07, p.glow, 0.7); }
  antenna(g, s * 0.05, -s * 0.06, s * 0.2, -1, t, p); antenna(g, s * 0.05, -s * 0.06, s * 0.2, 1, t, p);
  g.restore();
}
const queen: BugFn = (g, s, t) => centipede(g, s, t);

function splat(g: G, x: number, y: number, r: number, c: string, seed: number) {
  const rr = rng(seed);
  g.save(); g.globalAlpha = 0.85;
  for (let i = 0; i < 9; i++) {
    const a = rr() * TAU, d = rr() * r, s = r * (0.25 + rr() * 0.4);
    g.fillStyle = i < 3 ? 'rgba(0,0,0,0.5)' : c; g.beginPath(); g.ellipse(x + Math.cos(a) * d, y + Math.sin(a) * d, s, s * 0.7, a, 0, TAU); g.fill();
  }
  g.restore();
}

// ---------- aliens v2: bug-like xenoforms (biomechanical ribbing, scythe limbs, bladed tails, wet sheen) ----------
const AL: Record<'blue' | 'red' | 'purple' | 'gold', Pal> = {
  blue: { base: '#1d4258', dark: '#050c12', light: '#9ad8f6', glow: '#45d2ff', edge: '#010304' },
  red: { base: '#6a2014', dark: '#140403', light: '#f0a080', glow: '#ff6a2a', edge: '#030101' },
  purple: { base: '#3e2a62', dark: '#0b0614', light: '#c8b0f4', glow: '#b97cff', edge: '#020104' },
  gold: { base: '#7d5a16', dark: '#1a1103', light: '#ffe6a0', glow: '#ffcf3a', edge: '#050300' },
};
/** Filled tapered segment (organic limb piece), outlined. */
function taper(g: G, ax: number, ay: number, bx: number, by: number, wa: number, wb: number, fill: string | CanvasGradient) {
  const dx = bx - ax, dy = by - ay, L = Math.hypot(dx, dy) || 1, nx = -dy / L, ny = dx / L;
  g.fillStyle = fill; g.beginPath();
  g.moveTo(ax + nx * wa / 2, ay + ny * wa / 2); g.lineTo(bx + nx * wb / 2, by + ny * wb / 2);
  g.lineTo(bx - nx * wb / 2, by - ny * wb / 2); g.lineTo(ax - nx * wa / 2, ay - ny * wa / 2); g.closePath(); g.fill();
  g.beginPath(); g.arc(ax, ay, wa / 2, 0, TAU); g.fill();
  g.beginPath(); g.arc(bx, by, wb / 2, 0, TAU); g.fill();
}
function limbPiece(g: G, ax: number, ay: number, bx: number, by: number, wa: number, wb: number, p: Pal) {
  taper(g, ax, ay, bx, by, wa + 2.5, wb + 2.5, p.edge);
  taper(g, ax, ay, bx, by, wa, wb, p.dark);
  taper(g, ax, ay, bx, by, wa * 0.55, wb * 0.55, p.base);
  g.strokeStyle = p.light; g.globalAlpha = 0.7; g.lineWidth = Math.max(0.8, wa * 0.12); g.lineCap = 'round';
  const dx = bx - ax, dy = by - ay, L = Math.hypot(dx, dy) || 1, nx = -dy / L * wa * 0.18, ny = dx / L * wa * 0.18;
  g.beginPath(); g.moveTo(ax + nx + dx * 0.15, ay + ny + dy * 0.15); g.lineTo(ax + nx + dx * 0.7, ay + ny + dy * 0.7); g.stroke(); g.globalAlpha = 1;
}
function spike(g: G, x: number, y: number, ang: number, len: number, w: number, p: Pal) {
  g.fillStyle = p.edge; g.beginPath();
  g.moveTo(x + Math.cos(ang + 1.57) * w, y + Math.sin(ang + 1.57) * w); g.lineTo(x + Math.cos(ang) * len, y + Math.sin(ang) * len);
  g.lineTo(x + Math.cos(ang - 1.57) * w, y + Math.sin(ang - 1.57) * w); g.closePath(); g.fill();
  g.strokeStyle = p.light; g.globalAlpha = 0.5; g.lineWidth = 0.8; g.beginPath(); g.moveTo(x, y); g.lineTo(x + Math.cos(ang) * len * 0.8, y + Math.sin(ang) * len * 0.8); g.stroke(); g.globalAlpha = 1;
}
/** Sharp, high-kneed alien leg: IK hip→foot, tapered to a point, spur at the knee. */
function xleg(g: G, hx: number, hy: number, fx: number, fy: number, l1: number, l2: number, bend: number, w: number, p: Pal, spur = true) {
  const dx = fx - hx, dy = fy - hy, D = Math.hypot(dx, dy) || 0.01, d = Math.min(D, l1 + l2 - 0.01);
  const ux = dx / D, uy = dy / D;
  const a = (l1 * l1 - l2 * l2 + d * d) / (2 * d), h = Math.sqrt(Math.max(0, l1 * l1 - a * a));
  const kx = hx + ux * a - uy * h * bend, ky = hy + uy * a + ux * h * bend, ex = hx + ux * d, ey = hy + uy * d;
  limbPiece(g, kx, ky, ex, ey, w * 0.7, w * 0.08, p);
  limbPiece(g, hx, hy, kx, ky, w, w * 0.75, p);
  if (spur) spike(g, kx, ky, Math.atan2(ky - hy, kx - hx) + 0.5 * bend, w * 1.4, w * 0.28, p);
  g.fillStyle = p.light; g.globalAlpha = 0.6; g.beginPath(); g.arc(kx, ky, w * 0.22, 0, TAU); g.fill(); g.globalAlpha = 1;
}
function xlegs(g: G, set: Array<{ hip: [number, number]; foot: [number, number]; l1: number; l2: number; w: number; spur?: boolean }>, t: number, stride: number, p: Pal) {
  set.forEach((L, i) => {
    for (const side of [-1, 1]) {
      const ph = (t + (i % 2) * 0.5 + (side > 0 ? 0.5 : 0)) % 1, stance = ph < 0.6, k = stance ? ph / 0.6 : (ph - 0.6) / 0.4;
      const fy = L.foot[1] + (stance ? -1 + 2 * k : 1 - 2 * k) * stride, lift = stance ? 0 : Math.sin(k * Math.PI) * stride * 0.3;
      xleg(g, L.hip[0] * side, L.hip[1], (L.foot[0] - lift) * side, fy, L.l1, L.l2, side * (L.foot[1] < L.hip[1] ? -1 : 1), L.w, p, L.spur ?? true);
    }
  });
}
/** Glossy body piece with biomechanical ribs across it. */
function ribbed(g: G, x: number, y: number, rx: number, ry: number, p: Pal, ribs: number, lw = 2.5) {
  shell(g, x, y, rx, ry, p, 0, lw);
  g.save(); g.beginPath(); g.ellipse(x, y, rx, ry, 0, 0, TAU); g.clip();
  for (let i = 1; i < ribs; i++) {
    const yy = y - ry + (i / ribs) * ry * 2;
    g.strokeStyle = 'rgba(0,0,0,0.55)'; g.lineWidth = Math.max(1.2, ry * 0.06);
    g.beginPath(); g.ellipse(x, yy - ry * 0.1, rx * 1.05, ry * 0.22, 0, 0.15, Math.PI - 0.15); g.stroke();
    g.strokeStyle = p.light; g.globalAlpha = 0.35; g.lineWidth = 0.9;
    g.beginPath(); g.ellipse(x, yy - ry * 0.13, rx * 0.95, ry * 0.2, 0, 0.4, Math.PI - 0.4); g.stroke(); g.globalAlpha = 1;
  }
  g.restore();
  wet(g, x - rx * 0.3, y - ry * 0.2, ry * 0.6, -0.25);
}
/** Sharp wet specular streak. */
function wet(g: G, x: number, y: number, len: number, ang: number) {
  g.save(); g.translate(x, y); g.rotate(ang);
  g.fillStyle = 'rgba(255,255,255,0.55)'; g.beginPath(); g.ellipse(0, 0, len * 0.08, len * 0.5, 0, 0, TAU); g.fill();
  g.fillStyle = 'rgba(255,255,255,0.9)'; g.beginPath(); g.ellipse(0, -len * 0.1, len * 0.03, len * 0.25, 0, 0, TAU); g.fill();
  g.restore();
}
/** Elongated biomech skull: rounded snout at y, sweeping back to a point at y + len. */
function skull(g: G, x: number, y: number, w: number, len: number, p: Pal, ridges = 5) {
  const path = () => { g.beginPath(); g.moveTo(x, y - w * 0.2); g.bezierCurveTo(x + w * 0.7, y - w * 0.15, x + w * 0.55, y + len * 0.6, x, y + len); g.bezierCurveTo(x - w * 0.55, y + len * 0.6, x - w * 0.7, y - w * 0.15, x, y - w * 0.2); g.closePath(); };
  const gr = g.createLinearGradient(x - w * 0.5, y, x + w * 0.5, y + len * 0.4);
  gr.addColorStop(0, p.light); gr.addColorStop(0.3, p.base); gr.addColorStop(1, p.dark);
  path(); g.fillStyle = gr; g.fill(); g.lineWidth = 2.5; g.strokeStyle = p.edge; g.stroke();
  g.save(); path(); g.clip();
  g.strokeStyle = 'rgba(0,0,0,0.5)'; g.lineWidth = 1.4;
  for (let i = 1; i <= ridges; i++) { const yy = y + (i / (ridges + 1)) * len * 0.9; g.beginPath(); g.moveTo(x - w, yy + w * 0.3); g.quadraticCurveTo(x, yy - w * 0.15, x + w, yy + w * 0.3); g.stroke(); }
  g.strokeStyle = 'rgba(0,0,0,0.6)'; g.lineWidth = 2; g.beginPath(); g.moveTo(x, y); g.lineTo(x, y + len); g.stroke();
  g.restore();
  wet(g, x - w * 0.18, y + len * 0.25, len * 0.45, -0.15);
}
/** Segmented tail swaying behind (toward +y), ending in a blade. */
function xtail(g: G, x0: number, y0: number, n: number, seg: number, w: number, t: number, p: Pal, amp = 0.25) {
  const pts: Array<[number, number]> = [[x0, y0]];
  let a = Math.PI / 2;
  for (let i = 1; i <= n; i++) { a = Math.PI / 2 + Math.sin(t * TAU + i * 0.55) * amp * (i / n + 0.4); const [px, py] = pts[i - 1]; pts.push([px + Math.cos(a) * seg, py + Math.sin(a) * seg]); }
  for (let i = n; i >= 1; i--) { const [ax, ay] = pts[i - 1], [bx, by] = pts[i]; const ww = w * (1 - (i - 1) / n * 0.75); limbPiece(g, ax, ay, bx, by, ww, ww * 0.85, p); }
  const [ex, ey] = pts[n], [qx, qy] = pts[n - 1], ang = Math.atan2(ey - qy, ex - qx);
  g.save(); g.translate(ex, ey); g.rotate(ang);
  g.fillStyle = p.edge; g.beginPath(); g.moveTo(-seg * 0.2, 0); g.quadraticCurveTo(seg * 0.6, -w * 1.1, seg * 1.6, 0); g.quadraticCurveTo(seg * 0.6, w * 0.5, -seg * 0.2, 0); g.fill();
  g.strokeStyle = p.light; g.lineWidth = 1; g.globalAlpha = 0.7; g.beginPath(); g.moveTo(0, -w * 0.15); g.quadraticCurveTo(seg * 0.6, -w * 0.75, seg * 1.5, 0); g.stroke(); g.globalAlpha = 1;
  g.restore();
}
function veins(g: G, x: number, y: number, rx: number, ry: number, c: string, seed: number, n = 6) {
  const r = rng(seed);
  g.save(); g.globalCompositeOperation = 'lighter'; g.strokeStyle = c; g.lineWidth = 1; g.globalAlpha = 0.4;
  for (let i = 0; i < n; i++) {
    let px = x + (r() - 0.5) * rx, py = y + (r() - 0.5) * ry, a = r() * TAU; g.beginPath(); g.moveTo(px, py);
    for (let k = 0; k < 5; k++) { a += (r() - 0.5) * 1.2; px += Math.cos(a) * rx * 0.18; py += Math.sin(a) * ry * 0.18; g.lineTo(px, py); }
    g.stroke();
  }
  g.restore();
}
function eyes(g: G, pts: Array<[number, number]>, r: number, c: string) {
  for (const [x, y] of pts) { g.fillStyle = '#000'; g.beginPath(); g.arc(x, y, r * 1.3, 0, TAU); g.fill(); g.fillStyle = c; g.beginPath(); g.arc(x, y, r, 0, TAU); g.fill(); glowDot(g, x, y, r * 4, c, 0.6); }
}
function pincers(g: G, x: number, y: number, s: number, open: number, p: Pal) {
  for (const sx of [-1, 1]) {
    const kx = x + sx * s * 0.16, ky = y - s * 0.08, tx = x + sx * s * (0.04 + open * 0.08), ty = y - s * 0.3;
    limbPiece(g, x + sx * s * 0.05, y, kx, ky, s * 0.09, s * 0.07, p);
    limbPiece(g, kx, ky, tx, ty, s * 0.07, s * 0.01, p);
    spike(g, (kx + tx) / 2, (ky + ty) / 2, sx > 0 ? Math.PI * 1.1 : -0.1, s * 0.06, s * 0.015, p);
  }
}

// Skitter (blue swarm): splayed finger-legs, flat palm body, whip tail. Swarms in streams.
const skitter: BugFn = (g, s, t) => {
  const p = AL.blue;
  shadow(g, s * 0.4, s * 0.4);
  xtail(g, 0, s * 0.12, 7, s * 0.07, s * 0.07, t * 1.5, p, 0.5);
  xlegs(g, [
    { hip: [s * 0.08, -s * 0.1], foot: [s * 0.3, -s * 0.42], l1: s * 0.22, l2: s * 0.26, w: s * 0.06, spur: false },
    { hip: [s * 0.11, -s * 0.04], foot: [s * 0.44, -s * 0.16], l1: s * 0.24, l2: s * 0.28, w: s * 0.06, spur: false },
    { hip: [s * 0.11, s * 0.03], foot: [s * 0.44, s * 0.14], l1: s * 0.24, l2: s * 0.28, w: s * 0.06, spur: false },
    { hip: [s * 0.08, s * 0.09], foot: [s * 0.32, s * 0.38], l1: s * 0.22, l2: s * 0.26, w: s * 0.06, spur: false },
  ], t * 1.5, s * 0.07, p);
  ribbed(g, 0, 0, s * 0.2, s * 0.22, p, 4);
  for (const [x, y] of [[-0.08, 0.02], [0.08, 0.02], [0, 0.1]]) { g.fillStyle = p.glow; g.beginPath(); g.arc(x * s, y * s, s * 0.03, 0, TAU); g.fill(); glowDot(g, x * s, y * s, s * 0.1, p.glow, 0.6); }
  eyes(g, [[-s * 0.05, -s * 0.12], [s * 0.05, -s * 0.12], [0, -s * 0.15]], s * 0.022, p.glow);
};

// Glider (blue flier): ribbed dart body, bat-membrane wings on finger bones, barbed tail.
const glider: BugFn = (g, s, t) => {
  const p = AL.blue, flap = Math.sin(t * TAU * 3);
  g.save(); g.translate(s * 0.45, s * 0.65); g.globalAlpha = 0.5; shadow(g, s * 0.4, s * 0.2, 0); g.restore();
  for (const side of [-1, 1]) {
    const span = s * (0.55 + flap * 0.08), sh: Array<[number, number]> = [[side * s * 0.06, -s * 0.12]];
    const tips: Array<[number, number]> = [[side * span, -s * 0.3], [side * span * 0.95, -s * 0.02], [side * span * 0.7, s * 0.2], [side * s * 0.1, s * 0.22]];
    g.beginPath(); g.moveTo(...sh[0]);
    for (let i = 0; i < tips.length; i++) { const [tx, ty] = tips[i]; if (i === 0) g.lineTo(tx, ty); else { const [px, py] = tips[i - 1]; g.quadraticCurveTo((px + tx) / 2 - side * s * 0.03, (py + ty) / 2 - s * 0.02, tx, ty); } }
    g.closePath();
    const gr = g.createLinearGradient(0, -s * 0.3, side * span, s * 0.2); gr.addColorStop(0, 'rgba(40,90,120,0.85)'); gr.addColorStop(1, 'rgba(10,30,45,0.7)');
    g.fillStyle = gr; g.fill(); g.strokeStyle = p.edge; g.lineWidth = 2; g.stroke();
    for (const [tx, ty] of tips.slice(0, 3)) limbPiece(g, sh[0][0], sh[0][1], tx, ty, s * 0.035, s * 0.008, p);
    veins(g, side * span * 0.5, 0, span * 0.6, s * 0.3, p.glow, side > 0 ? 8 : 9, 3);
  }
  xtail(g, 0, s * 0.12, 6, s * 0.06, s * 0.05, t, p, 0.3);
  ribbed(g, 0, 0, s * 0.08, s * 0.16, p, 5);
  skull(g, 0, -s * 0.28, s * 0.13, s * 0.18, p, 3);
  eyes(g, [[-s * 0.035, -s * 0.24], [s * 0.035, -s * 0.24]], s * 0.016, p.glow);
};

// Warrior (red brute): arachnid war-form on four long scythe legs, pincers, armoured ribbed back.
function warriorBody(g: G, s: number, t: number, p: Pal, ram: boolean) {
  shadow(g, s * 0.42, s * 0.48);
  xtail(g, 0, s * 0.3, 3, s * 0.06, s * 0.1, t, p, 0.15);
  xlegs(g, [
    { hip: [s * 0.1, -s * 0.12], foot: [s * 0.46, -s * 0.44], l1: s * 0.3, l2: s * 0.34, w: s * 0.1 },
    { hip: [s * 0.11, s * 0.0], foot: [s * 0.52, s * 0.0], l1: s * 0.3, l2: s * 0.34, w: s * 0.1 },
    { hip: [s * 0.1, s * 0.12], foot: [s * 0.44, s * 0.42], l1: s * 0.3, l2: s * 0.34, w: s * 0.1 },
  ].filter((_, i) => ram || i !== 1) as Parameters<typeof xlegs>[1], t, s * 0.09, p);
  ribbed(g, 0, s * 0.12, s * 0.17, s * 0.24, p, 6);
  veins(g, 0, s * 0.12, s * 0.2, s * 0.3, p.glow, 12, 5);
  g.strokeStyle = p.glow; g.lineWidth = s * 0.015; for (const sx of [-1, 1]) { g.beginPath(); g.moveTo(sx * s * 0.06, -s * 0.02); g.lineTo(sx * s * 0.09, s * 0.25); g.stroke(); }
  if (ram) {
    // armoured battering crest
    const gr = g.createLinearGradient(0, -s * 0.5, 0, -s * 0.05); gr.addColorStop(0, p.light); gr.addColorStop(0.5, p.base); gr.addColorStop(1, p.dark);
    g.fillStyle = gr; g.strokeStyle = p.edge; g.lineWidth = 3;
    g.beginPath(); g.moveTo(-s * 0.26, -s * 0.12); g.quadraticCurveTo(-s * 0.3, -s * 0.42, 0, -s * 0.52); g.quadraticCurveTo(s * 0.3, -s * 0.42, s * 0.26, -s * 0.12);
    g.quadraticCurveTo(0, -s * 0.02, -s * 0.26, -s * 0.12); g.closePath(); g.fill(); g.stroke();
    g.strokeStyle = 'rgba(0,0,0,0.5)'; g.lineWidth = 1.5;
    for (let i = 1; i < 4; i++) { g.beginPath(); g.moveTo(-s * 0.24 + i * 0.01 * s, -s * 0.14 - i * s * 0.08); g.quadraticCurveTo(0, -s * 0.2 - i * s * 0.1, s * 0.24 - i * 0.01 * s, -s * 0.14 - i * s * 0.08); g.stroke(); }
    for (const sx of [-1, 1]) spike(g, sx * s * 0.22, -s * 0.3, sx > 0 ? -0.6 : Math.PI + 0.6, s * 0.16, s * 0.03, p);
    wet(g, -s * 0.1, -s * 0.32, s * 0.2, -0.6);
    eyes(g, [[-s * 0.08, -s * 0.14], [s * 0.08, -s * 0.14]], s * 0.02, p.glow);
  } else {
    pincers(g, 0, -s * 0.22, s, 0.5 + Math.sin(t * TAU) * 0.3, p);
    skull(g, 0, -s * 0.24, s * 0.16, s * 0.3, p, 4);
    eyes(g, [[-s * 0.04, -s * 0.2], [s * 0.04, -s * 0.2], [-s * 0.07, -s * 0.15], [s * 0.07, -s * 0.15]], s * 0.016, p.glow);
  }
}
const warrior: BugFn = (g, s, t) => warriorBody(g, s, t, AL.red, false);
const ram: BugFn = (g, s, t) => warriorBody(g, s, t, { ...AL.red, base: '#5a1a10' }, true);

// Bulwark (purple armoured): low domed siege shell of fused plates, acid glands, stubby legs.
const bulwark: BugFn = (g, s, t) => {
  const p = AL.purple;
  shadow(g, s * 0.42, s * 0.48);
  const set = [];
  for (let i = 0; i < 4; i++) set.push({ hip: [s * 0.2, -s * 0.2 + i * s * 0.14] as [number, number], foot: [s * 0.4, -s * 0.24 + i * s * 0.17] as [number, number], l1: s * 0.13, l2: s * 0.15, w: s * 0.08 });
  xlegs(g, set, t * 0.8, s * 0.04, p);
  xtail(g, 0, s * 0.36, 3, s * 0.06, s * 0.12, t * 0.6, p, 0.1);
  shell(g, 0, s * 0.02, s * 0.33, s * 0.4, p, 0, 3);
  // fused plates
  const r = rng(31);
  for (let i = 0; i < 9; i++) {
    const a = (i / 9) * TAU + 0.2, d = s * 0.2, px = Math.cos(a) * d * 0.9, py = s * 0.02 + Math.sin(a) * d * 1.1;
    shell(g, px, py, s * 0.11, s * 0.09, p, a, 2);
    if (r() < 0.6) { g.fillStyle = p.glow; g.beginPath(); g.arc(px, py, s * 0.018, 0, TAU); g.fill(); glowDot(g, px, py, s * 0.07, p.glow, 0.6); }
  }
  ribbed(g, 0, s * 0.02, s * 0.15, s * 0.19, p, 4);
  // acid glands glowing through seams
  g.save(); g.globalCompositeOperation = 'lighter'; g.strokeStyle = p.glow; g.lineWidth = 1.6; g.globalAlpha = 0.8;
  g.beginPath(); g.ellipse(0, s * 0.02, s * 0.28, s * 0.34, 0, 0, TAU); g.stroke(); g.restore();
  skull(g, 0, -s * 0.44, s * 0.16, s * 0.12, p, 2);
  pincers(g, 0, -s * 0.4, s * 0.7, 0.3, p);
  eyes(g, [[-s * 0.05, -s * 0.42], [s * 0.05, -s * 0.42]], s * 0.016, p.glow);
};

// Broodmother (purple carrier): crested head, scythe forearms, vast translucent egg sac trailing behind.
const broodmother: BugFn = (g, s, t) => {
  const p = AL.purple, pulse = 1 + Math.sin(t * TAU * 0.8) * 0.025;
  shadow(g, s * 0.44, s * 0.55);
  xlegs(g, [
    { hip: [s * 0.08, -s * 0.2], foot: [s * 0.36, -s * 0.36], l1: s * 0.22, l2: s * 0.26, w: s * 0.055 },
    { hip: [s * 0.09, -s * 0.1], foot: [s * 0.42, -s * 0.04], l1: s * 0.24, l2: s * 0.28, w: s * 0.055 },
  ], t * 0.6, s * 0.05, p);
  // egg sac
  const sx0 = 0, sy0 = s * 0.2, rx = s * 0.32 * pulse, ry = s * 0.36 * pulse;
  const gr = g.createRadialGradient(sx0 - rx * 0.3, sy0 - ry * 0.3, 0, sx0, sy0, ry * 1.1);
  gr.addColorStop(0, '#6b4a80'); gr.addColorStop(0.6, '#2c1840'); gr.addColorStop(1, '#0d0618');
  g.fillStyle = gr; g.beginPath(); g.ellipse(sx0, sy0, rx, ry, 0, 0, TAU); g.fill(); g.strokeStyle = p.edge; g.lineWidth = 3; g.stroke();
  const r = rng(17);
  for (let i = 0; i < 14; i++) {
    const a = r() * TAU, d = Math.sqrt(r()) * 0.75, x = sx0 + Math.cos(a) * rx * d, y = sy0 + Math.sin(a) * ry * d, er = s * (0.035 + r() * 0.03);
    const eg = g.createRadialGradient(x - er * 0.3, y - er * 0.3, 0, x, y, er);
    eg.addColorStop(0, '#fbeaff'); eg.addColorStop(0.45, p.glow); eg.addColorStop(1, '#2a0c48');
    g.fillStyle = eg; g.beginPath(); g.ellipse(x, y, er, er * 1.25, a, 0, TAU); g.fill();
    glowDot(g, x, y, er * 2.6, p.glow, 0.35 + 0.2 * Math.sin(t * TAU + i));
  }
  veins(g, sx0, sy0, rx * 1.4, ry * 1.4, '#5a2a7a', 5, 10);
  wet(g, -rx * 0.4, sy0 - ry * 0.35, ry * 0.5, -0.5);
  ribbed(g, 0, -s * 0.16, s * 0.11, s * 0.14, p, 4);
  // scythe forearms raised
  for (const sx of [-1, 1]) {
    limbPiece(g, sx * s * 0.07, -s * 0.24, sx * s * 0.2, -s * 0.36, s * 0.06, s * 0.05, p);
    limbPiece(g, sx * s * 0.2, -s * 0.36, sx * s * 0.1, -s * 0.52, s * 0.05, s * 0.01, p);
  }
  // fan crest
  g.fillStyle = p.dark; g.strokeStyle = p.edge; g.lineWidth = 2.5;
  g.beginPath(); g.moveTo(0, -s * 0.28);
  for (let i = 0; i <= 6; i++) { const a = Math.PI + (i / 6) * Math.PI, rr = i % 2 ? s * 0.14 : s * 0.2; g.lineTo(Math.cos(a) * rr, -s * 0.3 + Math.sin(a) * rr * 0.8); }
  g.closePath(); g.fill(); g.stroke();
  skull(g, 0, -s * 0.38, s * 0.1, s * 0.12, p, 2);
  eyes(g, [[-s * 0.03, -s * 0.37], [s * 0.03, -s * 0.37]], s * 0.014, p.glow);
};

// Stalker (shifting colour): lean biomech hunter, long swept skull, clawed arms, digitigrade legs, bladed tail.
const stalker: BugFn = (g, s, t) => {
  const hue = (t * 120) % 360;
  const p: Pal = { base: `hsl(${hue},25%,26%)`, dark: '#08080c', light: `hsl(${hue},60%,82%)`, glow: `hsl(${hue},100%,62%)`, edge: '#000' };
  shadow(g, s * 0.26, s * 0.5);
  xtail(g, 0, s * 0.18, 11, s * 0.05, s * 0.06, t * 0.8, p, 0.45);
  xlegs(g, [{ hip: [s * 0.07, s * 0.12], foot: [s * 0.22, s * 0.3], l1: s * 0.2, l2: s * 0.22, w: s * 0.06 }], t, s * 0.08, p);
  ribbed(g, 0, s * 0.02, s * 0.08, s * 0.19, p, 7);
  // dorsal tubes
  for (const sx of [-1, 1]) { limbPiece(g, sx * s * 0.06, -s * 0.12, sx * s * 0.16, -s * 0.02, s * 0.03, s * 0.02, p); limbPiece(g, sx * s * 0.06, -s * 0.06, sx * s * 0.14, s * 0.06, s * 0.025, s * 0.015, p); }
  // arms reaching forward
  for (const sx of [-1, 1]) {
    const reach = Math.sin(t * TAU + (sx > 0 ? 0 : Math.PI)) * s * 0.03;
    limbPiece(g, sx * s * 0.06, -s * 0.14, sx * s * 0.17, -s * 0.24 + reach, s * 0.04, s * 0.03, p);
    limbPiece(g, sx * s * 0.17, -s * 0.24 + reach, sx * s * 0.12, -s * 0.36 + reach, s * 0.03, s * 0.02, p);
    for (const f of [-1, 0, 1]) spike(g, sx * s * 0.12, -s * 0.36 + reach, -Math.PI / 2 + f * 0.35, s * 0.06, s * 0.008, p);
  }
  skull(g, 0, -s * 0.36, s * 0.13, s * 0.32, p, 6);
  veins(g, 0, 0, s * 0.16, s * 0.4, p.glow, 41, 6);
  g.save(); g.globalCompositeOperation = 'lighter'; g.strokeStyle = p.glow; g.lineWidth = 1.5; g.beginPath(); g.moveTo(0, -s * 0.3); g.lineTo(0, -s * 0.06); g.stroke(); g.restore();
  // jaws (inner jaw glint)
  g.fillStyle = '#d8d8e0'; for (const sx of [-1, 1]) { g.beginPath(); g.moveTo(sx * s * 0.015, -s * 0.38); g.lineTo(sx * s * 0.035, -s * 0.42); g.lineTo(sx * s * 0.005, -s * 0.41); g.fill(); }
};

// Hive Tyrant (gold boss): massive crested war-beast, six legs, two great scythe arms, long armoured tail.
const tyrant: BugFn = (g, s, t) => {
  const p = AL.gold;
  shadow(g, s * 0.45, s * 0.55);
  xtail(g, 0, s * 0.24, 9, s * 0.055, s * 0.12, t * 0.5, p, 0.3);
  xlegs(g, [
    { hip: [s * 0.1, -s * 0.06], foot: [s * 0.4, -s * 0.16], l1: s * 0.24, l2: s * 0.28, w: s * 0.07 },
    { hip: [s * 0.11, s * 0.04], foot: [s * 0.42, s * 0.12], l1: s * 0.24, l2: s * 0.28, w: s * 0.07 },
    { hip: [s * 0.1, s * 0.14], foot: [s * 0.36, s * 0.36], l1: s * 0.24, l2: s * 0.28, w: s * 0.07 },
  ], t * 0.6, s * 0.05, p);
  ribbed(g, 0, s * 0.06, s * 0.16, s * 0.22, p, 7);
  for (let i = 0; i < 4; i++) for (const sx of [-1, 1]) spike(g, sx * s * 0.08, -s * 0.06 + i * s * 0.08, sx > 0 ? -0.3 : Math.PI + 0.3, s * 0.08, s * 0.02, p);
  veins(g, 0, s * 0.06, s * 0.2, s * 0.3, p.glow, 77, 6);
  // great scythe arms
  for (const sx of [-1, 1]) {
    const sw = Math.sin(t * TAU * 0.8 + (sx > 0 ? 0 : 1.5)) * 0.15;
    const ex = sx * s * 0.28, ey = -s * 0.22, tx = sx * s * (0.18 - sw * 0.3), ty = -s * (0.52 + sw * 0.2);
    limbPiece(g, sx * s * 0.1, -s * 0.12, ex, ey, s * 0.08, s * 0.065, p);
    // blade
    g.fillStyle = p.edge; g.beginPath(); g.moveTo(ex, ey); g.quadraticCurveTo(ex + sx * s * 0.1, (ey + ty) / 2, tx, ty); g.quadraticCurveTo(ex - sx * s * 0.02, (ey + ty) / 2, ex - sx * s * 0.03, ey); g.closePath(); g.fill();
    const bg = g.createLinearGradient(ex, ey, tx, ty); bg.addColorStop(0, p.base); bg.addColorStop(1, p.light);
    g.fillStyle = bg; g.beginPath(); g.moveTo(ex, ey + 2); g.quadraticCurveTo(ex + sx * s * 0.08, (ey + ty) / 2, tx, ty + 3); g.quadraticCurveTo(ex, (ey + ty) / 2, ex - sx * s * 0.01, ey); g.closePath(); g.fill();
  }
  // crest
  g.fillStyle = p.dark; g.strokeStyle = p.edge; g.lineWidth = 3;
  g.beginPath(); g.moveTo(-s * 0.06, -s * 0.18);
  for (let i = 0; i <= 8; i++) { const a = Math.PI * 0.95 + (i / 8) * Math.PI * 1.1, rr = i % 2 ? s * 0.2 : s * 0.3; g.lineTo(Math.cos(a) * rr, -s * 0.26 + Math.sin(a) * rr * 0.75); }
  g.lineTo(s * 0.06, -s * 0.18); g.closePath(); g.fill(); g.stroke();
  g.save(); g.globalCompositeOperation = 'lighter'; g.strokeStyle = p.glow; g.globalAlpha = 0.5; g.lineWidth = 1.5;
  for (let i = 0; i < 5; i++) { const a = Math.PI * 1.1 + (i / 4) * Math.PI * 0.8; g.beginPath(); g.moveTo(0, -s * 0.24); g.lineTo(Math.cos(a) * s * 0.24, -s * 0.26 + Math.sin(a) * s * 0.18); g.stroke(); }
  g.restore();
  skull(g, 0, -s * 0.42, s * 0.16, s * 0.24, p, 4);
  pincers(g, 0, -s * 0.42, s * 0.8, 0.4 + Math.sin(t * TAU) * 0.3, p);
  eyes(g, [[-s * 0.05, -s * 0.38], [s * 0.05, -s * 0.38], [-s * 0.08, -s * 0.33], [s * 0.08, -s * 0.33]], s * 0.018, p.glow);
};

// ---------- environment ----------
function ground(g: G, W: number, H: number) {
  g.fillStyle = '#211d19'; g.fillRect(0, 0, W, H);
  const r = rng(3);
  for (let i = 0; i < 1400; i++) {
    const x = r() * W, y = r() * H, s = 6 + r() * 40, l = r();
    g.fillStyle = l < 0.5 ? `rgba(0,0,0,${0.05 + r() * 0.12})` : `rgba(140,120,95,${0.03 + r() * 0.06})`;
    g.beginPath(); g.ellipse(x, y, s, s * (0.5 + r() * 0.5), r() * TAU, 0, TAU); g.fill();
  }
  g.strokeStyle = 'rgba(0,0,0,0.5)'; g.lineWidth = 1.5;
  for (let i = 0; i < 70; i++) {
    let x = r() * W, y = r() * H; g.beginPath(); g.moveTo(x, y);
    for (let k = 0; k < 6; k++) { x += (r() - 0.5) * 40; y += (r() - 0.5) * 40; g.lineTo(x, y); } g.stroke();
  }
  for (let i = 0; i < 260; i++) { // pebbles
    const x = r() * W, y = r() * H, s = 1.5 + r() * 4;
    g.fillStyle = 'rgba(0,0,0,0.5)'; g.beginPath(); g.arc(x + 1, y + 1.5, s, 0, TAU); g.fill();
    g.fillStyle = `rgb(${70 + r() * 30},${62 + r() * 25},${52 + r() * 20})`; g.beginPath(); g.arc(x, y, s, 0, TAU); g.fill();
  }
}
type Pt = [number, number];
function bez(c: Pt[], u: number): Pt {
  const v = 1 - u, a = v * v * v, b = 3 * v * v * u, d = 3 * v * u * u, e = u * u * u;
  return [a * c[0][0] + b * c[1][0] + d * c[2][0] + e * c[3][0], a * c[0][1] + b * c[1][1] + d * c[2][1] + e * c[3][1]];
}
function bezDir(c: Pt[], u: number): number { const a = bez(c, Math.max(0, u - 0.005)), b = bez(c, Math.min(1, u + 0.005)); return Math.atan2(b[1] - a[1], b[0] - a[0]); }
function trench(g: G, c: Pt[], w: number) {
  const path = () => { g.beginPath(); g.moveTo(...c[0]); g.bezierCurveTo(...c[1], ...c[2], ...c[3]); };
  g.lineCap = 'round';
  path(); g.strokeStyle = '#4a4238'; g.lineWidth = w + 14; g.stroke(); // lip
  path(); g.strokeStyle = '#0b0a09'; g.lineWidth = w + 6; g.stroke();
  path(); g.strokeStyle = '#2b261f'; g.lineWidth = w; g.stroke();
  path(); g.strokeStyle = '#353027'; g.lineWidth = w * 0.6; g.stroke();
  path(); g.strokeStyle = 'rgba(70,60,48,0.35)'; g.lineWidth = w * 0.5; g.setLineDash([3, 9]); g.stroke(); g.setLineDash([]);
  // edge rubble
  const r = rng(Math.round(c[0][0] * 7 + 11));
  for (let i = 0; i < 70; i++) {
    const u = r(), [x, y] = bez(c, u), a = bezDir(c, u) + Math.PI / 2, side = r() < 0.5 ? -1 : 1, d = (w / 2 + 6 + r() * 6) * side;
    g.fillStyle = `rgb(${60 + r() * 30},${54 + r() * 25},${44 + r() * 20})`;
    g.beginPath(); g.arc(x + Math.cos(a) * d, y + Math.sin(a) * d, 2 + r() * 4, 0, TAU); g.fill();
  }
}
function creep(g: G, x: number, y: number, r: number, seed: number, t: number) {
  const rr = rng(seed);
  for (let i = 0; i < 26; i++) {
    const a = rr() * TAU, d = rr() * r, s = r * (0.2 + rr() * 0.35);
    const gr = g.createRadialGradient(x + Math.cos(a) * d, y + Math.sin(a) * d, 0, x + Math.cos(a) * d, y + Math.sin(a) * d, s);
    gr.addColorStop(0, 'rgba(58,22,62,0.85)'); gr.addColorStop(1, 'rgba(30,10,34,0)');
    g.fillStyle = gr; g.beginPath(); g.arc(x + Math.cos(a) * d, y + Math.sin(a) * d, s, 0, TAU); g.fill();
  }
  g.strokeStyle = 'rgba(120,50,110,0.55)'; g.lineWidth = 1.6;
  for (let i = 0; i < 16; i++) {
    let px = x, py = y, a = rr() * TAU; g.beginPath(); g.moveTo(px, py);
    for (let k = 0; k < 8; k++) { a += (rr() - 0.5) * 0.8; px += Math.cos(a) * r * 0.14; py += Math.sin(a) * r * 0.14; g.lineTo(px, py); } g.stroke();
  }
  for (let i = 0; i < 14; i++) {
    const a = rr() * TAU, d = rr() * r * 0.9, px = x + Math.cos(a) * d, py = y + Math.sin(a) * d, s = 3 + rr() * 6;
    g.fillStyle = '#5a1f5e'; g.beginPath(); g.arc(px, py, s, 0, TAU); g.fill();
    g.fillStyle = '#e48cff'; g.beginPath(); g.arc(px - s * 0.3, py - s * 0.3, s * 0.35, 0, TAU); g.fill();
    glowDot(g, px, py, s * 3, '#c45cff', 0.35 + 0.15 * Math.sin(t * 3 + i));
  }
}
function plate(g: G, x: number, y: number, w: number, h: number) {
  const gr = g.createLinearGradient(x, y, x + w, y + h);
  gr.addColorStop(0, '#5c5a55'); gr.addColorStop(1, '#2c2b29');
  g.fillStyle = gr; g.fillRect(x, y, w, h);
  g.strokeStyle = '#111'; g.lineWidth = 2; g.strokeRect(x, y, w, h);
  g.strokeStyle = 'rgba(255,255,255,0.12)'; g.lineWidth = 1; g.strokeRect(x + 2, y + 2, w - 4, h - 4);
  for (const [rx, ry] of [[x + 6, y + 6], [x + w - 6, y + 6], [x + 6, y + h - 6], [x + w - 6, y + h - 6]]) {
    g.fillStyle = '#1a1a1a'; g.beginPath(); g.arc(rx + 0.6, ry + 0.8, 2.6, 0, TAU); g.fill();
    g.fillStyle = '#8a8780'; g.beginPath(); g.arc(rx, ry, 2.2, 0, TAU); g.fill();
  }
  // rust streaks
  const r = rng(Math.round(x * 13 + y));
  for (let i = 0; i < 4; i++) { g.fillStyle = `rgba(120,60,20,${0.15 + r() * 0.2})`; g.fillRect(x + r() * w, y + r() * h * 0.5, 2 + r() * 3, r() * h * 0.5); }
}
function hazardRing(g: G, x: number, y: number, r0: number, r1: number) {
  g.save(); g.beginPath(); g.arc(x, y, r1, 0, TAU); g.arc(x, y, r0, 0, TAU, true); g.clip();
  g.fillStyle = '#d9a417'; g.fillRect(x - r1, y - r1, r1 * 2, r1 * 2);
  g.fillStyle = '#141210';
  for (let i = 0; i < 28; i++) { const a = (i / 28) * TAU; g.beginPath(); g.moveTo(x, y); g.lineTo(x + Math.cos(a) * r1 * 1.5, y + Math.sin(a) * r1 * 1.5); g.lineTo(x + Math.cos(a + TAU / 56) * r1 * 1.5, y + Math.sin(a + TAU / 56) * r1 * 1.5); g.fill(); }
  g.fillStyle = 'rgba(0,0,0,0.3)'; g.fillRect(x - r1, y - r1, r1 * 2, r1 * 2); // grime
  g.restore();
}
function cable(g: G, a: Pt, b: Pt, t: number, power: number) {
  const mx = (a[0] + b[0]) / 2 + (b[1] - a[1]) * 0.12, my = (a[1] + b[1]) / 2 - (b[0] - a[0]) * 0.12;
  g.lineCap = 'round';
  g.strokeStyle = 'rgba(0,0,0,0.5)'; g.lineWidth = 9; g.beginPath(); g.moveTo(a[0] + 2, a[1] + 3); g.quadraticCurveTo(mx + 2, my + 3, b[0] + 2, b[1] + 3); g.stroke();
  g.strokeStyle = '#0e0e0e'; g.lineWidth = 7; g.beginPath(); g.moveTo(...a); g.quadraticCurveTo(mx, my, ...b); g.stroke();
  g.strokeStyle = '#3a3a3a'; g.lineWidth = 2; g.stroke();
  for (let k = 0; k < 4; k++) { // power pulses: one per pedal stroke
    const u = (t * 0.9 + k / 4) % 1, v = 1 - u;
    const x = v * v * a[0] + 2 * v * u * mx + u * u * b[0], y = v * v * a[1] + 2 * v * u * my + u * u * b[1];
    glowDot(g, x, y, 10 * power, '#54f0ff', 0.9);
  }
}

// ---------- towers / base ----------
function towerPad(g: G, x: number, y: number) {
  g.fillStyle = 'rgba(0,0,0,0.5)'; g.beginPath(); g.arc(x + 3, y + 5, 30, 0, TAU); g.fill();
  g.fillStyle = '#3b3934'; g.beginPath();
  for (let i = 0; i < 8; i++) { const a = (i / 8) * TAU + TAU / 16; i ? g.lineTo(x + Math.cos(a) * 30, y + Math.sin(a) * 30) : g.moveTo(x + Math.cos(a) * 30, y + Math.sin(a) * 30); }
  g.closePath(); g.fill(); g.strokeStyle = '#121110'; g.lineWidth = 3; g.stroke();
  for (let i = 0; i < 8; i++) { const a = (i / 8) * TAU + TAU / 16; g.fillStyle = '#7d7a72'; g.beginPath(); g.arc(x + Math.cos(a) * 24, y + Math.sin(a) * 24, 2, 0, TAU); g.fill(); }
}
function tesla(g: G, x: number, y: number, t: number, target: Pt | null) {
  towerPad(g, x, y);
  for (let i = 4; i >= 0; i--) {
    g.strokeStyle = i % 2 ? '#b8692c' : '#e3954e'; g.lineWidth = 4;
    g.beginPath(); g.arc(x, y, 8 + i * 3.4, 0, TAU); g.stroke();
  }
  g.strokeStyle = '#2a1a10'; g.lineWidth = 1; for (let i = 0; i < 5; i++) { g.beginPath(); g.arc(x, y, 6.5 + i * 3.4, 0, TAU); g.stroke(); }
  const gr = g.createRadialGradient(x - 3, y - 4, 0, x, y, 9);
  gr.addColorStop(0, '#ffffff'); gr.addColorStop(0.4, '#9ad8ff'); gr.addColorStop(1, '#2a5d80');
  g.fillStyle = gr; g.beginPath(); g.arc(x, y, 9, 0, TAU); g.fill();
  glowDot(g, x, y, 40, '#45d2ff', 0.6);
  if (target) {
    const r = rng(Math.floor(t * 20));
    for (let k = 0; k < 2; k++) {
      g.save(); g.globalCompositeOperation = 'lighter';
      g.strokeStyle = k ? '#ffffff' : '#45d2ff'; g.lineWidth = k ? 1.5 : 5; g.globalAlpha = k ? 1 : 0.5; g.lineJoin = 'round';
      g.beginPath(); g.moveTo(x, y);
      for (let i = 1; i <= 8; i++) { const u = i / 8, j = i < 8 ? (r() - 0.5) * 26 : 0; g.lineTo(x + (target[0] - x) * u + j, y + (target[1] - y) * u + j * 0.6); }
      g.stroke(); g.restore();
    }
    glowDot(g, target[0], target[1], 28, '#45d2ff', 0.8);
  }
}
function mortar(g: G, x: number, y: number, ang: number, t: number) {
  towerPad(g, x, y);
  g.save(); g.translate(x, y); g.rotate(ang);
  shell(g, 0, 0, 16, 16, { base: '#6b5a3e', dark: '#2a2218', light: '#c9b38a', glow: '', edge: '#100c08' }, 0, 2.5);
  const recoil = Math.max(0, 1 - ((t * 0.6) % 1) * 4) * 5;
  g.fillStyle = '#26231f'; g.strokeStyle = '#0c0b0a'; g.lineWidth = 2.5;
  g.fillRect(-7, -26 + recoil, 14, 24); g.strokeRect(-7, -26 + recoil, 14, 24);
  g.fillStyle = '#0a0908'; g.beginPath(); g.arc(0, -26 + recoil, 6, 0, TAU); g.fill();
  g.fillStyle = '#d9a417'; g.fillRect(-7, -10 + recoil, 14, 3);
  g.restore();
  // smoke wisps
  for (let i = 0; i < 5; i++) { const u = ((t * 0.4 + i / 5) % 1); g.fillStyle = `rgba(150,140,130,${0.18 * (1 - u)})`; g.beginPath(); g.arc(x + Math.sin(ang) * 26 + u * 14, y - Math.cos(ang) * 26 - u * 30, 6 + u * 14, 0, TAU); g.fill(); }
}
function lens(g: G, x: number, y: number, target: Pt | null, t: number) {
  towerPad(g, x, y);
  g.strokeStyle = '#1a1916'; g.lineWidth = 5; g.lineCap = 'round';
  for (let i = 0; i < 3; i++) { const a = (i / 3) * TAU - Math.PI / 2; g.beginPath(); g.moveTo(x, y); g.lineTo(x + Math.cos(a) * 22, y + Math.sin(a) * 22); g.stroke(); }
  g.save(); g.translate(x, y); g.rotate(t * 0.4);
  const gr = g.createLinearGradient(-12, -12, 12, 12);
  gr.addColorStop(0, '#f2e4ff'); gr.addColorStop(0.5, '#a466ff'); gr.addColorStop(1, '#3d1a70');
  g.fillStyle = gr; g.strokeStyle = '#120820'; g.lineWidth = 2.5;
  g.beginPath(); g.moveTo(0, -15); g.lineTo(13, 0); g.lineTo(0, 15); g.lineTo(-13, 0); g.closePath(); g.fill(); g.stroke();
  g.strokeStyle = 'rgba(255,255,255,0.5)'; g.lineWidth = 1; g.beginPath(); g.moveTo(0, -15); g.lineTo(0, 15); g.moveTo(-13, 0); g.lineTo(13, 0); g.stroke();
  g.restore();
  glowDot(g, x, y, 36, '#b97cff', 0.6);
  if (target) {
    g.save(); g.globalCompositeOperation = 'lighter'; g.lineCap = 'round';
    for (const [w, c, a] of [[16, '#b97cff', 0.25], [7, '#d6b4ff', 0.6], [2.5, '#ffffff', 1]] as const) { g.strokeStyle = c; g.globalAlpha = a; g.lineWidth = w; g.beginPath(); g.moveTo(x, y); g.lineTo(...target); g.stroke(); }
    g.restore(); glowDot(g, target[0], target[1], 40, '#b97cff', 0.9);
  }
}
function dynamoBase(g: G, x: number, y: number, t: number, aim: number, look: ReturnType<typeof riderLook>, scale = 1) {
  g.save(); g.translate(x, y); g.scale(scale, scale);
  // steel deck
  g.fillStyle = 'rgba(0,0,0,0.55)'; g.beginPath(); g.arc(6, 10, 118, 0, TAU); g.fill();
  for (let i = -3; i < 3; i++) for (let j = -2; j < 2; j++) plate(g, i * 38, j * 38 - 10, 38, 38);
  g.save(); g.globalCompositeOperation = 'destination-in'; g.restore();
  hazardRing(g, 0, 0, 94, 112);
  g.strokeStyle = '#0b0a09'; g.lineWidth = 4; g.beginPath(); g.arc(0, 0, 112, 0, TAU); g.stroke();
  // flywheel
  const spin = t * 5;
  g.fillStyle = '#121110'; g.beginPath(); g.arc(0, 0, 84, 0, TAU); g.fill();
  const ring = g.createRadialGradient(-20, -24, 10, 0, 0, 84);
  ring.addColorStop(0, '#f0c27a'); ring.addColorStop(0.6, '#a86d2c'); ring.addColorStop(1, '#4b2c10');
  g.strokeStyle = ring; g.lineWidth = 16; g.beginPath(); g.arc(0, 0, 74, 0, TAU); g.stroke();
  g.strokeStyle = '#2a1808'; g.lineWidth = 2; g.beginPath(); g.arc(0, 0, 82, 0, TAU); g.stroke(); g.beginPath(); g.arc(0, 0, 66, 0, TAU); g.stroke();
  for (let i = 0; i < 6; i++) {
    const a = spin + (i / 6) * TAU;
    g.strokeStyle = '#6b4520'; g.lineWidth = 9; g.beginPath(); g.moveTo(Math.cos(a) * 20, Math.sin(a) * 20); g.lineTo(Math.cos(a) * 66, Math.sin(a) * 66); g.stroke();
    g.strokeStyle = '#c48d4c'; g.lineWidth = 2; g.stroke();
  }
  // motion blur sheen on the rim
  g.save(); g.globalCompositeOperation = 'lighter';
  for (let i = 0; i < 3; i++) { g.strokeStyle = `rgba(255,220,160,${0.18 - i * 0.05})`; g.lineWidth = 6; g.beginPath(); g.arc(0, 0, 74, spin * 1.0 + i * 0.25, spin + i * 0.25 + 0.9); g.stroke(); }
  g.restore();
  // belt to generator
  g.strokeStyle = '#0d0c0b'; g.lineWidth = 7; g.beginPath(); g.moveTo(-72, -40); g.lineTo(-150, -22); g.moveTo(-72, 40); g.lineTo(-150, 22); g.stroke();
  g.strokeStyle = '#2b2a27'; g.lineWidth = 2; g.setLineDash([6, 6]); g.lineDashOffset = -t * 60; g.stroke(); g.setLineDash([]);
  // generator housing (left) with coils
  plate(g, -196, -34, 60, 68);
  for (let i = 0; i < 5; i++) { g.fillStyle = i % 2 ? '#b8692c' : '#d98a46'; g.fillRect(-190 + i * 10, -26, 8, 52); }
  glowDot(g, -166, 0, 40, '#54f0ff', 0.55 + 0.25 * Math.sin(t * TAU * 1.5));
  // rider cab (right): a riveted window showing the rider on the dynamo bike
  plate(g, 132, -46, 92, 92);
  g.fillStyle = '#0c1118'; g.fillRect(140, -38, 76, 76);
  const sky = g.createLinearGradient(0, -38, 0, 38); sky.addColorStop(0, '#1f2b38'); sky.addColorStop(1, '#0c1118');
  g.fillStyle = sky; g.fillRect(140, -38, 76, 76);
  g.save(); g.beginPath(); g.rect(140, -38, 76, 76); g.clip();
  g.translate(176, 26); g.scale(2.2, 2.2); drawRider(g, look, t * 1.5, t * 6, { t, speed: 6 }); g.restore();
  g.strokeStyle = '#d9a417'; g.lineWidth = 3; g.strokeRect(140, -38, 76, 76);
  glowDot(g, 178, 0, 50, '#ffb04a', 0.15);
  // turret on the hub: twin flame nozzles (this wave's weapon)
  g.save(); g.rotate(aim);
  shell(g, 0, 0, 30, 30, { base: '#55524c', dark: '#1d1c1a', light: '#b5b0a5', glow: '', edge: '#0a0908' }, 0, 3);
  for (const sx of [-1, 1]) {
    g.fillStyle = '#2a2724'; g.strokeStyle = '#0a0908'; g.lineWidth = 2.5;
    g.fillRect(sx * 9 - 5, -58, 10, 40); g.strokeRect(sx * 9 - 5, -58, 10, 40);
    g.fillStyle = '#8c2f1c'; g.fillRect(sx * 9 - 6, -60, 12, 6);
  }
  plate(g, -14, -14, 28, 28);
  g.fillStyle = '#ff6a2a'; g.beginPath(); g.arc(0, 0, 6, 0, TAU); g.fill(); glowDot(g, 0, 0, 22, '#ff6a2a', 0.8);
  g.restore();
  g.restore();
}
function flame(g: G, x: number, y: number, ang: number, len: number, t: number) {
  g.save(); g.translate(x, y); g.rotate(ang); g.globalCompositeOperation = 'lighter';
  const r = rng(Math.floor(t * 30));
  for (let i = 0; i < 70; i++) {
    const u = Math.pow(r(), 0.8), d = 50 + u * len, spread = u * len * 0.22, px = (r() - 0.5) * spread * 2, s = 8 + u * 34;
    const hot = 1 - u;
    const gr = g.createRadialGradient(px, -d, 0, px, -d, s);
    gr.addColorStop(0, hot > 0.6 ? 'rgba(255,250,210,0.55)' : 'rgba(255,170,60,0.4)');
    gr.addColorStop(0.5, `rgba(255,${Math.round(80 + hot * 80)},20,${0.25 * (0.4 + hot)})`);
    gr.addColorStop(1, 'rgba(120,20,0,0)');
    g.fillStyle = gr; g.beginPath(); g.arc(px, -d, s, 0, TAU); g.fill();
  }
  g.restore();
  g.save(); g.translate(x, y); g.rotate(ang);
  for (let i = 0; i < 10; i++) { const u = ((t * 0.7 + i / 10) % 1), d = 60 + u * (len + 80); g.fillStyle = `rgba(40,30,28,${0.25 * u})`; g.beginPath(); g.arc(Math.sin(i * 7) * u * 50, -d, 14 + u * 30, 0, TAU); g.fill(); }
  g.restore();
}

/** Darkness with light pools punched out. */
function lighting(g: G, W: number, H: number, lights: Array<[number, number, number, number]>) {
  const c = document.createElement('canvas'); c.width = W; c.height = H;
  const l = c.getContext('2d')!;
  l.fillStyle = 'rgba(4,6,14,0.5)'; l.fillRect(0, 0, W, H);
  l.globalCompositeOperation = 'destination-out';
  for (const [x, y, r, a] of lights) {
    const gr = l.createRadialGradient(x, y, 0, x, y, r);
    gr.addColorStop(0, `rgba(0,0,0,${a})`); gr.addColorStop(1, 'rgba(0,0,0,0)');
    l.fillStyle = gr; l.beginPath(); l.arc(x, y, r, 0, TAU); l.fill();
  }
  g.drawImage(c, 0, 0);
  const v = g.createRadialGradient(W / 2, H * 0.6, Math.min(W, H) * 0.35, W / 2, H * 0.6, Math.max(W, H) * 0.8);
  v.addColorStop(0, 'rgba(0,0,0,0)'); v.addColorStop(1, 'rgba(0,0,0,0.6)');
  g.fillStyle = v; g.fillRect(0, 0, W, H);
}

// ---------- views ----------
const look = riderLook({ ...defaultProfile('Rider'), color: '#ff2bd6' } as never);

function placeBug(g: G, fn: BugFn, x: number, y: number, s: number, heading: number, t: number) {
  g.save(); g.translate(x, y); g.rotate(heading + Math.PI / 2); fn(g, s, t); g.restore();
}

function scene(W: number, H: number, t: number) {
  const g = setup(W, H);
  ground(g, W, H);
  const portrait = H > W;
  const bx = W / 2, by = H - (portrait ? 190 : 150);
  const sx = W / 1600, sy = (by - 0) / 850;
  const L = (pts: Pt[]): Pt[] => pts.map(([x, y]) => [x * sx, y * sy]);
  const lanes: Pt[][] = [
    L([[-60, 140], [480, 160], [300, 620], [800, 850]]),
    L([[800, -60], [560, 260], [1040, 480], [800, 850]]),
    L([[1660, 140], [1120, 160], [1300, 620], [800, 850]]),
  ];
  creep(g, 70 * sx, 140 * sy, 200 * Math.min(sx, 1), 21, t);
  creep(g, 800 * sx, 40 * sy, 230 * Math.min(sx, 1), 22, t);
  creep(g, 1530 * sx, 150 * sy, 200 * Math.min(sx, 1), 23, t);
  for (const c of lanes) trench(g, c, 84 * Math.min(1, sx * 1.1));
  // goo splats from earlier kills
  const rs = rng(5);
  for (let i = 0; i < 22; i++) { const c = lanes[i % 3], [x, y] = bez(c, 0.25 + rs() * 0.6); splat(g, x + (rs() - 0.5) * 30, y + (rs() - 0.5) * 30, 10 + rs() * 12, i % 2 ? 'rgba(170,60,20,0.7)' : 'rgba(40,150,190,0.6)', i); }
  // charred creep on the burned centre lane
  for (let i = 0; i < 8; i++) { const [x, y] = bez(lanes[1], 0.55 + i * 0.03); g.fillStyle = 'rgba(0,0,0,0.35)'; g.beginPath(); g.arc(x + (rs() - 0.5) * 40, y, 30 + rs() * 20, 0, TAU); g.fill(); }
  // towers + cables
  const pads: Array<[number, number, 'tesla' | 'mortar' | 'lens']> = [
    [430, 470, 'tesla'], [300, 720, 'mortar'], [1120, 470, 'lens'], [1250, 720, 'mortar'], [660, 360, 'tesla'],
  ];
  const P = pads.map(([x, y, k]) => [x * sx, y * sy, k] as const);
  const power = 1.1;
  for (const [x, y] of P) cable(g, [bx, by], [x, y], t, power);
  // bugs
  const enemies: Array<[BugFn, number, number, number, number]> = []; // fn, lane, u, size, gait offset
  for (let i = 0; i < 7; i++) enemies.push([skitter, 0, 0.18 + i * 0.06, 34, i * 0.37]);
  for (let i = 0; i < 4; i++) enemies.push([skitter, 2, 0.3 + i * 0.07, 34, i * 0.29]);
  enemies.push([warrior, 1, 0.62, 100, 0.1], [warrior, 1, 0.5, 100, 0.6], [ram, 1, 0.38, 104, 0.3], [warrior, 0, 0.62, 96, 0.45], [warrior, 2, 0.6, 96, 0.2]);
  enemies.push([bulwark, 2, 0.17, 100, 0.5], [broodmother, 1, 0.16, 130, 0.2]);
  const S = Math.min(1.3, sx * 1.4);
  for (const [fn, lane, u, s, o] of enemies) {
    const [x, y] = bez(lanes[lane], u), a = bezDir(lanes[lane], u);
    placeBug(g, fn, x, y, s * S, a, t * 1.3 + o);
  }
  // wasps in the air, off-lane
  for (const [x, y, a] of [[980, 300, 2.2], [1030, 250, 2.3], [920, 270, 2.0]] as const) placeBug(g, glider, x * sx, y * sy, 60 * S, a, t + x);
  // a burning beetle (death anim) + fresh splat
  const [dx, dy] = bez(lanes[1], 0.72);
  splat(g, dx, dy, 26 * S, 'rgba(190,70,20,0.8)', 99);
  g.save(); g.translate(dx, dy); g.rotate(2.6); g.globalAlpha = 0.85; g.filter = 'brightness(0.45) sepia(0.6)'; warrior(g, 92 * S, 0.37); g.restore();
  // towers on top
  const tgt0 = bez(lanes[0], 0.36), tgt2 = bez(lanes[2], 0.6), tgt4 = bez(lanes[0], 0.24);
  for (const [x, y, k] of P) {
    if (k === 'tesla') tesla(g, x, y, t, x < 600 * sx ? tgt0 : tgt4);
    else if (k === 'mortar') mortar(g, x, y, x < bx ? 0.3 : -0.3, t + x);
    else lens(g, x, y, tgt2, t);
  }
  // mortar shell in flight + impact
  const imp = bez(lanes[2], 0.44);
  for (let i = 0; i < 3; i++) glowDot(g, imp[0] + (i - 1) * 18, imp[1] + (i % 2) * 10, 50 - i * 10, '#ff9a3a', 0.5);
  // base + flamer on the red brood
  const aimAt = bez(lanes[1], 0.6), aim = Math.atan2(aimAt[0] - bx, by - aimAt[1]);
  flame(g, bx, by, aim, Math.min(560, (by - aimAt[1]) * 0.95), t);
  dynamoBase(g, bx, by, t, aim, look, Math.min(1, sx * 1.05));
  lighting(g, W, H, [
    [bx, by, 380, 1], [bx + Math.sin(aim) * 300, by - Math.cos(aim) * 300, 360, 1],
    ...P.map(([x, y]) => [x, y, 170, 0.85] as [number, number, number, number]),
    [imp[0], imp[1], 160, 0.9], [tgt2[0], tgt2[1], 140, 0.8],
    ...enemies.map(([, lane, u]) => { const [x, y] = bez(lanes[lane], u); return [x, y, 70, 0.55] as [number, number, number, number]; }),
    ...[[70 * sx, 140 * sy], [800 * sx, 40 * sy], [1530 * sx, 150 * sy]].map(([x, y]) => [x, y, 160, 0.4] as [number, number, number, number]),
  ]);
  // re-add emissive glows over the darkness
  flame(g, bx, by, aim, Math.min(560, (by - aimAt[1]) * 0.95), t + 0.03);
  for (const [x, y, k] of P) glowDot(g, x, y, 34, k === 'tesla' ? '#45d2ff' : k === 'lens' ? '#b97cff' : '#ff9a3a', 0.5);
  // wave card (announcement)
  const cw = Math.min(560, W - 40), cx = (W - cw) / 2, cy = 28;
  g.fillStyle = 'rgba(14,12,10,0.82)'; g.fillRect(cx, cy, cw, 84);
  g.fillStyle = '#d9a417'; for (let i = 0; i < cw; i += 18) { g.beginPath(); g.moveTo(cx + i, cy); g.lineTo(cx + i + 9, cy); g.lineTo(cx + i + 3, cy + 6); g.lineTo(cx + i - 6, cy + 6); g.fill(); }
  g.strokeStyle = '#ff6a2a'; g.lineWidth = 2; g.strokeRect(cx, cy, cw, 84);
  g.textAlign = 'center'; g.fillStyle = '#ff8a4a'; g.font = '800 30px system-ui, sans-serif';
  g.fillText('WAVE 12 · RED BROOD', W / 2, cy + 44);
  g.fillStyle = '#e8ded0'; g.font = '600 17px system-ui, sans-serif';
  g.fillText('FLAMER · resistance 35% · grind 70–80 rpm', W / 2, cy + 70);
}

function roster(W: number, H: number, t: number) {
  const g = setup(W, H);
  g.fillStyle = '#16130f'; g.fillRect(0, 0, W, H);
  const r = rng(4);
  for (let i = 0; i < 500; i++) { g.fillStyle = `rgba(${r() < 0.5 ? '0,0,0' : '120,105,85'},${0.04 + r() * 0.06})`; g.beginPath(); g.arc(r() * W, r() * H, 4 + r() * 24, 0, TAU); g.fill(); }
  g.fillStyle = '#e8ded0'; g.font = '800 30px system-ui, sans-serif'; g.textAlign = 'left';
  g.fillText('DYNAMO DEFENSE · XENO HIVE ROSTER (code-drawn concept v2)', 40, 52);
  g.fillStyle = 'rgba(232,222,208,0.6)'; g.font = '500 16px system-ui, sans-serif';
  g.fillText('Procedural parts + IK legs; colour = weakness. Every frame is drawn live, so walk cycles, hurt flashes and deaths are free.', 40, 80);
  const items: Array<[string, string, BugFn, number, string]> = [
    ['Skitter', 'swarm · Gatling', skitter, 130, AL.blue.glow],
    ['Glider', 'flier · Gatling', glider, 170, AL.blue.glow],
    ['Warrior', 'brute · Flamer', warrior, 200, AL.red.glow],
    ['Ram', 'charger · Flamer', ram, 190, AL.red.glow],
    ['Bulwark', 'armoured · Rail', bulwark, 200, AL.purple.glow],
    ['Broodmother', 'carrier · Rail', broodmother, 210, AL.purple.glow],
    ['Stalker', 'shifting colour', stalker, 230, '#ffffff'],
    ['Hive Tyrant', 'boss · phases', tyrant, 250, AL.gold.glow],
  ];

  const cols = 4, cw = (W - 80) / cols, ch = 340;
  items.forEach(([name, sub, fn, s, col], i) => {
    const cx = 40 + (i % cols) * cw + cw / 2, cy = 120 + Math.floor(i / cols) * (ch + 10) + ch / 2 - 10;
    g.fillStyle = 'rgba(0,0,0,0.25)'; g.fillRect(cx - cw / 2 + 8, cy - ch / 2 + 6, cw - 16, ch - 12);
    g.save(); g.translate(cx, cy - (fn === tyrant ? 30 : 20)); fn(g, s, t + i * 0.21); g.restore();
    g.textAlign = 'center'; g.fillStyle = col; g.font = '800 22px system-ui, sans-serif'; g.fillText(name.toUpperCase(), cx, cy + ch / 2 - 44);
    g.fillStyle = 'rgba(232,222,208,0.65)'; g.font = '500 15px system-ui, sans-serif'; g.fillText(sub, cx, cy + ch / 2 - 22);
  });
  // walk-cycle strip
  const y0 = H - 130;
  g.textAlign = 'left'; g.fillStyle = 'rgba(232,222,208,0.7)'; g.font = '700 16px system-ui, sans-serif';
  g.fillText('WARRIOR WALK CYCLE (8 phases) · HURT FLASH · DEATH', 40, y0 - 18);
  for (let k = 0; k < 8; k++) { g.save(); g.translate(100 + k * 140, y0 + 62); warrior(g, 110, k / 8); g.restore(); }
  g.save(); 
  g.save(); g.translate(1260, y0 + 62); g.filter = 'brightness(2.4) saturate(0.3)'; warrior(g, 110, 0.2); g.restore();
  splat(g, 1440, y0 + 62, 34, 'rgba(190,70,20,0.85)', 9);
  g.save(); g.translate(1440, y0 + 62); g.rotate(2.8); g.filter = 'brightness(0.45) sepia(0.6)'; warrior(g, 100, 0.37); g.restore();
  
}

function setup(W: number, H: number): G {
  const c = document.getElementById('c') as HTMLCanvasElement;
  c.width = W; c.height = H; c.style.width = `${W}px`; c.style.height = `${H}px`;
  return c.getContext('2d')!;
}

function draw(t: number) {
  if (view === 'roster') roster(1600, 1000, t);
  else if (view === 'portrait') scene(900, 1300, t);
  else scene(1600, 1000, t);
}
draw(T0);
(window as unknown as { __draw: (t: number) => void; __ready: boolean }).__draw = draw;
(window as unknown as { __ready: boolean }).__ready = true;
