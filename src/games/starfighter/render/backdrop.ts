// Full-bleed parallax space backdrop per sector theme: sky gradient, nebula tile, planet, three star layers.
import { SECTORS } from '../sim/content';

const hash = (i: number, s = 1) => { let h = (i * 374761393 + s * 668265263) | 0; h = (h ^ (h >>> 13)) * 1274126177; return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };

const TILE_W = 384, TILE_H = 768;
const tiles = new Map<number, HTMLCanvasElement>();

function nebulaTile(theme: number): HTMLCanvasElement {
  let c = tiles.get(theme);
  if (c) return c;
  const th = SECTORS[theme];
  c = document.createElement('canvas'); c.width = TILE_W; c.height = TILE_H;
  const g = c.getContext('2d')!;
  // blobs drawn 3x vertically offset so the tile wraps seamlessly
  for (let i = 0; i < 26; i++) {
    const x = hash(i, theme + 3) * TILE_W, y = hash(i, theme + 7) * TILE_H, r = 50 + hash(i, theme + 11) * 160;
    const col = th.nebula[i % th.nebula.length], a = 0.08 + hash(i, theme + 13) * 0.14;
    for (const oy of [-TILE_H, 0, TILE_H]) for (const ox of [-TILE_W, 0, TILE_W]) {
      const gr = g.createRadialGradient(x + ox, y + oy, 0, x + ox, y + oy, r);
      gr.addColorStop(0, col + Math.round(a * 255).toString(16).padStart(2, '0'));
      gr.addColorStop(1, col + '00');
      g.fillStyle = gr; g.fillRect(x + ox - r, y + oy - r, r * 2, r * 2);
    }
  }
  // dust
  for (let i = 0; i < 260; i++) {
    g.fillStyle = `rgba(255,255,255,${0.05 + hash(i, theme + 21) * 0.12})`;
    g.fillRect(hash(i, theme + 17) * TILE_W, hash(i, theme + 19) * TILE_H, 1, 1);
  }
  tiles.set(theme, c);
  return c;
}

/**
 * Draw the backdrop over the whole canvas (CSS px). `scroll` grows with thrust; `warp` 0..1 stretches stars into streaks.
 */
export function drawBackdrop(g: CanvasRenderingContext2D, CW: number, CH: number, theme: number, scroll: number, warp: number, t: number): void {
  const th = SECTORS[theme % SECTORS.length];
  const sky = g.createLinearGradient(0, 0, 0, CH);
  sky.addColorStop(0, th.sky[0]); sky.addColorStop(1, th.sky[1]);
  g.fillStyle = sky; g.fillRect(0, 0, CW, CH);

  // nebula (slow), scaled so a tile spans ~ the canvas width
  const tile = nebulaTile(theme % SECTORS.length);
  const k = Math.max(CW / TILE_W, CH / TILE_H) * 0.9, tw = TILE_W * k, thh = TILE_H * k;
  const ny = ((scroll * 3) % thh + thh) % thh;
  for (let y = ny - thh; y < CH; y += thh) for (let x = 0; x < CW; x += tw) g.drawImage(tile, x, y, tw, thh);

  // planet (very slow, one per theme, drifts down and wraps)
  const pr = Math.min(CW, CH) * (0.16 + 0.06 * (theme % 3));
  const span = CH + pr * 4, py = ((scroll * 1.2 + theme * 400) % span) - pr * 2;
  const px = theme % 2 ? CW * 0.82 : CW * 0.16;
  const pg = g.createRadialGradient(px - pr * 0.35, py - pr * 0.35, pr * 0.1, px, py, pr);
  pg.addColorStop(0, th.nebula[1]); pg.addColorStop(0.7, th.nebula[2]); pg.addColorStop(1, '#000000');
  g.globalAlpha = 0.55; g.fillStyle = pg; g.beginPath(); g.arc(px, py, pr, 0, Math.PI * 2); g.fill();
  if (theme % SECTORS.length === 2 || theme % SECTORS.length === 4) { // ringed
    g.strokeStyle = th.accent + '66'; g.lineWidth = pr * 0.06;
    g.beginPath(); g.ellipse(px, py, pr * 1.6, pr * 0.35, -0.3, 0, Math.PI * 2); g.stroke();
  }
  g.globalAlpha = 1;

  // stars: 3 layers
  const layers = [{ n: 90, sp: 6, s: 1, a: 0.45 }, { n: 50, sp: 16, s: 1.5, a: 0.7 }, { n: 22, sp: 34, s: 2, a: 1 }];
  g.fillStyle = th.star;
  layers.forEach((L, li) => {
    const streak = 1 + warp * (6 + li * 10);
    for (let i = 0; i < L.n; i++) {
      const x = hash(i, li * 31 + 1) * CW;
      const y = ((hash(i, li * 31 + 2) * CH + scroll * L.sp) % CH + CH) % CH;
      const tw = 0.75 + 0.25 * Math.sin(t * (1 + hash(i, li + 40) * 3) + i);
      g.globalAlpha = L.a * tw;
      g.fillRect(x, y - (streak - 1) * L.s * 4, L.s, L.s * streak * (warp > 0 ? 4 : 1));
    }
  });
  g.globalAlpha = 1;
}
