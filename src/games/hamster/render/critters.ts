// The rest of Gerald's workforce: gerbils, guinea pigs and ferrets, each with its own silhouette.
// Same conventions as `hamster()`: side view facing right, feet at (x, y), `s` ≈ body length, `p` = gait phase.
import { FONT, TAU, rr, shadow, type Look } from './draw';
type G = CanvasRenderingContext2D;

export interface Gear { hardhat?: boolean; vest?: boolean; sweatband?: boolean }

const lw = (s: number, k: number, min = 0.7) => Math.max(min, s * k);

function bead(g: G, x: number, y: number, r: number, closed: boolean, line: string, s: number) {
  if (closed) { g.strokeStyle = line; g.lineWidth = lw(s, 0.018, 1); g.beginPath(); g.arc(x, y, r * 0.8, 0.2, Math.PI - 0.2); g.stroke(); return; }
  g.fillStyle = '#120806'; g.beginPath(); g.arc(x, y, r, 0, TAU); g.fill();
  g.fillStyle = '#fff'; g.beginPath(); g.arc(x + r * 0.32, y - r * 0.38, r * 0.34, 0, TAU); g.fill();
  g.beginPath(); g.arc(x - r * 0.3, y + r * 0.35, r * 0.15, 0, TAU); g.fill();
}
function whiskers(g: G, x: number, y: number, len: number, s: number, color = 'rgba(255,255,255,0.7)') {
  g.strokeStyle = color; g.lineWidth = lw(s, 0.007, 0.6);
  for (let i = -1; i <= 1; i++) { g.beginPath(); g.moveTo(x, y); g.lineTo(x + len, y + len * (-0.05 + i * 0.3)); g.stroke(); }
}
function zzz(g: G, x: number, y: number, s: number, time: number) {
  g.fillStyle = '#fff'; g.font = `700 ${s * 0.2}px ${FONT}`;
  const k = time % 1.5 / 1.5; g.globalAlpha = 1 - k;
  g.fillText('z', x, y - k * s * 0.3); g.fillText('Z', x + s * 0.12, y - s * 0.16 - k * s * 0.3); g.globalAlpha = 1;
}
function hardhat(g: G, x: number, y: number, r: number, tilt: number) {
  g.save(); g.translate(x, y); g.rotate(tilt);
  g.fillStyle = '#ffc43a'; g.beginPath(); g.arc(0, 0, r, Math.PI, TAU); g.fill();
  g.fillStyle = '#e8a412'; rr(g, -r * 1.3, -r * 0.08, r * 2.6, r * 0.28, r * 0.12); g.fill();
  g.fillStyle = '#fff3c0'; g.fillRect(-r * 0.12, -r * 0.95, r * 0.24, r * 0.9);
  g.restore();
}

/** The strike placard from `hamster()`, held on a post above the back. */
function picket(g: G, px: number, s: number, text: string, time: number) {
  g.strokeStyle = '#8a6440'; g.lineWidth = Math.max(1.5, s * 0.035); g.beginPath(); g.moveTo(px, -s * 0.28); g.lineTo(px, -s * 1.15); g.stroke();
  g.save(); g.translate(px, -s * 1.33); g.rotate(Math.sin(time * 4) * 0.08);
  g.fillStyle = '#fbf6e6'; rr(g, -s * 0.55, -s * 0.2, s * 1.1, s * 0.4, s * 0.04); g.fill();
  g.strokeStyle = '#c8b890'; g.lineWidth = 1; g.stroke();
  g.fillStyle = '#c0161a'; g.font = `900 ${Math.max(6, s * 0.14)}px ${FONT}`; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText(text, 0, 0); g.restore(); g.textAlign = 'left'; g.textBaseline = 'alphabetic';
}

// ---------- gerbil ----------
export const GERBIL = { light: '#f7e9cc', mid: '#d2a467', dark: '#9b6d3c', line: '#5c3e20', tip: '#4a3220' };
/** Slim agouti body, long tufted tail, big hind feet, upright ears. */
export function gerbil(g: G, x: number, y: number, s: number, p: number, look: Look & Gear = {}, time = 0) {
  const f = GERBIL, still = !!look.sleep;
  g.save(); g.translate(x, y);
  if (!look.noShadow) shadow(g, 0, 0, s * 0.4, s * 0.06, 0.3);
  if (look.flip) g.scale(-1, 1);
  const bob = still ? 0 : Math.abs(Math.sin(p)) * s * 0.06; g.translate(0, -bob);
  const sway = still ? 0 : Math.sin(p * 0.5 + time * 2) * s * 0.06;
  // tail: long, thin, dark tuft at the tip
  g.lineCap = 'round';
  g.strokeStyle = f.mid; g.lineWidth = lw(s, 0.045);
  g.beginPath(); g.moveTo(-s * 0.34, -s * 0.24); g.bezierCurveTo(-s * 0.62, -s * 0.16 + sway, -s * 0.78, -s * 0.06 + sway, -s * 0.98, -s * 0.2 + sway * 1.6); g.stroke();
  g.fillStyle = f.tip; g.beginPath(); g.ellipse(-s * 1.0, -s * 0.21 + sway * 1.6, s * 0.08, s * 0.035, 0.5, 0, TAU); g.fill();
  const foot = (fx: number, k: number, near: boolean, hind: boolean) => {
    const ph = p + k, dx = still ? 0 : Math.sin(ph) * s * 0.12, lift = still ? 0 : Math.max(0, Math.cos(ph)) * s * 0.07;
    g.fillStyle = near ? '#f3bcc2' : '#d39aa5';
    g.beginPath(); g.ellipse(fx + dx, bob - lift - s * 0.02, s * (hind ? 0.11 : 0.05), s * 0.028, 0, 0, TAU); g.fill();
  };
  foot(-s * 0.16, Math.PI, false, true); foot(s * 0.22, 0, false, false);
  // body
  const bx = -s * 0.04, by = -s * 0.28, brx = s * 0.36, bry = s * 0.2;
  const bg = g.createRadialGradient(bx - brx * 0.2, by - bry * 0.8, s * 0.02, bx, by, brx * 1.1);
  bg.addColorStop(0, '#e6c28c'); bg.addColorStop(0.6, f.mid); bg.addColorStop(1, f.dark);
  g.fillStyle = bg; g.beginPath(); g.ellipse(bx, by, brx, bry, -0.1, 0, TAU); g.fill();
  g.strokeStyle = f.line; g.globalAlpha = 0.45; g.lineWidth = lw(s, 0.016, 1); g.stroke(); g.globalAlpha = 1;
  // white belly and a big hind haunch
  g.save(); g.beginPath(); g.ellipse(bx, by, brx, bry, -0.1, 0, TAU); g.clip();
  g.fillStyle = 'rgba(255,250,238,0.95)'; g.beginPath(); g.ellipse(s * 0.04, -s * 0.1, s * 0.34, s * 0.09, -0.05, 0, TAU); g.fill();
  g.restore();
  g.fillStyle = 'rgba(255,236,200,0.35)'; g.beginPath(); g.ellipse(-s * 0.2, -s * 0.25, s * 0.15, s * 0.13, 0, 0, TAU); g.fill();
  g.strokeStyle = 'rgba(92,62,32,0.35)'; g.lineWidth = lw(s, 0.01); g.beginPath(); g.arc(-s * 0.2, -s * 0.25, s * 0.14, -1.2, 1.6); g.stroke();
  if (look.vest) {
    g.save(); g.beginPath(); g.ellipse(bx, by, brx, bry, -0.1, 0, TAU); g.clip();
    g.fillStyle = '#ff8a1e'; g.fillRect(s * 0.02, by - bry, s * 0.24, bry * 2);
    g.fillStyle = '#f4f2d8'; g.fillRect(s * 0.08, by - bry, s * 0.05, bry * 2);
    g.restore();
  }
  // head: pointed, tilted down toward the nose
  const hx = s * 0.33, hy = -s * 0.4;
  const hg = g.createRadialGradient(hx - s * 0.05, hy - s * 0.07, 1, hx, hy, s * 0.2);
  hg.addColorStop(0, '#ecd09e'); hg.addColorStop(0.6, f.mid); hg.addColorStop(1, f.dark);
  g.fillStyle = hg; g.beginPath(); g.ellipse(hx, hy, s * 0.17, s * 0.13, 0.3, 0, TAU); g.fill();
  g.beginPath(); g.ellipse(hx + s * 0.13, hy + s * 0.06, s * 0.1, s * 0.07, 0.35, 0, TAU); g.fill();
  g.fillStyle = 'rgba(255,250,238,0.95)'; g.beginPath(); g.ellipse(hx + s * 0.12, hy + s * 0.1, s * 0.08, s * 0.035, 0.35, 0, TAU); g.fill();
  // upright ear
  g.fillStyle = f.dark; g.beginPath(); g.ellipse(hx - s * 0.08, hy - s * 0.13, s * 0.045, s * 0.08, -0.35, 0, TAU); g.fill();
  g.fillStyle = '#e9a2ad'; g.beginPath(); g.ellipse(hx - s * 0.075, hy - s * 0.125, s * 0.025, s * 0.055, -0.35, 0, TAU); g.fill();
  const blink = time % 6.3 > 6.15;
  bead(g, hx + s * 0.05, hy - s * 0.02, s * 0.05, still || blink, f.line, s);
  g.fillStyle = '#e07a8e'; g.beginPath(); g.arc(hx + s * 0.225, hy + s * 0.08, s * 0.022, 0, TAU); g.fill();
  whiskers(g, hx + s * 0.2, hy + s * 0.09, s * 0.17, s);
  if (look.hardhat) hardhat(g, hx - s * 0.01, hy - s * 0.1, s * 0.11, 0.25);
  foot(-s * 0.2, 0, true, true); foot(s * 0.18, Math.PI, true, false);
  if (look.sign) picket(g, s * 0.05, s, look.sign, time);
  if (still) zzz(g, hx + s * 0.2, hy - s * 0.2, s, time);
  g.restore();
}

// ---------- guinea pig ----------
export const GUINEA = { base: '#fbf3e6', shade: '#e4d3bd', ginger: '#dc8b3e', brown: '#4f321d', line: '#3f2715' };
/** A tailless loaf: tricolour patches, petal ears, almost no visible legs. */
export function guineaPig(g: G, x: number, y: number, s: number, p: number, look: Look & Gear = {}, time = 0, seed = 0) {
  const c = GUINEA, still = !!look.sleep;
  g.save(); g.translate(x, y);
  if (!look.noShadow) shadow(g, 0, 0, s * 0.48, s * 0.07, 0.3);
  if (look.flip) g.scale(-1, 1);
  const bob = still ? 0 : Math.abs(Math.sin(p * 1.5)) * s * 0.03; g.translate(0, -bob);
  const foot = (fx: number, k: number, near: boolean) => {
    const ph = p * 1.5 + k, dx = still ? 0 : Math.sin(ph) * s * 0.06, lift = still ? 0 : Math.max(0, Math.cos(ph)) * s * 0.04;
    g.fillStyle = near ? '#f0b0b8' : '#c98e98';
    g.beginPath(); g.ellipse(fx + dx, bob - lift - s * 0.02, s * 0.06, s * 0.03, 0, 0, TAU); g.fill();
  };
  foot(-s * 0.22, Math.PI, false); foot(s * 0.22, 0, false);
  // loaf body (head merged at the front)
  const body = () => { g.beginPath(); g.ellipse(-s * 0.04, -s * 0.27, s * 0.48, s * 0.27, -0.03, 0, TAU); g.ellipse(s * 0.33, -s * 0.28, s * 0.22, s * 0.21, 0.1, 0, TAU); };
  g.fillStyle = c.base; body(); g.fill();
  g.save(); body(); g.clip();
  const flipPatch = seed % 2 === 1;
  g.fillStyle = flipPatch ? c.brown : c.ginger; g.beginPath(); g.ellipse(-s * 0.3, -s * 0.33, s * 0.28, s * 0.3, 0.3, 0, TAU); g.fill();
  g.fillStyle = flipPatch ? c.ginger : c.brown; g.beginPath(); g.ellipse(s * 0.02, -s * 0.52, s * 0.17, s * 0.16, 0, 0, TAU); g.fill();
  g.fillStyle = c.ginger; g.beginPath(); g.ellipse(s * 0.33, -s * 0.38, s * 0.18, s * 0.12, -0.2, 0, TAU); g.fill();
  g.fillStyle = c.base; g.beginPath(); g.ellipse(s * 0.47, -s * 0.33, s * 0.05, s * 0.2, 0.5, 0, TAU); g.fill(); // blaze
  // shading and hair strands
  const sh = g.createLinearGradient(0, -s * 0.55, 0, 0); sh.addColorStop(0, 'rgba(255,255,255,0.18)'); sh.addColorStop(0.6, 'rgba(0,0,0,0)'); sh.addColorStop(1, 'rgba(60,30,10,0.22)');
  g.fillStyle = sh; g.fillRect(-s * 0.6, -s * 0.6, s * 1.2, s * 0.6);
  g.strokeStyle = 'rgba(80,40,15,0.18)'; g.lineWidth = lw(s, 0.008, 0.6);
  for (let i = 0; i < 10; i++) { const fx = -s * 0.45 + i * s * 0.08; g.beginPath(); g.moveTo(fx, -s * 0.5 + (i % 3) * s * 0.03); g.quadraticCurveTo(fx - s * 0.03, -s * 0.38, fx - s * 0.05, -s * 0.3); g.stroke(); }
  g.restore();
  g.strokeStyle = c.line; g.globalAlpha = 0.4; g.lineWidth = lw(s, 0.016, 1);
  g.beginPath(); g.ellipse(-s * 0.04, -s * 0.27, s * 0.48, s * 0.27, -0.03, Math.PI * 0.55, Math.PI * 2.08); g.stroke();
  g.beginPath(); g.ellipse(s * 0.33, -s * 0.28, s * 0.22, s * 0.21, 0.1, -1.7, 1.4); g.stroke(); g.globalAlpha = 1;
  if (look.sweatband) { g.fillStyle = '#ff4f7a'; g.save(); g.translate(s * 0.33, -s * 0.44); g.rotate(0.1); rr(g, -s * 0.2, -s * 0.03, s * 0.36, s * 0.07, s * 0.03); g.fill(); g.restore(); }
  // petal ear
  g.fillStyle = '#c98a72'; g.beginPath(); g.ellipse(s * 0.2, -s * 0.46, s * 0.075, s * 0.045, 0.7, 0, TAU); g.fill();
  g.fillStyle = '#f1b2a6'; g.beginPath(); g.ellipse(s * 0.21, -s * 0.455, s * 0.045, s * 0.025, 0.7, 0, TAU); g.fill();
  const blink = time % 5.1 > 4.95;
  bead(g, s * 0.37, -s * 0.36, s * 0.045, still || blink, c.line, s);
  // nose and Y mouth
  g.fillStyle = '#b8707a'; g.beginPath(); g.ellipse(s * 0.535, -s * 0.27, s * 0.025, s * 0.018, 0, 0, TAU); g.fill();
  g.strokeStyle = c.line; g.lineWidth = lw(s, 0.01); g.beginPath(); g.moveTo(s * 0.53, -s * 0.25); g.lineTo(s * 0.52, -s * 0.2); g.lineTo(s * 0.48, -s * 0.18); g.stroke();
  whiskers(g, s * 0.5, -s * 0.24, s * 0.16, s, 'rgba(255,255,255,0.8)');
  foot(-s * 0.26, 0, true); foot(s * 0.24, Math.PI, true);
  if (look.sign) picket(g, -s * 0.05, s, look.sign, time);
  if (still) zzz(g, s * 0.45, -s * 0.55, s, time);
  g.restore();
}

// ---------- ferret ----------
export const FERRET = { cream: '#f6ead3', fawn: '#c9a27a', sable: '#7a5236', dark: '#3a2518', mask: '#4f3424', line: '#24160d' };
/**
 * A long bounding ferret. `p` drives the arch of the gallop. Feet at (x, y), nose near x + 0.6s, tail to x − 0.75s.
 * Draw rotated to send it along a tube.
 */
export function ferret(g: G, x: number, y: number, s: number, p: number, look: Look = {}, time = 0) {
  const c = FERRET, still = !!look.sleep;
  g.save(); g.translate(x, y);
  if (!look.noShadow) shadow(g, 0, 0, s * 0.5, s * 0.05, 0.28);
  if (look.flip) g.scale(-1, 1);
  const arch = still ? 0.2 : 0.5 + 0.5 * Math.sin(p), gather = still ? 0 : Math.cos(p);
  const hip = { x: -s * 0.28 + gather * s * 0.05, y: -s * 0.2 }, sh = { x: s * 0.28 - gather * s * 0.05, y: -s * 0.2 };
  const mid = { x: 0, y: -s * (0.24 + arch * 0.06) };
  g.lineCap = 'round'; g.lineJoin = 'round';
  // legs: short and dark, hind and fore pairs move together (bound)
  const leg = (bx: number, by: number, swing: number, near: boolean) => {
    const fx = bx + swing * s * 0.1, fy = still ? 0 : -Math.max(0, -Math.sin(p + (bx > 0 ? 0 : Math.PI))) * s * 0.05;
    g.strokeStyle = near ? c.dark : '#2a1a10'; g.lineWidth = lw(s, 0.085);
    g.beginPath(); g.moveTo(bx, by); g.lineTo(fx, fy - s * 0.02); g.stroke();
    g.fillStyle = near ? '#4a3020' : '#2a1a10'; g.beginPath(); g.ellipse(fx + s * 0.02, fy - s * 0.015, s * 0.04, s * 0.02, 0, 0, TAU); g.fill();
  };
  leg(hip.x + s * 0.02, hip.y, -gather, false); leg(sh.x - s * 0.02, sh.y, gather, false);
  // tail: tapering, darker
  g.strokeStyle = c.sable; g.lineWidth = lw(s, 0.09);
  const tw = still ? 0 : Math.sin(p + 1) * s * 0.05;
  g.beginPath(); g.moveTo(hip.x, hip.y - s * 0.02); g.quadraticCurveTo(hip.x - s * 0.25, hip.y - s * 0.02 + tw, hip.x - s * 0.45, hip.y + s * 0.04 + tw * 1.5); g.stroke();
  g.strokeStyle = c.dark; g.lineWidth = lw(s, 0.05);
  g.beginPath(); g.moveTo(hip.x - s * 0.3, hip.y + tw * 1.1); g.quadraticCurveTo(hip.x - s * 0.38, hip.y + s * 0.02 + tw * 1.3, hip.x - s * 0.46, hip.y + s * 0.04 + tw * 1.5); g.stroke();
  // body: a thick curved tube, sable with cream undercoat showing through
  const spine = () => { g.beginPath(); g.moveTo(hip.x, hip.y); g.quadraticCurveTo(mid.x, mid.y * 2 - (hip.y + sh.y) / 2, sh.x, sh.y); };
  g.strokeStyle = c.sable; g.lineWidth = s * 0.3; spine(); g.stroke();
  g.save(); g.translate(0, s * 0.05); g.strokeStyle = c.cream; g.lineWidth = s * 0.16; spine(); g.stroke(); g.restore();
  g.save(); g.translate(0, -s * 0.03); g.strokeStyle = c.fawn; g.lineWidth = s * 0.15; spine(); g.stroke(); g.restore();
  g.save(); g.translate(0, -s * 0.09); g.strokeStyle = 'rgba(58,37,24,0.5)'; g.lineWidth = s * 0.07; spine(); g.stroke(); g.restore();
  leg(hip.x - s * 0.03, hip.y + s * 0.02, -gather * 0.8, true); leg(sh.x + s * 0.02, sh.y + s * 0.02, gather * 0.8, true);
  // head: wedge with the bandit mask
  const hx = sh.x + s * 0.2, hy = sh.y - s * 0.07; g.save(); g.translate(hx, hy); g.scale(1.3, 1.3); g.translate(-hx, -hy);
  g.fillStyle = c.cream; g.beginPath(); g.ellipse(hx, hy, s * 0.15, s * 0.1, 0.12, 0, TAU); g.fill();
  g.beginPath(); g.ellipse(hx + s * 0.1, hy + s * 0.03, s * 0.08, s * 0.06, 0.2, 0, TAU); g.fill();
  g.fillStyle = c.mask; g.beginPath(); g.ellipse(hx + s * 0.02, hy - s * 0.015, s * 0.085, s * 0.045, 0.25, 0, TAU); g.fill();
  g.fillStyle = c.sable; g.beginPath(); g.ellipse(hx - s * 0.06, hy - s * 0.06, s * 0.08, s * 0.04, -0.2, 0, TAU); g.fill();
  g.strokeStyle = c.line; g.globalAlpha = 0.4; g.lineWidth = lw(s, 0.012, 1); g.beginPath(); g.ellipse(hx, hy, s * 0.15, s * 0.1, 0.12, -2.4, 1.6); g.stroke(); g.globalAlpha = 1;
  // ear
  g.fillStyle = c.cream; g.beginPath(); g.arc(hx - s * 0.09, hy - s * 0.08, s * 0.045, 0, TAU); g.fill();
  g.strokeStyle = c.sable; g.lineWidth = lw(s, 0.012); g.stroke();
  const blink = time % 4.7 > 4.55;
  bead(g, hx + s * 0.04, hy - s * 0.02, s * 0.03, still || blink, c.line, s);
  g.fillStyle = '#e88b9a'; g.beginPath(); g.ellipse(hx + s * 0.18, hy + s * 0.025, s * 0.022, s * 0.017, 0, 0, TAU); g.fill();
  whiskers(g, hx + s * 0.15, hy + s * 0.04, s * 0.14, s);
  g.restore();
  if (still) zzz(g, hx + s * 0.1, hy - s * 0.15, s, time);
  g.restore();
}

/** A tiny treadmill for a guinea pig; (x, y) is the floor under the deck centre, `w` the deck length. */
export function treadmill(g: G, x: number, y: number, w: number, t: number, stopped: boolean) {
  const h = w * 0.1, top = y - h * 1.6;
  shadow(g, x, y, w * 0.55, w * 0.05, 0.3);
  g.fillStyle = '#4a4f5c'; rr(g, x - w * 0.5, top, w, h * 1.4, h * 0.5); g.fill();
  g.fillStyle = '#23262e'; rr(g, x - w * 0.46, top - h * 0.15, w * 0.92, h * 0.55, h * 0.25); g.fill();
  g.strokeStyle = '#596070'; g.lineWidth = Math.max(1, w * 0.012);
  const off = stopped ? 0 : (t * w * 0.5) % (w * 0.12);
  g.save(); g.beginPath(); g.rect(x - w * 0.44, top - h * 0.2, w * 0.88, h * 0.6); g.clip();
  for (let lx = x - w * 0.5 - off + w * 0.12; lx < x + w * 0.5; lx += w * 0.12) { g.beginPath(); g.moveTo(lx, top - h * 0.1); g.lineTo(lx + w * 0.03, top + h * 0.35); g.stroke(); }
  g.restore();
  // console post at the front
  g.strokeStyle = '#8c93a3'; g.lineWidth = Math.max(1.5, w * 0.03); g.lineCap = 'round';
  g.beginPath(); g.moveTo(x + w * 0.42, top); g.lineTo(x + w * 0.5, top - w * 0.42); g.stroke();
  g.beginPath(); g.moveTo(x + w * 0.5, top - w * 0.36); g.lineTo(x + w * 0.2, top - w * 0.3); g.stroke();
  g.fillStyle = '#383d48'; rr(g, x + w * 0.4, top - w * 0.5, w * 0.2, w * 0.12, w * 0.025); g.fill();
  g.fillStyle = stopped ? '#2a3a2a' : '#7dffa0'; g.fillRect(x + w * 0.43, top - w * 0.475, w * 0.14, w * 0.05);
  return top - h * 0.15;
}
