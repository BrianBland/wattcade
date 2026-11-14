// The mega ramp that launches you up a layer: chevron booster pad on the road, then a steel quarter-pipe with a lit lip.
import type { G } from '../../warmup/render/biomes';
import { MEGA, megaLift } from '../sim/track';

/** `lip` is world m; sx / roadY / sy map world to buffer px (roadY includes the ramp's own height). */
export function drawMegaRamp(g: G, lip: number, sx: (x: number) => number, roadY: (x: number) => number, roadH: (x: number) => number,
  sy: (h: number) => number, ppm: number, t: number) {
  // booster pad: chevrons that chase toward the ramp
  const p0 = lip - MEGA.len - MEGA.padFrom, p1 = lip - MEGA.len - MEGA.padTo;
  for (let x = Math.floor(sx(p0)); x < sx(p1); x++) {
    const dd = p0 + (x - sx(p0)) / ppm, y = Math.round(roadY(dd));
    const ph = ((dd - t * 30) % 4 + 4) % 4; // 4 m chevrons sliding forward
    g.fillStyle = '#1b1b2a'; g.fillRect(x, y, 1, 5);
    const on = ph < 2 ? Math.abs(ph - 1) : 9;
    if (on < 1) { g.fillStyle = on < 0.45 ? '#fff3a0' : '#ff9a1a'; g.fillRect(x, y + Math.round(on * 2), 1, Math.max(1, 5 - Math.round(on * 4))); }
  }
  g.fillStyle = 'rgba(255,190,60,0.25)'; g.fillRect(Math.round(sx(p0)), Math.round(roadY(p0)) - 3, Math.round((p1 - p0) * ppm), 3); // glow
  // the ramp: steel deck on a lattice of struts
  const a = lip - MEGA.len, x0 = Math.floor(sx(a)), x1 = Math.ceil(sx(lip));
  for (let x = x0; x <= x1; x++) {
    const dd = a + (x - sx(a)) / ppm, top = Math.round(roadY(dd)), base = Math.round(sy(roadH(dd)));
    if (top >= base) continue;
    g.fillStyle = '#3c4256'; g.fillRect(x, top + 4, 1, base - top - 4); // the side, in shadow
    if (Math.floor(dd / 3) % 2 === 0) { g.fillStyle = '#2a2f40'; g.fillRect(x, top + 4, 1, base - top - 4); }
    g.fillStyle = '#c6ccd6'; g.fillRect(x, top, 1, 2); g.fillStyle = '#8a92a6'; g.fillRect(x, top + 2, 1, 2);
  }
  // cross-bracing
  g.strokeStyle = '#5a6278'; g.lineWidth = 1; g.beginPath();
  for (let k = 0; k < 6; k++) {
    const xa = a + (MEGA.len * k) / 6, xb = a + (MEGA.len * (k + 1)) / 6;
    g.moveTo(sx(xa), sy(roadH(xa))); g.lineTo(sx(xb), sy(roadH(xb) + megaLift(lip, xb) - 0.5));
  }
  g.stroke();
  // the lip: a lit bar that pulses
  const lx = Math.round(sx(lip)), ly = Math.round(roadY(lip - 0.01));
  g.fillStyle = Math.sin(t * 10) > 0 ? '#ffd23b' : '#ff6a1a'; g.fillRect(lx - 2, ly - 1, 4, 4);
  g.fillStyle = '#3c4256'; g.fillRect(lx - 1, ly + 3, 2, Math.max(0, Math.round(sy(roadH(lip))) - ly - 3));
}
