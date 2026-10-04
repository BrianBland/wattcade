/**
 * A 5-colour palette from cover art (pure k-means on RGBA pixels), sorted most vivid first.
 * Games seed their look from it (e.g. Wattsurf's zone colours).
 */
const hex = (r: number, g: number, b: number) => '#' + [r, g, b].map((v) => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, '0')).join('');

export function rgbToHsl(r: number, g: number, b: number): [number, number, number] {
  r /= 255; g /= 255; b /= 255;
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), l = (mx + mn) / 2, d = mx - mn;
  if (!d) return [0, 0, l];
  const s = l > 0.5 ? d / (2 - mx - mn) : d / (mx + mn);
  const h = mx === r ? ((g - b) / d + (g < b ? 6 : 0)) : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return [h * 60, s, l];
}

export function paletteFromPixels(rgba: ArrayLike<number>, k = 5, iterations = 12): string[] {
  const px: Array<[number, number, number]> = [];
  for (let i = 0; i + 3 < rgba.length; i += 4) if (rgba[i + 3] > 128) px.push([rgba[i], rgba[i + 1], rgba[i + 2]]);
  if (!px.length) return [];
  // deterministic init: spread over the pixels sorted by luminance
  const sorted = [...px].sort((a, b) => a[0] * 0.3 + a[1] * 0.59 + a[2] * 0.11 - (b[0] * 0.3 + b[1] * 0.59 + b[2] * 0.11));
  let cents = Array.from({ length: Math.min(k, px.length) }, (_, i) => [...sorted[Math.floor(((i + 0.5) * sorted.length) / k)]] as [number, number, number]);
  const counts = new Array(cents.length).fill(0);
  for (let it = 0; it < iterations; it++) {
    const sums = cents.map(() => [0, 0, 0]); counts.fill(0);
    for (const p of px) {
      let bi = 0, bd = Infinity;
      for (let c = 0; c < cents.length; c++) { const d = (p[0] - cents[c][0]) ** 2 + (p[1] - cents[c][1]) ** 2 + (p[2] - cents[c][2]) ** 2; if (d < bd) { bd = d; bi = c; } }
      sums[bi][0] += p[0]; sums[bi][1] += p[1]; sums[bi][2] += p[2]; counts[bi]++;
    }
    cents = cents.map((c, i) => (counts[i] ? [sums[i][0] / counts[i], sums[i][1] / counts[i], sums[i][2] / counts[i]] : c) as [number, number, number]);
  }
  const vivid = (c: [number, number, number]) => { const [, s, l] = rgbToHsl(...c); return s * (1 - Math.abs(l - 0.5) * 1.6); };
  return cents.map((c, i) => ({ c, n: counts[i] })).filter((x) => x.n > 0)
    .sort((a, b) => vivid(b.c) * Math.sqrt(b.n) - vivid(a.c) * Math.sqrt(a.n)).map((x) => hex(...x.c));
}

/** Fallback palette from the key (Camelot number → hue) and energy, for songs without art. */
export function paletteFromKey(camelot: string, energy = 0.6): string[] {
  const n = Number(camelot.slice(0, -1)) || 1, minor = camelot.endsWith('A');
  const h = ((n - 1) * 30 + (minor ? 200 : 20)) % 360;
  const hsl = (hh: number, s: number, l: number) => {
    const a = s * Math.min(l, 1 - l), f = (m: number) => { const k = (m + hh / 30) % 12; return l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1)); };
    return hex(f(0) * 255, f(8) * 255, f(4) * 255);
  };
  return [hsl(h, 0.85, 0.55), hsl((h + 40) % 360, 0.8, 0.6), hsl((h + 180) % 360, 0.75, 0.55), hsl((h + 300) % 360, 0.6 + 0.3 * energy, 0.5), hsl(h, 0.4, 0.12)];
}
