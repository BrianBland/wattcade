// Pure grid upsampling for rendering: the sim grid is coarse (1 unit cells); the renderer draws at 2× with smooth
// interpolation so slopes and shorelines don't show the grid's facets.

/** Fine-grid size for a coarse size n: 2n − 1 (every coarse sample is kept). */
export const fine = (n: number) => 2 * n - 1;

/**
 * 2× upsample `src` (nx × ny, `ch` interleaved channels) into `out` (fine(nx) × fine(ny) × ch).
 * Even fine samples copy the coarse ones; odd ones are the midpoint of a Catmull-Rom spline (`cubic`) or linear.
 * `tmp` must hold fine(nx) × ny × ch values.
 */
export function upsample2(src: ArrayLike<number>, nx: number, ny: number, out: Float32Array, tmp: Float32Array, cubic = true, ch = 1): void {
  const FX = fine(nx), FY = fine(ny);
  const mid = cubic
    ? (a: number, b: number, c: number, d: number) => (-a + 9 * b + 9 * c - d) / 16
    : (_a: number, b: number, c: number) => (b + c) / 2;
  for (let j = 0; j < ny; j++) for (let I = 0; I < FX; I++) {
    const i = I >> 1;
    for (let c = 0; c < ch; c++) {
      const at = (ii: number) => src[(j * nx + Math.max(0, Math.min(nx - 1, ii))) * ch + c];
      tmp[(j * FX + I) * ch + c] = I & 1 ? mid(at(i - 1), at(i), at(i + 1), at(i + 2)) : at(i);
    }
  }
  for (let J = 0; J < FY; J++) {
    const j = J >> 1;
    for (let I = 0; I < FX; I++) for (let c = 0; c < ch; c++) {
      const at = (jj: number) => tmp[(Math.max(0, Math.min(ny - 1, jj)) * FX + I) * ch + c];
      out[(J * FX + I) * ch + c] = J & 1 ? mid(at(j - 1), at(j), at(j + 1), at(j + 2)) : at(j);
    }
  }
}
