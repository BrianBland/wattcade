export type G = CanvasRenderingContext2D;
export type P = [number, number];

export const SKIN = '#f1c27d';
export const TAU = Math.PI * 2;

export function line(g: G, c: string, w: number, ...pts: P[]) {
  g.strokeStyle = c; g.lineWidth = w; g.lineCap = 'round'; g.lineJoin = 'round';
  g.beginPath(); g.moveTo(pts[0][0], pts[0][1]); for (let i = 1; i < pts.length; i++) g.lineTo(pts[i][0], pts[i][1]); g.stroke();
}
export function poly(g: G, c: string, ...pts: P[]) {
  g.fillStyle = c; g.beginPath(); g.moveTo(pts[0][0], pts[0][1]); for (let i = 1; i < pts.length; i++) g.lineTo(pts[i][0], pts[i][1]); g.closePath(); g.fill();
}
export function circle(g: G, c: string, x: number, y: number, r: number) {
  g.fillStyle = c; g.beginPath(); g.arc(x, y, r, 0, TAU); g.fill();
}
export function ring(g: G, c: string, w: number, x: number, y: number, r: number) {
  g.strokeStyle = c; g.lineWidth = w; g.beginPath(); g.arc(x, y, r, 0, TAU); g.stroke();
}
/** Filled ellipse; `half` = only the top half (a dome). */
export function oval(g: G, c: string, x: number, y: number, rx: number, ry: number, rot = 0, half = false) {
  g.fillStyle = c; g.beginPath(); g.ellipse(x, y, rx, ry, rot, half ? Math.PI : 0, half ? TAU : TAU); if (half) g.closePath(); g.fill();
}
export function rect(g: G, c: string, x: number, y: number, w: number, h: number) { g.fillStyle = c; g.fillRect(x, y, w, h); }
export function quad(g: G, c: string, w: number, a: P, ctrl: P, b: P) {
  g.strokeStyle = c; g.lineWidth = w; g.lineCap = 'round';
  g.beginPath(); g.moveTo(a[0], a[1]); g.quadraticCurveTo(ctrl[0], ctrl[1], b[0], b[1]); g.stroke();
}

/**
 * Two-bone joint between `a` and `b` (limb lengths l1, l2). `bend` +1 bends toward +x for a limb pointing down
 * (knees forward); -1 the other way (elbows down/back). Unreachable targets straighten the limb.
 */
export function joint(a: P, b: P, l1: number, l2: number, bend: 1 | -1 = 1): P {
  const dx = b[0] - a[0], dy = b[1] - a[1];
  const dist = Math.min(l1 + l2 - 0.01, Math.max(0.1, Math.hypot(dx, dy)));
  const ang = Math.atan2(dy, dx);
  const k = Math.acos(Math.min(1, Math.max(-1, (l1 * l1 + dist * dist - l2 * l2) / (2 * l1 * dist))));
  const t = ang - bend * k;
  return [a[0] + l1 * Math.cos(t), a[1] + l1 * Math.sin(t)];
}

/** Shade a hex colour: f < 1 darker, f > 1 lighter. */
export function shade(hex: string, f: number): string {
  const m = /^#?([0-9a-f]{6})/i.exec(hex);
  if (!m) return hex;
  const n = parseInt(m[1], 16), ch = (s: number) => Math.max(0, Math.min(255, Math.round(f <= 1 ? ((n >> s) & 255) * f : ((n >> s) & 255) + (255 - ((n >> s) & 255)) * (f - 1))));
  return `#${((ch(16) << 16) | (ch(8) << 8) | ch(0)).toString(16).padStart(6, '0')}`;
}
