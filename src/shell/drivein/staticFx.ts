// TV static for the channel flip (pure fill of an RGBA buffer so it can be tested without a canvas).

/** Fill `data` (w*h RGBA) with grey noise and a bright horizontal roll bar that moves with `t`. */
export function fillStatic(data: Uint8ClampedArray, w: number, h: number, t: number, rng: () => number): void {
  const bar = Math.floor(((t * 0.9) % 1) * h);
  for (let y = 0; y < h; y++) {
    const lift = Math.abs(y - bar) < h * 0.06 ? 60 : 0, tear = (y + Math.floor(t * 30)) % 23 === 0 ? 40 : 0;
    for (let x = 0; x < w; x++) {
      const v = Math.min(255, 30 + rng() * 190 + lift + tear), i = (y * w + x) * 4;
      data[i] = data[i + 1] = v; data[i + 2] = Math.min(255, v + 10); data[i + 3] = 255;
    }
  }
}
