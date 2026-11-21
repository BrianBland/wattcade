// Ferret Turbines: a real ferret in a real tube, turning something you can see turn.
import { FONT, TAU, rr, shadow } from './draw';
import { ferret } from './critters';
type G = CanvasRenderingContext2D;
type P = { x: number; y: number };

function rotor(g: G, x: number, y: number, r: number, ang: number, blades = 6, color = '#d9dde6') {
  g.save(); g.translate(x, y); g.rotate(ang);
  for (let i = 0; i < blades; i++) {
    g.rotate(TAU / blades);
    g.fillStyle = i % 2 ? color : '#b4bac6';
    g.beginPath(); g.moveTo(r * 0.12, -r * 0.08); g.quadraticCurveTo(r * 0.6, -r * 0.42, r * 0.96, -r * 0.12); g.lineTo(r * 0.92, r * 0.08); g.quadraticCurveTo(r * 0.5, r * 0.02, r * 0.12, r * 0.08); g.closePath(); g.fill();
  }
  g.restore();
  g.fillStyle = '#7a8090'; g.beginPath(); g.arc(x, y, r * 0.16, 0, TAU); g.fill();
  g.fillStyle = '#e7ebf2'; g.beginPath(); g.arc(x - r * 0.04, y - r * 0.04, r * 0.06, 0, TAU); g.fill();
}
function bolt(g: G, x: number, y: number, r: number) {
  g.fillStyle = '#ffd84a'; g.beginPath(); g.moveTo(x + r * 0.2, y - r); g.lineTo(x - r * 0.5, y + r * 0.1); g.lineTo(x, y + r * 0.1); g.lineTo(x - r * 0.2, y + r); g.lineTo(x + r * 0.5, y - r * 0.1); g.lineTo(x, y - r * 0.1); g.closePath(); g.fill();
}
function glassTube(g: G, path: () => void, w: number) {
  g.lineCap = 'round'; g.lineJoin = 'round';
  g.strokeStyle = 'rgba(40,60,80,0.35)'; g.lineWidth = w + 4; path(); g.stroke();
  g.strokeStyle = 'rgba(170,225,255,0.22)'; g.lineWidth = w; path(); g.stroke();
}
function glassShine(g: G, path: () => void, w: number) {
  g.save(); g.translate(0, -w * 0.28); g.strokeStyle = 'rgba(255,255,255,0.45)'; g.lineWidth = Math.max(1.5, w * 0.1); path(); g.stroke(); g.restore();
  g.save(); g.translate(0, w * 0.32); g.strokeStyle = 'rgba(255,255,255,0.12)'; g.lineWidth = Math.max(1, w * 0.06); path(); g.stroke(); g.restore();
}

/** A: a glass racetrack loop around a turbine hub. The ferret laps it; the rotor spins. (x, y) is the base centre. */
export function ferretLoop(g: G, x: number, y: number, u: number, t: number, speed: number, stopped: boolean, phase = 0) {
  const a = u * 1.15, b = u * 0.5, cx = x, cy = y - u * 0.95, tw = u * 0.42, L = (a - b) * 2, P = L * 2 + Math.PI * b * 2;
  // stand
  shadow(g, x, y, u * 1.1, u * 0.12, 0.35);
  g.fillStyle = '#5c616e'; g.fillRect(x - u * 0.06, cy, u * 0.12, y - cy); rr(g, x - u * 0.7, y - u * 0.07, u * 1.4, u * 0.08, u * 0.03); g.fill();
  const stad = (dx = 0) => { g.beginPath(); g.moveTo(cx - (a - b), cy + b + dx); g.lineTo(cx + (a - b), cy + b + dx); g.arc(cx + (a - b), cy, b + dx, Math.PI / 2, -Math.PI / 2, true); g.lineTo(cx - (a - b), cy - b - dx); g.arc(cx - (a - b), cy, b + dx, -Math.PI / 2, Math.PI / 2, true); g.closePath(); };
  glassTube(g, () => stad(), tw);
  // hub housing
  g.fillStyle = '#b07a3a'; g.beginPath(); g.arc(cx, cy, b * 0.62, 0, TAU); g.fill();
  g.fillStyle = '#2a2f3a'; g.beginPath(); g.arc(cx, cy, b * 0.52, 0, TAU); g.fill();
  const spin = stopped ? 0 : t * 6 * speed + phase;
  rotor(g, cx, cy, b * 0.5, spin);
  g.strokeStyle = '#e3b56c'; g.lineWidth = Math.max(1, u * 0.025); g.beginPath(); g.arc(cx, cy, b * 0.6, Math.PI * 1.1, Math.PI * 1.6); g.stroke();
  // ferret position along the loop (feet against the outer wall)
  const d = (((stopped ? 0.15 : t * 0.35 * speed) + phase) % 1) * P, off = tw * 0.32;
  let pos: P, ang: number;
  if (d < L) { pos = { x: cx - (a - b) + d, y: cy + b + off }; ang = 0; }
  else if (d < L + Math.PI * b) { const th = Math.PI / 2 - (d - L) / b; pos = { x: cx + (a - b) + Math.cos(th) * (b + off), y: cy + Math.sin(th) * (b + off) }; ang = th - Math.PI / 2; }
  else if (d < L * 2 + Math.PI * b) { pos = { x: cx + (a - b) - (d - L - Math.PI * b), y: cy - b - off }; ang = Math.PI; }
  else { const th = -Math.PI / 2 - (d - 2 * L - Math.PI * b) / b; pos = { x: cx - (a - b) + Math.cos(th) * (b + off), y: cy + Math.sin(th) * (b + off) }; ang = th - Math.PI / 2; }
  g.save(); g.translate(pos.x, pos.y); g.rotate(ang); ferret(g, 0, 0, u * 0.62, t * 9 * speed, { noShadow: true, sleep: stopped }, t); g.restore();
  glassShine(g, () => stad(), tw);
  // brass collars and output
  for (const k of [-1, 1]) { g.fillStyle = '#c99a52'; rr(g, cx + k * (a - b) - u * 0.04, cy + b - tw * 0.6, u * 0.08, tw * 1.2, u * 0.02); g.fill(); rr(g, cx + k * (a - b) - u * 0.04, cy - b - tw * 0.6, u * 0.08, tw * 1.2, u * 0.02); g.fill(); }
  if (!stopped && Math.sin(t * 7 + phase * 9) > 0.6) bolt(g, cx + a + u * 0.15, cy - b, u * 0.12);
}

/** B: glass pipe that snakes across the floor into a turbine box. `from`→`to` in scene coords. */
export function ferretPipe(g: G, from: P, to: P, u: number, t: number, speed: number, stopped: boolean, phase = 0, lift = 0.6, box = true) {
  const c1 = { x: from.x + (to.x - from.x) * 0.35, y: from.y - u * lift }, c2 = { x: from.x + (to.x - from.x) * 0.65, y: to.y + u * lift };
  const path = () => { g.beginPath(); g.moveTo(from.x, from.y); g.bezierCurveTo(c1.x, c1.y, c2.x, c2.y, to.x, to.y); };
  const bez = (p: number): [P, number] => {
    const q = 1 - p, x = q ** 3 * from.x + 3 * q * q * p * c1.x + 3 * q * p * p * c2.x + p ** 3 * to.x, y = q ** 3 * from.y + 3 * q * q * p * c1.y + 3 * q * p * p * c2.y + p ** 3 * to.y;
    const dx = 3 * q * q * (c1.x - from.x) + 6 * q * p * (c2.x - c1.x) + 3 * p * p * (to.x - c2.x), dy = 3 * q * q * (c1.y - from.y) + 6 * q * p * (c2.y - c1.y) + 3 * p * p * (to.y - c2.y);
    return [{ x, y }, Math.atan2(dy, dx)];
  };
  const tw = u * 0.42;
  glassTube(g, path, tw);
  const p = stopped ? 0.55 : ((t * 0.22 * speed + phase) % 1) * 0.9;
  const [pos, ang] = bez(p);
  g.save(); g.translate(pos.x, pos.y); g.rotate(ang); g.translate(0, tw * 0.32); ferret(g, 0, 0, u * 0.62, t * 9 * speed, { noShadow: true, sleep: stopped }, t); g.restore();
  glassShine(g, path, tw);
  for (const k of [0.2, 0.45, 0.7]) { const [cp, ca] = bez(k); g.save(); g.translate(cp.x, cp.y); g.rotate(ca); g.fillStyle = '#c99a52'; rr(g, -u * 0.04, -tw * 0.6, u * 0.08, tw * 1.2, u * 0.02); g.fill(); g.restore(); }
  if (box) turbineBox(g, to, u, t, speed, stopped, phase);
}
/** The turbine housing a pipe run ends in; `at` is the pipe mouth on its left side. */
export function turbineBox(g: G, at: P, u: number, t: number, speed: number, stopped: boolean, phase = 0) {
  const bx = at.x, by = at.y;
  shadow(g, bx + u * 0.3, by + u * 0.55, u * 0.6, u * 0.08, 0.3);
  g.fillStyle = '#4b5160'; rr(g, bx - u * 0.05, by - u * 0.5, u * 0.75, u * 1.05, u * 0.08); g.fill();
  g.strokeStyle = '#2a2e38'; g.lineWidth = 2; g.stroke();
  g.fillStyle = '#20242d'; g.beginPath(); g.arc(bx + u * 0.33, by - u * 0.02, u * 0.3, 0, TAU); g.fill();
  rotor(g, bx + u * 0.33, by - u * 0.02, u * 0.28, stopped ? 0 : t * 7 * speed + phase);
  g.strokeStyle = '#8a91a2'; g.lineWidth = Math.max(1, u * 0.03); for (let i = -2; i <= 2; i++) { g.beginPath(); g.moveTo(bx + u * 0.03, by - u * 0.02 + i * u * 0.1); g.lineTo(bx + u * 0.63, by - u * 0.02 + i * u * 0.1); g.stroke(); }
  g.fillStyle = stopped ? '#6a4a44' : (Math.sin(t * 5) > 0 ? '#9cff8a' : '#4f8a46'); g.beginPath(); g.arc(bx + u * 0.6, by - u * 0.42, u * 0.04, 0, TAU); g.fill();
  g.fillStyle = '#e8dcc0'; g.font = `800 ${Math.max(6, u * 0.09)}px ${FONT}`; g.textAlign = 'center'; g.fillText('TURBINE', bx + u * 0.33, by + u * 0.46); g.textAlign = 'left';
}

/** C: a jet-engine nacelle with a cutaway window; the ferret runs a roller inside, the fan spins at the intake. */
export function ferretJet(g: G, x: number, y: number, u: number, t: number, speed: number, stopped: boolean, phase = 0) {
  const cy = y - u * 0.95, L = u * 1.25, R = u * 0.5, spin = stopped ? 0 : t * 9 * speed + phase;
  shadow(g, x, y, u * 1.1, u * 0.1, 0.35);
  // pylon stand
  g.fillStyle = '#545a68'; g.beginPath(); g.moveTo(x - u * 0.3, y); g.lineTo(x - u * 0.12, cy + R * 0.6); g.lineTo(x + u * 0.12, cy + R * 0.6); g.lineTo(x + u * 0.3, y); g.closePath(); g.fill();
  rr(g, x - u * 0.55, y - u * 0.06, u * 1.1, u * 0.07, u * 0.03); g.fill();
  // exhaust heat shimmer
  if (!stopped) for (let i = 0; i < 4; i++) { const k = (t * 1.4 * speed + i / 4 + phase) % 1; g.fillStyle = `rgba(255,170,90,${0.25 * (1 - k)})`; g.beginPath(); g.ellipse(x - L - u * 0.1 - k * u * 0.6, cy + Math.sin(t * 9 + i) * u * 0.04, u * 0.08 + k * u * 0.12, R * (0.35 + k * 0.2), 0, 0, TAU); g.fill(); }
  // body
  const body = () => { g.beginPath(); g.moveTo(x - L, cy - R * 0.5); g.quadraticCurveTo(x - L * 0.3, cy - R * 1.02, x + L * 0.75, cy - R); g.lineTo(x + L * 0.75, cy + R); g.quadraticCurveTo(x - L * 0.3, cy + R * 1.02, x - L, cy + R * 0.5); g.closePath(); };
  const mg = g.createLinearGradient(0, cy - R, 0, cy + R); mg.addColorStop(0, '#eef1f6'); mg.addColorStop(0.35, '#b9c0cc'); mg.addColorStop(1, '#5d6472');
  g.fillStyle = mg; body(); g.fill(); g.strokeStyle = '#3a404c'; g.lineWidth = 1.5; g.stroke();
  // exhaust nozzle
  g.fillStyle = '#3a3f4a'; g.beginPath(); g.ellipse(x - L, cy, R * 0.16, R * 0.5, 0, 0, TAU); g.fill();
  g.fillStyle = stopped ? '#3a2a26' : '#ff8a3a'; g.beginPath(); g.ellipse(x - L - R * 0.02, cy, R * 0.09, R * 0.32, 0, 0, TAU); g.fill();
  // panel lines + stencil
  g.strokeStyle = 'rgba(40,46,58,0.35)'; g.lineWidth = 1; for (const k of [-0.55, 0.45]) { g.beginPath(); g.moveTo(x + L * k, cy - R * 0.95); g.lineTo(x + L * k, cy + R * 0.95); g.stroke(); }
  g.fillStyle = 'rgba(40,46,58,0.7)'; g.font = `800 ${Math.max(6, u * 0.085)}px ${FONT}`; g.textAlign = 'center'; g.fillText('FERRET-1', x - L * 0.68, cy + R * 0.68); g.textAlign = 'left';
  // cutaway window with the ferret on a roller
  const wx = x - L * 0.42, ww = L * 0.95, wy = cy - R * 0.62, wh = R * 1.24;
  g.fillStyle = '#1d2230'; rr(g, wx, wy, ww, wh, u * 0.08); g.fill();
  g.save(); rr(g, wx, wy, ww, wh, u * 0.08); g.clip();
  const ry = wy + wh * 0.78;
  g.fillStyle = '#3b4252'; g.fillRect(wx, ry, ww, wh);
  g.strokeStyle = '#7c8496'; g.lineWidth = 1.5; const roll = (stopped ? 0 : t * u * 1.6 * speed) % (u * 0.16);
  for (let k = -1; k < ww / (u * 0.16) + 1; k++) { const lx = wx + k * u * 0.16 - roll; g.beginPath(); g.moveTo(lx, ry + 2); g.lineTo(lx - u * 0.04, ry + wh * 0.2); g.stroke(); }
  ferret(g, wx + ww * 0.5, ry, u * 0.62, t * 10 * speed, { noShadow: true, sleep: stopped }, t);
  g.fillStyle = 'rgba(170,225,255,0.14)'; g.fillRect(wx, wy, ww, wh);
  g.fillStyle = 'rgba(255,255,255,0.3)'; g.beginPath(); g.moveTo(wx + ww * 0.1, wy); g.lineTo(wx + ww * 0.22, wy); g.lineTo(wx + ww * 0.06, wy + wh); g.lineTo(wx - ww * 0.06, wy + wh); g.closePath(); g.fill();
  g.restore();
  g.strokeStyle = '#c99a52'; g.lineWidth = Math.max(1.5, u * 0.035); rr(g, wx, wy, ww, wh, u * 0.08); g.stroke();
  // intake cowl + fan (seen from the side, slightly towards us)
  g.fillStyle = '#d7dce5'; g.beginPath(); g.ellipse(x + L * 0.75, cy, R * 0.3, R * 1.02, 0, 0, TAU); g.fill();
  g.fillStyle = '#1b1f28'; g.beginPath(); g.ellipse(x + L * 0.77, cy, R * 0.24, R * 0.88, 0, 0, TAU); g.fill();
  g.save(); g.translate(x + L * 0.77, cy); g.scale(0.27, 1); rotor(g, 0, 0, R * 0.86, spin, 10); g.restore();
  g.strokeStyle = 'rgba(255,255,255,0.6)'; g.lineWidth = 1.5; g.beginPath(); g.ellipse(x + L * 0.75, cy, R * 0.3, R * 1.02, 0, Math.PI * 1.15, Math.PI * 1.6); g.stroke();
  if (!stopped && Math.sin(t * 6 + phase * 7) > 0.7) bolt(g, x + L * 0.2, cy - R - u * 0.15, u * 0.11);
}

/** The current art, kept for before/after comparison. */
export function ferretBefore(g: G, x: number, w: number, ty: number, k: number, t: number, stopped: boolean) {
  const cy1 = ty - 50, cy2 = ty + 40, ey = ty - 20;
  const path = (dy: number) => { g.beginPath(); g.moveTo(x, ty + dy); g.bezierCurveTo(x + w * 0.35, cy1 + dy, x + w * 0.6, cy2 + dy, x + w, ey + dy); };
  g.strokeStyle = 'rgba(150,220,255,0.28)'; g.lineWidth = 16; path(0); g.stroke();
  g.strokeStyle = 'rgba(255,255,255,0.35)'; g.lineWidth = 2; path(-6); g.stroke();
  const p = (t * (stopped ? 0 : 0.25) + k * 0.27) % 1, q = 1 - p, bx = x + (3 * q * q * p * 0.35 + 3 * q * p * p * 0.6 + p ** 3) * w;
  const by = q ** 3 * ty + 3 * q * q * p * cy1 + 3 * q * p * p * cy2 + p ** 3 * ey;
  g.fillStyle = '#f4ead8'; g.beginPath(); g.ellipse(bx, by, 14, 5, 0, 0, TAU); g.fill(); g.fillStyle = '#222'; g.fillRect(bx + 9, by - 2, 2, 2);
}
