// Pixel-art sprites, rasterised once to offscreen canvases. '.' = transparent; other chars map through the palette.
type Pal = Record<string, string>;
interface SpriteDef { rows: string[]; pal: Pal }

const K = '#0d0a18';
export const SPRITES: Record<string, SpriteDef> = {
  ship: {
    rows: [
      '.......k.......',
      '......kck......',
      '......kwk......',
      '.....kcwck.....',
      '.....kcwck.....',
      '.k..kccccck..k.',
      '.gk.kcdcdck.kg.',
      'kgkkccccccckkgk',
      'kgkcccdcdccckgk',
      'kkccccccccccckk',
      '.kdccckkkcccdk.',
      '..kddk.e.kddk..',
      '...kk..e..kk...',
    ],
    pal: { k: K, c: '#4cc9f0', d: '#2b7a99', w: '#e8fbff', g: '#9aa3b8', e: '#ffb020' },
  },
  wing: {
    rows: [
      '...k...',
      '..kck..',
      '.kcwck.',
      'kccccck',
      'kckckck',
      '.k...k.',
    ],
    pal: { k: K, c: '#4cc9f0', w: '#e8fbff' },
  },
  drone: {
    rows: [
      '..kkkkk..',
      '.krrrrrk.',
      'krrererrk',
      'kRrrrrrRk',
      '.kRk.kRk.',
      '..k...k..',
    ],
    pal: { k: K, r: '#ff5a4a', R: '#a8302a', e: '#fff3a0' },
  },
  armor: {
    rows: [
      '..kkkkkkk..',
      '.kpPPPPPpk.',
      'kpPpppppPpk',
      'kPpkeeekpPk',
      'kPpppppppPk',
      'kpPPPPPPPpk',
      '.kpkkkkkpk.',
      '.kk.....kk.',
    ],
    pal: { k: K, p: '#b06cff', P: '#6b3aa8', e: '#ff4a8a' },
  },
  weaver: {
    rows: [
      'k....k....k',
      'kbk.kek.kbk',
      'kbbkbbbkbbk',
      '.kbbbbbbbk.',
      '..kbk.kbk..',
      '...k...k...',
    ],
    pal: { k: K, b: '#4aa3ff', e: '#e8fbff' },
  },
  diver: {
    rows: [
      'k.....k',
      'kok.kok',
      'koooook',
      '.koeok.',
      '.koook.',
      '..kok..',
      '...k...',
    ],
    pal: { k: K, o: '#ff8a3c', e: '#fff3a0' },
  },
  gunner: {
    rows: [
      '...kkk...',
      '..kgggk..',
      '.kgGeGgk.',
      'kgggggggk',
      'kGkgggkGk',
      'kGk.k.kGk',
      '.k..k..k.',
    ],
    pal: { k: K, g: '#5dd66a', G: '#2e7a3a', e: '#ff4a4a' },
  },
  splitter: {
    rows: [
      '....k....',
      '...kyk...',
      '..kyYyk..',
      '.kyYwYyk.',
      'kyYwwwYyk',
      '.kyYwYyk.',
      '..kyYyk..',
      '...kyk...',
      '....k....',
    ],
    pal: { k: K, y: '#ffd84a', Y: '#c49a1a', w: '#fffbe0' },
  },
  mini: {
    rows: [
      '..k..',
      '.kyk.',
      'kyYyk',
      '.kyk.',
      '..k..',
    ],
    pal: { k: K, y: '#ffd84a', Y: '#c49a1a' },
  },
};

const cache = new Map<string, HTMLCanvasElement>();

export function shade(hex: string, k: number): string {
  const n = parseInt(hex.slice(1), 16);
  const f = (v: number) => Math.max(0, Math.min(255, Math.round(v * k)));
  return '#' + [(n >> 16) & 255, (n >> 8) & 255, n & 255].map(f).map((v) => v.toString(16).padStart(2, '0')).join('');
}

/** Rasterise a sprite (1 canvas px per art px). `mode` tints the whole sprite (hurt flash / golden). */
export function sprite(name: string, over?: Pal, mode: 'normal' | 'flash' | 'gold' = 'normal'): HTMLCanvasElement {
  const key = `${name}|${over ? JSON.stringify(over) : ''}|${mode}`;
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
      let col = pal[ch] ?? '#f0f';
      if (mode === 'flash') col = ch === 'k' ? '#ffffff' : '#ffe8e8';
      if (mode === 'gold') col = ch === 'k' ? '#3a2a00' : ch === 'e' || ch === 'w' ? '#ffffff' : /[A-Z]/.test(ch) ? '#c49a1a' : '#ffd84a';
      g.fillStyle = col; g.fillRect(x, y, 1, 1);
    }
  });
  cache.set(key, c);
  return c;
}

export function shipPalette(color: string): Pal {
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
