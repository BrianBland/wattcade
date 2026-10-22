// Named palette → indices 1..255 plus a linear-RGB table for the mesher.
export interface Palette<K extends string> { idx: Record<K, number>; linear: Float32Array; hex: Record<K, number> }

const toLinear = (c: number) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);

export function definePalette<K extends string>(colors: Record<K, number>): Palette<K> {
  const idx = {} as Record<K, number>;
  const linear = new Float32Array(256 * 3);
  let i = 1;
  for (const k of Object.keys(colors) as K[]) {
    if (i > 255) throw new Error('palette overflow');
    const h = colors[k];
    idx[k] = i;
    linear[i * 3] = toLinear(((h >> 16) & 255) / 255);
    linear[i * 3 + 1] = toLinear(((h >> 8) & 255) / 255);
    linear[i * 3 + 2] = toLinear((h & 255) / 255);
    i++;
  }
  return { idx, linear, hex: colors };
}
