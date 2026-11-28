// Multi-segment pixel-art renderer for The Headwind Wyrm (Boss 5).
// Draws 14 articulated scaled serpent body segments wrapping smoothly around the boss room
// like a classic arcade snake, with horned dragon head, glowing storm dorsal spines, and forked tail.
import { pixelDisc, pixelRing } from './pixel';

export interface WyrmSeg {
  x: number;
  y: number;
  ang: number;
}

const BODY_OUTLINE = '#090712';
const SCALE_DARK = '#1b2b4a';
const SCALE_MID = '#2c4c7c';
const SCALE_LIGHT = '#5282b8';
const BELLY = '#8fb8d8';
const SPINE_IDLE = '#6fd8ff';
const SPINE_WIND = '#ffd84a';
const SPINE_EXPOSED = '#fff4b0';

/**
 * Render the entire articulated Headwind Wyrm body from tail to head.
 * Drawn in world pixel coordinates (1 tile = TS px).
 */
export function drawWyrm32(
  g: CanvasRenderingContext2D,
  segs: readonly WyrmSeg[],
  TS: number,
  t: number,
  opts: { windup: boolean; exposed: boolean; flash: boolean },
): void {
  if (!segs.length) return;
  const n = segs.length;
  const spineCol = opts.flash ? '#ffffff' : opts.exposed ? SPINE_EXPOSED : opts.windup && Math.sin(t * 20) > 0 ? SPINE_WIND : SPINE_IDLE;

  // 1. Soft ground shadow pass under every segment so the whole snake floats cleanly above the floor
  g.save();
  g.fillStyle = 'rgba(6, 4, 12, 0.42)';
  for (let i = n - 1; i >= 0; i--) {
    const s = segs[i];
    const taper = i === 0 ? 1.05 : Math.max(0.38, 1 - (i / n) * 0.62);
    const rx = Math.max(3, Math.round(TS * 0.42 * taper));
    const ry = Math.max(2, Math.round(rx * 0.52));
    const sx = Math.round(s.x * TS), sy = Math.round(s.y * TS + TS * 0.34);
    g.fillRect(sx - rx, sy - ry, rx * 2, ry * 2);
  }
  g.restore();

  // 2. Body segments drawn tail -> neck with continuous armored scale bridges so the serpent reads as one sinuous body
  const segPos = (i: number) => {
    const s = segs[i];
    const wave = i === 0 ? 0 : Math.sin(t * 8 - i * 0.65) * 1.4;
    const perpX = -Math.sin(s.ang), perpY = Math.cos(s.ang);
    return { x: Math.round(s.x * TS + perpX * wave), y: Math.round(s.y * TS + perpY * wave), ang: s.ang, perpX, perpY };
  };
  const pts = Array.from({ length: n }, (_, i) => segPos(i));

  for (let i = n - 1; i >= 1; i--) {
    const cur = pts[i], fwd = pts[i - 1];
    const taper = Math.max(0.36, 1 - (i / (n + 0.6)) * 0.64);
    const r = Math.max(4, Math.round(TS * 0.44 * taper));
    const midX = Math.round((cur.x + fwd.x) / 2), midY = Math.round((cur.y + fwd.y) / 2);
    const midR = Math.max(3, Math.round(r * 0.96));

    // Continuous inter-segment armored bridge (eliminates bead gaps on tight coils)
    pixelDisc(g, midX, midY, midR + 1.5, BODY_OUTLINE);
    pixelDisc(g, midX, midY, midR, opts.flash ? '#ffffff' : SCALE_DARK);
    if (!opts.flash) {
      pixelDisc(g, midX - Math.round(midR * 0.18), midY - Math.round(midR * 0.2), Math.max(2, Math.round(midR * 0.5)), SCALE_MID);
    }

    // Main overlapping armored scale plate
    pixelDisc(g, cur.x, cur.y, r + 1.5, BODY_OUTLINE);
    const bodyCol = opts.flash ? '#ffffff' : i % 2 === 0 ? SCALE_MID : SCALE_DARK;
    pixelDisc(g, cur.x, cur.y, r, bodyCol);
    if (!opts.flash) {
      pixelDisc(g, cur.x - Math.round(r * 0.22), cur.y - Math.round(r * 0.24), Math.max(2, Math.round(r * 0.56)), i % 2 === 0 ? SCALE_LIGHT : SCALE_MID);
      // Ribbed ventral scale glint
      if (r >= 6) {
        g.fillStyle = BELLY;
        g.fillRect(cur.x - Math.round(r * 0.34), cur.y + Math.round(r * 0.36), Math.max(3, Math.round(r * 0.68)), 2);
      }
    }

    // Pointed glowing dorsal storm fin ridge on every segment (waves from head to tail)
    const pulse = 0.58 + 0.42 * Math.sin(t * 10 - i * 0.55);
    const finH = Math.max(3, Math.round(r * 0.55));
    g.save();
    g.globalAlpha = Math.min(1, opts.windup || opts.exposed ? 1 : pulse);
    const fx = Math.round(cur.x + cur.perpX * 1);
    const fy = Math.round(cur.y - Math.round(r * 0.28));
    g.fillStyle = BODY_OUTLINE;
    g.fillRect(fx - 2, fy - finH - 1, 5, finH + 3);
    g.fillStyle = spineCol;
    g.fillRect(fx - 1, fy - finH, 3, finH);
    g.fillStyle = '#e6fbff';
    g.fillRect(fx, fy - finH, 1, Math.max(2, finH - 1));
    g.restore();

    // Forked storm-tail blades on the very last segment
    if (i === n - 1) {
      const bx = Math.cos(cur.ang + Math.PI), by = Math.sin(cur.ang + Math.PI);
      for (const side of [-1, 1]) {
        const tx = Math.round(cur.x + bx * 9 + cur.perpX * side * 5);
        const ty = Math.round(cur.y + by * 9 + cur.perpY * side * 5);
        g.fillStyle = BODY_OUTLINE;
        g.fillRect(tx - 2, ty - 2, 5, 5);
        g.fillStyle = spineCol;
        g.fillRect(tx - 1, ty - 1, 3, 3);
      }
    }
  }

  // 3. Fierce horned Headwind Wyrm dragon head at segment 0
  const head = pts[0];
  const hx = head.x, hy = head.y;
  const hr = Math.round(TS * 0.58);
  const fx = Math.cos(head.ang), fy = Math.sin(head.ang);
  const lx = -fy, ly = fx;

  if (opts.exposed) {
    pixelRing(g, hx, hy, hr * 1.9, '#ffe08a', true);
  } else if (opts.windup) {
    pixelRing(g, hx, hy, hr * (1.7 + 0.25 * Math.sin(t * 18)), '#ffd84a', true);
  }

  // Swept-back articulated storm horns
  for (const side of [-1, 1]) {
    const hbx = Math.round(hx - fx * hr * 0.25 + lx * side * hr * 0.72);
    const hby = Math.round(hy - fy * hr * 0.25 + ly * side * hr * 0.72);
    const hmx = Math.round(hx - fx * hr * 0.85 + lx * side * hr * 1.12);
    const hmy = Math.round(hy - fy * hr * 0.85 + ly * side * hr * 1.12);
    const htx = Math.round(hx - fx * hr * 1.38 + lx * side * hr * 1.24);
    const hty = Math.round(hy - fy * hr * 1.38 + ly * side * hr * 1.24);
    g.strokeStyle = BODY_OUTLINE; g.lineWidth = 5;
    g.beginPath(); g.moveTo(hbx, hby); g.lineTo(hmx, hmy); g.lineTo(htx, hty); g.stroke();
    g.strokeStyle = spineCol; g.lineWidth = 2.5;
    g.beginPath(); g.moveTo(hbx, hby); g.lineTo(hmx, hmy); g.lineTo(htx, hty); g.stroke();
    g.fillStyle = '#e6fbff';
    g.fillRect(htx - 1, hty - 1, 2, 2);
  }

  // Snout + armored cranium
  const sx = Math.round(hx + fx * hr * 0.62), sy = Math.round(hy + fy * hr * 0.62);
  pixelDisc(g, sx, sy, Math.round(hr * 0.74) + 1.5, BODY_OUTLINE);
  pixelDisc(g, hx, hy, hr + 1.5, BODY_OUTLINE);
  pixelDisc(g, hx, hy, hr, opts.flash ? '#ffffff' : SCALE_MID);
  pixelDisc(g, sx, sy, Math.round(hr * 0.74), opts.flash ? '#ffffff' : SCALE_LIGHT);
  if (!opts.flash) {
    // Forehead armored brow crest + glowing storm rune
    pixelDisc(g, hx - Math.round(fx * 2), hy - Math.round(fy * 2), Math.round(hr * 0.55), SCALE_DARK);
    g.fillStyle = spineCol;
    g.fillRect(hx - 2, hy - 3, 4, 5);
    g.fillStyle = '#e6fbff';
    g.fillRect(hx - 1, hy - 2, 2, 2);
    // Fierce blazing eyes
    for (const side of [-1, 1]) {
      const ex = Math.round(hx + fx * hr * 0.34 + lx * side * hr * 0.46);
      const ey = Math.round(hy + fy * hr * 0.34 + ly * side * hr * 0.46);
      g.fillStyle = BODY_OUTLINE; g.fillRect(ex - 2, ey - 2, 5, 4);
      g.fillStyle = opts.windup ? '#ff4a5a' : '#ffe45e'; g.fillRect(ex - 1, ey - 1, 3, 2);
    }
    // White fangs + flaring nostrils on snout
    for (const side of [-1, 1]) {
      const fangX = Math.round(sx + fx * hr * 0.45 + lx * side * hr * 0.36);
      const fangY = Math.round(sy + fy * hr * 0.45 + ly * side * hr * 0.36);
      g.fillStyle = BODY_OUTLINE; g.fillRect(fangX - 1, fangY - 1, 3, 3);
      g.fillStyle = '#ffffff'; g.fillRect(fangX, fangY, 2, 2);
    }
    // Flowing wind whiskers trailing off the snout
    for (const side of [-1, 1]) {
      const w0x = Math.round(sx + lx * side * hr * 0.55);
      const w0y = Math.round(sy + ly * side * hr * 0.55);
      const wag = Math.sin(t * 11 + side) * 3;
      const w1x = Math.round(w0x - fx * 9 + lx * side * (6 + wag));
      const w1y = Math.round(w0y - fy * 9 + ly * side * (6 + wag));
      g.strokeStyle = opts.windup ? '#ffd84a' : '#a8eeff';
      g.lineWidth = 1.5;
      g.beginPath(); g.moveTo(w0x, w0y); g.lineTo(w1x, w1y); g.stroke();
    }
  }
}
