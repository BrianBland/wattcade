import type { G } from './prims';

/**
 * Cadenza ships (the `ship` slot), drawn from behind the way the chase camera sees them: dark hull, neon outline,
 * glowing nozzles and their exhaust beams. Ship space: x −1..1, y −0.6..1 (y down, the nozzles near y 0). The 3D
 * hulls are `src/games/cadenza/render/craft.ts`; ids match.
 */
const HULL = '#0b1426';

/** '#rrggbb' (or '#rgb') at alpha `a`. */
function alpha(c: string, a: number): string {
  let h = c.replace('#', '');
  if (h.length === 3) h = h.split('').map((x) => x + x).join('');
  const n = parseInt(h.slice(0, 6), 16);
  return Number.isFinite(n) ? `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})` : c;
}

/** A filled, outlined hull part; `path` adds its outline to the current path. */
function shape(g: G, color: string, path: () => void) {
  g.beginPath(); path(); g.closePath();
  g.fillStyle = HULL; g.fill();
  g.strokeStyle = alpha(color, 0.9); g.lineWidth = 0.025; g.stroke();
}

/** A nozzle of lip radius r at (x, y): its beam streaming down-screen, a neon rim and a white-hot core. */
function nozzle(g: G, color: string, x: number, y: number, r: number, k: number) {
  const len = 0.55 + 0.1 * k, beam = g.createLinearGradient(0, y, 0, y + len);
  beam.addColorStop(0, alpha(color, 0.75 * k)); beam.addColorStop(1, alpha(color, 0));
  g.fillStyle = beam;
  g.beginPath(); g.moveTo(x - r * 0.8, y); g.lineTo(x + r * 0.8, y); g.lineTo(x + r * 0.2, y + len); g.lineTo(x - r * 0.2, y + len); g.closePath(); g.fill();
  g.fillStyle = '#05070d'; g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill();
  const core = g.createRadialGradient(x, y, 0, x, y, r);
  core.addColorStop(0, `rgba(255,240,225,${k})`); core.addColorStop(0.35, alpha(color, 0.8 * k)); core.addColorStop(1, alpha(color, 0.05));
  g.fillStyle = core; g.beginPath(); g.arc(x, y, r * 0.92, 0, Math.PI * 2); g.fill();
  g.strokeStyle = color; g.lineWidth = r * 0.16; g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.stroke();
}
const oval = (g: G, x: number, y: number, rx: number, ry: number) => () => g.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2);
function hoop(g: G, color: string, x: number, y: number, rx: number, ry: number) {
  g.strokeStyle = alpha(color, 0.55); g.lineWidth = 0.018; g.beginPath(); g.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2); g.stroke();
}

type Drawer = (g: G, color: string, k: number) => void;
export const SHIPS: Record<string, Drawer> = {
  triad: (g, c, k) => {
    for (const s of [-1, 1]) shape(g, c, () => { g.moveTo(s * 0.55, 0.02); g.lineTo(s * 0.9, 0.12); g.lineTo(s * 0.55, 0.15); }); // fins
    shape(g, c, oval(g, 0, 0.04, 0.56, 0.2));
    for (const s of [-1, 1]) { shape(g, c, oval(g, s * 0.42, 0.06, 0.21, 0.21)); hoop(g, c, s * 0.42, 0.06, 0.25, 0.25); }
    shape(g, c, oval(g, 0, -0.14, 0.25, 0.24)); hoop(g, c, 0, -0.14, 0.29, 0.28);
    for (const s of [-1, 1]) nozzle(g, c, s * 0.42, 0.06, 0.17, k);
    nozzle(g, c, 0, -0.14, 0.2, k);
  },
  lancer: (g, c, k) => {
    for (const s of [-1, 1]) shape(g, c, () => { g.moveTo(s * 0.12, -0.3); g.lineTo(s * 0.5, -0.02); g.lineTo(s * 0.5, 0.1); g.lineTo(s * 0.2, 0.08); }); // webs to the pods
    shape(g, c, () => { g.moveTo(0, -0.42); g.lineTo(0.3, -0.16); g.lineTo(0.34, 0.03); g.lineTo(0.2, 0.13); g.lineTo(-0.2, 0.13); g.lineTo(-0.34, 0.03); g.lineTo(-0.3, -0.16); });
    for (const s of [-1, 1]) { shape(g, c, oval(g, s * 0.6, 0.05, 0.21, 0.18)); hoop(g, c, s * 0.6, 0.05, 0.25, 0.21); }
    g.fillStyle = alpha(c, 0.9 * k); g.fillRect(-0.3, 0.07, 0.6, 0.025); // tail light bar
    for (const s of [-1, 1]) nozzle(g, c, s * 0.6, 0.05, 0.19, k);
  },
  manta: (g, c, k) => {
    shape(g, c, () => { g.moveTo(-0.92, 0.06); g.quadraticCurveTo(-0.45, -0.22, 0, -0.26); g.quadraticCurveTo(0.45, -0.22, 0.92, 0.06); g.quadraticCurveTo(0, 0.2, -0.92, 0.06); });
    shape(g, c, () => { g.ellipse(0, -0.12, 0.2, 0.18, 0, Math.PI, 0); }); // cockpit hump
    g.strokeStyle = alpha(c, 0.7); g.lineWidth = 0.02; g.beginPath(); g.moveTo(0, -0.3); g.lineTo(0, -0.18); g.stroke(); // spine light
    for (const x of [-0.46, -0.16, 0.16, 0.46]) nozzle(g, c, x, 0.08, 0.11, k);
  },
};
export const SHIP_IDS = Object.keys(SHIPS);

/** Ship `id` in the profile colour; `t` (s) breathes the engines. Draws nothing for unknown ids. */
export function drawShip(g: G, id: string, color: string, t = 0) {
  const f = SHIPS[id]; if (!f) return;
  g.save();
  f(g, color, 0.85 + 0.15 * Math.sin(t * 5));
  g.restore();
}
