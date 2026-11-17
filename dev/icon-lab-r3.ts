// Dev-only icon lab, round 3 (helpers copied from round 2): key art + logo, with the logo placed per game (not always bottom centre), emblem-like
// key art where a game has one subject, name alternatives, and two more games. Sources: dev/icon-lab-src (real
// renderer captures) and the dungeon's own sprites/font.   /dev/icon-lab-r2.html → window.__icons
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
const CAD: Mark = { font: '86px Audiowide', fill: vgrad(['#ffffff', '#ffd2f6', '#ff6ae2']), stroke: '#2a0630', sw: 6, glow: '#ff2bd6', blur: 30, skew: -0.2 };
const KL_SMALL: Mark = { font: '700 38px Cinzel', fill: '#ffe7a8', glow: '#000c', blur: 10, track: 2 };
const KL_BIG: Mark = { font: '900 100px Cinzel', fill: vgrad(['#fffbe8', '#ffcb3b']), stroke: '#2b1d05', sw: 4, glow: '#ffd23b', blur: 26 };
const TD: Mark = { font: '64px Bungee', fill: vgrad(['#fff3c4', '#f2b544', '#b8741f']), stroke: '#1b1208', sw: 8, glow: '#000a', blur: 14 };
const WS: Mark = { font: '900 76px Fraunces', fill: vgrad(['#ffffff', '#c9fff0', '#5fe3c0']), stroke: '#08261f', sw: 6, glow: '#000a', blur: 16 };

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
function bossScene(boss: string, theme = 3): HTMLCanvasElement {
  const N = 64, c = canvas(N), g = ctx(c); g.imageSmoothingEnabled = false; g.fillStyle = '#1a1626'; g.fillRect(0, 0, N, N);
  buildBackground(world(theme, (x, y) => (y < 1 ? 1 : x === 0 || x === 3 ? (y < 2 ? 1 : 0) : 0), 4, 4)).draw(g, 0, 0, N, N, 1);
  torch(g, 8, 4, 0.3); torch(g, 56, 4, 0.7);
  glow(g, 8, 6, 22, '255,160,70', 0.22); glow(g, 56, 6, 22, '255,160,70', 0.22);
  const b = sprite2(boss, 'attack', 0); shadowAt(g, 36, 9 + b.height - 2, 13, 3); g.drawImage(b, 36 - b.width / 2 | 0, 8);
  const h = sprite2('hero', 'attack', 0, heroPalette(HERO)); shadowAt(g, 13, 61, 6, 2); g.drawImage(h, 5, 44);
  const ang = -0.95, ws = heldWeapon({ base: 'bolt', element: 'storm', rarity: 4, variant: 2 } as never, ang); g.drawImage(ws, Math.round(14 + Math.cos(ang) * 6 - ws.width / 2), Math.round(54 + Math.sin(ang) * 6 - ws.height / 2));
  for (const k of [0.3, 0.6]) { const p = projectileSprite({ style: 'bolt', color: '#7fe7ff', angle: ang, age: k, variant: 2 }); g.drawImage(p, Math.round(18 + 14 * k - p.width / 2), Math.round(48 - 20 * k - p.height / 2)); }
  for (let i = 0; i < 3; i++) { g.fillStyle = 'rgba(8,6,14,0.18)'; g.fillRect(0, N - 2 - i * 2, N, 2 + i * 2); g.fillRect(0, 0, 1 + i, N); g.fillRect(N - 1 - i, 0, 1 + i, N); }
  return c;
}
/** Hero hero-shot: the rider's character at 16 px on a lit floor patch, 32×32 native (blown up ×16). */
function heroPortrait(theme = 3): HTMLCanvasElement {
  const N = 32, c = canvas(N), g = ctx(c); g.imageSmoothingEnabled = false; g.fillStyle = '#1a1626'; g.fillRect(0, 0, N, N);
  buildBackground(world(theme, () => 0, 2, 2)).draw(g, 0, 0, N, N, 1);
  glow(g, 16, 18, 20, '255,170,90', 0.25);
  const h = sprite2('hero', 'attack', 0, heroPalette(HERO)); shadowAt(g, 16, 28, 7, 2); g.drawImage(h, 16 - h.width / 2 | 0, 11);
  const ang = -0.5, ws = heldWeapon({ base: 'bolt', element: 'storm', rarity: 4, variant: 2 } as never, ang); g.drawImage(ws, Math.round(17 + Math.cos(ang) * 6 - ws.width / 2), Math.round(21 + Math.sin(ang) * 6 - ws.height / 2));
  for (let i = 0; i < 3; i++) { g.fillStyle = 'rgba(8,6,14,0.2)'; g.fillRect(0, 0, N, 1 + i); g.fillRect(0, N - 1 - i, N, 1 + i); g.fillRect(0, 0, 1 + i, N); g.fillRect(N - 1 - i, 0, 1 + i, N); }
  return c;
}
const blowUp = (g: G, c: HTMLCanvasElement, sx = 0, sy = 0, sw = c.width, sh = c.height) => { g.imageSmoothingEnabled = false; g.drawImage(c, sx, sy, sw, sh, 0, 0, S, S); g.imageSmoothingEnabled = true; };


const WS_B: Mark = { font: '800 84px "Baloo 2"', fill: '#ffffff', stroke: '#1d5fb8', sw: 10, glow: '#0b2f6a', blur: 12 };
const WS_F: Mark = { font: '700 80px Fredoka', fill: vgrad(['#7fd6ff', '#2a8fe0']), stroke: '#ffffff', sw: 9, glow: '#0004', blur: 6 };
const WS_N: Mark = { font: '900 82px Nunito', fill: '#174a8c', stroke: '#ffffff', sw: 8 };
const SF: Mark = { font: '62px "Russo One"', fill: vgrad(['#ffffff', '#bcd2ff', '#5b8cff']), stroke: '#0b1640', sw: 8, glow: '#5b8cff', blur: 22 };
type Out = Record<string, string>;
async function main() {
  const names = ['cad-scene', 'cad-rear-0', 'cad-rear-0.15', 'cad-rear-5.9', 'td-turret', 'td-turret2', 'td-prism', 'ws-cloud1', 'ws-cloud4', 'ws-cloud5', 'ws-cloud4w', 'sf-1', 'sf-2', 'sf-3'];
  const im = Object.fromEntries(await Promise.all(names.map(async (n) => [n, await load(n)] as const))) as Record<string, HTMLImageElement>;
  for (const f of ['86px Audiowide', '64px Bungee', '800 84px "Baloo 2"', '700 80px Fredoka', '900 82px Nunito', '62px "Russo One"']) await document.fonts.load(f);
  const out: Out = {}, list = document.getElementById('out')!;
  const make = (id: string, draw: (g: G) => void) => { const c = canvas(), g = ctx(c); draw(g); out[id] = c.toDataURL('image/png'); c.title = id; list.append(c); };

  // Cadenza: the road (Brian's pick for distinctness) with the craft from behind, chase-cam style; logo on top.
  const road = (g: G) => { g.filter = 'brightness(0.62) saturate(1.25)'; g.drawImage(im['cad-scene'], -30, -10, S + 60, S + 60); g.filter = 'none'; };
  const craft = (g: G, k: string, x: number, y: number, w: number) => { g.globalCompositeOperation = 'screen'; g.drawImage(im[k], x, y, w, w); g.globalCompositeOperation = 'source-over'; };
  make('cadenza-chase', (g) => { road(g); craft(g, 'cad-rear-0', -24, 40, 560); shade(g, 'top', 0.85, '20,4,28', 0.4); line(g, 'CADENZA', S / 2 + 10, 96, { ...CAD, font: '74px Audiowide' }, 'center'); });
  make('cadenza-bank', (g) => { road(g); craft(g, 'cad-rear-0.15', -60, 20, 620); shade(g, 'top', 0.85, '20,4,28', 0.4); line(g, 'CADENZA', S / 2 + 10, 96, { ...CAD, font: '74px Audiowide' }, 'center'); });
  make('cadenza-dive', (g) => { road(g); craft(g, 'cad-rear-5.9', -20, -10, 640); shade(g, 'tl', 0.8, '20,4,28', 0.4); line(g, 'CADENZA', 30, 86, { ...CAD, font: '60px Audiowide' }, 'left'); });

  // Dynamo Defense: turret close-ups.
  make('towerdefense-turret', (g) => { g.drawImage(im['td-turret'], 0, 0, S, S); shade(g, 'top', 0.8, '14,10,6', 0.3); line(g, 'DYNAMO', 26, 82, { ...TD, font: '76px Bungee' }); });
  make('towerdefense-turret-wide', (g) => { g.drawImage(im['td-turret2'], 0, 0, S, S); shade(g, 'bottom', 0.8, '14,10,6', 0.3); line(g, 'DYNAMO', 26, S - 36, { ...TD, font: '76px Bungee' }); });
  make('towerdefense-prism', (g) => { g.drawImage(im['td-prism'], 0, 0, S, S); vignette(g, 0.5); shade(g, 'top', 0.7, '14,10,6', 0.3); line(g, 'DYNAMO', S / 2, 86, { ...TD, font: '76px Bungee' }, 'center'); });
  for (const [n, f] of [['HIVEBREAK', '58px Bungee'], ['SURGE', '96px Bungee'], ['GRIDLOCK', '66px Bungee'], ['LIVE WIRE', '62px Bungee'], ['COILGATE', '66px Bungee'], ['BROODWALL', '58px Bungee']] as const) {
    make(`towerdefense-name-${n.toLowerCase().replace(' ', '')}`, (g) => { g.drawImage(im['td-turret'], 0, 0, S, S); shade(g, 'top', 0.8, '14,10,6', 0.3); line(g, n, 26, 84, { ...TD, font: f }); });
  }

  // Watershed: cloud close-ups, three new letterings.
  make('watershed-cloud-baloo', (g) => { g.drawImage(im['ws-cloud1'], -16, 0, S + 32, S + 32); shade(g, 'top', 0.35, '20,60,120', 0.28); line(g, 'Watershed', S / 2, 84, WS_B, 'center'); });
  make('watershed-cloud-fredoka', (g) => { g.drawImage(im['ws-cloud4'], -16, 0, S + 32, S + 32); line(g, 'Watershed', S / 2, 82, WS_F, 'center'); });
  make('watershed-cloud-nunito', (g) => { g.drawImage(im['ws-cloud5'], -16, 0, S + 32, S + 32); line(g, 'watershed', S / 2, 80, WS_N, 'center'); });
  make('watershed-cloud-small', (g) => { g.drawImage(im['ws-cloud4w'], 0, 0, S, S); shade(g, 'bottom', 0.55, '10,40,30', 0.3); line(g, 'Watershed', S / 2, S - 34, { ...WS_B, font: '800 78px "Baloo 2"' }, 'center'); });

  // Sprocket Squadron: name candidates on one battle crop.
  for (const [n, f, k] of [['SPROCKET SQUADRON', '40px "Russo One"', 'sf-2'], ['BEATWING', '70px "Russo One"', 'sf-2'], ['DOWNBEAT', '70px "Russo One"', 'sf-2'], ['SKYBEAT', '78px "Russo One"', 'sf-2'], ['SALVO', '100px "Russo One"', 'sf-2'], ['CLOUDBREAK', '58px "Russo One"', 'sf-2']] as const) {
    make(`starfighter-name-${n.toLowerCase().replace(' ', '')}`, (g) => { g.drawImage(im[k], 0, 0, S, S); shade(g, 'top', 0.85, '6,10,30', 0.34); line(g, n, S / 2, 92, { ...SF, font: f }, 'center'); });
  }
  (window as unknown as { __icons: Out }).__icons = out;
}
main().catch((e) => { console.error(e); (window as unknown as { __err: string }).__err = String(e); });
