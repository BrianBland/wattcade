// Transition effects and things to catch up high: cloud decks, the sea surface, splashes, the re-entry fireball,
// rings and stars, and the jet. Pure drawing on the low-res buffer; no state.
import { hash01 } from '../../warmup/sim/terrain';
import type { G } from '../../warmup/render/biomes';

/** A deck of puffy clouds centred on screen row `y`, scrolling with `scroll` (px). Thick enough to fly through. */
export function drawCloudDeck(g: G, W: number, y: number, scroll: number, t: number, alpha: number, tint = '#ffffff') {
  if (alpha <= 0.01) return;
  const slot = 26, k0 = Math.floor((scroll - 40) / slot), k1 = Math.ceil((scroll + W + 40) / slot);
  g.globalAlpha = alpha * 0.55; g.fillStyle = tint;
  g.fillRect(0, Math.round(y - 6), W, 12);
  for (let pass = 0; pass < 2; pass++) {
    g.globalAlpha = alpha * (pass ? 0.95 : 0.6); g.fillStyle = pass ? tint : '#dfe8f5';
    for (let k = k0; k <= k1; k++) {
      const cx = k * slot - scroll + (hash01(k * 3 + pass) - 0.5) * 10, cy = y + (hash01(k * 7 + pass) - 0.5) * 16 + (pass ? -3 : 4);
      const r = 9 + hash01(k * 11 + pass) * 9 + Math.sin(t * 0.7 + k) * 0.6;
      for (const [dx, dy, f] of [[0, 0, 1], [-r * 0.8, r * 0.3, 0.7], [r * 0.85, r * 0.25, 0.75]] as const) {
        g.beginPath(); g.arc(Math.round(cx + dx), Math.round(cy + dy), Math.round(r * f), 0, Math.PI * 2); g.fill();
      }
    }
  }
  g.globalAlpha = 1;
}

/** The sea surface seen from either side: a bright wavy line with light below (underwater) or spray above. */
export function drawSeaSurface(g: G, W: number, y: number, scroll: number, t: number) {
  if (y < -20) return;
  g.globalAlpha = 0.35; g.fillStyle = '#9fe6ff'; g.fillRect(0, Math.round(y), W, 6); g.globalAlpha = 1;
  g.fillStyle = '#e6fbff';
  for (let x = 0; x < W; x++) { const yy = y + Math.sin((x + scroll) / 9 + t * 3) * 1.6 + Math.sin((x + scroll) / 23 - t * 2); g.fillRect(x, Math.round(yy), 1, 1); }
  g.globalAlpha = 0.5; g.fillStyle = '#4a90b8'; g.fillRect(0, Math.round(y) - 40, W, 40); g.globalAlpha = 1; // the sky above the sea, dimmed
}

/** A splash (into the sea, or breaking out of it): a crown of droplets, a white flash and bubbles. `age` in seconds. */
export function drawSplash(g: G, x: number, y: number, age: number, big: boolean) {
  if (age < 0 || age > 1.4) return;
  const k = age / 1.4, n = big ? 34 : 20;
  if (age < 0.15) { g.globalAlpha = (0.15 - age) / 0.15 * 0.6; g.fillStyle = '#ffffff'; g.beginPath(); g.arc(x, y, 30, 0, Math.PI * 2); g.fill(); }
  for (let i = 0; i < n; i++) {
    const a = -Math.PI * (0.1 + 0.8 * hash01(i * 3 + 1)), sp = (big ? 70 : 45) * (0.4 + hash01(i * 5 + 2));
    const dx = Math.cos(a) * sp * age, dy = Math.sin(a) * sp * age + 60 * age * age;
    g.globalAlpha = 1 - k; g.fillStyle = i % 3 ? '#e6fbff' : '#8fd8f0';
    g.fillRect(Math.round(x + dx), Math.round(y + dy), i % 4 ? 2 : 3, i % 4 ? 2 : 3);
  }
  g.strokeStyle = '#ffffff'; g.globalAlpha = (1 - k) * 0.8; g.lineWidth = 1;
  g.beginPath(); g.ellipse(x, y + 4, 8 + 40 * k, 2 + 6 * k, 0, 0, Math.PI * 2); g.stroke();
  for (let i = 0; i < 10; i++) { // bubbles
    g.globalAlpha = (1 - k) * 0.7; g.strokeStyle = '#cdf6ff';
    g.beginPath(); g.arc(Math.round(x + (hash01(i * 9) - 0.5) * 30), Math.round(y + 10 + hash01(i * 4) * 20 - age * 30), 1 + (i % 3), 0, Math.PI * 2); g.stroke();
  }
  g.globalAlpha = 1;
}

/** Re-entry: a fireball round the rider (screen x, y) moving at angle `dir`, with a trail streaming back up. `heat` 0..1. */
export function drawFireball(g: G, x: number, y: number, dir: number, heat: number, t: number) {
  if (heat <= 0.01) return;
  const bx = -Math.cos(dir), by = -Math.sin(dir); // trail direction (behind)
  for (let i = 14; i >= 0; i--) {
    const d = i * 4.5 * heat, r = (13 - i * 0.6) * (0.6 + 0.4 * heat) + Math.sin(t * 40 + i) * 1.2;
    g.globalAlpha = (0.12 + 0.05 * (14 - i) / 14) * heat * 2;
    g.fillStyle = i < 3 ? '#fff3c0' : i < 7 ? '#ffb030' : '#ff5a1a';
    g.beginPath(); g.arc(x + bx * d + (hash01(i + Math.floor(t * 20)) - 0.5) * 3, y - 6 + by * d, Math.max(2, r), 0, Math.PI * 2); g.fill();
  }
  g.globalAlpha = 0.5 * heat; g.fillStyle = '#ffffff'; g.beginPath(); g.arc(x - bx * 4, y - 6 - by * 4, 9, 0, Math.PI * 2); g.fill();
  for (let i = 0; i < 12; i++) { // sparks
    const age = ((t * 2 + hash01(i)) % 1);
    g.globalAlpha = (1 - age) * heat; g.fillStyle = i % 2 ? '#ffe066' : '#ff7a2a';
    g.fillRect(Math.round(x + bx * age * 60 + (hash01(i * 3) - 0.5) * 20), Math.round(y - 6 + by * age * 60 + (hash01(i * 5) - 0.5) * 20), 2, 2);
  }
  g.globalAlpha = 1;
}

/** A golden ring to fly through (seen edge-on, so an upright ellipse), or its burst once caught. */
export function drawRing(g: G, x: number, y: number, t: number, caughtAge = -1) {
  if (caughtAge >= 0) {
    if (caughtAge > 0.6) return;
    const k = caughtAge / 0.6;
    g.globalAlpha = 1 - k; g.strokeStyle = '#fff3a0'; g.lineWidth = 2;
    g.beginPath(); g.ellipse(x, y, 5 + 20 * k, 14 + 20 * k, 0, 0, Math.PI * 2); g.stroke(); g.globalAlpha = 1;
    return;
  }
  const w = 5 + Math.sin(t * 2) * 0.6;
  g.lineWidth = 3; g.strokeStyle = '#b8860b'; g.beginPath(); g.ellipse(x + 1, y, w, 15, 0, 0, Math.PI * 2); g.stroke();
  g.lineWidth = 2; g.strokeStyle = '#ffd23b'; g.beginPath(); g.ellipse(x, y, w, 15, 0, 0, Math.PI * 2); g.stroke();
  g.fillStyle = '#fff6c0'; g.fillRect(Math.round(x - 1), Math.round(y - 14 + ((t * 20) % 28)), 2, 2);
}

/** A spinning pixel star, or its sparkle once caught. */
export function drawStar(g: G, x: number, y: number, t: number, caughtAge = -1) {
  if (caughtAge >= 0) {
    if (caughtAge > 0.5) return;
    const k = caughtAge / 0.5; g.globalAlpha = 1 - k; g.fillStyle = '#fff6a0';
    for (let i = 0; i < 8; i++) { const a = (i / 8) * Math.PI * 2; g.fillRect(Math.round(x + Math.cos(a) * 16 * k), Math.round(y + Math.sin(a) * 16 * k), 2, 2); }
    g.globalAlpha = 1; return;
  }
  const s = 5 * (0.75 + 0.25 * Math.abs(Math.cos(t * 3))), r = s * 0.45;
  g.fillStyle = '#ffd23b'; g.beginPath();
  for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + (i * Math.PI) / 5, rr = i % 2 ? r : s; g.lineTo(x + Math.cos(a) * rr * Math.abs(Math.cos(t * 3)) + (i % 2 ? 0 : 0), y + Math.sin(a) * rr); }
  g.closePath(); g.fill();
  g.fillStyle = '#fffbe0'; g.fillRect(Math.round(x - 1), Math.round(y - 1), 2, 2);
}
