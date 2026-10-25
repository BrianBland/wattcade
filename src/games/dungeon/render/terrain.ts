import { pixelLine } from './pixel';
export interface StoneTheme {
  floor: string[];
  grout: string;
  swamp: string;
}
/** Renderer-only coordinate noise: never advances the dungeon's gameplay RNG. */
export const terrainNoise = (x: number, y: number) => {
  let h = Math.imul(x, 374761393) ^ Math.imul(y, 668265263);
  h = Math.imul(h ^ h >>> 13, 1274126177);
  return ((h ^ h >>> 16) >>> 0) / 4294967296;
};
/** Flat, worn flagstones: fine joints and low-contrast scuffs keep actors/effects in front. */
export function drawFlagstone(g: CanvasRenderingContext2D, x: number, y: number, th: StoneTheme, wallAbove = false) {
  const px = x * 16,
    py = y * 16,
    r = terrainNoise(x, y);
  const tone = Math.floor(terrainNoise(x, y - 7) * th.floor.length);
  g.fillStyle = th.floor[tone];
  g.fillRect(px, py, 16, 16);
  // A single subdued joint, without the bright top/left and dark bottom/right bevel frame.
  g.fillStyle = '#100d1924';
  g.fillRect(px, py + 15, 16, 1);
  g.fillRect(px + 15, py, 1, 16);
  const repair = terrainNoise(x + 89, y - 31);
  if (repair > .95) g.fillRect(px, py + 7, 15, 1);else if (repair > .92) g.fillRect(px + 7, py, 1, 15);
  // Several small, independently positioned patches per stone, rather than one repeated bold crack.
  for (let i = 0; i < 5; i++) {
    const a = terrainNoise(x * 11 + i * 19, y * 13 + 7),
      b = terrainNoise(x * 17 + 23, y * 7 + i * 31);
    const xx = px + 2 + Math.floor(a * 10),
      yy = py + 2 + Math.floor(b * 10);
    g.fillStyle = i % 2 ? '#eee9ef0a' : '#100d1912';
    g.fillRect(xx, yy, 1 + Math.floor(b * 3), 1 + (a > .8 ? 1 : 0));
    if (i === 0 && r > .45) {
      g.fillStyle = '#eee9ef07';
      g.fillRect(xx - 1, yy + 1, 4, 1);
    }
  }
  // Hairline wear is rare and uses a faint pigment, not the mortar color.
  if (r > .92) {
    pixelLine(g, px + 5, py + 4, px + 7, py + 6, '#100d191c');
    pixelLine(g, px + 7, py + 6, px + 6, py + 8, '#100d191c');
  }
  if (wallAbove) {
    g.fillStyle = '#08061240';
    g.fillRect(px, py, 16, 3);
    if (r > .5) {
      g.fillStyle = '#6b805326';
      g.fillRect(px + 2, py + 2, 3, 1);
      g.fillRect(px + 12, py + 1, 2, 2);
    }
  }
}
export function drawMarsh(g: CanvasRenderingContext2D, x: number, y: number, th: StoneTheme, connected: (dx: number, dy: number) => boolean) {
  const px = x * 16,
    py = y * 16,
    r = terrainNoise(x, y);
  g.fillStyle = th.swamp;
  g.fillRect(px, py, 16, 16);
  // Shared shorelines replace the repeated little oval on every swamp tile.
  g.fillStyle = th.grout;
  if (!connected(0, -1)) g.fillRect(px, py, 16, 2);
  if (!connected(0, 1)) g.fillRect(px, py + 14, 16, 2);
  if (!connected(-1, 0)) g.fillRect(px, py, 2, 16);
  if (!connected(1, 0)) g.fillRect(px + 14, py, 2, 16);
  g.fillStyle = '#8fc57835';
  if (r > .35) {
    const xx = px + 3 + Math.floor(r * 7),
      yy = py + 4 + Math.floor(r * 17) % 7;
    g.fillRect(xx, yy, 4, 1);
    g.fillRect(xx + 1, yy + 2, 2, 1);
  }
  if (r > .7) {
    g.fillStyle = '#bdd69744';
    g.fillRect(px + 4, py + 10, 1, 2);
    g.fillRect(px + 5, py + 9, 1, 2);
  }
}
