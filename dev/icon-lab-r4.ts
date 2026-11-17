// Dev-only icon lab, round 4 (helpers copied from round 3): key art + logo, with the logo placed per game (not always bottom centre), emblem-like
// key art where a game has one subject, name alternatives, and two more games. Sources: dev/icon-lab-src (real
// renderer captures) and the dungeon's own sprites/font.   /dev/icon-lab-r4.html → window.__icons
import { buildBackground } from '../src/games/dungeon/render/renderer';
import { sprite2, heroPalette, heldWeapon } from '../src/games/dungeon/render/sprites';
import { flameSprite, projectileSprite } from '../src/games/dungeon/render/effects';
import { fillText, pixelFont } from '../src/games/dungeon/render/font';
import type { World } from '../src/games/dungeon/sim/world';

const S = 512;
type G = CanvasRenderingContext2D;
const load = (n: string) => new Promise<HTMLImageElement>((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = () => rej(new Error(n)); i.src = `./icon-lab-src/${n}.png`; });
const canvas = (w = S, h = w) => { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; };
const ctx = (c: HTMLCanvasElement) => c.getContext('2d')!;

function vignette(g: G, a = 0.5, cx = S / 2, cy = S / 2) {
  const r = g.createRadialGradient(cx, cy, S * 0.25, cx, cy, S * 0.8);
  r.addColorStop(0, '#0000'); r.addColorStop(1, `rgba(4,3,10,${a})`); g.fillStyle = r; g.fillRect(0, 0, S, S);
}
/** Darken toward one edge so a logo placed there reads. */
function shade(g: G, side: 'top' | 'bottom' | 'left' | 'right' | 'tl' | 'tr' | 'bl', amt = 0.8, col = '6,6,16', reach = 0.5) {
  let lg: CanvasGradient;
  if (side === 'tl' || side === 'tr' || side === 'bl') {
    const cx = side === 'tr' ? S : 0, cy = side === 'bl' ? S : 0;
    lg = g.createRadialGradient(cx, cy, 0, cx, cy, S * reach * 1.6);
  } else {
    const [x0, y0, x1, y1] = { top: [0, 0, 0, S * reach], bottom: [0, S, 0, S * (1 - reach)], left: [0, 0, S * reach, 0], right: [S, 0, S * (1 - reach), 0] }[side];
    lg = g.createLinearGradient(x0, y0, x1, y1);
  }
  lg.addColorStop(0, `rgba(${col},${amt})`); lg.addColorStop(1, `rgba(${col},0)`); g.fillStyle = lg; g.fillRect(0, 0, S, S);
}
interface Mark { font: string; fill: string | ((g: G, y0: number, y1: number) => CanvasGradient); stroke?: string; sw?: number; glow?: string; blur?: number; skew?: number; track?: number }
/** One line of logotype. align: 'left' | 'center' | 'right'; y is the baseline. */
function line(g: G, text: string, x: number, y: number, m: Mark, align: CanvasTextAlign = 'left', size = 0) {
  g.save(); g.font = m.font; g.textAlign = align; g.textBaseline = 'alphabetic';
  if (m.track) (g as unknown as { letterSpacing: string }).letterSpacing = `${m.track}px`;
  g.translate(x, y); if (m.skew) g.transform(1, 0, m.skew, 1, 0, 0);
  const asc = size || parseFloat(m.font.match(/(\d+)px/)![1]) * 0.75;
  if (m.glow) { g.shadowColor = m.glow; g.shadowBlur = m.blur ?? 24; g.fillStyle = m.glow; g.fillText(text, 0, 0); g.shadowBlur = 0; }
  if (m.stroke) { g.lineJoin = 'round'; g.lineWidth = m.sw ?? 6; g.strokeStyle = m.stroke; g.strokeText(text, 0, 0); }
  g.fillStyle = typeof m.fill === 'string' ? m.fill : m.fill(g, -asc, 0); g.fillText(text, 0, 0);
  g.restore();
}
const vgrad = (stops: string[]) => (g: G, y0: number, y1: number) => { const lg = g.createLinearGradient(0, y0, 0, y1); stops.forEach((c, i) => lg.addColorStop(i / (stops.length - 1), c)); return lg; };

// Per-game logotypes

/** Crank Crawler's own pixel lettering: gold with an orange lower half and a chunky drop outline. */
function pixelMark(g: G, text: string, size: number, x: number, y: number, align: 'left' | 'center' | 'right' = 'left', col = ['#ffd84a', '#ff9f2e']) {
  g.imageSmoothingEnabled = false; g.textBaseline = 'top'; g.font = pixelFont(size);
  const w = measurePixel(g, text), sc = Math.max(1, Math.round(size / 10)), o = sc;
  const x0 = Math.round(align === 'left' ? x : align === 'right' ? x - w : x - w / 2);
  g.fillStyle = '#100d1c'; for (const [dx, dy] of [[-o, 0], [o, 0], [0, -o], [0, o], [o, o], [0, 2 * o], [o, 2 * o], [-o, o], [-o, 2 * o]]) fillText(g, text, x0 + dx, y + dy);
  g.fillStyle = col[0]; fillText(g, text, x0, y);
  g.save(); g.beginPath(); g.rect(0, y + size * 0.55, S, size); g.clip(); g.fillStyle = col[1]; fillText(g, text, x0, y); g.restore();
  return w;
}
function measurePixel(g: G, text: string) {
  const t = canvas(1024, 160), tg = ctx(t); tg.font = g.font; tg.textBaseline = 'top'; tg.fillStyle = '#fff'; fillText(tg, text, 0, 0);
  const d = tg.getImageData(0, 0, 1024, 160).data; let mx = 0;
  for (let x = 1023; x >= 0 && !mx; x--) for (let y = 0; y < 160; y++) if (d[(y * 1024 + x) * 4 + 3]) { mx = x; break; }
  return mx + 1;
}

// ---------- Crank Crawler native-pixel scenes ----------
function world(theme: number, rows: (x: number, y: number) => number, w = 8, h = 8): World {
  const tiles: number[] = []; for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) tiles.push(rows(x, y));
  return { floor: 1, w, h, tiles, rooms: [], adj: [], doorRoom: {}, spawn: { x: 1, y: 1 }, stairs: { x: 0, y: 0 }, theme } as unknown as World;
}
const HERO = '#ff2bd6';
function torch(g: G, x: number, y: number, t: number) { g.fillStyle = '#2a1e14'; g.fillRect(x - 1, y + 3, 2, 6); g.fillStyle = '#6b4a2a'; g.fillRect(x - 2, y + 2, 4, 2); g.drawImage(flameSprite(t), x - 4, y - 6); }
function glow(g: G, x: number, y: number, r: number, col: string, a: number) {
  g.globalCompositeOperation = 'lighter'; const rg = g.createRadialGradient(x, y, 0, x, y, r); rg.addColorStop(0, `rgba(${col},${a})`); rg.addColorStop(1, `rgba(${col},0)`); g.fillStyle = rg; g.fillRect(x - r, y - r, r * 2, r * 2); g.globalCompositeOperation = 'source-over';
}
function shadowAt(g: G, x: number, y: number, rx: number, ry: number) { g.fillStyle = '#100d1c66'; g.beginPath(); g.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2); g.fill(); }
/** Boss close-up: the boss looms (32 px art) over a corridor, the hero small in front, back to camera. 64×64 native. */
/** Boss close-up, 64×64 native. wand: 'over' (the game's own placement, over the body), 'side' (held out to the right,
 *  clear of the body), 'raised' (held up behind the shoulder, the hero drawn on top). */
function bossScene(boss: string, wand: 'over' | 'side' | 'raised' = 'side', theme = 3, bossY = 8): HTMLCanvasElement {
  const N = 64, c = canvas(N), g = ctx(c); g.imageSmoothingEnabled = false; g.fillStyle = '#1a1626'; g.fillRect(0, 0, N, N);
  buildBackground(world(theme, (x, y) => (y < 1 ? 1 : x === 0 || x === 3 ? (y < 2 ? 1 : 0) : 0), 4, 4)).draw(g, 0, 0, N, N, 1);
  torch(g, 8, 4, 0.3); torch(g, 56, 4, 0.7);
  glow(g, 8, 6, 22, '255,160,70', 0.22); glow(g, 56, 6, 22, '255,160,70', 0.22);
  const b = sprite2(boss, 'attack', 0); shadowAt(g, 36, bossY + 1 + b.height - 2, 13, 3); g.drawImage(b, 36 - b.width / 2 | 0, bossY);
  const h = sprite2('hero', 'attack', 0, heroPalette(HERO));
  const ang = wand === 'raised' ? -1.25 : -0.95, ws = heldWeapon({ base: 'bolt', element: 'storm', rarity: 4, variant: 2 } as never, ang);
  const [wx, wy] = wand === 'over' ? [14 + Math.cos(ang) * 6, 54 + Math.sin(ang) * 6] : wand === 'side' ? [25, 50] : [19, 43];
  const drawW = () => g.drawImage(ws, Math.round(wx - ws.width / 2), Math.round(wy - ws.height / 2));
  shadowAt(g, 13, 61, 6, 2);
  if (wand === 'raised') drawW();
  g.drawImage(h, 5, 44);
  if (wand !== 'raised') drawW();
  const tx = wx + Math.cos(ang) * 5, ty = wy + Math.sin(ang) * 5;
  for (const k of [0.3, 0.6]) { const p = projectileSprite({ style: 'bolt', color: '#7fe7ff', angle: ang, age: k, variant: 2 }); g.drawImage(p, Math.round(tx + 14 * k * Math.cos(ang) * 1.6 - p.width / 2), Math.round(ty + 14 * k * Math.sin(ang) * 1.6 - p.height / 2)); }
  for (let i = 0; i < 3; i++) { g.fillStyle = 'rgba(8,6,14,0.18)'; g.fillRect(0, N - 2 - i * 2, N, 2 + i * 2); g.fillRect(0, 0, 1 + i, N); g.fillRect(N - 1 - i, 0, 1 + i, N); }
  return c;
}
const blowUp = (g: G, c: HTMLCanvasElement, sx = 0, sy = 0, sw = c.width, sh = c.height) => { g.imageSmoothingEnabled = false; g.drawImage(c, sx, sy, sw, sh, 0, 0, S, S); g.imageSmoothingEnabled = true; };

/** Embossed lettering: dark extrusion below, a light edge above, then the face. Reads as cast metal or carved stone. */
function bevel(g: G, text: string, x: number, y: number, m: Mark, align: CanvasTextAlign, d: number, hi: string, lo: string, depth = 0) {
  g.save(); g.font = m.font; g.textAlign = align; if (m.track) (g as unknown as { letterSpacing: string }).letterSpacing = `${m.track}px`;
  if (m.glow) { g.shadowColor = m.glow; g.shadowBlur = m.blur ?? 24; g.fillStyle = m.glow; g.fillText(text, x, y); g.shadowBlur = 0; }
  if (m.stroke) { g.lineJoin = 'round'; g.lineWidth = m.sw ?? 6; g.strokeStyle = m.stroke; for (let i = 0; i <= depth; i++) g.strokeText(text, x, y + i); }
  g.fillStyle = lo; for (let i = 1; i <= depth; i++) g.fillText(text, x, y + i);
  g.fillStyle = lo; g.fillText(text, x + d * 0.5, y + d);
  g.fillStyle = hi; g.fillText(text, x - d * 0.5, y - d);
  const asc = parseFloat(m.font.match(/(\d+)px/)![1]) * 0.75;
  g.fillStyle = typeof m.fill === 'string' ? m.fill : (() => { g.translate(0, y); const f = m.fill(g, -asc, 0); g.translate(0, -y); return f; })(); g.fillText(text, x, y);
  g.restore();
}
/** Text whose baseline rides a gentle wave, each letter tilted with the slope: a cartoon river. */
function waveLine(g: G, text: string, cx: number, y: number, m: Mark, amp: number, waves: number, lean = 0) {
  g.save(); g.font = m.font; const ws = [...text].map((ch) => g.measureText(ch).width + (m.track ?? 0)), tot = ws.reduce((a, b) => a + b, 0);
  const k = (Math.PI * 2 * waves) / tot; const x = cx - tot / 2;
  const glyph = (pass: (ch: string) => void) => { let xx = x; [...text].forEach((ch, i) => { const mid = xx + ws[i] / 2 - (cx - tot / 2), yy = y + amp * Math.sin(mid * k);
    g.save(); g.translate(xx + ws[i] / 2, yy); g.rotate(Math.atan(amp * k * Math.cos(mid * k)) * 0.8 + lean); if (m.skew) g.transform(1, 0, m.skew, 1, 0, 0); pass(ch); g.restore(); xx += ws[i]; }); };
  g.textAlign = 'center'; const asc = parseFloat(m.font.match(/(\d+)px/)![1]) * 0.75;
  if (m.glow) glyph((ch) => { g.shadowColor = m.glow!; g.shadowBlur = m.blur ?? 20; g.fillStyle = m.glow!; g.fillText(ch, 0, 0); g.shadowBlur = 0; });
  if (m.stroke) glyph((ch) => { g.lineJoin = 'round'; g.lineWidth = m.sw ?? 6; g.strokeStyle = m.stroke!; g.strokeText(ch, 0, 0); });
  glyph((ch) => { g.fillStyle = typeof m.fill === 'string' ? m.fill : m.fill(g, -asc, 0); g.fillText(ch, 0, 0); });
  // a light glint across the upper half of each letter, like light on water
  glyph((ch) => { g.save(); g.beginPath(); g.rect(-100, -asc, 200, asc * 0.38); g.clip(); g.fillStyle = 'rgba(255,255,255,0.45)'; g.fillText(ch, 0, 0); g.restore(); });
  g.restore(); return tot;
}
/** Delve's pixel mark, made dramatic: a deep carved extrusion, a pale top edge, stone-to-violet face and a magic glow. */
function pixelBevel(g: G, text: string, size: number, x: number, y: number, face: string[], ext: string, glowCol: string, steps = 3) {
  g.imageSmoothingEnabled = false; g.textBaseline = 'top'; g.font = pixelFont(size);
  const w = measurePixel(g, text), o = Math.max(1, Math.round(size / 10)), x0 = Math.round(x - w / 2);
  g.save(); g.shadowColor = glowCol; g.shadowBlur = 40; g.fillStyle = glowCol; fillText(g, text, x0, y + 2 * o); g.restore();
  g.fillStyle = '#07050d'; for (const [dx, dy] of [[-o, -o], [o, -o], [-o, 0], [o, 0], [0, -o], [-o, (steps + 1) * o], [o, (steps + 1) * o], [0, (steps + 2) * o], [-o, 2 * o], [o, 2 * o]]) fillText(g, text, x0 + dx, y + dy);
  g.fillStyle = ext; for (let i = 1; i <= steps; i++) fillText(g, text, x0, y + i * o);
  const band = (col: string, a: number, b: number) => { g.save(); g.beginPath(); g.rect(0, y + size * a, S, size * (b - a)); g.clip(); g.fillStyle = col; fillText(g, text, x0, y); g.restore(); };
  band(face[0], -0.2, 0.3); band(face[1], 0.3, 0.6); band(face[2], 0.6, 1.2);
  // pale top edge: the face again, clipped to the top o pixels of each stroke, via a one-step-down mask
  const t = canvas(), tg = ctx(t); tg.imageSmoothingEnabled = false; tg.textBaseline = 'top'; tg.font = g.font; tg.fillStyle = face[3] ?? '#ffffff'; fillText(tg, text, x0, y);
  tg.globalCompositeOperation = 'destination-out'; fillText(tg, text, x0, y + o); g.drawImage(t, 0, 0);
  return w;
}

const CAD: Mark = { font: '74px Audiowide', fill: vgrad(['#ffffff', '#ffd2f6', '#ff6ae2']), stroke: '#2a0630', sw: 6, glow: '#ff2bd6', blur: 30, skew: -0.2 };
const TD: Mark = { font: '76px Bungee', fill: vgrad(['#fff3c4', '#f2b544', '#b8741f']), stroke: '#1b1208', sw: 8, glow: '#000a', blur: 14 };
const SF: Mark = { font: '70px "Russo One"', fill: vgrad(['#ffffff', '#bcd2ff', '#5b8cff']), stroke: '#0b1640', sw: 8, glow: '#5b8cff', blur: 22 };
const WATER = vgrad(['#e9fbff', '#8fe0ff', '#2f9be8', '#1c6fd0']);
type Out = Record<string, string>;
async function main() {
  const names = ['cad-scene', 'cad-rear-0', 'cad-craft', 'lh-scene', 'td-scene', 'td-scene-tight', 'ws-cloud1', 'ws-cloud4', 'ws-cloud5', 'sf-c0', 'sf-c2', 'sf-c2t', 'sf-2'];
  const im = Object.fromEntries(await Promise.all(names.map(async (n) => [n, await load(n)] as const))) as Record<string, HTMLImageElement>;
  for (const f of ['74px Audiowide', '76px Bungee', '70px "Russo One"', '800 84px "Baloo 2"', '700 80px Fredoka', '400 40px "IM Fell English SC"', 'italic 400 40px "IM Fell English"', '900 40px "Playfair Display SC"', '900 40px "Cinzel Decorative"', '400 40px "Uncial Antiqua"', '700 40px Cinzel']) await document.fonts.load(f);
  const out: Out = {}, list = document.getElementById('out')!;
  const make = (id: string, draw: (g: G) => void) => { const c = canvas(), g = ctx(c); draw(g); out[id] = c.toDataURL('image/png'); c.title = id; list.append(c); };

  // ---- Cadenza: the chase cam, with the road no longer dimmed to 62%.
  const craft = (g: G, k: string, x: number, y: number, w: number) => { g.globalCompositeOperation = 'screen'; g.drawImage(im[k], x, y, w, w); g.globalCompositeOperation = 'source-over'; };
  for (const [id, f, sh] of [['cadenza-chase-bright', 'brightness(0.95) saturate(1.35) contrast(1.08)', 0.7], ['cadenza-chase-mid', 'brightness(0.8) saturate(1.35) contrast(1.12)', 0.8]] as const) {
    make(id, (g) => { g.filter = f; g.drawImage(im['cad-scene'], -30, -10, S + 60, S + 60); g.filter = 'none'; craft(g, 'cad-rear-0', -24, 40, 560); shade(g, 'top', sh, '20,4,28', 0.34); line(g, 'CADENZA', S / 2 + 10, 96, CAD, 'center'); });
  }

  // ---- Delve: the wand moved off the hero; more dramatic lettering.
  const side = bossScene('arch_necromancer', 'side'), raised = bossScene('arch_necromancer', 'raised');
  make('dungeon-wand-side', (g) => { blowUp(g, side); pixelMark(g, 'DELVE', 120, S / 2, 24, 'center'); });
  make('dungeon-wand-raised', (g) => { blowUp(g, raised); pixelMark(g, 'DELVE', 120, S / 2, 24, 'center'); });
  const low = bossScene('arch_necromancer', 'side', 3, 15);
  make('dungeon-type-gold-soft', (g) => { blowUp(g, low); pixelBevel(g, 'DELVE', 100, S / 2, 12, ['#fff0a0', '#ffd84a', '#ff9f2e', '#fff8d0'], '#5a250a', '#9b5cff88', 1); });
  make('dungeon-type-gold-lowboss', (g) => { blowUp(g, low); pixelMark(g, 'DELVE', 110, S / 2, 14, 'center'); });
  make('dungeon-type-carved', (g) => { blowUp(g, side); pixelBevel(g, 'DELVE', 120, S / 2, 20, ['#f3eaff', '#c7b3ff', '#8a63e6', '#ffffff'], '#3b2370', '#9b5cff'); });
  make('dungeon-type-gold', (g) => { blowUp(g, side); pixelBevel(g, 'DELVE', 120, S / 2, 20, ['#fff4b8', '#ffd84a', '#ff9f2e', '#ffffff'], '#6a2c0c', '#b46bff'); });
  make('dungeon-type-uncial', (g) => { blowUp(g, side); shade(g, 'top', 0.55, '10,6,24', 0.3);
    bevel(g, 'Delve', S / 2, 118, { font: '400 128px "Uncial Antiqua"', fill: vgrad(['#ffffff', '#d9c8ff', '#9a6bff']), stroke: '#12081f', sw: 10, glow: '#a46bff', blur: 40 }, 'center', 3, '#ffffffcc', '#2a1052', 6); });
  make('dungeon-type-decorative', (g) => { blowUp(g, side); shade(g, 'top', 0.55, '10,6,24', 0.3);
    bevel(g, 'DELVE', S / 2, 116, { font: '900 108px "Cinzel Decorative"', fill: vgrad(['#fffbe8', '#ffd76a', '#c27a1a']), stroke: '#1a0d05', sw: 8, glow: '#9b5cff', blur: 44 }, 'center', 3, '#fff8d8', '#3a1d05', 6); });

  // ---- Keeper's Light: option 2 layout (sky top right), with period lettering.
  const lh = (g: G) => { g.drawImage(im['lh-scene'], -205, -30, S + 215, S + 215); shade(g, 'tr', 0.6, '5,8,20', 0.5); };
  const rule = (g: G, x0: number, x1: number, y: number, col: string) => { g.strokeStyle = col; g.lineWidth = 2; g.beginPath(); g.moveTo(x0, y); g.lineTo(x1, y); g.stroke(); g.lineWidth = 1; g.beginPath(); g.moveTo(x0 + 8, y + 5); g.lineTo(x1 - 8, y + 5); g.stroke();
    g.fillStyle = col; g.beginPath(); const m = (x0 + x1) / 2; g.moveTo(m, y - 6); g.lineTo(m + 6, y + 2.5); g.lineTo(m, y + 11); g.lineTo(m - 6, y + 2.5); g.closePath(); g.fill(); };
  make('lighthouse-fell', (g) => { lh(g); const R = S - 30;
    line(g, "Keeper's", R - 6, 96, { font: 'italic 400 50px "IM Fell English"', fill: '#f6e7c1', glow: '#000d', blur: 12 }, 'right');
    line(g, 'LIGHT', R, 172, { font: '400 72px "IM Fell English SC"', fill: vgrad(['#fffaf0', '#f3d79a']), glow: '#ffcf6a', blur: 22, track: 2 }, 'right');
    rule(g, R - 180, R, 192, '#f3d79acc'); });
  make('lighthouse-playfair', (g) => { lh(g); const R = S - 28;
    line(g, "KEEPER'S", R, 86, { font: '900 30px "Playfair Display SC"', fill: '#f6e7c1', glow: '#000d', blur: 10, track: 7 }, 'right');
    bevel(g, 'Light', R, 168, { font: '900 84px "Playfair Display SC"', fill: vgrad(['#fff6d6', '#f2c04a', '#b67a14']), stroke: '#1d1203', sw: 5, glow: '#ffcf6a', blur: 26 }, 'right', 2, '#fffbe8', '#3a2405', 3);
    rule(g, R - 200, R, 190, '#f2c04acc'); });
  make('lighthouse-brass', (g) => { lh(g); const R = S - 26;
    line(g, "KEEPER'S", R - 4, 90, { font: '700 30px "Cinzel Decorative"', fill: '#f6e7c1', glow: '#000d', blur: 10, track: 5 }, 'right');
    bevel(g, 'Light', R, 170, { font: '900 76px "Cinzel Decorative"', fill: vgrad(['#fff6d6', '#e9b949', '#9a6410']), stroke: '#1d1203', sw: 5, glow: '#ffcf6a', blur: 24 }, 'right', 2, '#fffbe8', '#3a2405', 3); });

  // ---- Dynamo Defense: the compressed scene: dynamo firing, the tesla's arc through the brood.
  make('towerdefense-scene', (g) => { g.drawImage(im['td-scene'], 0, 0, S, S); vignette(g, 0.35); shade(g, 'bottom', 0.75, '14,10,6', 0.3); line(g, 'DYNAMO', S - 26, S - 34, TD, 'right'); });
  make('towerdefense-scene-tight', (g) => { g.drawImage(im['td-scene-tight'], 0, 0, S, S); vignette(g, 0.35); shade(g, 'bottom', 0.75, '14,10,6', 0.3); line(g, 'DYNAMO', S - 26, S - 34, TD, 'right'); });
  make('towerdefense-scene-hivebreak', (g) => { g.drawImage(im['td-scene'], 0, 0, S, S); vignette(g, 0.35); shade(g, 'bottom', 0.75, '14,10,6', 0.3); line(g, 'HIVEBREAK', S - 24, S - 34, { ...TD, font: '60px Bungee' }, 'right'); });

  // ---- Watershed: the name at the bottom, riding a cartoon wave.
  const WSM: Mark = { font: '800 92px "Baloo 2"', fill: WATER, stroke: '#ffffff', sw: 12, glow: '#0b2f6acc', blur: 14 };
  make('watershed-wave', (g) => { g.drawImage(im['ws-cloud1'], -40, -70, S + 80, S + 80); shade(g, 'bottom', 0.45, '10,40,90', 0.3); waveLine(g, 'Watershed', S / 2, S - 44, WSM, 9, 1); });
  make('watershed-wave-lean', (g) => { g.drawImage(im['ws-cloud4'], -40, -66, S + 80, S + 80); shade(g, 'bottom', 0.45, '10,40,90', 0.3); waveLine(g, 'Watershed', S / 2 + 4, S - 46, { ...WSM, skew: -0.18 }, 12, 1.25); });
  make('watershed-wave-fredoka', (g) => { g.drawImage(im['ws-cloud5'], -40, -66, S + 80, S + 80); shade(g, 'bottom', 0.45, '10,40,90', 0.3); waveLine(g, 'Watershed', S / 2, S - 42, { ...WSM, font: '700 86px Fredoka', sw: 11 }, 10, 1); });

  // ---- Sprocket Squadron: carrier deck instead of lava, and pulse/bass names.
  const carrier = (g: G, k = 'sf-c2t') => { g.drawImage(im[k], 0, 0, S, S); shade(g, 'bottom', 0.8, '6,10,30', 0.3); };
  const sfName = (g: G, n: string, size: number) => line(g, n, S / 2, S - 34, { ...SF, font: `${size}px "Russo One"` }, 'center');
  make('starfighter-carrier', (g) => { carrier(g); sfName(g, 'BEATWING', 76); });
  make('starfighter-carrier-wide', (g) => { g.drawImage(im['sf-c2'], 0, -30, S, S); g.drawImage(im['sf-c2'], 0, S - 31, S, 31, 0, S - 31, S, 31); shade(g, 'bottom', 0.8, '6,10,30', 0.3); sfName(g, 'BEATWING', 76); });
  make('starfighter-carrier-side', (g) => { g.drawImage(im['sf-c0'], 0, 0, S, S); shade(g, 'bottom', 0.8, '6,10,30', 0.3); sfName(g, 'BEATWING', 76); });
  make('starfighter-lava', (g) => { g.drawImage(im['sf-2'], 0, 0, S, S); shade(g, 'bottom', 0.8, '6,10,30', 0.3); sfName(g, 'BEATWING', 76); });
  for (const [n, size] of [['PULSEWING', 66], ['PULSAR', 96], ['PULSEJET', 72], ['STARBASS', 72], ['BASSWING', 70]] as const) {
    make(`starfighter-name-${n.toLowerCase()}`, (g) => { carrier(g); sfName(g, n, size); });
  }
  // ---- Hero key art: 16:9, no text, an intentional crop of the subject (shown briefly before the clip plays).
  const HW = 960, HH = 540;
  const wide = (id: string, draw: (g: G) => void) => { const c = canvas(HW, HH), g = ctx(c); draw(g); out[id] = c.toDataURL('image/png'); };
  wide('hero-cadenza', (g) => { g.filter = 'brightness(0.55) saturate(1.3) contrast(1.15)'; g.drawImage(im['cad-scene'], 0, -230, HW, HW); g.filter = 'none';
    g.globalCompositeOperation = 'screen'; g.drawImage(im['cad-craft'], 130, -100, 720, 720); g.globalCompositeOperation = 'source-over'; });
  wide('hero-dungeon', (g) => { const N = 96, M = 54, c = canvas(N, M), d = ctx(c); d.imageSmoothingEnabled = false; d.fillStyle = '#1a1626'; d.fillRect(0, 0, N, M);
    buildBackground(world(3, (x, y) => (y < 1 ? 1 : 0), 6, 4)).draw(d, 0, 0, N, 64, 1);
    torch(d, 14, 4, 0.3); torch(d, 82, 4, 0.7); glow(d, 14, 6, 24, '255,160,70', 0.22); glow(d, 82, 6, 24, '255,160,70', 0.22);
    const b = sprite2('arch_necromancer', 'attack', 0); shadowAt(d, 58, 9 + b.height - 2, 13, 3); d.drawImage(b, 58 - b.width / 2 | 0, 8);
    const h = sprite2('hero', 'attack', 0, heroPalette(HERO)); shadowAt(d, 26, 45, 6, 2); d.drawImage(h, 18, 28);
    const ang = -0.45, ws = heldWeapon({ base: 'bolt', element: 'storm', rarity: 4, variant: 2 } as never, ang); d.drawImage(ws, 36 - ws.width / 2 | 0, 32 - ws.height / 2 | 0);
    for (const k of [0.35, 0.7]) { const pr = projectileSprite({ style: 'bolt', color: '#7fe7ff', angle: ang, age: k, variant: 2 }); d.drawImage(pr, Math.round(40 + 14 * k - pr.width / 2), Math.round(30 - 7 * k - pr.height / 2)); }
    g.imageSmoothingEnabled = false; g.drawImage(c, 0, 0, N, M, 0, 0, HW, HH); g.imageSmoothingEnabled = true; });
  (window as unknown as { __icons: Out }).__icons = out;
}
main().catch((e) => { console.error(e); (window as unknown as { __err: string }).__err = String(e); });
