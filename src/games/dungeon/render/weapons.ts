import { ELEMENT_COLORS, RARITY_COLORS, type Element, type Weapon, type WeaponStyle } from '../sim/loot';
import { rotateRows, squareRows } from './pixel';
export interface PixelArt {
  rows: string[];
  pal: Record<string, string>;
}
// Four pointed, swept blades with open diagonal quadrants. No ring-shaped shuriken tiers.
export const SHURIKEN_MASKS = [['.....h.....', '.....hm....', '.....hmm...', '.....hme...', '..eehhme...', 'hhhhhehhhhh', '...emhhee..', '...emh.....', '...mmh.....', '....mh.....', '.....h.....'], ['.....h.....', '....hh.....', '...hmh.....', '...meh.....', '...emhhe...', 'hhhhhehhhhh', '...ehhme...', '.....hem...', '.....hmh...', '.....hh....', '.....h.....'], ['.....h.....', '.....hh....', '.....hmh...', '.....hemh..', '....hhhehh.', 'hhhhhehhhhh', '.hhehhh....', '..hmeh.....', '...hmh.....', '....hh.....', '.....h.....']];
// Twelve-pixel masks face RIGHT. e = element, d = element shadow, h = highlight, t = rarity trim.
const masks: Record<WeaponStyle, string[][]> = {
  bolt: [['............', '............', '.........ee.', '........ehhe', 'bbbbbbt.ehhe', '........dee.', '............'], ['............', '........e...', '.......ehhe.', 'bbbbbbtthhee', '.......edde.', '........d...', '............'], ['........e.e.', '.......ehhhe', 'bbtbbbtt.hhe', '.......ehhhe', '........d.d.', '............', '............']],
  pellet: [['............', '............', '...mmmmmmmm.', 'bbbtmmmmmmh.', '.bb....tt...', '.b..........', '............'], ['............', '...mmmmmmmm.', 'bbbtmmhhmmh.', '.bbbmmmmmmm.', '.bb....tt...', '.b..........', '............'], ['.....tt.....', '...mmmmmmmmm', 'bbbttmhhmmmh', '.bbbmmmmmmmm', '.bb.e...tt..', '.b..........', '............']],
  arrow: [['......tt....', '......b.b...', 'bbbtbbbbbb..', '..hhhhtbhhh>', 'bbbtbbbbbb..', '......b.b...', '......tt....'], ['.....bb.....', '......bb....', '.......b....', '..hhhhtbhhh>', '.......b....', '......bb....', '.....bb.....'], ['.....tt.....', '......bt....', 'bbbtbbbbbbt.', '..hhhhtbhhh>', 'bbbtbbbbbbt.', '......bt....', '.....tt.....']],
  flame: [['............', '............', '...mmmm.e.e.', 'bbbtmmmhhee.', '.bb.mmm.e.e.', '.b.e........', '............'], ['............', '......tt.ee.', '...mmmmmehhe', 'bbbtmmmmhhe.', '.bb.mmmmee..', '.b.e........', '............'], ['......tt....', '...mmmm.e.ee', 'bbbtmmmmehee', '.bb.mmmhhhhe', '.bb.mmm.e.ee', '.b.e........', '............']],
  spark: [['.........e..', '........ee..', '.....teee...', 'bbbbbtt.eee.', '.........e..', '............', '............'], ['.......e.e..', '......ee.ee.', 'bbbbbtthe...', '......ee.ee.', '.......e.e..', '............', '............'], ['......e..e..', '.....ee.ee..', 'bbtbbtthhhee', '.....ee.ee..', '......e..e..', '............', '............']],
  orb: [['............', '........ee..', '.......ehhe.', 'bbbbbbtehhe.', '........dd..', '............', '............'], ['........t...', '.......tee..', '......tehhet', 'bbbbbbtehhet', '.......tdd..', '........t...', '............'], ['.......t.t..', '......tehhe.', 'bbtbbttehhhe', '......tehhe.', '.......t.t..', '............', '............']],
  star: SHURIKEN_MASKS.map(rows => [...rows.map(r => r.padEnd(12, '.')), '............']),
  knife: [['............', '............', '......mmm...', 'bbbtmmmmhhh>', '......mmm...', '............', '............'], ['............', '.......m....', '......mmh...', 'bbbtmmmhhh>>', '......mmh...', '.......m....', '............'], ['............', '......em....', '.....emhh...', 'bbtbtmmhhhh>', '.....emhh...', '......em....', '............']],
  axe: [['.......mm...', '......mhhm..', '......mhhhm.', 'bbbbbttmmmmm', '.......mm...', '........m...', '............'], ['......m..m..', '.....mhhmhm.', '.....mhhmhhm', 'bbbbbttmmmmm', '......m..m..', '............', '............'], ['.....m...m..', '....mhhthhm.', '....mhhthhhm', 'bbtbbttmmmmm', '....mhhthhhm', '.....m...m..', '............']],
  spear: [['............', '.........m..', '........mmh.', 'bbtbbbbbmmh>', '........mmh.', '.........m..', '............'], ['............', '........em..', '.......emmh.', 'bbtbbtbbmmh>', '.......emmh.', '........em..', '............'], ['........e...', '.......ehm..', '......ehmmh.', 'btbbttbbmmh>', '......ehmmh.', '.......ehm..', '........e...']]
};
export type WeaponLook = Pick<Weapon, 'base'> & Partial<Pick<Weapon, 'element' | 'rarity' | 'variant' | 'unique' | 'plus'>>;
const rampCache = new Map<string, {
  base: string;
  dark: string;
  light: string;
}>();
export function colorRamp(hex: string) {
  const cached = rampCache.get(hex);
  if (cached) return cached;
  const full = hex.length === 4 ? '#' + [...hex.slice(1)].map(c => c + c).join('') : hex;
  const n = parseInt(full.slice(1), 16),
    rgb = [n >> 16 & 255, n >> 8 & 255, n & 255];
  const mix = (f: number) => '#' + rgb.map(c => Math.round(f < 0 ? c * (1 + f) : c + (255 - c) * f).toString(16).padStart(2, '0')).join('');
  const result = {
    base: hex,
    dark: mix(-0.5),
    light: mix(0.7)
  };
  rampCache.set(hex, result);
  return result;
}
export function weaponPalette(look: WeaponLook) {
  const ramp = colorRamp(ELEMENT_COLORS[look.element ?? 'normal']);
  return {
    b: '#79513c',
    m: '#8993a7',
    h: look.element === 'normal' || !look.element ? '#eef4fa' : '#f5eedb',
    e: ramp.base,
    d: ramp.dark,
    t: RARITY_COLORS[look.rarity ?? 0],
    '>': ramp.light
  };
}
export function weaponArt(look: WeaponLook): PixelArt {
  const tier = Math.max(0, Math.min(2, Math.floor(look.variant ?? (look.rarity ?? 0) / 2)));
  const rows = (masks[look.base] ?? masks.bolt)[tier].map(r => r.padEnd(12, '.'));
  // All families carry their modifier as actual inlaid color, even wood/steel throwing weapons.
  if (look.base !== 'star') rows[3] = rows[3].slice(0, 4) + 'e' + rows[3].slice(5);
  if (look.unique) rows[0] = '.....t.t....';
  if ((look.plus ?? 0) > 0) rows[5] = rows[5].slice(0, 2) + 't' + rows[5].slice(3);
  return {
    rows,
    pal: weaponPalette(look)
  };
}
const cache = new Map<string, HTMLCanvasElement>();
export function rasterArt(art: PixelArt, outline = true): HTMLCanvasElement {
  const rows = art.rows,
    h = rows.length,
    w = Math.max(...rows.map(r => r.length)),
    c = document.createElement('canvas');
  c.width = w + 2;
  c.height = h + 2;
  const g = c.getContext('2d')!,
    at = (x: number, y: number) => rows[y]?.[x] ?? '.';
  for (let y = -1; y <= h; y++) for (let x = -1; x <= w; x++) {
    const ch = at(x, y);
    if (ch !== '.') {
      g.fillStyle = art.pal[ch];
      g.fillRect(x + 1, y + 1, 1, 1);
    } else if (outline && [at(x - 1, y), at(x + 1, y), at(x, y - 1), at(x, y + 1)].some(v => v !== '.')) {
      g.fillStyle = '#140f1c';
      g.fillRect(x + 1, y + 1, 1, 1);
    }
  }
  return c;
}
export function heldWeapon(look: WeaponLook, angle = 0): HTMLCanvasElement {
  const dir = (Math.round(angle / (Math.PI / 4)) % 8 + 8) % 8;
  const key = `${look.base}|${look.element}|${look.rarity}|${look.variant}|${!!look.unique}|${(look.plus ?? 0) > 0}|${dir}`;
  let c = cache.get(key);
  if (c) return c;
  const art = weaponArt(look),
    square = squareRows(art.rows, 12);
  c = rasterArt({
    rows: dir ? rotateRows(square, dir * Math.PI / 4) : square,
    pal: art.pal
  });
  cache.set(key, c);
  return c;
}
export const WEAPON_STYLES = Object.keys(masks) as WeaponStyle[];
export const ELEMENTS = Object.keys(ELEMENT_COLORS) as Element[];
const gearCache = new Map<string, HTMLCanvasElement>();
export function gearSprite(slot: string, color: string) {
  const key = slot + color;
  let c = gearCache.get(key);
  if (c) return c;
  const rows: Record<string, string[]> = {
    helm: ['..eeee..', '.ehhhhe.', 'eehhhhhe', 'eehehhee', 'eehehhee', 'e.e..e.e', '........', '........'],
    armor: ['e.e..e.e', 'eeehheee', '.ehhhhe.', '.ehhhhe.', '.eehhee.', '.eeeeee.', '..eeee..', '........'],
    boots: ['.ee.ee..', '.eh.eh..', '.eh.eh..', '.ehhehhe', '.eeeeeee', '........', '........', '........'],
    ring: ['...ee...', '..ehhe..', '...ee...', '..e..e..', '.e....e.', '.e....e.', '..eeee..', '........']
  };
  c = rasterArt({
    rows: rows[slot] ?? rows.ring,
    pal: {
      e: color,
      h: colorRamp(color).light
    }
  });
  gearCache.set(key, c);
  return c;
}
