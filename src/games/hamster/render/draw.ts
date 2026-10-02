// Shared Canvas 2D primitives for HAMSTERGRID: rounded rects, the hamster, the wheel.
type G = CanvasRenderingContext2D;
export const TAU = Math.PI * 2;
export const hash = (n: number) => { const x = Math.sin(n * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); };
export const FONT = 'ui-rounded,"SF Pro Rounded","Nunito","Varela Round","Segoe UI",system-ui,sans-serif';
export const COMIC = '"Comic Sans MS","Chalkboard SE","Comic Neue",cursive';

export function rr(g: G, x: number, y: number, w: number, h: number, r: number) {
  r = Math.max(0, Math.min(r, w / 2, h / 2));
  g.beginPath();
  g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath();
}
export function shadow(g: G, x: number, y: number, rx: number, ry: number, a = 0.28) {
  const gr = g.createRadialGradient(x, y, 0, x, y, rx);
  gr.addColorStop(0, `rgba(0,0,0,${a})`); gr.addColorStop(1, 'rgba(0,0,0,0)');
  g.save(); g.translate(x, y); g.scale(1, ry / rx); g.translate(-x, -y);
  g.fillStyle = gr; g.beginPath(); g.arc(x, y, rx, 0, TAU); g.fill(); g.restore();
}
export function glow(g: G, x: number, y: number, r: number, color: string, a = 0.5) {
  const gr = g.createRadialGradient(x, y, 0, x, y, r);
  gr.addColorStop(0, color.replace('A', String(a))); gr.addColorStop(1, color.replace('A', '0'));
  g.fillStyle = gr; g.beginPath(); g.arc(x, y, r, 0, TAU); g.fill();
}

// ---------- hamster ----------
export interface Fur { light: string; mid: string; dark: string; line: string }
export const FURS: Record<string, Fur> = {
  gerald: { light: '#ffd9a0', mid: '#eaa257', dark: '#b8672a', line: '#7a3e14' },
  gerbil: { light: '#f3e2c0', mid: '#d6b98a', dark: '#a8875a', line: '#6a5230' },
  guinea: { light: '#d9a77a', mid: '#9a6038', dark: '#5e3418', line: '#3a1e0a' },
  white: { light: '#ffffff', mid: '#efe8f2', dark: '#c4b8cc', line: '#7a6a88' },
  grey: { light: '#e2e2ea', mid: '#a8a8b8', dark: '#6a6a7a', line: '#3a3a4a' },
  golden: { light: '#fff6b0', mid: '#ffcf3a', dark: '#c88a00', line: '#7a5200' },
  rage: { light: '#ffb08a', mid: '#e8603a', dark: '#a82a10', line: '#5a1000' },
  pink: { light: '#ffe0ff', mid: '#ff9ef0', dark: '#c060b8', line: '#702a6a' },
};
export interface Look {
  fur?: Fur; swole?: number; shades?: boolean; rage?: boolean; halo?: boolean; bigHead?: boolean;
  sign?: string; sleep?: boolean; flip?: boolean; noShadow?: boolean; sweat?: boolean;
}
/** A hamster in side view facing right with feet at (x, y). `s` ≈ body length. `p` = run-cycle phase (radians). */
export function hamster(g: G, x: number, y: number, s: number, p: number, look: Look = {}, time = 0) {
  const fur = look.fur ?? FURS.gerald, sw = look.swole ?? 0, still = !!look.sleep;
  g.save(); g.translate(x, y);
  if (!look.noShadow) shadow(g, 0, 0, s * 0.42, s * 0.07, 0.3);
  if (look.flip) g.scale(-1, 1);
  const bob = still ? 0 : Math.abs(Math.sin(p)) * s * 0.045;
  g.translate(0, -bob);
  const foot = (fx: number, k: number, near: boolean) => {
    const ph = p + k, dx = still ? 0 : Math.sin(ph) * s * 0.11, lift = still ? 0 : Math.max(0, Math.cos(ph)) * s * 0.06;
    g.fillStyle = near ? '#f7b3bf' : '#d98d9c';
    g.beginPath(); g.ellipse(fx + dx, bob - lift - s * 0.02, s * 0.065, s * 0.035, 0, 0, TAU); g.fill();
  };
  // far feet
  foot(-s * 0.2, Math.PI, false); foot(s * 0.2, 0, false);
  // tail
  g.fillStyle = fur.mid; g.beginPath(); g.ellipse(-s * 0.44, -s * 0.26, s * 0.06, s * 0.035, -0.5, 0, TAU); g.fill();
  // far ear (behind head)
  g.fillStyle = fur.dark; g.beginPath(); g.arc(s * 0.36, -s * 0.62, s * 0.065, 0, TAU); g.fill();
  // body
  const bx = -s * 0.03, by = -s * 0.29, brx = s * (0.42 + sw * 0.05), bry = s * (0.27 + sw * 0.06);
  const bg = g.createRadialGradient(bx - brx * 0.3, by - bry * 0.6, s * 0.03, bx, by, brx * 1.1);
  bg.addColorStop(0, fur.light); bg.addColorStop(0.55, fur.mid); bg.addColorStop(1, fur.dark);
  g.fillStyle = bg; g.beginPath(); g.ellipse(bx, by, brx, bry, -0.06, 0, TAU); g.fill();
  g.strokeStyle = fur.line; g.globalAlpha = 0.45; g.lineWidth = Math.max(1, s * 0.018); g.stroke(); g.globalAlpha = 1;
  // belly
  g.save(); g.beginPath(); g.ellipse(bx, by, brx, bry, -0.06, 0, TAU); g.clip();
  g.fillStyle = 'rgba(255,248,236,0.92)'; g.beginPath(); g.ellipse(s * 0.06, -s * 0.07, s * 0.36, s * 0.14, -0.05, 0, TAU); g.fill();
  if (sw > 0.05) { // abs
    g.strokeStyle = 'rgba(160,100,60,0.55)'; g.lineWidth = Math.max(0.8, s * 0.012);
    for (let i = 0; i < 3; i++) { g.beginPath(); g.moveTo(-s * 0.06 + i * s * 0.09, -s * 0.15); g.lineTo(-s * 0.06 + i * s * 0.09, -s * 0.05); g.stroke(); }
    g.beginPath(); g.moveTo(-s * 0.1, -s * 0.1); g.lineTo(s * 0.2, -s * 0.1); g.stroke();
  }
  g.restore();
  // swole arm
  if (sw > 0.05) {
    const ax = s * 0.2, ay = -s * 0.24, br = s * (0.06 + sw * 0.11);
    const ag = g.createRadialGradient(ax - br * 0.4, ay - br * 0.5, 1, ax, ay, br);
    ag.addColorStop(0, fur.light); ag.addColorStop(1, fur.mid);
    g.fillStyle = ag; g.beginPath(); g.arc(ax, ay, br, 0, TAU); g.fill();
    g.strokeStyle = fur.line; g.globalAlpha = 0.4; g.lineWidth = Math.max(1, s * 0.015); g.stroke(); g.globalAlpha = 1;
    if (sw > 0.5 || look.rage) {
      g.strokeStyle = '#c0204a'; g.lineWidth = Math.max(0.8, s * 0.012);
      g.beginPath(); g.moveTo(ax - br * 0.5, ay - br * 0.3); g.quadraticCurveTo(ax, ay - br * 0.7, ax + br * 0.4, ay - br * 0.2); g.quadraticCurveTo(ax + br * 0.2, ay + br * 0.2, ax + br * 0.5, ay + br * 0.4); g.stroke();
    }
  }
  // head
  g.save();
  const hx = s * 0.3, hy = -s * 0.43, hr = s * 0.22;
  if (look.bigHead) { g.translate(hx - hr * 0.6, hy + hr * 0.6); g.scale(1.9, 1.9); g.translate(-(hx - hr * 0.6), -(hy + hr * 0.6)); }
  const hg = g.createRadialGradient(hx - hr * 0.35, hy - hr * 0.45, 1, hx, hy, hr * 1.1);
  hg.addColorStop(0, fur.light); hg.addColorStop(0.6, fur.mid); hg.addColorStop(1, fur.dark);
  g.fillStyle = hg; g.beginPath(); g.ellipse(hx, hy, hr * 1.05, hr * 0.95, 0.15, 0, TAU); g.fill();
  g.strokeStyle = fur.line; g.globalAlpha = 0.45; g.lineWidth = Math.max(1, s * 0.018); g.stroke(); g.globalAlpha = 1;
  // cheek pouch + blush
  g.fillStyle = 'rgba(255,246,234,0.95)'; g.beginPath(); g.ellipse(hx + hr * 0.35, hy + hr * 0.45, hr * 0.5, hr * 0.38, 0.2, 0, TAU); g.fill();
  g.fillStyle = 'rgba(255,120,150,0.35)'; g.beginPath(); g.arc(hx + hr * 0.1, hy + hr * 0.35, hr * 0.18, 0, TAU); g.fill();
  // near ear
  g.fillStyle = fur.mid; g.beginPath(); g.arc(hx - hr * 0.45, hy - hr * 0.8, hr * 0.36, 0, TAU); g.fill();
  g.fillStyle = '#f7a8b8'; g.beginPath(); g.arc(hx - hr * 0.42, hy - hr * 0.76, hr * 0.22, 0, TAU); g.fill();
  // eye
  const ex = hx + hr * 0.38, ey = hy - hr * 0.15;
  if (still) { g.strokeStyle = '#2a1408'; g.lineWidth = Math.max(1, s * 0.02); g.beginPath(); g.arc(ex, ey, hr * 0.2, 0.2, Math.PI - 0.2); g.stroke(); }
  else {
    g.fillStyle = look.rage ? '#3a0000' : '#140a06'; g.beginPath(); g.arc(ex, ey, hr * 0.26, 0, TAU); g.fill();
    if (look.rage) { g.fillStyle = '#ff2020'; g.beginPath(); g.arc(ex, ey, hr * 0.12, 0, TAU); g.fill(); }
    g.fillStyle = '#fff'; g.beginPath(); g.arc(ex + hr * 0.08, ey - hr * 0.1, hr * 0.09, 0, TAU); g.fill();
    g.beginPath(); g.arc(ex - hr * 0.08, ey + hr * 0.09, hr * 0.04, 0, TAU); g.fill();
  }
  if (look.rage) { g.strokeStyle = fur.line; g.lineWidth = Math.max(1.5, s * 0.03); g.beginPath(); g.moveTo(ex - hr * 0.35, ey - hr * 0.5); g.lineTo(ex + hr * 0.25, ey - hr * 0.3); g.stroke(); }
  // nose, mouth, whiskers
  const nx = hx + hr * 0.98, ny = hy + hr * 0.12;
  g.fillStyle = '#ff7f9c'; g.beginPath(); g.ellipse(nx, ny, hr * 0.12, hr * 0.09, 0, 0, TAU); g.fill();
  g.strokeStyle = fur.line; g.lineWidth = Math.max(0.8, s * 0.01); g.beginPath(); g.moveTo(nx - hr * 0.05, ny + hr * 0.1); g.quadraticCurveTo(nx - hr * 0.1, ny + hr * 0.3, nx - hr * 0.3, ny + hr * 0.25); g.stroke();
  g.strokeStyle = 'rgba(255,255,255,0.7)'; g.lineWidth = Math.max(0.6, s * 0.007);
  for (let i = -1; i <= 1; i++) { g.beginPath(); g.moveTo(nx - hr * 0.15, ny + hr * 0.1); g.lineTo(nx + hr * 0.6, ny + hr * (0.05 + i * 0.22)); g.stroke(); }
  if (look.shades) {
    g.fillStyle = '#08080c'; rr(g, ex - hr * 0.42, ey - hr * 0.28, hr * 0.8, hr * 0.42, hr * 0.15); g.fill();
    g.fillRect(ex - hr * 0.95, ey - hr * 0.2, hr * 0.6, hr * 0.07);
    g.fillStyle = 'rgba(255,255,255,0.55)'; g.beginPath(); g.moveTo(ex - hr * 0.25, ey - hr * 0.22); g.lineTo(ex - hr * 0.05, ey - hr * 0.22); g.lineTo(ex - hr * 0.2, ey + hr * 0.08); g.closePath(); g.fill();
  }
  g.restore();
  // near feet
  foot(-s * 0.24, 0, true); foot(s * 0.16, Math.PI, true);
  if (look.halo) {
    g.save(); g.strokeStyle = '#fff6a0'; g.lineWidth = Math.max(1.5, s * 0.035); g.shadowColor = '#fff6a0'; g.shadowBlur = 12;
    g.beginPath(); g.ellipse(hx - hr * 0.1, hy - hr * (look.bigHead ? 2.8 : 1.6), hr * 0.75, hr * 0.22, 0, 0, TAU); g.stroke(); g.restore();
  }
  if (look.sweat && !still) { g.fillStyle = '#9ad8ff'; for (let i = 0; i < 2; i++) { const k = (time * 1.6 + i * 0.5) % 1; g.globalAlpha = 1 - k; g.beginPath(); g.ellipse(hx - hr * (0.6 + k), hy - hr * (0.6 - k * 0.8), s * 0.02, s * 0.03, 0, 0, TAU); g.fill(); } g.globalAlpha = 1; }
  if (look.sign) {
    g.strokeStyle = '#8a6440'; g.lineWidth = Math.max(1.5, s * 0.035); g.beginPath(); g.moveTo(s * 0.16, -s * 0.28); g.lineTo(s * 0.16, -s * 1.15); g.stroke();
    g.save(); g.translate(s * 0.16, -s * 1.33); g.rotate(Math.sin(time * 4) * 0.08);
    g.fillStyle = '#fbf6e6'; rr(g, -s * 0.55, -s * 0.2, s * 1.1, s * 0.4, s * 0.04); g.fill();
    g.strokeStyle = '#c8b890'; g.lineWidth = 1; g.stroke();
    g.fillStyle = '#c0161a'; g.font = `900 ${Math.max(6, s * 0.14)}px ${FONT}`; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText(look.sign, 0, 0); g.restore(); g.textAlign = 'left'; g.textBaseline = 'alphabetic';
  }
  if (still) {
    g.fillStyle = '#fff'; g.font = `700 ${s * 0.22}px ${FONT}`;
    const k = time % 1.5 / 1.5; g.globalAlpha = 1 - k;
    g.fillText('z', hx + hr, hy - hr - k * s * 0.3); g.fillText('Z', hx + hr * 1.6, hy - hr * 1.8 - k * s * 0.3); g.globalAlpha = 1;
  }
  g.restore();
}

// ---------- wheel ----------
export interface WheelStyle { rim: string; rimDark: string; glow?: string }
export const STEEL: WheelStyle = { rim: '#e8eef8', rimDark: '#7a849c' };
/** The back half of a hamster wheel (drawn behind the runner). Depth is faked by offsetting the back rim. */
export function wheelBack(g: G, x: number, y: number, r: number, ang: number, st: WheelStyle, speed = 1) {
  const d = r * 0.16, bx = x - d * 0.7, by = y - d * 0.5;
  // back disc (mesh)
  const dg = g.createRadialGradient(bx, by, r * 0.1, bx, by, r);
  dg.addColorStop(0, 'rgba(255,255,255,0.06)'); dg.addColorStop(1, 'rgba(255,255,255,0.14)');
  g.fillStyle = dg; g.beginPath(); g.arc(bx, by, r, 0, TAU); g.fill();
  // back spokes
  g.strokeStyle = st.rimDark; g.lineWidth = Math.max(1, r * 0.035); g.lineCap = 'round';
  const blur = Math.min(1, speed / 2.5);
  g.globalAlpha = 1 - blur * 0.6;
  for (let i = 0; i < 6; i++) { const a = ang + (i / 6) * TAU; g.beginPath(); g.moveTo(bx, by); g.lineTo(bx + Math.cos(a) * r, by + Math.sin(a) * r); g.stroke(); }
  g.globalAlpha = 1;
  if (blur > 0.2) { g.strokeStyle = `rgba(200,210,230,${blur * 0.12})`; g.lineWidth = r * 0.9; g.beginPath(); g.arc(bx, by, r * 0.5, 0, TAU); g.stroke(); }
  g.strokeStyle = st.rimDark; g.lineWidth = Math.max(1, r * 0.06);
  g.beginPath(); g.arc(bx, by, r, 0, TAU); g.stroke();
  // rungs connecting back rim to front rim
  const n = Math.max(12, Math.min(36, Math.round(r / 3)));
  g.lineWidth = Math.max(0.8, r * 0.028); g.strokeStyle = st.rimDark;
  for (let i = 0; i < n; i++) {
    const a = ang + (i / n) * TAU, c = Math.cos(a), s = Math.sin(a);
    g.globalAlpha = 0.55 + 0.45 * Math.max(0, s);
    g.beginPath(); g.moveTo(bx + c * r, by + s * r); g.lineTo(x + c * r, y + s * r); g.stroke();
  }
  g.globalAlpha = 1;
}
/** The front rim + hub (drawn over the runner). */
export function wheelFront(g: G, x: number, y: number, r: number, st: WheelStyle) {
  const lg = g.createLinearGradient(x - r, y - r, x + r, y + r);
  lg.addColorStop(0, st.rim); lg.addColorStop(0.5, st.rimDark); lg.addColorStop(1, st.rim);
  if (st.glow) { g.save(); g.shadowColor = st.glow; g.shadowBlur = r * 0.35; }
  g.strokeStyle = lg; g.lineWidth = Math.max(1.5, r * 0.075);
  g.beginPath(); g.arc(x, y, r, 0, TAU); g.stroke();
  if (st.glow) g.restore();
  g.strokeStyle = 'rgba(255,255,255,0.5)'; g.lineWidth = Math.max(0.6, r * 0.015);
  g.beginPath(); g.arc(x, y, r - r * 0.03, Math.PI * 1.05, Math.PI * 1.55); g.stroke();
}
export function wheelStand(g: G, x: number, y: number, r: number, st: WheelStyle) {
  const fy = y + r * 1.12, d = r * 0.16;
  shadow(g, x, fy, r * 0.95, r * 0.1, 0.35);
  g.strokeStyle = st.rimDark; g.lineCap = 'round'; g.lineWidth = Math.max(1.5, r * 0.06);
  g.beginPath(); g.moveTo(x - d * 0.7, y - d * 0.5); g.lineTo(x - r * 0.55 - d * 0.7, fy - d * 0.3); g.stroke();
  const sg = g.createLinearGradient(x - r, 0, x + r, 0); sg.addColorStop(0, st.rimDark); sg.addColorStop(0.5, st.rim); sg.addColorStop(1, st.rimDark);
  g.strokeStyle = sg; g.lineWidth = Math.max(2, r * 0.08);
  g.beginPath(); g.moveTo(x, y); g.lineTo(x + r * 0.55, fy); g.moveTo(x, y); g.lineTo(x - r * 0.55, fy); g.stroke();
  g.fillStyle = st.rimDark; rr(g, x - r * 0.75, fy - r * 0.035, r * 1.5, r * 0.07, r * 0.03); g.fill();
}
export function hub(g: G, x: number, y: number, r: number, st: WheelStyle) {
  const hg = g.createRadialGradient(x - r * 0.04, y - r * 0.04, 1, x, y, r * 0.12);
  hg.addColorStop(0, '#fff'); hg.addColorStop(1, st.rimDark);
  g.fillStyle = hg; g.beginPath(); g.arc(x, y, r * 0.1, 0, TAU); g.fill();
}
/** A complete wheel with a runner. `runner` draws the hamster with its feet at the wheel's bottom. */
export function wheelWith(g: G, x: number, y: number, r: number, ang: number, st: WheelStyle, speed: number, runner?: (fx: number, fy: number) => void, stand = true) {
  if (stand) wheelStand(g, x, y, r, st);
  wheelBack(g, x, y, r, ang, st, speed);
  runner?.(x, y + r * 0.94);
  wheelFront(g, x, y, r, st);
  hub(g, x, y, r, st);
}
