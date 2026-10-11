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

// ---------------- sprites v2 ----------------
export type AnimState = 'idle' | 'walk' | 'attack' | 'hurt';
/** Boss variant -> art (32 px). Bosses without their own art use their minion's 16 px art scaled x2 (re-outlined at 32 px). */
export const BOSS_ART: Array<{ art: string; scale: 1 | 2; pal?: Pal }> = [
  { art: 'spitter', scale: 2 }, { art: 'archer', scale: 2 }, { art: 'brute', scale: 2 }, { art: 'summoner', scale: 2 },
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
function hexRgb(hex: string): [number, number, number] { const n = parseInt(hex.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; }
function ramp(hex: string, f: number): string {
  if (!/^#[0-9a-f]{6}$/i.test(hex)) return hex;
  const [r, g, b] = hexRgb(hex), m = (c: number) => Math.max(0, Math.min(255, Math.round(f >= 1 ? c + (255 - c) * (f - 1) : c * f)));
  return `rgb(${m(r)},${m(g)},${m(b)})`;
}
/**
 * Rasterise a v2 frame: 1 px dark outline around the silhouette, a light ramp on pixels lit from above-left and a shadow
 * ramp on pixels facing down-right. `scale` 2 upsizes 16 px art for bosses before outlining.
 */
export function sprite2(name: string, state: AnimState = 'idle', idx = 0, over?: Pal, flash = false, scale = 1): HTMLCanvasElement {
  const key = `v2|${name}|${state}|${idx}|${over ? JSON.stringify(over) : ''}|${flash}|${scale}`;
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
    const lit = at(x, y - 1) === '.' || at(x - 1, y) === '.', dark = at(x, y + 1) === '.' || at(x + 1, y) === '.';
    g.fillStyle = flash ? '#ffe0e0' : lit && !dark ? ramp(col, 1.22) : dark && !lit ? ramp(col, 0.68) : col;
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

// small held weapons (8 px), one per weapon style, drawn in the hero's hand and rotated toward the aim
export const WEAPON_ART: Record<string, { rows: string[]; pal: Pal }> = {
  bolt:   { rows: ['......w.', '.....wW.', '....wW..', '...bW...', '..bb....', '.bb.....', 'bb......', '........'], pal: { b: '#6b4a2a', w: '#c77dff', W: '#7a3fbf' } },
  arrow:  { rows: ['..bbb...', '.b...b..', 'b.....b.', 'sssssss>', 'b.....b.', '.b...b..', '..bbb...', '........'].map((r) => r.replace('>', 's')), pal: { b: '#8a5a2b', s: '#d8d0c0' } },
  pellet: { rows: ['........', '........', 'bbmmmmmm', 'bbbMMMMM', 'bb......', 'b.......', '........', '........'], pal: { b: '#6b4a2a', m: '#9aa3b5', M: '#5a6070' } },
  flame:  { rows: ['........', '......ff', 'bbmmmmFf', 'bbbMMMM.', 'bbt.....', 'b.......', '........', '........'], pal: { b: '#6b4a2a', m: '#9aa3b5', M: '#5a6070', f: '#ffd84a', F: '#ff7a2a', t: '#ff7a2a' } },
  star:   { rows: ['...y....', '..yYy...', 'yyYYYyy.', '..yYy...', '...y....', '........', '........', '........'], pal: { y: '#bfe9ff', Y: '#ffffff' } },
  spark:  { rows: ['.....y..', '....yy..', '...yYy..', '..yYy...', '.bYy....', 'bb......', 'b.......', '........'], pal: { b: '#6b4a2a', y: '#ffe14a', Y: '#ffffff' } },
  orb:    { rows: ['.....oo.', '....oOOo', '....oOOo', '...b.oo.', '..b.....', '.b......', 'b.......', '........'], pal: { b: '#6b4a2a', o: '#c77dff', O: '#f0d8ff' } },
};
export function weaponSprite(style: string): HTMLCanvasElement {
  const key = `w|${style}`; let c = cache.get(key); if (c) return c;
  const d = WEAPON_ART[style] ?? WEAPON_ART.bolt, h = d.rows.length, w = d.rows[0].length;
  c = document.createElement('canvas'); c.width = w + 2; c.height = h + 2; const g = c.getContext('2d')!;
  const at = (x: number, y: number) => (x < 0 || y < 0 || x >= w || y >= h ? '.' : d.rows[y][x]);
  for (let y = -1; y <= h; y++) for (let x = -1; x <= w; x++) {
    const ch = at(x, y);
    if (ch === '.') { if (at(x - 1, y) !== '.' || at(x + 1, y) !== '.' || at(x, y - 1) !== '.' || at(x, y + 1) !== '.') { g.fillStyle = OUTLINE; g.fillRect(x + 1, y + 1, 1, 1); } continue; }
    g.fillStyle = d.pal[ch] ?? '#f0f'; g.fillRect(x + 1, y + 1, 1, 1);
  }
  cache.set(key, c); return c;
}

function shade(hex: string, f: number): string {
  const n = parseInt(hex.slice(1), 16);
  const c = (s: number) => Math.max(0, Math.min(255, Math.round(((n >> s) & 255) * f)));
  return `rgb(${c(16)},${c(8)},${c(0)})`;
}

/** Rasterise a sprite (1 canvas px per art px). Optional palette override, e.g. hero cloak colour. */
export function sprite(name: string, over?: Pal, flash = false): HTMLCanvasElement {
  const key = `${name}|${over ? JSON.stringify(over) : ''}|${flash}`;
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

export function heroPalette(color: string): Pal {
  return /^#[0-9a-f]{6}$/i.test(color) ? { c: color, d: shade(color, 0.6) } : {};
}

/** Soft radial glow, cached per colour; draw with 'lighter' compositing. */
export function glow(color: string): HTMLCanvasElement {
  const key = `glow|${color}`;
  let c = cache.get(key);
  if (c) return c;
  c = document.createElement('canvas'); c.width = c.height = 64;
  const g = c.getContext('2d')!;
  const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  gr.addColorStop(0, color); gr.addColorStop(0.35, color + '88'); gr.addColorStop(1, color + '00');
  g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
  cache.set(key, c);
  return c;
}
