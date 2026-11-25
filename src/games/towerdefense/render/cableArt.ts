// Power cable art and the tower power indicator.
// The cables are painted once into world-space bitmaps at about the tower sprites' texel density (armoured rubber
// with a lit edge, grain, ground staples, bundle straps on shared trunks, splice boxes, bridge clamps), and blitted
// every frame like the ground bake; only the small lamps and power pulses are live.
// Pure parts (power state, run splitting, the bake's paint plan) are tested; the canvas work is thin.
import type { Pt } from '../sim/road';
import { PAD_R } from '../sim/road';
import { cableRoadClear, cableRuns, cableRoutes, deckSides, onDeckSide, polyLength, sliceArc, along, type CableRun } from './cables';
import type { TdLevel } from '../sim/level';
import type { View } from './aliens/layer';

/** What the cables show: off (dynamo stalled), low (under the towers' rated power), ok, over (overclocked: towers run
 *  faster on the extra watts), overdrive (sprinting). `amount` 0..1 says how far into low/over the rider is. */
export type PowerKind = 'off' | 'low' | 'ok' | 'over' | 'overdrive';
export interface PowerState { kind: PowerKind; amount: number }
/** The ok band around rated power (grid 1 = the towers' rated speed). */
export const POWER_OK_LOW = 0.9, POWER_OK_HIGH = 1.08;
export function powerState(grid: number, stalled: boolean, overdrive: boolean, maxBoost = 1.6): PowerState {
  if (overdrive && grid > 0) return { kind: 'overdrive', amount: 1 };
  if (stalled || grid <= 0) return { kind: 'off', amount: 1 };
  if (grid < POWER_OK_LOW) return { kind: 'low', amount: Math.min(1, (POWER_OK_LOW - grid) / (POWER_OK_LOW - 0.3)) };
  if (grid > POWER_OK_HIGH) return { kind: 'over', amount: Math.min(1, (grid - POWER_OK_HIGH) / Math.max(0.05, maxBoost - POWER_OK_HIGH)) };
  return { kind: 'ok', amount: 0 };
}
/** The socket lamp on each tower's cable: colour, brightness 0..1 at time t, and whether pulses run down the cable. */
export function lampLook(p: PowerState, t: number): { color: string; on: number; pulses: boolean } {
  switch (p.kind) {
    case 'ok': return { color: '#7dff9a', on: 0.55, pulses: false };
    case 'low': { const hz = 1.2 + 2.6 * p.amount; return { color: '#ffb020', on: Math.sin(t * hz * Math.PI * 2) > -0.2 ? 1 : 0.12, pulses: false }; }
    case 'off': return { color: '#ff4a3a', on: Math.sin(t * 2.5 * Math.PI * 2) > -0.5 ? 1 : 0.1, pulses: false };
    case 'over': return { color: '#7ff2ff', on: 0.85 + 0.15 * p.amount, pulses: true };
    case 'overdrive': return { color: '#ffd36a', on: 1, pulses: true };
  }
}

/** A run cut into the stretches on open ground and those clamped along a bridge deck's side (drawn above the deck). */
export interface CablePiece { pts: Pt[]; load: number; bridge: boolean }
export function splitAtBridges(run: CableRun, onBridge: (p: Pt) => boolean): CablePiece[] {
  const len = polyLength(run.pts), n = Math.max(2, Math.ceil(len / 0.25)), out: CablePiece[] = [];
  let from = 0, cur = onBridge(along(run.pts, len, 0.5 / n));
  for (let i = 1; i <= n; i++) {
    const b = i < n && onBridge(along(run.pts, len, (i + 0.5) / n));
    if (i === n || b !== cur) { const a = from * len / n, z = i * len / n; if (z - a > 0.05) out.push({ pts: sliceArc(run.pts, a, z), load: run.load, bridge: cur }); from = i; cur = b; }
  }
  return out;
}
/** Every run's pieces for a level and its built pads, plus the splice and socket spots. */
export function cablePlan(level: TdLevel, built: ReadonlySet<number>) {
  const sides = deckSides(level), clear = cableRoadClear(level);
  const runs = cableRuns(cableRoutes(level), built);
  const pieces = runs.flatMap((r) => splitAtBridges(r, (p) => onDeckSide(sides, p, clear)));
  const splices = runs.filter((r) => r.spliced).map((r) => ({ at: r.pts[0], dir: dirAt(r.pts, 0) }));
  // a socket where each built tower's cable enters its clearing; its lamp is drawn live
  const sockets = cableRoutes(level).filter((r) => built.has(r.pad)).map((r) => {
    const pad = level.pads[r.pad], f = Math.max(0, 1 - (PAD_R + 0.7) / r.length), at = along(r.pts, r.length, f);
    return { pad: r.pad, at, dir: Math.atan2(pad.y - at.y, pad.x - at.x) };
  });
  return { pieces, splices, sockets };
}
const dirAt = (pts: readonly Pt[], i: number) => { const a = pts[Math.min(i, pts.length - 2)], b = pts[Math.min(i, pts.length - 2) + 1]; return Math.atan2(b.y - a.y, b.x - a.x); };
/** A polyline moved sideways by d (positive = left of travel in a y-down frame). */
export function offsetLine(pts: readonly Pt[], d: number): Pt[] {
  return pts.map((p, i) => {
    const a = pts[Math.max(0, i - 1)], b = pts[Math.min(pts.length - 1, i + 1)], dx = b.x - a.x, dy = b.y - a.y, l = Math.hypot(dx, dy) || 1;
    return { x: p.x + (dy / l) * d, y: p.y - (dx / l) * d };
  });
}

/** Cable colours: cold steel-armoured rubber, or white-hot in Overdrive. */
const COLD = { body: '#121518', mid: '#353c42', lit: 'rgba(190,205,212,0.42)', ring: 'rgba(6,8,10,0.28)', glow: null as string | null };
const HOT = { body: '#3b1806', mid: '#ff9233', lit: 'rgba(255,244,210,0.85)', ring: 'rgba(90,30,0,0.3)', glow: 'rgba(255,140,40,0.16)' };
/** Overclocked: a cyan charge in the armour. */
const CHARGED = { body: '#0d2a33', mid: '#2fa9c4', lit: 'rgba(200,250,255,0.85)', ring: 'rgba(0,30,40,0.35)', glow: 'rgba(80,220,255,0.13)' };
type Paint = typeof COLD;

export interface Layers { cold: Layer; hot: Layer; charged: Layer }
interface Layer { canvas: HTMLCanvasElement; x0: number; y0: number; w: number; h: number }
export interface CableBake { key: string; K: number; ground: Layers | null; bridge: Layers | null; sockets: ReturnType<typeof cablePlan>['sockets'] }

let noise: HTMLCanvasElement | null = null;
function grain(): HTMLCanvasElement {
  if (noise) return noise;
  noise = document.createElement('canvas'); noise.width = noise.height = 64;
  const g = noise.getContext('2d')!, img = g.createImageData(64, 64);
  let s = 1234567;
  for (let i = 0; i < 64 * 64; i++) { s = (s * 1103515245 + 12345) >>> 0; const v = (s >>> 16) & 255, c = v > 127 ? 255 : 0; img.data.set([c, c, c, Math.abs(v - 128) * 2], i * 4); }
  g.putImageData(img, 0, 0);
  return noise;
}

/** Paints the cables (cold and hot) for a level's built pads at K texels per unit, lit from `light` (a world-space
 *  unit vector towards the light, so the lit edge stays at the screen's top left in either orientation). */
export function bakeCables(level: TdLevel, built: ReadonlySet<number>, K: number, light: Pt, key: string): CableBake {
  const plan = cablePlan(level, built);
  const layer = (bridge: boolean) => {
    const pieces = plan.pieces.filter((p) => p.bridge === bridge);
    if (!pieces.length) return null;
    const all = pieces.flatMap((p) => p.pts).concat(bridge ? [] : plan.splices.map((s) => s.at), bridge ? [] : plan.sockets.map((s) => s.at));
    const m = 3, x0 = Math.min(...all.map((p) => p.x)) - m, y0 = Math.min(...all.map((p) => p.y)) - m;
    const w = Math.max(...all.map((p) => p.x)) + m - x0, h = Math.max(...all.map((p) => p.y)) + m - y0;
    const paint = (c: Paint): Layer => {
      const canvas = document.createElement('canvas'); canvas.width = Math.ceil(w * K); canvas.height = Math.ceil(h * K);
      const g = canvas.getContext('2d')!;
      g.setTransform(K, 0, 0, K, -x0 * K, -y0 * K); g.lineCap = 'round'; g.lineJoin = 'round';
      drawPieces(g, pieces, plan, c, light, bridge);
      return { canvas, x0, y0, w, h };
    };
    // the hot and charged sets are painted the first time they show, so a build only pays for the cold one
    let hot: Layer | null = null, charged: Layer | null = null;
    return { cold: paint(COLD), get hot() { return (hot ??= paint(HOT)); }, get charged() { return (charged ??= paint(CHARGED)); } };
  };
  return { key, K, ground: layer(false), bridge: layer(true), sockets: plan.sockets };
}

const CABLE_W = 0.78, SPACING = 0.64; // shared strands lie touching, as one loom
function strokeLine(g: CanvasRenderingContext2D, pts: readonly Pt[], width: number, style: string) {
  g.strokeStyle = style; g.lineWidth = width; g.beginPath(); pts.forEach((p, i) => (i ? g.lineTo(p.x, p.y) : g.moveTo(p.x, p.y))); g.stroke();
}
/** Marks every `step` units along a polyline: position and heading. */
function marks(pts: readonly Pt[], step: number, phase = 0.5): Array<{ p: Pt; a: number }> {
  const len = polyLength(pts), out: Array<{ p: Pt; a: number }> = [];
  for (let d = step * phase; d < len - step * 0.3; d += step) {
    const p = along(pts, len, d / len), q = along(pts, len, Math.min(1, (d + 0.2) / len));
    out.push({ p, a: Math.atan2(q.y - p.y, q.x - p.x) });
  }
  return out;
}
function box(g: CanvasRenderingContext2D, p: Pt, a: number, l: number, w: number, fill: string, rim: string, light: Pt) {
  g.save(); g.translate(p.x - light.x * 0.28, p.y - light.y * 0.28); g.rotate(a); g.fillStyle = 'rgba(0,0,0,0.32)'; g.fillRect(-l / 2, -w / 2, l, w); g.restore();
  g.save(); g.translate(p.x, p.y); g.rotate(a);
  g.fillStyle = fill; g.fillRect(-l / 2, -w / 2, l, w);
  g.strokeStyle = 'rgba(0,0,0,0.6)'; g.lineWidth = 0.1; g.strokeRect(-l / 2, -w / 2, l, w);
  // lit rim on the light's side
  const la = Math.atan2(light.y, light.x) - a, ly = Math.sin(la) >= 0 ? 1 : -1;
  g.strokeStyle = rim; g.lineWidth = 0.09; g.beginPath(); g.moveTo(-l / 2 + 0.08, ly * (w / 2 - 0.06)); g.lineTo(l / 2 - 0.08, ly * (w / 2 - 0.06)); g.stroke();
  g.restore();
}
function drawPieces(g: CanvasRenderingContext2D, pieces: CablePiece[], plan: ReturnType<typeof cablePlan>, c: Paint, light: Pt, bridge: boolean) {
  const strands = (p: CablePiece) => { const n = Math.min(3, p.load); return Array.from({ length: n }, (_, i) => offsetLine(p.pts, (i - (n - 1) / 2) * SPACING)); };
  const shade = { x: -light.x, y: -light.y };
  // soft contact shadow, away from the light
  for (const p of pieces) for (const s of strands(p)) {
    const sh = s.map((q) => ({ x: q.x + shade.x * 0.32, y: q.y + shade.y * 0.32 }));
    strokeLine(g, sh, CABLE_W + 0.55, 'rgba(0,0,0,0.12)'); strokeLine(g, sh, CABLE_W + 0.2, 'rgba(0,0,0,0.2)');
  }
  if (c.glow) for (const p of pieces) for (const s of strands(p)) { strokeLine(g, s, CABLE_W * 3.2, c.glow); strokeLine(g, s, CABLE_W * 2, c.glow); }
  for (const p of pieces) for (const s of strands(p)) {
    strokeLine(g, s, CABLE_W, c.body);
    strokeLine(g, s.map((q) => ({ x: q.x + light.x * 0.07, y: q.y + light.y * 0.07 })), CABLE_W * 0.62, c.mid);
    strokeLine(g, s.map((q) => ({ x: q.x + light.x * 0.2, y: q.y + light.y * 0.2 })), CABLE_W * 0.16, c.lit);
    // armour windings
    g.strokeStyle = c.ring; g.lineWidth = 0.11;
    for (const m of marks(s, 0.55)) { const ca = Math.cos(m.a + Math.PI / 2 + 0.35) * CABLE_W * 0.48, sa = Math.sin(m.a + Math.PI / 2 + 0.35) * CABLE_W * 0.48; g.beginPath(); g.moveTo(m.p.x - ca, m.p.y - sa); g.lineTo(m.p.x + ca, m.p.y + sa); g.stroke(); }
  }
  // grain over the cables only
  g.save(); g.setTransform(1, 0, 0, 1, 0, 0); g.globalCompositeOperation = 'source-atop'; g.globalAlpha = 0.22;
  g.fillStyle = g.createPattern(grain(), 'repeat')!; g.fillRect(0, 0, g.canvas.width, g.canvas.height); g.restore();
  for (const p of pieces) {
    const width = Math.min(3, p.load) * SPACING + 0.35;
    if (bridge) {
      // clamps bolting the cable to the deck's side
      for (const m of marks(p.pts, 3.4)) box(g, m.p, m.a, 0.42, width + 0.45, '#6f777d', 'rgba(230,236,240,0.7)', light);
    } else {
      // bundle straps on shared trunks, ground staples on single runs
      for (const m of marks(p.pts, p.load > 1 ? 6.5 : 5.5)) box(g, m.p, m.a, p.load > 1 ? 0.5 : 0.3, width + (p.load > 1 ? 0.1 : 0.4), p.load > 1 ? '#6a5130' : '#4f565c', p.load > 1 ? 'rgba(236,196,120,0.75)' : 'rgba(210,220,226,0.6)', light);
    }
  }
  if (!bridge) {
    for (const s of plan.splices) {
      box(g, s.at, s.dir, 1.7, 1.35, '#3c4248', 'rgba(220,226,230,0.7)', light);
      g.fillStyle = '#b08a4a'; for (const [dx, dy] of [[-0.6, -0.42], [0.6, -0.42], [-0.6, 0.42], [0.6, 0.42]]) { const ca = Math.cos(s.dir), sa = Math.sin(s.dir); g.beginPath(); g.arc(s.at.x + dx * ca - dy * sa, s.at.y + dx * sa + dy * ca, 0.1, 0, Math.PI * 2); g.fill(); }
    }
    for (const s of plan.sockets) box(g, s.at, s.dir, 1.0, 1.15, '#2c3135', 'rgba(220,226,230,0.65)', light);
  }
}

/** Draws a baked layer through the view (upright or turned), like the ground bake. */
export function blitLayer(g: CanvasRenderingContext2D, v: View, l: Layer, alpha = 1) {
  if (alpha <= 0) return;
  const a = v.P(l.x0, l.y0);
  g.save(); g.globalAlpha = alpha; g.translate(a.x, a.y); if (v.turned) g.transform(0, 1, -1, 0, 0, 0);
  g.drawImage(l.canvas, 0, 0, l.w * v.k, l.h * v.k);
  g.restore();
}
/** Draws a cable layer set for a power state and Overdrive blend: cold steel, cyan when overclocked, white-hot. */
export function blitCables(g: CanvasRenderingContext2D, v: View, l: Layers, p: PowerState, od: number) {
  const charge = p.kind === 'over' ? 0.45 + 0.55 * p.amount : 0;
  if (od < 1) blitLayer(g, v, l.cold, 1 - od);
  if (charge > 0 && od < 1) blitLayer(g, v, l.charged, charge * (1 - od));
  if (od > 0) blitLayer(g, v, l.hot, od);
}
/** World-space direction to the light for a view: the screen's top left. */
export const lightFor = (turned: boolean): Pt => (turned ? { x: -Math.SQRT1_2, y: Math.SQRT1_2 } : { x: -Math.SQRT1_2, y: -Math.SQRT1_2 });
