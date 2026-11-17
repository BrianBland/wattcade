// Full Send's two faces, self-hosted (OFL, see render/fonts/*.txt), loaded once on mount; canvas text falls back to
// system-ui until they arrive. Display: Barlow Condensed ExtraBold Italic (titles, numerals, call-outs; broadcast-sport
// feel). Signs: Overpass (an open take on the US highway-sign face) for boards, labels and tips.
import displayUrl from './fonts/barlow-condensed-latin-800-italic.woff2?url';
import sign700Url from './fonts/overpass-latin-700-normal.woff2?url';
import sign900Url from './fonts/overpass-latin-900-normal.woff2?url';

let loading: Promise<unknown> | null = null;
/** Starts loading the faces (browser only); resolves when they are usable (or failed, then the fallback stays). */
export function loadFonts(): Promise<unknown> {
  if (loading || typeof FontFace === 'undefined' || typeof document === 'undefined') return loading ?? Promise.resolve();
  const add = (f: FontFace) => f.load().then((x) => { document.fonts.add(x); }).catch(() => undefined);
  loading = Promise.all([
    add(new FontFace('FS Display', `url(${displayUrl})`, { weight: '800', style: 'italic' })),
    add(new FontFace('FS Sign', `url(${sign700Url})`, { weight: '700' })),
    add(new FontFace('FS Sign', `url(${sign900Url})`, { weight: '900' })),
  ]);
  return loading;
}

/** Display face for italic text; it is condensed, so it runs a bit larger to keep the same presence. */
const DISPLAY_SCALE = 1.22;
/** A canvas font string. `italic` picks the display face; otherwise the sign face (700 or 900). `px` is already in device pixels. */
export function fsFont(weight: number, px: number, italic = false): string {
  if (italic) return `italic 800 ${Math.round(px * DISPLAY_SCALE)}px "FS Display", "Arial Narrow", system-ui, sans-serif`;
  return `${weight >= 850 ? 900 : 700} ${Math.round(px)}px "FS Sign", system-ui, sans-serif`;
}
