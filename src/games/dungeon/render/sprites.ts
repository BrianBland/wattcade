// Hand-made pixel-art sprites, rasterised once to offscreen canvases.
// '.' = transparent; other chars map through the sprite's palette.

import { ART } from './art';

type Pal = Record<string, string>;
export interface SpriteDef { rows: string[]; pal: Pal }

const K = '#140f1c';
export const SPRITES: Record<string, SpriteDef> = {
  hero: {
    rows: [
      '....kkkk....',
      '...kccddk...',
      '..kccccddk..',
      '..kcsssssk..',
      '..ksessesk..',
      '...kssssk...',
      '..kccggcck..',
      '.kcccccccck.',
      'ksccbbbbccsk',
      '.kcccccccck.',
      '.kddcccdddk.',
      '..kddkkddk..',
      '..kbbk.kbbk.',
      '..kkkk.kkkk.',
    ],
    pal: { k: K, c: '#4cc9f0', d: '#2b7a99', s: '#f1c27d', e: '#1b1b2a', g: '#ffd84a', b: '#5b3a29' },
  },
  chaser: { // goblin
    rows: [
      '.k......k.',
      '.kgk..kgk.',
      '..kggggk..',
      '.kgeggegk.',
      '.kggwwggk.',
      '..kGGGGk..',
      '.kgGGGGgk.',
      '.kgGGGGgk.',
      '..kGkkGk..',
      '..kk..kk..',
    ],
    pal: { k: K, g: '#6fbf4a', G: '#8a5a2b', e: '#ffec3d', w: '#f4f4f4' },
  },
  bat: {
    rows: [
      'k....kk....k',
      'kpk.kppk.kpk',
      'kppkpeepkppk',
      'kppppppppppk',
      '.kppkppkppk.',
      '..kk.kk.kk..',
    ],
    pal: { k: K, p: '#6b4a8f', e: '#ff4a4a' },
  },
  spitter: { // slime
    rows: [
      '....kkkk....',
      '..kkllllkk..',
      '.kllssssllk.',
      'klsssssssslk',
      'ksssessesssk',
      'kssssssssssk',
      'kSssssssssSk',
      '.kSSSSSSSSk.',
      '..kkkkkkkk..',
    ],
    pal: { k: K, l: '#c9ff9a', s: '#5fd35f', S: '#2f8f3f', e: '#14301a' },
  },
  archer: { // skeleton
    rows: [
      '...kkkk...',
      '..kbbbbk..',
      '..kebbek..',
      '..kbkkbk..',
      '...kbbk...',
      '..kkbbkk..',
      '.kbkBBkbk.',
      '.kbkBBkbk.',
      '...kBBk...',
      '..kbkkbk..',
      '..kbk.kbk.',
      '.kkk..kkk.',
    ],
    pal: { k: K, b: '#e8e2cf', B: '#a59f8c', e: '#ff3b3b' },
  },
  brute: { // ogre
    rows: [
      '...kkkkkk...',
      '..kooooook..',
      '.koeooooeok.',
      '.kooooooook.',
      '.kowoooowok.',
      'kkooOOOOookk',
      'kooOOOOOOook',
      'koo.OOOO.ook',
      'kok.bbbb.kok',
      '.k.kbbbbk.k.',
      '...kOkkOk...',
      '..kkk..kkk..',
    ],
    pal: { k: K, o: '#b5894f', O: '#7d5a32', e: '#ff4a2a', w: '#fff6d8', b: '#5a3b8a' },
  },
  bomber: {
    rows: [
      '......Fy..',
      '.....kf...',
      '...kkkfk..',
      '..knnnnnk.',
      '.knNnnnnnk',
      '.knnynnynk',
      '.knnnnnnnk',
      '.knnkkknnk',
      '..knnnnnk.',
      '...kkkkk..',
    ],
    pal: { k: K, n: '#3a3f6b', N: '#8a90c9', f: '#c9a36b', F: '#ff7a2a', y: '#ffe14a' },
  },
  summoner: { // necromancer
    rows: [
      '...kkkk...',
      '..kppppk..',
      '.kppkkppk.',
      '.kpksskpk.',
      '.kpesespk.',
      '.kppsspPk.',
      'kgkppppkgk',
      '.kpppppPk.',
      '.kpPpppPk.',
      'kppPpppPpk',
      'kpPPpPPPpk',
      'kkkkkkkkkk',
    ],
    pal: { k: K, p: '#6a3d9a', P: '#40205f', s: '#e6e0d0', e: '#7dff5a', g: '#7dff5a' },
  },
  coin: {
    rows: ['.kkkk.', 'kyyyyk', 'kywyyk', 'kyyyYk', 'kyyYYk', '.kkkk.'],
    pal: { k: '#5a3d00', y: '#ffd84a', Y: '#d9a300', w: '#fff8c4' },
  },
  potion: {
    rows: ['.kkkk.', '..kk..', '.krrk.', 'krwrrk', 'krrrrk', 'krrrRk', '.kkkk.'],
    pal: { k: K, r: '#ff4a6e', R: '#b02040', w: '#ffd0da' },
  },
};

const cache = new Map<string, HTMLCanvasElement>();
const palKeys2 = new WeakMap<Pal, string>();
/** Cache key for a palette override, computed once per palette object (avoids JSON.stringify per drawn sprite per frame). */
function pal2Key(p: Pal): string { let k = palKeys2.get(p); if (k === undefined) { k = JSON.stringify(p); palKeys2.set(p, k); } return k; }

// ---------------- sprites v2 ----------------
export type AnimState = 'idle' | 'walk' | 'attack' | 'hurt';
/** Every boss has dedicated native 32px art on the same grid as the 16px actors. */
export const BOSS_ART: Array<{ art: string; scale: 1 | 2; pal?: Pal }> = [
  { art: 'slime_monarch', scale: 1 }, { art: 'bone_lord', scale: 1 }, { art: 'ogre_warchief', scale: 1 }, { art: 'arch_necromancer', scale: 1 },
  { art: 'bone_king', scale: 1 }, { art: 'frost_wyrm', scale: 1 },
];
export const OUTLINE = '#140f1c';
/** Rows of one animation frame: base rows with the frame's overrides applied. */
export function frameRows(name: string, state: AnimState = 'idle', idx = 0): string[] {
  const a = ART[name]; if (!a) return [];
  const list = state === 'idle' ? undefined : a.frames[state];
  const ov = list && list.length ? list[idx % list.length] : undefined;
  return ov ? a.rows.map((r, i) => ov[i] ?? r) : a.rows;
}
export const animFrames = (name: string, state: AnimState) => (state === 'idle' ? 1 : Math.max(1, ART[name]?.frames[state]?.length ?? 0));
/** Animation helper: which frame of `state` to show at time t (walk cycles at `fps`, attack/hurt hold their frame). */
export function anim(name: string, state: AnimState, t: number, fps = 8): { state: AnimState; idx: number } {
  const n = animFrames(name, state);
  if (state !== 'idle' && !(ART[name]?.frames[state]?.length)) return { state: 'idle', idx: 0 };
  return { state, idx: state === 'walk' ? Math.floor(t * fps) % n : 0 };
}
/** Rasterise a flat palette frame with a one-pixel silhouette outline. */
export function sprite2(name: string, state: AnimState = 'idle', idx = 0, over?: Pal, flash = false, scale = 1): HTMLCanvasElement {
  const key = `v2|${name}|${state}|${idx}|${over ? pal2Key(over) : ''}|${flash}|${scale}`;
  let c = cache.get(key); if (c) return c;
  const a = ART[name], pal = { ...a.pal, ...over };
  const base = frameRows(name, state, idx), rows = scale === 1 ? base : base.flatMap((r) => { const rr = [...r].map((ch) => ch.repeat(scale)).join(''); return Array(scale).fill(rr); });
  const w = rows[0].length, h = rows.length, at = (x: number, y: number) => (x < 0 || y < 0 || x >= w || y >= h ? '.' : rows[y][x]);
  c = document.createElement('canvas'); c.width = w + 2; c.height = h + 2;
  const g = c.getContext('2d')!;
  for (let y = -1; y <= h; y++) for (let x = -1; x <= w; x++) {
    const ch = at(x, y);
    if (ch === '.') {
      if (at(x - 1, y) !== '.' || at(x + 1, y) !== '.' || at(x, y - 1) !== '.' || at(x, y + 1) !== '.') { if (!flash) { g.fillStyle = OUTLINE; g.fillRect(x + 1, y + 1, 1, 1); } }
      continue;
    }
    const col = pal[ch] ?? '#f0f';
    g.fillStyle = flash ? '#ffe0e0' : col;
    g.fillRect(x + 1, y + 1, 1, 1);
  }
  cache.set(key, c);
  return c;
}
/** Every palette character used by an art's frames (for validation). */
export function artChars(name: string): Set<string> {
  const a = ART[name], out = new Set<string>();
  for (const r of [...a.rows, ...Object.values(a.frames).flatMap((l) => l!.flatMap((o) => Object.values(o)))]) for (const ch of r) if (ch !== '.') out.add(ch);
  return out;
}

export { heldWeapon } from './weapons';
import { heldWeapon, weaponArt, WEAPON_STYLES } from './weapons';
export const WEAPON_ART = Object.fromEntries(WEAPON_STYLES.map(base => [base, weaponArt({ base })]));
export const weaponSprite = (style: string) => heldWeapon({ base: style as import('../sim/loot').WeaponStyle });

function shade(hex: string, f: number): string {
  const n = parseInt(hex.slice(1), 16);
  const c = (s: number) => Math.max(0, Math.min(255, Math.round(((n >> s) & 255) * f)));
  return `rgb(${c(16)},${c(8)},${c(0)})`;
}

/** Rasterise a sprite (1 canvas px per art px). Optional palette override, e.g. hero cloak colour. */
export function sprite(name: string, over?: Pal, flash = false): HTMLCanvasElement {
  const key = `${name}|${over ? palKey(over) : ''}|${flash}`;
  let c = cache.get(key);
  if (c) return c;
  const def = SPRITES[name];
  const pal = { ...def.pal, ...over };
  const w = Math.max(...def.rows.map((r) => r.length)), h = def.rows.length;
  c = document.createElement('canvas'); c.width = w; c.height = h;
  const g = c.getContext('2d')!;
  def.rows.forEach((row, y) => {
    for (let x = 0; x < row.length; x++) {
      const ch = row[x];
      if (ch === '.') continue;
      g.fillStyle = flash ? (ch === 'k' ? '#ffffff' : '#ffe0e0') : pal[ch] ?? '#f0f';
      g.fillRect(x, y, 1, 1);
    }
  });
  cache.set(key, c);
  return c;
}

const palKeys = new WeakMap<Pal, string>();
/** Cache key for a palette override (JSON.stringify per drawn sprite per frame was a steady allocation). */
function palKey(p: Pal): string { let k = palKeys.get(p); if (k === undefined) { k = JSON.stringify(p); palKeys.set(p, k); } return k; }

const heroPals = new Map<string, Pal>();
/** Hero palette for a profile colour; the same object per colour, so its sprite cache key is computed once. */
export function heroPalette(color: string): Pal {
  let p = heroPals.get(color);
  if (!p) { p = /^#[0-9a-f]{6}$/i.test(color) ? { c: color, d: shade(color, 0.6) } : {}; heroPals.set(color, p); }
  return p;
}
