import type { BulletView, Fx } from '../sim/types';
import { ELEMENT_COLORS } from '../sim/loot';
import { colorRamp, rasterArt, SHURIKEN_MASKS, type PixelArt } from './weapons';
import { pixelDisc, pixelLine, pixelRing, rotateRows, squareRows } from './pixel';
const cache = new Map<string, HTMLCanvasElement>();
export function projectileArt(style: BulletView['style'], color: string, frame = 0, variant = 0): PixelArt {
  frame = (frame % 4 + 4) % 4;
  const normal = color === ELEMENT_COLORS.normal;
  const p = colorRamp(color),
    pal = {
      e: p.base,
      d: p.dark,
      h: frame === 1 ? '#f6f8ff' : p.light,
      w: normal ? '#f4f8ff' : '#fff4da',
      b: '#79513c',
      m: ['#8997a9', '#b8c7d7', '#dce6ee', '#9eacbc'][frame],
      t: p.base,
      k: '#251c32',
      r: '#f45161'
    };
  let rows: string[];
  switch (style) {
    case 'enemy':
      rows = ['...r...', '..rer..', '.reher.', 'rehwher', '.reher.', '..rer..', '...r...'];
      {
        const glints = [[2, 2], [4, 2], [4, 4], [2, 4]],
          [x, y] = glints[frame];
        rows[y] = rows[y].slice(0, x) + 'w' + rows[y].slice(x + 1);
        if (frame === 2) rows[3] = 'rehhh er'.replace(' ', '');
      }
      break;
    case 'pellet':
      rows = ['eh', 'de'];
      break;
    case 'bolt':
      rows = ['.....e..', '..eeehh.', 'eeehhwhh', '..eeehh.', '.....d..'];
      break;
    case 'arrow':
      rows = variant === 0 ? ['.m....mm..', '..m...mmh.', 'bbbeeemhh>', '..m...mmh.', '.m....mm..'] : variant === 2 ? ['.m.......emm..', '..m......emmh.', 'bbbeeeeeemhhh>', '..m......emmh.', '.m.......emm..'] : ['.m.......m...', '..m......mm..', 'bbbeeeeeemhh>', '..m......mm..', '.m.......m...'];
      break;
    case 'spear':
      rows = ['..........e...', '.........emm..', 'bbbebbbbemhhh>', '.........emm..', '..........e...'];
      break;
    case 'knife':
      rows = variant === 2 ? ['....e.m...', '..e.emhh..', 'bbtemhhhh>', '..e.emhh..', '....e.m...'] : variant === 1 ? ['.....m....', '....mmh...', 'bbtemhhhh>', '....mmh...', '.....m....'] : ['......m...', '.....mmh..', 'bbtemhhhh>', '.....mmh..', '......m...'];
      break;
    case 'axe':
      rows = variant > 0 ? ['...m.m...', '..mhmhm..', '.mhhemhm.', 'bbbtetmmm', '.mhhemhm.', '..mhmhm..', '...m.m...'] : ['....mmm.', '...mhhhm', '...mehhm', 'bbbtemhm', '....mmm.', '.....m..', '........'];
      break;
    case 'flame':
      rows = [['...e....', 'e.dehe..', '.eehhhe.', 'eehhhwhh', '.eehhhe.', 'e.dehe..', '...e....'], ['..e.....', 'e.eehe..', '..ehhhhe', 'eehhwhhh', '..ehhhhe', 'e.eehe..', '..e.....'], ['.....e..', 'e..eehe.', '.eehhhhe', '..ehwhhh', '.eehhhhe', 'e..eehe.', '.....e..']][frame % 3];
      if (normal) rows = frame % 2 ? ['..m.....', 'm..mh...', '..mhwh..', '.mhhwhhm', '..mhwh..', 'm..mh...', '..m.....'] : ['...m....', '.m.mhm..', '..mhwhm.', 'm.mhwhhm', '..mhwhm.', '.m.mhm..', '...m....'];
      break;
    case 'spark':
      rows = frame % 2 ? ['....he....', '...hhe....', 'ehhhe.....', '...ehhhe..', '.....ehhhe', '......he..', '..........'] : ['.....he...', '....hhe...', '..ehhe....', 'ehhhehhe..', '.....ehhe.', '......ehhe', '.......he.'];
      break;
    case 'orb':
      rows = ['..ddd..', '.eeeee.', 'deeeeed', 'deeweed', 'deeeeed', '.deeed.', '..ddd..'];
      {
        const glints = [[2, 2], [4, 2], [4, 4], [2, 4]],
          [x, y] = glints[frame];
        rows[y] = rows[y].slice(0, x) + 'h' + rows[y].slice(x + 1);
      }
      break;
    case 'star':
      rows = [...SHURIKEN_MASKS[Math.max(0, Math.min(2, variant))]];
      break;
  }
  return {
    rows: rows.map(r => r.replaceAll('>', 'h')),
    pal
  };
}
export function projectileSprite(b: Pick<BulletView, 'style' | 'color' | 'angle' | 'age' | 'variant'>) {
  const frame = Math.floor(b.age * 10) % 4;
  const spin = b.style === 'axe' || b.style === 'star' ? b.age * 14 : b.angle;
  const dir = (Math.round(spin / (Math.PI / 4)) % 8 + 8) % 8;
  const key = `${b.style}|${b.color}|${frame}|${dir}|${b.variant ?? 0}`;
  let c = cache.get(key);
  if (c) return c;
  const art = projectileArt(b.style, b.color, frame, b.variant),
    square = squareRows(art.rows);
  c = rasterArt({
    rows: dir ? rotateRows(square, dir * Math.PI / 4) : square,
    pal: art.pal
  }, b.style !== 'flame');
  cache.set(key, c);
  return c;
}
export function drawProjectile(g: CanvasRenderingContext2D, b: BulletView, TS: number) {
  const x = Math.round(b.x * TS),
    y = Math.round(b.y * TS),
    ca = Math.cos(b.angle),
    sa = Math.sin(b.angle),
    p = colorRamp(b.color);
  if (b.style === 'bolt' || b.style === 'orb' || b.style === 'knife' || b.style === 'spear') {
    for (let i = 1; i <= 3; i++) {
      const d = 5 + i * 3;
      g.fillStyle = i === 1 ? p.base : p.dark;
      const size = i === 1 ? 2 : 1;
      g.fillRect(Math.round(x - ca * d), Math.round(y - sa * d), size, size);
    }
  }
  const c = projectileSprite(b);
  g.drawImage(c, x - Math.floor(c.width / 2), y - Math.floor(c.height / 2));
}
export function drawPixelFx(g: CanvasRenderingContext2D, f: Fx, t: number, TS: number) {
  const k = (t - f.t0) / f.life;
  if (k < 0 || k > 1) return;
  const x = Math.round(f.x * TS),
    y = Math.round(f.y * TS),
    r = (f.r ?? 1) * TS,
    p = colorRamp(f.color);
  // Three discrete phases keep bursts readable without covering the actor in a translucent blob.
  const phase = Math.min(2, Math.floor(k * 3));
  switch (f.kind) {
    case 'chain':
      {
        const pts = f.pts ?? [];
        for (let i = 1; i < pts.length; i++) {
          let ax = pts[i - 1].x * TS,
            ay = pts[i - 1].y * TS;
          const bx = pts[i].x * TS,
            by = pts[i].y * TS;
          for (let j = 1; j <= 4; j++) {
            const xx = pts[i - 1].x * TS + (bx - pts[i - 1].x * TS) * j / 4 + (j < 4 ? j % 2 ? 2 : -2 : 0),
              yy = pts[i - 1].y * TS + (by - pts[i - 1].y * TS) * j / 4;
            pixelLine(g, ax, ay, xx, yy, p.dark, 3);
            pixelLine(g, ax, ay, xx, yy, phase === 2 ? p.base : p.light);
            ax = xx;
            ay = yy;
          }
        }
        break;
      }
    case 'boom':
      {
        const radius = Math.round(r * (0.25 + k * 0.75));
        pixelRing(g, x, y, radius, p.base, true);
        if (phase === 0) pixelDisc(g, x, y, Math.min(5, radius), p.light);
        for (let i = 0; i < 8; i++) {
          const a = i * Math.PI / 4,
            d = radius * (i % 2 ? 0.72 : 1);
          pixelLine(g, x + Math.cos(a) * d, y + Math.sin(a) * d, x + Math.cos(a) * (d + 2), y + Math.sin(a) * (d + 2), i % 2 ? p.base : p.light, phase === 2 ? 1 : 2);
        }
        break;
      }
    case 'hit':
    case 'muzzle':
      {
        const radius = (f.kind === 'muzzle' ? 2 : 3) + phase * 2;
        if (phase === 0) {
          pixelLine(g, x - 2, y, x + 2, y, p.light);
          pixelLine(g, x, y - 2, x, y + 2, p.light);
        }
        for (let i = 0; i < 4; i++) {
          const a = i * Math.PI / 2 + Math.PI / 4;
          g.fillStyle = phase === 2 ? p.base : p.light;
          g.fillRect(Math.round(x + Math.cos(a) * radius), Math.round(y + Math.sin(a) * radius), phase === 2 ? 1 : 2, phase === 2 ? 1 : 2);
        }
        break;
      }
    case 'death':
      for (let i = 0; i < 8; i++) {
        const a = i * Math.PI / 4 + f.t0,
          d = k * r * 0.8;
        g.fillStyle = i % 2 ? p.base : p.light;
        g.fillRect(Math.round(x + Math.cos(a) * d), Math.round(y - 4 + Math.sin(a) * d), phase === 2 ? 1 : 2, phase === 2 ? 1 : 2);
      }
      break;
    case 'levelup':
      pixelRing(g, x, y - Math.round(k * 8), r * (0.35 + k * 0.65), p.base, true, 0.4);
      for (let i = 0; i < 5; i++) {
        const xx = x + (i - 2) * 4,
          yy = y - Math.round(k * 20) - i % 2 * 3;
        pixelLine(g, xx, yy, xx, yy - 2, p.light);
      }
      break;
  }
}
const fire = [['....e...', '...ee...', '...ehe..', '.e.ehhe.', '.eehhhe.', '..ehwhe.', '..deed..', '...dd...'], ['...e....', '...ee.e.', '..eheee.', '..ehhe..', '.ehhhhe.', '.eehwhe.', '..deed..', '...dd...'], ['.....e..', '....ee..', '..e.ehe.', '..eehhe.', '.eehhhe.', '..ehwhe.', '..deed..', '...dd...']];
export function flameSprite(t: number) {
  const frame = Math.floor(t * 9) % 3,
    key = `fire|${frame}`;
  let c = cache.get(key);
  if (c) return c;
  c = rasterArt({
    rows: fire[frame],
    pal: {
      e: '#f28a36',
      h: '#f6c75d',
      w: '#fff0b3',
      d: '#a94a33'
    }
  }, false);
  cache.set(key, c);
  return c;
}
