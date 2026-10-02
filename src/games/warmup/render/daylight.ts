/** Real time of day for the outdoor biomes: `night` 0 (day) .. 1 (night), `glow` 0..1 around sunrise/sunset. */
export function daylight(hours: number): { night: number; glow: number } {
  const h = ((hours % 24) + 24) % 24;
  let night: number;
  if (h < 5.5 || h >= 20.5) night = 1;
  else if (h < 7) night = 1 - (h - 5.5) / 1.5;
  else if (h < 18.5) night = 0;
  else night = (h - 18.5) / 2;
  const glow = Math.max(0, 1 - Math.abs(h - 19.2) / 1.3, 1 - Math.abs(h - 6.4) / 0.9);
  return { night, glow };
}
