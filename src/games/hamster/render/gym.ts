// Hamster Gym stations: barbells that are held, racked or resting on the floor, never floating.
// Lifters stand up and face the camera, so the bar reads end to end like a real gym poster.
import { FONT, FURS, TAU, hamster, rr, shadow, type Fur } from './draw';
type G = CanvasRenderingContext2D;
type P = { x: number; y: number };

export type GymKind = 'press' | 'squat' | 'deadlift' | 'curl';
export interface GymOpts { fur?: Fur; stopped?: boolean; phase?: number; mat?: boolean; plate?: string; rack?: boolean }
export interface UprightLook { fur?: Fur; sleep?: boolean; swole?: number; squash?: number; sweat?: boolean; band?: string }

const PLATES = ['#d8443c', '#3c7bd8', '#e0a326', '#3aa865'];

/** A hamster standing on its hind legs, facing us. Feet at (x, y); `s` ≈ standing height / 1.1. */
export function uprightHamster(g: G, x: number, y: number, s: number, hands: [P, P] | null, look: UprightLook = {}, time = 0) {
  const fur = look.fur ?? FURS.gerald, sw = look.swole ?? 0.8, sq = look.squash ?? 0, sleep = !!look.sleep;
  g.save(); g.translate(x, y); g.scale(1 + sq * 0.12, 1 - sq * 0.18);
  const lw = Math.max(1, s * 0.018);
  // feet
  g.fillStyle = '#f2a9b6'; for (const k of [-1, 1]) { g.beginPath(); g.ellipse(k * s * 0.15, -s * 0.03, s * 0.1, s * 0.045, 0, 0, TAU); g.fill(); }
  // body (pear)
  const by = -s * 0.4, brx = s * (0.3 + sw * 0.04), bry = s * 0.37;
  const bg = g.createRadialGradient(-brx * 0.35, by - bry * 0.5, s * 0.03, 0, by, brx * 1.25);
  bg.addColorStop(0, fur.light); bg.addColorStop(0.55, fur.mid); bg.addColorStop(1, fur.dark);
  g.fillStyle = bg; g.beginPath(); g.ellipse(0, by, brx, bry, 0, 0, TAU); g.fill();
  g.strokeStyle = fur.line; g.globalAlpha = 0.45; g.lineWidth = lw; g.stroke(); g.globalAlpha = 1;
  g.fillStyle = 'rgba(255,248,236,0.95)'; g.beginPath(); g.ellipse(0, by + s * 0.05, brx * 0.66, bry * 0.74, 0, 0, TAU); g.fill();
  if (sw > 0.05) {
    g.strokeStyle = 'rgba(170,110,70,0.55)'; g.lineWidth = Math.max(0.8, s * 0.014);
    g.beginPath(); g.moveTo(0, by - s * 0.12); g.lineTo(0, by + s * 0.22); g.stroke();
    for (let i = 0; i < 3; i++) { g.beginPath(); g.moveTo(-s * 0.09, by + i * s * 0.09); g.lineTo(s * 0.09, by + i * s * 0.09); g.stroke(); }
    g.beginPath(); g.arc(-s * 0.08, by - s * 0.15, s * 0.08, 0.2, Math.PI - 0.4); g.stroke();
    g.beginPath(); g.arc(s * 0.08, by - s * 0.15, s * 0.08, 0.4, Math.PI - 0.2); g.stroke();
  }
  if (look.band) { g.fillStyle = look.band; rr(g, -brx * 0.95, by + s * 0.12, brx * 1.9, s * 0.08, s * 0.03); g.fill(); }
  // head
  const hy = -s * 0.86, hr = s * 0.25;
  for (const k of [-1, 1]) {
    g.fillStyle = fur.mid; g.beginPath(); g.arc(k * hr * 0.72, hy - hr * 0.78, hr * 0.33, 0, TAU); g.fill();
    g.fillStyle = '#f7a8b8'; g.beginPath(); g.arc(k * hr * 0.72, hy - hr * 0.74, hr * 0.19, 0, TAU); g.fill();
  }
  const hg = g.createRadialGradient(-hr * 0.35, hy - hr * 0.45, 1, 0, hy, hr * 1.15);
  hg.addColorStop(0, fur.light); hg.addColorStop(0.6, fur.mid); hg.addColorStop(1, fur.dark);
  g.fillStyle = hg; g.beginPath(); g.ellipse(0, hy, hr * 1.08, hr * 0.95, 0, 0, TAU); g.fill();
  g.strokeStyle = fur.line; g.globalAlpha = 0.45; g.lineWidth = lw; g.stroke(); g.globalAlpha = 1;
  g.fillStyle = 'rgba(255,246,234,0.97)';
  for (const k of [-1, 1]) { g.beginPath(); g.ellipse(k * hr * 0.5, hy + hr * 0.45, hr * 0.5, hr * 0.38, k * 0.25, 0, TAU); g.fill(); }
  g.fillStyle = 'rgba(255,120,150,0.35)'; for (const k of [-1, 1]) { g.beginPath(); g.arc(k * hr * 0.62, hy + hr * 0.22, hr * 0.15, 0, TAU); g.fill(); }
  const blink = time % 5.3 > 5.15;
  for (const k of [-1, 1]) {
    const ex = k * hr * 0.4, ey = hy - hr * 0.1;
    if (sleep || blink) { g.strokeStyle = '#2a1408'; g.lineWidth = Math.max(1, s * 0.02); g.beginPath(); g.arc(ex, ey, hr * 0.16, 0.2, Math.PI - 0.2); g.stroke(); continue; }
    g.fillStyle = '#140a06'; g.beginPath(); g.arc(ex, ey, hr * 0.2, 0, TAU); g.fill();
    g.fillStyle = '#fff'; g.beginPath(); g.arc(ex + hr * 0.07, ey - hr * 0.08, hr * 0.075, 0, TAU); g.fill();
  }
  g.fillStyle = '#ff7f9c'; g.beginPath(); g.ellipse(0, hy + hr * 0.2, hr * 0.12, hr * 0.08, 0, 0, TAU); g.fill();
  g.strokeStyle = fur.line; g.lineWidth = Math.max(0.8, s * 0.012);
  g.beginPath(); g.moveTo(0, hy + hr * 0.28); g.lineTo(0, hy + hr * 0.38); g.moveTo(-hr * 0.14, hy + hr * 0.44); g.quadraticCurveTo(0, hy + hr * 0.5, hr * 0.14, hy + hr * 0.44); g.stroke();
  g.strokeStyle = 'rgba(255,255,255,0.7)'; g.lineWidth = Math.max(0.6, s * 0.007);
  for (const k of [-1, 1]) for (let i = -1; i <= 1; i++) { g.beginPath(); g.moveTo(k * hr * 0.25, hy + hr * 0.3); g.lineTo(k * hr * 1.2, hy + hr * (0.2 + i * 0.18)); g.stroke(); }
  g.restore();
  // arms are drawn in unsquashed space so hands land exactly on the bar
  const shY = y - s * 0.62 * (1 - sq * 0.18);
  if (hands) for (const k of [0, 1]) {
    const sh = { x: x + (k ? 1 : -1) * s * 0.24, y: shY }, h = hands[k];
    const el = { x: (sh.x + h.x) / 2 + (k ? 1 : -1) * s * 0.1, y: (sh.y + h.y) / 2 + s * 0.04 };
    g.lineCap = 'round'; g.lineJoin = 'round';
    g.strokeStyle = fur.line; g.globalAlpha = 0.35; g.lineWidth = s * 0.12 + sw * s * 0.03; g.beginPath(); g.moveTo(sh.x, sh.y); g.lineTo(el.x, el.y); g.lineTo(h.x, h.y); g.stroke(); g.globalAlpha = 1;
    g.strokeStyle = fur.mid; g.lineWidth = s * 0.095 + sw * s * 0.03; g.beginPath(); g.moveTo(sh.x, sh.y); g.lineTo(el.x, el.y); g.lineTo(h.x, h.y); g.stroke();
    if (sw > 0.4) { g.fillStyle = fur.mid; g.beginPath(); g.ellipse((sh.x + el.x) / 2, (sh.y + el.y) / 2, s * 0.09 * sw, s * 0.065 * sw, Math.atan2(el.y - sh.y, el.x - sh.x), 0, TAU); g.fill(); }
    g.fillStyle = '#f7b3bf'; g.beginPath(); g.arc(h.x, h.y, s * 0.055, 0, TAU); g.fill();
  }
  if (look.sweat && !sleep) { g.fillStyle = '#9ad8ff'; for (let i = 0; i < 2; i++) { const k = (time * 1.6 + i * 0.5) % 1; g.globalAlpha = 1 - k; g.beginPath(); g.ellipse(x + (i ? 1 : -1) * s * (0.3 + k * 0.1), y - s * (1.05 - k * 0.3), s * 0.025, s * 0.035, 0, 0, TAU); g.fill(); } g.globalAlpha = 1; }
  if (sleep) {
    g.fillStyle = '#fff'; g.font = `700 ${s * 0.22}px ${FONT}`; const k = time % 1.5 / 1.5; g.globalAlpha = 1 - k;
    g.fillText('z', x + s * 0.3, y - s * 1.1 - k * s * 0.3); g.fillText('Z', x + s * 0.45, y - s * 1.3 - k * s * 0.3); g.globalAlpha = 1;
  }
}

/** A barbell seen from the front, centred at (x, y). `half` is half the bar length. */
export function barbell(g: G, x: number, y: number, s: number, color: string, half = s * 0.72) {
  g.strokeStyle = '#c7cbd6'; g.lineWidth = Math.max(1.5, s * 0.045); g.lineCap = 'round';
  g.beginPath(); g.moveTo(x - half - s * 0.06, y); g.lineTo(x + half + s * 0.06, y); g.stroke();
  g.strokeStyle = 'rgba(255,255,255,0.5)'; g.lineWidth = Math.max(0.6, s * 0.012); g.beginPath(); g.moveTo(x - half, y - s * 0.012); g.lineTo(x + half, y - s * 0.012); g.stroke();
  for (const k of [-1, 1]) {
    const px = x + k * half;
    for (const [dx, ph, c] of [[0, 0.52, color], [0.1, 0.4, color]] as const) {
      const cx = px - k * s * 0.06 + k * dx * s, w = s * 0.085;
      g.fillStyle = c; rr(g, cx - w / 2, y - s * ph / 2, w, s * ph, s * 0.025); g.fill();
      g.fillStyle = 'rgba(0,0,0,0.25)'; g.fillRect(cx + (k > 0 ? w * 0.15 : -w * 0.5), y - s * ph / 2 + 2, w * 0.35, s * ph - 4);
      g.fillStyle = 'rgba(255,255,255,0.25)'; g.fillRect(cx - w * 0.35, y - s * ph / 2 + 2, w * 0.18, s * ph - 4);
    }
    g.fillStyle = '#8d92a0'; rr(g, px - k * s * 0.13 - s * 0.025, y - s * 0.07, s * 0.05, s * 0.14, s * 0.015); g.fill();
  }
}
function dumbbell(g: G, x: number, y: number, s: number) {
  g.strokeStyle = '#a9adb8'; g.lineWidth = Math.max(1.2, s * 0.035); g.beginPath(); g.moveTo(x - s * 0.1, y); g.lineTo(x + s * 0.1, y); g.stroke();
  g.fillStyle = '#4a4e59'; for (const k of [-1, 1]) { rr(g, x + k * s * 0.11 - s * 0.04, y - s * 0.09, s * 0.08, s * 0.18, s * 0.025); g.fill(); }
  g.fillStyle = 'rgba(255,255,255,0.22)'; for (const k of [-1, 1]) g.fillRect(x + k * s * 0.11 - s * 0.025, y - s * 0.07, s * 0.012, s * 0.14);
}
function mat(g: G, x: number, y: number, s: number, w = 1) {
  shadow(g, x, y + s * 0.02, s * 0.95 * w, s * 0.12, 0.35);
  g.fillStyle = '#26282e'; rr(g, x - s * 0.9 * w, y - s * 0.04, s * 1.8 * w, s * 0.1, s * 0.04); g.fill();
  g.fillStyle = 'rgba(255,255,255,0.07)'; g.fillRect(x - s * 0.85 * w, y - s * 0.04, s * 1.7 * w, s * 0.02);
}
function rackPost(g: G, x: number, top: number, y: number, s: number, hookY: number, side: number) {
  g.fillStyle = '#5b5f6b'; rr(g, x - s * 0.035, top, s * 0.07, y - top, s * 0.02); g.fill();
  g.fillStyle = '#2f3138'; for (let yy = top + s * 0.08; yy < y - s * 0.1; yy += s * 0.15) g.fillRect(x - s * 0.01, yy, s * 0.02, s * 0.04);
  g.strokeStyle = '#2f3138'; g.lineWidth = s * 0.035; g.lineCap = 'round';
  g.beginPath(); g.moveTo(x, hookY + s * 0.04); g.lineTo(x - side * s * 0.1, hookY + s * 0.04); g.lineTo(x - side * s * 0.12, hookY - s * 0.04); g.stroke();
}
const rep = (o: GymOpts, t: number, rate = 2.2) => o.stopped ? 0 : 0.5 - 0.5 * Math.cos(t * rate + (o.phase ?? 0));

/** One gym station with its feet on the floor at (x, y). `s` ≈ the lifter's size (like `hamster()`'s `s`). */
export function gymStation(g: G, x: number, y: number, s: number, kind: GymKind, t: number, o: GymOpts = {}) {
  const fur = o.fur ?? FURS.gerald, stopped = !!o.stopped, color = o.plate ?? PLATES[['press', 'squat', 'deadlift', 'curl'].indexOf(kind)];
  const look: UprightLook = { fur, sleep: stopped, sweat: !stopped };
  g.save();
  if (o.mat !== false) mat(g, x, y, s);
  if (kind === 'press') {
    const k = rep(o, t);
    if (stopped) { barbell(g, x, y - s * 0.26, s, color); uprightHamster(g, x, y - s * 0.02, s * 0.9, null, look, t); }
    else {
      const by = y - s * (0.7 + k * 0.62), hx = s * (0.36 - k * 0.02);
      uprightHamster(g, x, y, s, [{ x: x - hx, y: by }, { x: x + hx, y: by }], { ...look, swole: 0.6 + k * 0.4 }, t);
      barbell(g, x, by, s, color);
    }
  } else if (kind === 'squat') {
    const k = rep(o, t, 1.8), hookY = y - s * 0.98;
    if (o.rack !== false) { rackPost(g, x - s * 0.8, y - s * 1.35, y, s, hookY, -1); rackPost(g, x + s * 0.8, y - s * 1.35, y, s, hookY, 1); }
    if (stopped) { barbell(g, x, hookY, s, color); uprightHamster(g, x, y - s * 0.02, s * 0.9, null, look, t); }
    else {
      const sq = k, by = y - s * 0.9 * (1 - sq * 0.18);
      barbell(g, x, by, s, color);
      uprightHamster(g, x, y, s, [{ x: x - s * 0.3, y: by + s * 0.02 }, { x: x + s * 0.3, y: by + s * 0.02 }], { ...look, squash: sq }, t);
    }
    g.fillStyle = '#4a4d58'; rr(g, x - s * 0.9, y - s * 0.035, s * 1.8, s * 0.05, s * 0.02); g.fill();
  } else if (kind === 'deadlift') {
    const k = rep(o, t, 1.6), rest = y - s * 0.26;
    const by = stopped ? rest : rest - k * s * 0.18;
    if (stopped) { barbell(g, x, rest, s, color); uprightHamster(g, x - s * 0.02, y - s * 0.02, s * 0.9, null, look, t); }
    else {
      uprightHamster(g, x, y, s, [{ x: x - s * 0.26, y: by }, { x: x + s * 0.26, y: by }], { ...look, squash: (1 - k) * 0.55, swole: 0.9 }, t);
      barbell(g, x, by, s, color);
    }
  } else {
    // alternating dumbbell curls
    const k = rep(o, t, 2.8), k2 = o.stopped ? 0 : 0.5 + 0.5 * Math.cos(t * 2.8 + (o.phase ?? 0));
    if (stopped) { dumbbell(g, x - s * 0.55, y - s * 0.09, s); dumbbell(g, x + s * 0.55, y - s * 0.09, s); uprightHamster(g, x, y - s * 0.02, s * 0.9, null, look, t); }
    else {
      const hand = (side: number, kk: number) => ({ x: x + side * s * (0.36 - kk * 0.12), y: y - s * (0.36 + kk * 0.34) });
      const L = hand(-1, k), R = hand(1, k2);
      uprightHamster(g, x, y, s, [L, R], { ...look, swole: 1 }, t);
      dumbbell(g, L.x, L.y, s); dumbbell(g, R.x, R.y, s);
    }
  }
  g.restore();
}

/** The current art, kept for before/after comparison. */
export function gymBefore(g: G, gx: number, gy: number, k: number, t: number, stopped: boolean) {
  const lift = stopped ? 0 : Math.abs(Math.sin(t * 3 + k)) * 14;
  shadow(g, gx, gy, 24, 5);
  hamster(g, gx, gy, 30, 0, { swole: 0.8, sleep: stopped, noShadow: true, fur: k % 2 ? FURS.gerald : FURS.grey }, t);
  g.strokeStyle = '#ccd'; g.lineWidth = 3; g.beginPath(); g.moveTo(gx - 10, gy - 34 - lift); g.lineTo(gx + 24, gy - 34 - lift); g.stroke();
  g.fillStyle = '#222'; rr(g, gx - 16, gy - 42 - lift, 7, 16, 2); g.fill(); rr(g, gx + 21, gy - 42 - lift, 7, 16, 2); g.fill();
}

/** A wall mirror; `scene` draws a faint reflection inside it. */
export function mirror(g: G, x: number, y: number, w: number, h: number, scene?: () => void) {
  g.fillStyle = '#8a8f9c'; rr(g, x - 3, y - 3, w + 6, h + 6, 4); g.fill();
  const mg = g.createLinearGradient(x, y, x + w, y + h); mg.addColorStop(0, '#9fb3c4'); mg.addColorStop(0.5, '#7d93a6'); mg.addColorStop(1, '#a3b6c6');
  g.fillStyle = mg; g.fillRect(x, y, w, h);
  g.save(); g.beginPath(); g.rect(x, y, w, h); g.clip();
  if (scene) { g.globalAlpha = 0.3; scene(); g.globalAlpha = 1; }
  for (const [a, b, al] of [[0.15, 0.3, 0.3], [0.38, 0.44, 0.18], [0.7, 0.8, 0.22]] as const) {
    g.fillStyle = `rgba(255,255,255,${al})`; g.beginPath(); g.moveTo(x + w * a, y); g.lineTo(x + w * b, y); g.lineTo(x + w * b - h * 0.5, y + h); g.lineTo(x + w * a - h * 0.5, y + h); g.closePath(); g.fill();
  }
  g.restore();
}
