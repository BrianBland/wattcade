// Dev-only icon lab: composes picker icons (512×512) from real renderer captures in dev/icon-lab-src and the dungeon's own sprites.
//   /dev/icon-lab.html  → window.__icons = { '<game>-<style>': dataURL }
import { buildBackground } from '../src/games/dungeon/render/renderer';
import { sprite2, heroPalette, heldWeapon } from '../src/games/dungeon/render/sprites';
import { flameSprite, projectileSprite } from '../src/games/dungeon/render/effects';
import { fillText, strokeText, pixelFont } from '../src/games/dungeon/render/font';
import type { World } from '../src/games/dungeon/sim/world';

const S = 512;
const q = new URLSearchParams(location.search);
const load = (n: string) => new Promise<HTMLImageElement>((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = `./icon-lab-src/${n}.png`; });
const canvas = (w = S, h = w) => { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; };
const ctx = (c: HTMLCanvasElement) => c.getContext('2d')!;

function vignette(g: CanvasRenderingContext2D, a = 0.55, inner = 0.45) {
  const r = g.createRadialGradient(S / 2, S / 2, S * inner * 0.6, S / 2, S / 2, S * 0.75);
  r.addColorStop(0, '#0000'); r.addColorStop(1, `rgba(4,3,10,${a})`);
  g.fillStyle = r; g.fillRect(0, 0, S, S);
}
function bottomShade(g: CanvasRenderingContext2D, from = 0.5, a = 0.85, col = '6,6,16') {
  const lg = g.createLinearGradient(0, S * from, 0, S);
  lg.addColorStop(0, `rgba(${col},0)`); lg.addColorStop(1, `rgba(${col},${a})`);
  g.fillStyle = lg; g.fillRect(0, S * from, S, S * (1 - from));
}
/** Downsample to n×n, posterize, and blow back up with nearest-neighbour: the house pixel treatment. */
function pixelate(src: CanvasImageSource, n: number, levels = 6, sx = 0, sy = 0, sw = 1024, sh = 1024) {
  const sm = canvas(n), sg = ctx(sm); sg.imageSmoothingQuality = 'high'; sg.drawImage(src, sx, sy, sw, sh, 0, 0, n, n);
  const d = sg.getImageData(0, 0, n, n), p = d.data, st = 255 / (levels - 1);
  for (let i = 0; i < p.length; i += 4) for (let k = 0; k < 3; k++) {
    const v = Math.min(255, p[i + k] * 1.08); // a touch of lift so posterized darks don't crush
    p[i + k] = Math.round(Math.round(v / st) * st * 0.85 + v * 0.15);
  }
  sg.putImageData(d, 0, 0);
  return sm;
}
function blit(g: CanvasRenderingContext2D, small: HTMLCanvasElement) { g.imageSmoothingEnabled = false; g.drawImage(small, 0, 0, S, S); g.imageSmoothingEnabled = true; }

/** House pixel nameplate (style D): a dark band with the title in the arcade pixel face. */
function pixelPlate(g: CanvasRenderingContext2D, text: string, accent: string) {
  const h = 92;
  g.fillStyle = 'rgba(11,14,24,0.88)'; g.fillRect(0, S - h, S, h);
  g.fillStyle = accent; g.fillRect(0, S - h, S, 8);
  g.fillStyle = 'rgba(255,255,255,0.12)'; g.fillRect(0, S - h + 8, S, 4);
  g.imageSmoothingEnabled = false;
  g.font = pixelFont(text.length > 11 ? 40 : 50); g.textBaseline = 'top';
  const w = measurePixel(g, text), x = Math.round((S - w) / 2), y = S - h + 30;
  g.strokeStyle = '#05040a'; strokeText(g, text, x, y);
  g.fillStyle = '#fff4dc'; fillText(g, text, x, y);
}
function measurePixel(g: CanvasRenderingContext2D, text: string) {
  const t = canvas(1024, 128), tg = ctx(t); tg.font = g.font; tg.textBaseline = 'top'; tg.fillStyle = '#fff'; fillText(tg, text, 0, 0);
  const d = tg.getImageData(0, 0, 1024, 128).data; let mx = 0;
  for (let x = 0; x < 1024; x++) for (let y = 0; y < 128; y++) if (d[(y * 1024 + x) * 4 + 3]) { mx = x; break; }
  return mx + 1;
}

// ---------- Crank Crawler: a native-pixel scene from the game's own tiles and sprites ----------
function dungeonWorld(): World {
  const w = 8, h = 8, tiles: number[] = [];
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    let t = 0;
    if (y < 2) t = 1;
    if ((x >= 6 && y >= 5) || (x === 5 && y === 6) || (x === 7 && y === 4)) t = 2;
    if (x === 1 && y === 6) t = 6;
    tiles.push(t);
  }
  return { floor: 1, w, h, tiles, rooms: [], adj: [], doorRoom: {}, spawn: { x: 2, y: 4 }, stairs: { x: 0, y: 0 }, theme: Number(q.get('theme') ?? 3) } as unknown as World;
}
const HERO = '#ff2bd6', BOSS = q.get('boss') ?? 'arch_necromancer';
function dungeonScene(t = 0.4): HTMLCanvasElement {
  const N = 128, c = canvas(N), g = ctx(c); g.imageSmoothingEnabled = false;
  g.fillStyle = '#1a1626'; g.fillRect(0, 0, N, N);
  buildBackground(dungeonWorld()).draw(g, 0, 0, N, N, 1);
  // wall torches and the brazier (flames are drawn live in the game too)
  for (const [x, y] of [[2 * 16 + 8, 16 + 4], [6 * 16 + 8, 16 + 4]] as const) {
    g.fillStyle = '#2a1e14'; g.fillRect(x - 1, y + 3, 2, 6); g.fillStyle = '#6b4a2a'; g.fillRect(x - 2, y + 2, 4, 2);
    g.drawImage(flameSprite(t + x), x - 4, y - 6);
  }
  g.drawImage(flameSprite(t + 0.2), 16 + 4, 6 * 16 - 2);
  // warm light pools
  g.globalCompositeOperation = 'lighter';
  for (const [x, y, r, a] of [[40, 26, 34, 0.18], [104, 26, 34, 0.18], [24, 96, 26, 0.16]] as const) {
    const rg = g.createRadialGradient(x, y, 0, x, y, r); rg.addColorStop(0, `rgba(255,160,70,${a})`); rg.addColorStop(1, 'rgba(255,160,70,0)'); g.fillStyle = rg; g.fillRect(x - r, y - r, r * 2, r * 2);
  }
  g.globalCompositeOperation = 'source-over';
  // boss (32px) top-right, hero bottom-left firing at it
  const boss = sprite2(BOSS, 'attack', 0);
  const bx = 76, by = 30;
  g.fillStyle = '#100d1c66'; g.beginPath(); g.ellipse(bx + boss.width / 2, by + boss.height - 2, 13, 4, 0, 0, Math.PI * 2); g.fill();
  g.drawImage(boss, bx, by);
  const hero = sprite2('hero', 'attack', 0, heroPalette(HERO));
  const hx = 34, hy = 70;
  g.fillStyle = '#100d1c66'; g.beginPath(); g.ellipse(hx + hero.width / 2, hy + hero.height - 1, 6, 2, 0, 0, Math.PI * 2); g.fill();
  g.drawImage(hero, hx, hy);
  const ang = Math.atan2(by + 16 - (hy + 9), bx + 16 - (hx + 9));
  const ws = heldWeapon({ base: 'bolt', element: 'storm', rarity: 4, variant: 2 } as never, ang);
  g.drawImage(ws, Math.round(hx + 9 + Math.cos(ang) * 6 - ws.width / 2), Math.round(hy + 10 + Math.sin(ang) * 6 - ws.height / 2));
  for (const k of [0.32, 0.55, 0.78]) {
    const p = projectileSprite({ style: 'bolt', color: '#7fe7ff', angle: ang, age: k, variant: 2 });
    const x = hx + 9 + (bx + 16 - hx - 9) * k, y = hy + 9 + (by + 16 - hy - 9) * k;
    g.drawImage(p, Math.round(x - p.width / 2), Math.round(y - p.height / 2));
  }
  // enemy shots back at the hero
  for (const [x, y] of [[66, 70], [84, 84]] as const) { const p = projectileSprite({ style: 'orb', color: '#ff5a7a', angle: Math.PI, age: 0.2, variant: 0 }); g.drawImage(p, x, y); }
  // stepped darkness at the edges, like the run screen
  for (let i = 0; i < 4; i++) { g.fillStyle = 'rgba(8,6,14,0.16)'; g.fillRect(0, 0, N, 2 + i * 2); g.fillRect(0, N - 2 - i * 2, N, 2 + i * 2); g.fillRect(0, 0, 2 + i * 2, N); g.fillRect(N - 2 - i * 2, 0, 2 + i * 2, N); }
  return c;
}

// ---------- Wordmarks (style B) ----------
function cadenzaMark(g: CanvasRenderingContext2D) {
  g.save(); g.translate(S / 2, S - 70); g.transform(1, 0, -0.2, 1, 0, 0);
  g.font = '86px Audiowide'; g.textAlign = 'center'; g.textBaseline = 'alphabetic';
  g.shadowColor = '#ff2bd6'; g.shadowBlur = 34; g.fillStyle = '#ff2bd6'; g.fillText('CADENZA', 0, 0);
  g.shadowBlur = 0;
  const lg = g.createLinearGradient(0, -70, 0, 0); lg.addColorStop(0, '#ffffff'); lg.addColorStop(0.55, '#ffd2f6'); lg.addColorStop(1, '#ff6ae2');
  g.lineWidth = 6; g.strokeStyle = '#2a0630'; g.strokeText('CADENZA', 0, 0);
  g.fillStyle = lg; g.fillText('CADENZA', 0, 0);
  g.fillStyle = '#7ff6ff'; g.fillRect(-196, 12, 392, 5); // beat bar
  g.restore();
}
function keeperMark(g: CanvasRenderingContext2D) {
  g.save(); g.textAlign = 'center';
  g.font = '700 40px Cinzel'; g.fillStyle = '#ffe7a8'; g.shadowColor = '#000c'; g.shadowBlur = 10;
  g.fillText("KEEPER'S", S / 2, S - 112);
  g.font = '900 104px Cinzel'; g.shadowColor = '#ffd23b'; g.shadowBlur = 28; g.fillStyle = '#ffd23b'; g.fillText('LIGHT', S / 2, S - 28);
  g.shadowBlur = 0; g.lineWidth = 3; g.strokeStyle = '#2b1d05'; g.strokeText('LIGHT', S / 2, S - 28);
  const lg = g.createLinearGradient(0, S - 110, 0, S - 28); lg.addColorStop(0, '#fffbe8'); lg.addColorStop(1, '#ffcb3b'); g.fillStyle = lg; g.fillText('LIGHT', S / 2, S - 28);
  g.restore();
}
function crawlerMark(g: CanvasRenderingContext2D) {
  g.imageSmoothingEnabled = false; g.textBaseline = 'top';
  for (const [text, size, y] of [['CRANK', 70, S - 176], ['CRAWLER', 70, S - 98]] as const) {
    g.font = pixelFont(size); const w = measurePixel(g, text), x = Math.round((S - w) / 2);
    g.fillStyle = '#100d1c'; for (const [dx, dy] of [[-6, 0], [6, 0], [0, -6], [0, 6], [6, 6], [0, 12], [6, 12]]) fillText(g, text, x + dx, y + dy);
    g.fillStyle = '#ffd84a'; fillText(g, text, x, y);
    g.save(); g.beginPath(); g.rect(0, y + size * 0.55, S, size); g.clip(); g.fillStyle = '#ff9f2e'; fillText(g, text, x, y); g.restore();
  }
}

// ---------- Compose ----------
type Out = Record<string, string>;
async function main() {
  const [cad, cad2, lh, lh2, lantern, craft] = await Promise.all(['cad-scene', 'cad-scene2', 'lh-scene', 'lh-scene2', 'lh-lantern', 'cad-craft'].map(load));
  await document.fonts.load('86px Audiowide'); await document.fonts.load('900 104px Cinzel'); await document.fonts.load('700 40px Cinzel');
  const out: Out = {}, list = document.getElementById('out')!;
  const make = (id: string, draw: (g: CanvasRenderingContext2D) => void) => { const c = canvas(), g = ctx(c); draw(g); out[id] = c.toDataURL('image/png'); c.title = id; list.append(c); };
  const dscene = dungeonScene();

  // A — Scene: a pure in-game moment, no text (Switch-style art-only).
  make('cadenza-scene', (g) => { g.drawImage(cad, 0, 0, S, S); vignette(g, 0.45); });
  make('lighthouse-scene', (g) => { g.drawImage(lh, 0, 0, S, S); vignette(g, 0.4); });
  make('dungeon-scene', (g) => { g.imageSmoothingEnabled = false; g.drawImage(dscene, 22, 14, 102.4, 102.4, 0, 0, S, S); });

  // B — Key art + logo (the PS5/Switch default: art with the title on it).
  make('cadenza-logo', (g) => { g.drawImage(cad2, 0, -40, S, S); bottomShade(g, 0.45, 0.9, '20,4,28'); cadenzaMark(g); });
  make('lighthouse-logo', (g) => { g.drawImage(lh2, -30, -50, S + 60, S + 60); bottomShade(g, 0.5, 0.92, '5,8,20'); keeperMark(g); });
  make('dungeon-logo', (g) => { g.imageSmoothingEnabled = false; g.drawImage(dscene, 0, -128, S, S); g.fillStyle = '#100d1c'; g.fillRect(0, S - 128, S, 128); bottomShade(g, 0.4, 0.75, '16,13,28'); crawlerMark(g); });

  // C — Emblem: one hero subject, big, on a field of the game's accent. Reads at 64 px.
  make('cadenza-emblem', (g) => {
    g.filter = 'blur(10px) saturate(1.3) brightness(0.45)'; g.drawImage(cad, -40, -40, S + 80, S + 80); g.filter = 'none';
    const rg = g.createRadialGradient(S * 0.45, S * 0.55, 10, S * 0.5, S * 0.5, S * 0.75); rg.addColorStop(0, 'rgba(255,43,214,0.35)'); rg.addColorStop(1, 'rgba(20,4,40,0.85)'); g.fillStyle = rg; g.fillRect(0, 0, S, S);
    g.globalCompositeOperation = 'lighter';
    g.strokeStyle = 'rgba(127,246,255,0.5)'; g.lineWidth = 4;
    for (const r of [150, 205, 260]) { g.beginPath(); g.arc(S * 0.47, S * 0.55, r, 0, Math.PI * 2); g.globalAlpha = 0.6 - r / 600; g.stroke(); }
    g.globalAlpha = 1; g.drawImage(craft, -6, 6, S, S);
    g.globalCompositeOperation = 'source-over'; vignette(g, 0.35);
  });
  make('lighthouse-emblem', (g) => { g.drawImage(lantern, -20, 0, S + 40, S + 40); vignette(g, 0.5, 0.5); });
  make('dungeon-emblem', (g) => {
    const rg = g.createRadialGradient(S / 2, S * 0.45, 20, S / 2, S / 2, S * 0.72); rg.addColorStop(0, '#5a2f8f'); rg.addColorStop(1, '#170f26'); g.fillStyle = rg; g.fillRect(0, 0, S, S);
    g.imageSmoothingEnabled = false;
    for (let y = 0; y < S; y += 32) for (let x = (y / 32) % 2 ? 0 : 16; x < S; x += 32) { g.fillStyle = 'rgba(255,255,255,0.03)'; g.fillRect(x, y, 16, 16); }
    const hero = sprite2('hero', 'attack', 0, heroPalette(HERO)), k = 20;
    g.fillStyle = 'rgba(0,0,0,0.35)'; g.beginPath(); g.ellipse(S * 0.44, S * 0.86, 120, 22, 0, 0, Math.PI * 2); g.fill();
    g.drawImage(hero, Math.round(S * 0.44 - hero.width * k / 2), Math.round(S * 0.9 - hero.height * k), hero.width * k, hero.height * k);
    const ws = heldWeapon({ base: 'bolt', element: 'storm', rarity: 4, variant: 2 } as never, -0.6), kw = 12;
    g.drawImage(ws, Math.round(S * 0.70 - ws.width * kw / 2), Math.round(S * 0.64 - ws.height * kw / 2), ws.width * kw, ws.height * kw);
    const p = projectileSprite({ style: 'bolt', color: '#7fe7ff', angle: -0.6, age: 0.3, variant: 2 }), kp = 10;
    g.drawImage(p, Math.round(S * 0.83 - p.width * kp / 2), Math.round(S * 0.22 - p.height * kp / 2), p.width * kp, p.height * kp);
  });

  // D — Pixel: the house treatment. Real art pixelated to a 64 px grid, with a uniform pixel nameplate.
  make('cadenza-pixel', (g) => { g.filter = 'saturate(1.25) brightness(0.9)'; blit(g, pixelate(cad, 64, 10, 0, 40, 984, 984)); g.filter = 'none'; pixelPlate(g, 'CADENZA', '#ff2bd6'); });
  make('lighthouse-pixel', (g) => { blit(g, pixelate(lh, 64, 7)); pixelPlate(g, "KEEPER'S LIGHT", '#ffd23b'); });
  make('dungeon-pixel', (g) => { g.imageSmoothingEnabled = false; g.drawImage(dscene, 16, 8, 96, 96, 0, -40, S, S); pixelPlate(g, 'CRANK CRAWLER', '#b26bff'); });

  (window as unknown as { __icons: Out }).__icons = out;
}
main().catch((e) => { console.error(e); (window as unknown as { __err: string }).__err = String(e); });
