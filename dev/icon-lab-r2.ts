// Dev-only icon lab, round 2: key art + logo, with the logo placed per game (not always bottom centre), emblem-like
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

type Out = Record<string, string>;
async function main() {
  const names = ['cad-scene', 'cad-scene2', 'cad-craft', 'lh-scene', 'lh-scene2', 'lh-lantern', 'td-tesla', 'td-tesla2', 'td-dynamo', 'td-wide', 'ws-river', 'ws-delta'];
  const im = Object.fromEntries(await Promise.all(names.map(async (n) => [n, await load(n).catch(() => null)] as const))) as Record<string, HTMLImageElement | null>;
  for (const f of ['86px Audiowide', '900 100px Cinzel', '700 38px Cinzel', '64px Bungee', '900 76px Fraunces']) await document.fonts.load(f);
  const out: Out = {}, list = document.getElementById('out')!;
  const make = (id: string, draw: (g: G) => void) => { const c = canvas(), g = ctx(c); draw(g); out[id] = c.toDataURL('image/png'); c.title = id; list.append(c); };

  // ---- Cadenza ----
  make('cadenza-top', (g) => { g.drawImage(im['cad-scene']!, -20, 30, S + 40, S + 40); shade(g, 'top', 0.85, '20,4,28', 0.42); line(g, 'CADENZA', S / 2 + 10, 100, { ...CAD, font: '74px Audiowide' }, 'center'); });
  make('cadenza-craft', (g) => {
    g.filter = 'blur(6px) brightness(0.5) saturate(1.3)'; g.drawImage(im['cad-scene']!, -40, -40, S + 80, S + 80); g.filter = 'none';
    g.fillStyle = 'rgba(30,4,40,0.35)'; g.fillRect(0, 0, S, S);
    g.globalCompositeOperation = 'lighter'; g.drawImage(im['cad-craft']!, 10, 40, S * 0.95, S * 0.95); g.globalCompositeOperation = 'source-over';
    shade(g, 'tl', 0.7, '20,4,28', 0.45); line(g, 'CADENZA', 30, 92, { ...CAD, font: '62px Audiowide' }, 'left');
  });
  make('cadenza-behind', (g) => {
    g.filter = 'brightness(0.55) saturate(1.2)'; g.drawImage(im['cad-scene']!, 0, 0, S, S); g.filter = 'none';
    line(g, 'CADENZA', S / 2 + 12, S / 2 + 30, { ...CAD, font: '76px Audiowide', glow: '#ff2bd6', blur: 40 }, 'center');
    g.globalCompositeOperation = 'lighter'; g.drawImage(im['cad-craft']!, 40, 70, S * 0.85, S * 0.85); g.globalCompositeOperation = 'source-over'; vignette(g, 0.4);
  });

  // ---- Keeper's Light ----
  make('lighthouse-lantern', (g) => {
    g.drawImage(im['lh-lantern']!, -40, 10, S + 80, S + 80); vignette(g, 0.45);
    shade(g, 'top', 0.55, '5,8,20', 0.22);
    line(g, "KEEPER'S LIGHT", S / 2, 52, { ...KL_SMALL, font: '700 34px Cinzel', fill: '#fff1c4', track: 3 }, 'center');
  });
  make('lighthouse-side', (g) => {
    g.drawImage(im['lh-scene']!, -60, 0, S + 60, S + 60); shade(g, 'tr', 0.55, '5,8,20', 0.5);
    line(g, "KEEPER'S", S - 26, 96, KL_SMALL, 'right'); line(g, 'LIGHT', S - 22, 182, { ...KL_BIG, font: '900 86px Cinzel' }, 'right');
  });
  make('lighthouse-tall', (g) => {
    g.drawImage(im['lh-scene2']!, -150, -10, S + 120, S + 120); shade(g, 'right', 0.6, '5,8,20', 0.55);
    g.save(); g.translate(S - 40, S / 2 + 6); g.rotate(-Math.PI / 2); line(g, "KEEPER'S LIGHT", 0, 0, { ...KL_SMALL, font: '900 52px Cinzel', fill: vgrad(['#fffbe8', '#ffcb3b']), glow: '#ffd23b', blur: 18 }, 'center'); g.restore();
  });

  // ---- Crank Crawler (art, then name alternatives on the same art) ----
  const boss = bossScene('arch_necromancer'), bone = bossScene('bone_king', 0), hero = heroPortrait();
  make('dungeon-boss', (g) => { blowUp(g, boss); shade(g, 'bottom', 0.0); pixelMark(g, 'CRANK', 60, 24, 22); pixelMark(g, 'CRAWLER', 60, 24, 84); });
  make('dungeon-hero', (g) => { blowUp(g, hero, 2, 0, 28, 28); shade(g, 'tl', 0.5, '16,13,28', 0.4); pixelMark(g, 'CRANK', 50, S - 26, 22, 'right'); pixelMark(g, 'CRAWLER', 50, S - 26, 76, 'right'); });
  make('dungeon-boneking', (g) => { blowUp(g, bone); pixelMark(g, 'CRANK CRAWLER', 40, S / 2, 20, 'center'); });
  for (const [n, size] of [['DELVE', 120], ['TORCHDEEP', 64], ['UNDERCROFT', 58], ['GRIMHOLD', 70]] as const) {
    make(`dungeon-name-${n.toLowerCase()}`, (g) => { blowUp(g, boss); pixelMark(g, n, size, S / 2, 24, 'center'); });
  }

  // ---- Dynamo Defense ----
  if (im['td-tesla']) {
    make('towerdefense-tesla', (g) => { g.drawImage(im['td-tesla']!, 0, 0, S, S); shade(g, 'top', 0.8, '14,10,6', 0.38); line(g, 'DYNAMO', 24, 76, TD); line(g, 'DEFENSE', 24, 140, { ...TD, font: '50px Bungee' }); });
    make('towerdefense-dynamo', (g) => { g.drawImage(im['td-dynamo']!, 186, 80, 520, 520, 0, 0, S, S); vignette(g, 0.55, S / 2, S * 0.45); shade(g, 'bottom', 0.75, '14,10,6', 0.3); line(g, 'DYNAMO DEFENSE', S / 2, S - 30, { ...TD, font: '44px Bungee' }, 'center'); });
    for (const [n, f] of [['HIVEBREAK', '58px Bungee'], ['OVERDRIVE', '58px Bungee'], ['DYNAMO', '86px Bungee']] as const) {
      make(`towerdefense-name-${n.toLowerCase()}`, (g) => { g.drawImage(im['td-tesla2']!, 0, 0, S, S); shade(g, 'top', 0.8, '14,10,6', 0.34); line(g, n, S / 2, 94, { ...TD, font: f }, 'center'); });
    }
  }
  // ---- Watershed ----
  if (im['ws-river']) {
    make('watershed-river', (g) => { g.drawImage(im['ws-river']!, 0, 0, S, S); shade(g, 'tl', 0.6, '4,24,26', 0.45); line(g, 'Watershed', 26, 86, WS); });
    if (im['ws-delta']) make('watershed-delta', (g) => { g.drawImage(im['ws-delta']!, 0, 0, S, S); shade(g, 'bottom', 0.7, '4,24,26', 0.35); line(g, 'Watershed', S - 26, S - 34, { ...WS, font: '900 70px Fraunces' }, 'right'); });
  }
  (window as unknown as { __icons: Out }).__icons = out;
}
main().catch((e) => { console.error(e); (window as unknown as { __err: string }).__err = String(e); });
