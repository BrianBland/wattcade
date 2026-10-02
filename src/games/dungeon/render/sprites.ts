// Hand-made pixel-art sprites, rasterised once to offscreen canvases.
// '.' = transparent; other chars map through the sprite's palette.

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
