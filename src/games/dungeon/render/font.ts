// Original bitmap alphabet shared by the dungeon UI and display lettering.
export const GLYPHS: Record<string, string> = {
  A: '01110/10001/10001/11111/10001/10001/10001',
  B: '11110/10001/10001/11110/10001/10001/11110',
  C: '01111/10000/10000/10000/10000/10000/01111',
  D: '11110/10001/10001/10001/10001/10001/11110',
  E: '11111/10000/10000/11110/10000/10000/11111',
  F: '11111/10000/10000/11110/10000/10000/10000',
  G: '01111/10000/10000/10111/10001/10001/01111',
  H: '10001/10001/10001/11111/10001/10001/10001',
  I: '11111/00100/00100/00100/00100/00100/11111',
  J: '00111/00010/00010/00010/10010/10010/01100',
  K: '10001/10010/10100/11000/10100/10010/10001',
  L: '10000/10000/10000/10000/10000/10000/11111',
  M: '10001/11011/10101/10101/10001/10001/10001',
  N: '10001/11001/11001/10101/10011/10011/10001',
  O: '01110/10001/10001/10001/10001/10001/01110',
  P: '11110/10001/10001/11110/10000/10000/10000',
  Q: '01110/10001/10001/10001/10101/10010/01101',
  R: '11110/10001/10001/11110/10100/10010/10001',
  S: '01111/10000/10000/01110/00001/00001/11110',
  T: '11111/00100/00100/00100/00100/00100/00100',
  U: '10001/10001/10001/10001/10001/10001/01110',
  V: '10001/10001/10001/10001/10001/01010/00100',
  W: '10001/10001/10001/10101/10101/10101/01010',
  X: '10001/10001/01010/00100/01010/10001/10001',
  Y: '10001/10001/01010/00100/00100/00100/00100',
  Z: '11111/00001/00010/00100/01000/10000/11111',
  '0': '01110/10001/10011/10101/11001/10001/01110',
  '1': '00100/01100/00100/00100/00100/00100/01110',
  '2': '01110/10001/00001/00010/00100/01000/11111',
  '3': '11110/00001/00001/01110/00001/00001/11110',
  '4': '00010/00110/01010/10010/11111/00010/00010',
  '5': '11111/10000/10000/11110/00001/00001/11110',
  '6': '01110/10000/10000/11110/10001/10001/01110',
  '7': '11111/00001/00010/00100/01000/01000/01000',
  '8': '01110/10001/10001/01110/10001/10001/01110',
  '9': '01110/10001/10001/01111/00001/00001/01110'
};

// Lowercase has a five-pixel x-height, with two descender rows for g/j/p/q/y.
Object.assign(GLYPHS, {
  a: '00000/00000/01110/00001/01111/10001/01111',
  b: '10000/10000/11110/10001/10001/10001/11110',
  c: '00000/00000/01111/10000/10000/10000/01111',
  d: '00001/00001/01111/10001/10001/10001/01111',
  e: '00000/00000/01110/10001/11111/10000/01111',
  f: '00110/01001/01000/11100/01000/01000/01000',
  g: '00000/00000/01111/10001/10001/10001/01111/00001/01110',
  h: '10000/10000/11110/10001/10001/10001/10001',
  i: '1/0/1/1/1/1/1',
  j: '001/000/001/001/001/001/001/101/010',
  k: '10000/10000/10010/10100/11000/10100/10010',
  l: '10/10/10/10/10/10/01',
  m: '00000/00000/11010/10101/10101/10101/10101',
  n: '00000/00000/11110/10001/10001/10001/10001',
  o: '00000/00000/01110/10001/10001/10001/01110',
  p: '00000/00000/11110/10001/10001/10001/11110/10000/10000',
  q: '00000/00000/01111/10001/10001/10001/01111/00001/00001',
  r: '0000/0000/1011/1100/1000/1000/1000',
  s: '00000/00000/01111/10000/01110/00001/11110',
  t: '010/010/111/010/010/010/001',
  u: '00000/00000/10001/10001/10001/10001/01111',
  v: '00000/00000/10001/10001/10001/01010/00100',
  w: '00000/00000/10001/10001/10101/10101/01010',
  x: '00000/00000/10001/01010/00100/01010/10001',
  y: '00000/00000/10001/10001/10001/10001/01111/00001/01110',
  z: '00000/00000/11111/00010/00100/01000/11111',
  ' ': '000/000/000/000/000/000',
  '.': '0/0/0/0/0/0/1',
  ',': '00/00/00/00/00/01/01/10',
  ':': '0/1/1/0/1/1/0',
  ';': '00/01/01/00/01/01/10',
  '!': '1/1/1/1/1/0/1',
  '?': '01110/10001/00001/00010/00100/00000/00100',
  "'": '1/1/0/0/0/0/0',
  '"': '101/101/000/000/000/000/000',
  '-': '000/000/000/111/000/000/000',
  '–': '00000/00000/00000/11111/00000/00000/00000',
  '—': '0000000/0000000/0000000/1111111/0000000/0000000/0000000',
  '+': '00000/00100/00100/11111/00100/00100/00000',
  '=': '00000/00000/11111/00000/11111/00000/00000',
  '/': '00001/00001/00010/00100/01000/10000/10000',
  '\\': '10000/10000/01000/00100/00010/00001/00001',
  '(': '01/10/10/10/10/10/01',
  ')': '10/01/01/01/01/01/10',
  '[': '11/10/10/10/10/10/11',
  ']': '11/01/01/01/01/01/11',
  '<': '0001/0010/0100/1000/0100/0010/0001',
  '>': '1000/0100/0010/0001/0010/0100/1000',
  '%': '11001/11010/00010/00100/01000/01011/10011',
  '&': '01100/10010/10100/01000/10101/10010/01101',
  '#': '01010/01010/11111/01010/11111/01010/01010',
  '*': '00000/10101/01110/11111/01110/10101/00000',
  '_': '00000/00000/00000/00000/00000/00000/11111',
  '|': '1/1/1/1/1/1/1',
  '@': '01110/10001/10111/10101/10111/10000/01110',
  '$': '00100/01111/10100/01110/00101/11110/00100',
  '^': '00100/01010/10001/00000/00000/00000/00000',
  '`': '10/01/00/00/00/00/00',
  '{': '001/010/010/100/010/010/001',
  '}': '100/010/010/001/010/010/100',
  '~': '00000/00000/01001/10110/00000/00000/00000',
  '’': '1/1/0/0/0/0/0',
  '“': '0101/1010/0000/0000/0000/0000/0000',
  '”': '0101/1010/0000/0000/0000/0000/0000',
  '…': '00000/00000/00000/00000/00000/00000/10101',
  '·': '0/0/0/1/0/0/0',
  '×': '00000/10001/01010/00100/01010/10001/00000',
  '●': '00000/01110/11111/11111/11111/01110/00000',
  '✓': '00000/00001/00001/10010/10010/01100/00000',
  '☠': '01110/11111/10101/11111/01110/00000/11011',
  '★': '00100/00100/11111/01110/01110/11011/10001',
  '◀': '0001/0011/0111/1111/0111/0011/0001',
  '▶': '1000/1100/1110/1111/1110/1100/1000',
  '⏱': '01110/00100/01110/10101/10111/10001/01110',
});

interface Glyph { rows: string[]; width: number }
const glyphs = new Map(Object.entries(GLYPHS).map(([char, mask]) => {
  const rows = mask.split('/');
  return [char, { rows, width: rows[0].length }] as const;
}));
const glyph = (char: string): Glyph => glyphs.get(char) ?? glyphs.get('?')!;

/** The context keeps Canvas font/alignment state; drawing uses bitmap masks, never a system font. */
export const pixelFont = (size: number): string => `${Math.max(1, Math.round(size))}px monospace`;
export const fontScale = (size: number): number => Math.max(1, Math.round(size / 10));
const scaleOf = (g: CanvasRenderingContext2D): number => fontScale(Number(/([\d.]+)px/.exec(g.font)?.[1] ?? 10));

export function pixelTextWidth(text: string, scale = 1): number {
  let width = 0;
  for (const char of text) width += glyph(char).width + 1;
  return Math.max(0, width - 1) * scale;
}
export const textWidth = (g: CanvasRenderingContext2D, text: string): number => pixelTextWidth(text, scaleOf(g));

/** Ellipsize at a character boundary, never squash or fractionally scale the font. */
export function fitPixelText(text: string, scale: number, maxWidth = Infinity): string {
  if (pixelTextWidth(text, scale) <= maxWidth) return text;
  if (pixelTextWidth('…', scale) > maxWidth) return '';
  const chars: string[] = [];
  let used = 0;
  for (const char of text) {
    const advance = (glyph(char).width + 1) * scale;
    if (used + advance + pixelTextWidth('…', scale) > maxWidth) break;
    chars.push(char);
    used += advance;
  }
  return chars.join('').trimEnd() + '…';
}

export function textLayout(text: string, size: number, x: number, y: number,
  align: CanvasTextAlign = 'left', baseline: CanvasTextBaseline = 'alphabetic', maxWidth = Infinity) {
  const scale = fontScale(size), label = fitPixelText(text, scale, maxWidth), width = pixelTextWidth(label, scale);
  const left = align === 'center' ? x - width / 2 : align === 'right' || align === 'end' ? x - width : x;
  const top = baseline === 'top' || baseline === 'hanging' ? y : baseline === 'middle' ? y - 3.5 * scale : y - 7 * scale;
  return { label, scale, width, x: Math.round(left), y: Math.round(top) };
}

// Sizes share cached native-resolution labels; bound memory for changing counters and timers.
const labels = new Map<string, HTMLCanvasElement>();
function labelSprite(text: string, color: string, outline: boolean): HTMLCanvasElement {
  const key = `${outline ? 1 : 0}|${color}|${text}`;
  let canvas = labels.get(key);
  if (canvas) return canvas;
  const border = outline ? 1 : 0;
  canvas = document.createElement('canvas');
  canvas.width = pixelTextWidth(text) + 2 * border;
  canvas.height = 9 + 2 * border;
  const g = canvas.getContext('2d')!;
  g.fillStyle = color;
  let x = border;
  for (const char of text) {
    const { rows, width } = glyph(char);
    rows.forEach((row, y) => {
      for (let xx = 0; xx < width; xx++) if (row[xx] === '1') {
        g.fillRect(x + xx - border, y, 1 + 2 * border, 1 + 2 * border);
      }
    });
    x += width + 1;
  }
  if (labels.size >= 256) labels.delete(labels.keys().next().value!);
  labels.set(key, canvas);
  return canvas;
}

function drawText(g: CanvasRenderingContext2D, text: string, x: number, y: number, maxWidth: number, outline: boolean) {
  const size = Number(/([\d.]+)px/.exec(g.font)?.[1] ?? 10);
  const layout = textLayout(text, size, x, y, g.textAlign, g.textBaseline, maxWidth);
  if (!layout.label) return;
  const color = String(outline ? g.strokeStyle : g.fillStyle), image = labelSprite(layout.label, color, outline);
  const border = outline ? layout.scale : 0;
  const smoothing = g.imageSmoothingEnabled;
  g.imageSmoothingEnabled = false;
  g.drawImage(image, layout.x - border, layout.y - border, image.width * layout.scale, image.height * layout.scale);
  g.imageSmoothingEnabled = smoothing;
}

export function fillText(g: CanvasRenderingContext2D, text: string, x: number, y: number, maxWidth = Infinity) {
  drawText(g, text, x, y, maxWidth, false);
}
export function strokeText(g: CanvasRenderingContext2D, text: string, x: number, y: number, maxWidth = Infinity) {
  drawText(g, text, x, y, maxWidth, true);
}
