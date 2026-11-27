// The Seaside HUD kit: pixel-art pieces that match the voxel world instead of soft UI cards. One bitmap font (the
// roadside signs' 5×7 caps, plus lowercase, digits and punctuation), drawn as whole pixels of `u` CSS px; boxes are
// pixel panels with stepped corners, a 1-pixel ink line and a hard drop shadow; the monologue gets a stepped tail.
// Everything snaps to the `u` grid so it stays crisp at any devicePixelRatio. Pure layout helpers are unit-tested.
import type { Box } from './layout';

// ---- the font -----------------------------------------------------------------------------------------------------
// Rows top → bottom: 7 above the baseline (caps and ascenders fill all 7, lowercase x-height is the last 5), then up to
// 2 descender rows. '#' = ink.
const G: Record<string, string> = {
  A: '.###./#...#/#...#/#####/#...#/#...#/#...#', B: '####./#...#/#...#/####./#...#/#...#/####.', C: '.####/#..../#..../#..../#..../#..../.####',
  D: '####./#...#/#...#/#...#/#...#/#...#/####.', E: '#####/#..../#..../####./#..../#..../#####', F: '#####/#..../#..../####./#..../#..../#....',
  G: '.###./#...#/#..../#.###/#...#/#...#/.###.', H: '#...#/#...#/#...#/#####/#...#/#...#/#...#', I: '###/.#./.#./.#./.#./.#./###',
  J: '..###/...#./...#./...#./...#./#..#./.##..', K: '#...#/#..#./#.#../##.../#.#../#..#./#...#', L: '#..../#..../#..../#..../#..../#..../#####',
  M: '#...#/##.##/#.#.#/#.#.#/#...#/#...#/#...#', N: '#...#/##..#/#.#.#/#..##/#...#/#...#/#...#', O: '.###./#...#/#...#/#...#/#...#/#...#/.###.',
  P: '####./#...#/#...#/####./#..../#..../#....', Q: '.###./#...#/#...#/#...#/#.#.#/#..#./.##.#', R: '####./#...#/#...#/####./#.#../#..#./#...#',
  S: '.####/#..../#..../.###./....#/....#/####.', T: '#####/..#../..#../..#../..#../..#../..#..', U: '#...#/#...#/#...#/#...#/#...#/#...#/.###.',
  V: '#...#/#...#/#...#/#...#/#...#/.#.#./..#..', W: '#...#/#...#/#...#/#.#.#/#.#.#/##.##/#...#', X: '#...#/#...#/.#.#./..#../.#.#./#...#/#...#',
  Y: '#...#/#...#/.#.#./..#../..#../..#../..#..', Z: '#####/....#/...#./..#../.#.../#..../#####',
  a: '...../...../.###./....#/.####/#...#/.####', b: '#..../#..../####./#...#/#...#/#...#/####.', c: '...../...../.####/#..../#..../#..../.####',
  d: '....#/....#/.####/#...#/#...#/#...#/.####', e: '...../...../.###./#...#/#####/#..../.####', f: '..##/.#../####/.#../.#../.#../.#..',
  g: '...../...../.####/#...#/#...#/#...#/.####/....#/.###.', h: '#..../#..../####./#...#/#...#/#...#/#...#', i: '.#./.../##./.#./.#./.#./###',
  j: '..#/.../.##/..#/..#/..#/..#/#.#/.#.', k: '#.../#.../#..#/#.#./##../#.#./#..#', l: '##./.#./.#./.#./.#./.#./###',
  m: '...../...../##.#./#.#.#/#.#.#/#.#.#/#.#.#', n: '...../...../####./#...#/#...#/#...#/#...#', o: '...../...../.###./#...#/#...#/#...#/.###.',
  p: '...../...../####./#...#/#...#/#...#/####./#..../#....', q: '...../...../.####/#...#/#...#/#...#/.####/....#/....#',
  r: '...../...../#.##./##..#/#..../#..../#....', s: '...../...../.####/#..../.###./....#/####.', t: '.#../.#../####/.#../.#../.#../..##',
  u: '...../...../#...#/#...#/#...#/#...#/.####', v: '...../...../#...#/#...#/#...#/.#.#./..#..', w: '...../...../#...#/#...#/#.#.#/#.#.#/.#.#.',
  x: '...../...../#...#/.#.#./..#../.#.#./#...#', y: '...../...../#...#/#...#/#...#/#...#/.####/....#/.###.', z: '...../...../#####/...#./..#../.#.../#####',
  0: '.###./#...#/#..##/#.#.#/##..#/#...#/.###.', 1: '.#./##./.#./.#./.#./.#./###', 2: '.###./#...#/....#/...#./..#../.#.../#####',
  3: '####./....#/....#/.###./....#/....#/####.', 4: '#...#/#...#/#...#/#####/....#/....#/....#', 5: '#####/#..../####./....#/....#/#...#/.###.',
  6: '.###./#..../#..../####./#...#/#...#/.###.', 7: '#####/....#/...#./..#../.#.../.#.../.#...', 8: '.###./#...#/#...#/.###./#...#/#...#/.###.',
  9: '.###./#...#/#...#/.####/....#/....#/.###.',
  ' ': '.../.../.../.../.../.../...', '.': '././././././#', ',': '../../../../../.#/.#/#.', '!': '#/#/#/#/#/./#', '?': '.###./#...#/....#/...#./..#../...../..#..',
  "'": '#/#/./././././.', '"': '#.#/#.#/.../.../.../.../...', '-': '..../..../..../####/..../..../....', ':': '././#/././#/.', ';': '../../.#/../../.#/.#/#.',
  '/': '....#/...#./...#./..#../.#.../.#.../#....', '$': '..#../.####/#.#../.###./..#.#/####./..#..', '%': '##..#/##.#./...#./..#../.#.../.#.##/#..##',
  '+': '...../..#../..#../#####/..#../..#../.....', '·': './././#/./././.', '(': '.#/#./#./#./#./#./.#', ')': '#./.#/.#/.#/.#/.#/#.',
  '&': '.##../#..#./#.#../.#.../#.#.#/#..#./.##.#', '…': '...../...../...../...../...../...../#.#.#', '×': '...../#...#/.#.#./..#../.#.#./#...#/.....',
  '<': '...#/..#./.#../#.../.#../..#./...#', '>': '#.../.#../..#./...#/..#./.#../#...', '◀': '...#/..##/.###/####/.###/..##/...#',
  '▶': '#.../##../###./####/###./##../#...', '½': '#..../#..#./#.#../..#../.#.##/#...#/...##', '✓': '...../....#/...#./#..#./.##../.#.../.....',
  'Ⓐ': '..###../.##.##./##.#.##/##...##/##.#.##/.#.#.#./..###..', 'Ⓑ': '..###../.#..##./##.#.##/##..###/##.#.##/.#..##./..###..',
};
const ALIAS: Record<string, string> = { '’': "'", '‘': "'", '“': '"', '”': '"', '—': '-', '–': '-', '−': '-', '•': '·' };
interface Glyph { w: number; rows: string[] }
const GLYPHS = new Map<string, Glyph>(Object.entries(G).map(([k, v]) => { const rows = v.split('/'); return [k, { w: rows[0].length, rows }]; }));
const glyph = (ch: string): Glyph => GLYPHS.get(ch) ?? GLYPHS.get(ALIAS[ch] ?? '') ?? GLYPHS.get('?')!;

/** Text height in font pixels (cap height; descenders hang 2 below), and the gap between letters. */
export const FONT_H = 7, FONT_DESC = 2;

/** Width of `text` in font pixels (1-pixel gaps between letters). */
export function textCells(text: string): number {
  let w = 0;
  for (const ch of text) w += glyph(ch).w + 1;
  return Math.max(0, w - 1);
}

/** The biggest whole font pixel (≥ min) that fits `text` in `maxW` CSS px at most `maxU` px per font pixel. */
export function fitUnit(text: string, maxW: number, maxU: number, min = 1): number {
  const cells = Math.max(1, textCells(text));
  return Math.max(min, Math.min(Math.floor(maxU), Math.floor(maxW / cells)));
}

/** Greedy word wrap of `text` into lines no wider than `maxCells` font pixels. */
export function wrapCells(text: string, maxCells: number): string[] {
  const words = text.split(' '), lines: string[] = [];
  let line = '';
  for (const w of words) {
    const next = line ? `${line} ${w}` : w;
    if (line && textCells(next) > maxCells) { lines.push(line); line = w; } else line = next;
  }
  if (line) lines.push(line);
  return lines;
}

const cache = new Map<string, HTMLCanvasElement | OffscreenCanvas>();
function sprite(text: string, color: string): HTMLCanvasElement | OffscreenCanvas | null {
  const key = `${color}|${text}`, hit = cache.get(key);
  if (hit) return hit;
  const w = Math.max(1, textCells(text)), h = FONT_H + FONT_DESC;
  const c = typeof OffscreenCanvas !== 'undefined' ? new OffscreenCanvas(w, h) : typeof document !== 'undefined' ? Object.assign(document.createElement('canvas'), { width: w, height: h }) : null;
  const g = c?.getContext('2d') as CanvasRenderingContext2D | null;
  if (!c || !g) return null;
  g.fillStyle = color;
  let x = 0;
  for (const ch of text) {
    const gl = glyph(ch);
    gl.rows.forEach((row, y) => { for (let i = 0; i < row.length; i++) if (row[i] === '#') g.fillRect(x + i, y, 1, 1); });
    x += gl.w + 1;
  }
  if (cache.size > 160) cache.delete(cache.keys().next().value!);
  cache.set(key, c);
  return c;
}

/** Draw `text` with its cap-top at (x, y), `u` CSS px per font pixel. align: x is the left edge, centre or right edge. */
export function pixelText(g: CanvasRenderingContext2D, text: string, x: number, y: number, u: number, color: string, align: 'left' | 'center' | 'right' = 'left'): void {
  const w = textCells(text) * u, x0 = Math.round(align === 'left' ? x : align === 'center' ? x - w / 2 : x - w);
  const s = sprite(text, color);
  if (!s) return;
  const smooth = g.imageSmoothingEnabled;
  g.imageSmoothingEnabled = false;
  g.drawImage(s as CanvasImageSource, x0, Math.round(y), s.width * u, s.height * u);
  g.imageSmoothingEnabled = smooth;
}

/** Text centred in a box, vertically by the cap height. */
export function pixelLabel(g: CanvasRenderingContext2D, text: string, b: Box, u: number, color: string, align: 'left' | 'center' = 'center', padCells = 3): void {
  const y = b.y + (b.h - FONT_H * u) / 2;
  pixelText(g, text, align === 'center' ? b.x + b.w / 2 : b.x + padCells * u, y, u, color, align);
}

// ---- panels -------------------------------------------------------------------------------------------------------
export interface PanelStyle { fill: string; ink: string; shadow?: string; /** a second, inner line in this colour (road-sign style) */ inner?: string }
export const PAPER: PanelStyle = { fill: '#fbf4e2', ink: '#2a2622', shadow: 'rgba(20,18,16,.35)' };
export const PAPER_DIM: PanelStyle = { fill: 'rgba(251,244,226,.72)', ink: 'rgba(42,38,34,.7)', shadow: 'rgba(20,18,16,.18)' };
export const HOT: PanelStyle = { fill: '#c8382c', ink: '#3a0d09', shadow: 'rgba(20,18,16,.35)', inner: '#f2a093' };
/** The chapter card: a green highway sign with a white rule, like the ones on the road. */
export const SIGN: PanelStyle = { fill: '#1f7a4a', ink: '#0f3a24', shadow: 'rgba(10,20,14,.35)', inner: '#f6f6f2' };
export const DUSK: PanelStyle = { fill: 'rgba(20,8,14,.62)', ink: 'rgba(255,240,230,.55)' };

/** Snap a box to the u grid (outer edges on whole font pixels). */
export function snapBox(b: Box, u: number): Box {
  const x = Math.round(b.x / u) * u, y = Math.round(b.y / u) * u;
  return { x, y, w: Math.max(4 * u, Math.round(b.w / u) * u), h: Math.max(4 * u, Math.round(b.h / u) * u) };
}

/** A pixel panel: stepped corners (the corner pixel steps in), a 1-pixel ink line, a hard drop shadow. Returns the snapped box. */
export function pixelPanel(g: CanvasRenderingContext2D, box: Box, u: number, st: PanelStyle): Box {
  const b = snapBox(box, u), { x, y, w, h } = b;
  const shape = (ox: number, oy: number) => { // the panel outline (one step cut from each corner)
    g.fillRect(x + ox + u, y + oy, w - 2 * u, h);
    g.fillRect(x + ox, y + oy + u, w, h - 2 * u);
  };
  if (st.shadow) { g.fillStyle = st.shadow; g.fillRect(x + u, y + h, w - 2 * u, u); g.fillRect(x + w, y + 2 * u, u, h - 2 * u); g.fillRect(x + w - u, y + h - u, u, u); }
  g.fillStyle = st.ink; shape(0, 0);
  g.fillStyle = st.fill;
  g.fillRect(x + 2 * u, y + u, w - 4 * u, h - 2 * u); g.fillRect(x + u, y + 2 * u, w - 2 * u, h - 4 * u);
  if (st.inner) { // an inner rule one pixel in
    g.fillStyle = st.inner;
    g.fillRect(x + 3 * u, y + 2 * u, w - 6 * u, u); g.fillRect(x + 3 * u, y + h - 3 * u, w - 6 * u, u);
    g.fillRect(x + 2 * u, y + 3 * u, u, h - 6 * u); g.fillRect(x + w - 3 * u, y + 3 * u, u, h - 6 * u);
  }
  return b;
}

/** The tail under the bubble, from its bottom ink line down (x from 3 cells left of the anchor): # ink, P paper. */
const TAIL = ['...#PPP#', '..#PP#..', '.#P#....', '##......'];

/** The monologue bubble: a paper panel with a stepped tail off its bottom edge, pointing down-left (toward you). */
export function pixelBubble(g: CanvasRenderingContext2D, box: Box, u: number, st: PanelStyle = PAPER): Box {
  const b = pixelPanel(g, box, u, st), tx = b.x + 6 * u, ty = b.y + b.h - u;
  TAIL.forEach((row, dy) => { for (let i = 0; i < row.length; i++) {
    const c = row[i];
    if (c === '.') continue;
    g.fillStyle = c === '#' ? st.ink : st.fill;
    g.fillRect(tx + (i - 3) * u, ty + dy * u, u, u);
  } });
  return b;
}

/** A pixel bar (meters): ink frame, track, fill to k. */
export function pixelBar(g: CanvasRenderingContext2D, box: Box, u: number, k: number, fill: string, track = 'rgba(20,18,16,.55)', ink = '#2a2622'): Box {
  const b = snapBox(box, u);
  g.fillStyle = ink; g.fillRect(b.x + u, b.y, b.w - 2 * u, b.h); g.fillRect(b.x, b.y + u, b.w, b.h - 2 * u);
  g.fillStyle = track; g.fillRect(b.x + u, b.y + u, b.w - 2 * u, b.h - 2 * u);
  const fw = Math.round(((b.w - 2 * u) * Math.max(0, Math.min(1, k))) / u) * u;
  g.fillStyle = fill; g.fillRect(b.x + u, b.y + u, fw, b.h - 2 * u);
  return b;
}

/** The HUD's font pixel size for a box height: about 40 % of the box is the cap height, at least 2 CSS px. */
export const unitFor = (h: number, k = 0.4) => Math.max(2, Math.floor((h * k) / FONT_H));

/** Does the font draw `ch` (directly or through an alias)? */
export const hasGlyph = (ch: string) => GLYPHS.has(ch) || GLYPHS.has(ALIAS[ch] ?? '');
/** Every glyph's rows are the same width and 7 or 9 tall (tests). */
export const glyphTable = () => [...GLYPHS.entries()];
