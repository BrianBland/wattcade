// Vector boss art. Each draws centred at (x, y) with radius `r` in px; `tell` 0..1 charges the weapon glow.
import type { BossKind } from '../sim/content';

type G = CanvasRenderingContext2D;
interface BossDraw { x: number; y: number; r: number; t: number; tell: number; hurt: boolean; part?: 'core' | 'L' | 'R'; frac: number }

const poly = (g: G, pts: Array<[number, number]>) => { g.beginPath(); pts.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y))); g.closePath(); };

function core(g: G, x: number, y: number, r: number, color: string, tell: number, t: number) {
  const pr = r * (0.9 + 0.15 * Math.sin(t * 6) + tell * 0.4);
  const gr = g.createRadialGradient(x, y, 0, x, y, pr);
  gr.addColorStop(0, '#ffffff'); gr.addColorStop(0.35, color); gr.addColorStop(1, color + '00');
  g.fillStyle = gr; g.beginPath(); g.arc(x, y, pr, 0, Math.PI * 2); g.fill();
}

export function drawBoss(g: G, kind: BossKind, d: BossDraw): void {
  const { x, y, r, t, tell } = d;
  g.save();
  g.lineJoin = 'round';
  const flash = d.hurt;
  const ink = '#0d0a18';
  if (kind === 'dreadnought') {
    g.fillStyle = flash ? '#fff' : '#6a6f7e'; g.strokeStyle = ink; g.lineWidth = Math.max(2, r * 0.06);
    poly(g, [[x - r * 1.5, y - r * 0.5], [x + r * 1.5, y - r * 0.5], [x + r * 1.1, y + r * 0.45], [x + r * 0.35, y + r * 0.9], [x - r * 0.35, y + r * 0.9], [x - r * 1.1, y + r * 0.45]]);
    g.fill(); g.stroke();
    g.fillStyle = flash ? '#fff' : '#ffd24a';
    poly(g, [[x - r * 1.3, y - r * 0.5], [x + r * 1.3, y - r * 0.5], [x + r * 1.1, y - r * 0.25], [x - r * 1.1, y - r * 0.25]]); g.fill();
    g.fillStyle = flash ? '#fff' : '#454a58';
    for (const s of [-1, 1]) { g.fillRect(x + s * r * 0.85 - r * 0.15, y - r * 0.1, r * 0.3, r * 0.5); g.fillRect(x + s * r * 0.85 - r * 0.05, y + r * 0.3, r * 0.1, r * 0.35); }
    for (let i = -2; i <= 2; i++) { g.fillStyle = (Math.floor(t * 4) + i) % 3 === 0 ? '#ffe9a0' : '#8a6a1a'; g.fillRect(x + i * r * 0.32 - r * 0.06, y - r * 0.05, r * 0.12, r * 0.12); }
    core(g, x, y + r * 0.6, r * 0.35, '#ffb020', tell, t);
  } else if (kind === 'hive') {
    const pulse = 1 + Math.sin(t * 3) * 0.04;
    g.fillStyle = flash ? '#fff' : '#8a3a1a'; g.strokeStyle = ink; g.lineWidth = Math.max(2, r * 0.06);
    const hex = (cx: number, cy: number, rr: number) => poly(g, Array.from({ length: 6 }, (_, i) => [cx + Math.cos(i * Math.PI / 3 + Math.PI / 6) * rr, cy + Math.sin(i * Math.PI / 3 + Math.PI / 6) * rr] as [number, number]));
    hex(x, y, r * 1.15 * pulse); g.fill(); g.stroke();
    const cell = r * 0.3;
    for (let i = -2; i <= 2; i++) for (let j = -1; j <= 1; j++) {
      const cx = x + i * cell * 1.5, cy = y + j * cell * 1.75 + (i % 2 ? cell * 0.87 : 0);
      if (Math.hypot(cx - x, cy - y) > r * 0.95) continue;
      hex(cx, cy, cell * 0.8);
      const lit = Math.sin(t * 2 + i * 1.7 + j * 2.3) > 0.3;
      g.fillStyle = flash ? '#fff' : lit ? '#ffb347' : '#c4601e'; g.fill();
    }
    for (const s of [-1, 1]) { // side hatches that open when spawning
      g.fillStyle = '#2a1008'; g.beginPath(); g.ellipse(x + s * r * 1.0, y + r * 0.2, r * 0.18, r * 0.3, 0, 0, Math.PI * 2); g.fill();
    }
    core(g, x, y + r * 0.75, r * 0.3, '#ff8a3c', tell, t);
  } else if (kind === 'lancer') {
    const s = d.part === 'R' ? 1 : -1;
    g.fillStyle = flash ? '#fff' : '#1d6a7a'; g.strokeStyle = ink; g.lineWidth = Math.max(2, r * 0.08);
    poly(g, [[x, y - r * 1.6], [x + r * 0.9, y - r * 0.2], [x + r * 0.4, y + r * 1.3], [x - r * 0.4, y + r * 1.3], [x - r * 0.9, y - r * 0.2]]);
    g.fill(); g.stroke();
    g.fillStyle = flash ? '#fff' : '#5cf2e0';
    poly(g, [[x, y - r * 1.2], [x + r * 0.45, y - r * 0.2], [x, y + r * 0.9], [x - r * 0.45, y - r * 0.2]]); g.fill();
    g.strokeStyle = '#5cf2e0aa'; g.lineWidth = 2;
    poly(g, [[x - s * r * 0.9, y - r * 0.2], [x - s * r * 1.8, y - r * 0.6], [x - s * r * 1.5, y + r * 0.3]]); g.stroke(); // fin toward the centre
    core(g, x, y + r * 1.3, r * 0.35, '#5cf2e0', tell, t);
  } else if (kind === 'spiral') {
    g.strokeStyle = flash ? '#fff' : '#8a2bb0'; g.lineWidth = Math.max(3, r * 0.22);
    g.beginPath(); g.arc(x, y, r * 1.1, 0, Math.PI * 2); g.stroke();
    g.lineWidth = Math.max(2, r * 0.12);
    for (let i = 0; i < 6; i++) {
      const a = t * 1.6 + (i * Math.PI) / 3;
      g.strokeStyle = flash ? '#fff' : i % 2 ? '#c46cff' : '#f0dcff';
      g.beginPath(); g.arc(x, y, r * 1.45, a, a + 0.6); g.stroke();
      g.fillStyle = '#c46cff'; g.beginPath(); g.arc(x + Math.cos(a) * r * 1.1, y + Math.sin(a) * r * 1.1, r * 0.14, 0, Math.PI * 2); g.fill();
    }
    g.fillStyle = flash ? '#fff' : '#2a1240'; g.beginPath(); g.arc(x, y, r * 0.8, 0, Math.PI * 2); g.fill();
    core(g, x, y, r * 0.6, '#c46cff', tell, t);
  } else if (kind === 'maw') {
    const open = 0.35 + 0.25 * Math.sin(t * 2) + tell * 0.3;
    g.fillStyle = flash ? '#fff' : '#1d5a2a'; g.strokeStyle = ink; g.lineWidth = Math.max(2, r * 0.05);
    g.beginPath(); g.ellipse(x, y, r * 1.4, r * 1.0, 0, 0, Math.PI * 2); g.fill(); g.stroke();
    // armour plates
    g.fillStyle = flash ? '#fff' : '#3a8a2b';
    for (let i = -2; i <= 2; i++) { g.beginPath(); g.ellipse(x + i * r * 0.5, y - r * 0.6, r * 0.3, r * 0.22, 0, 0, Math.PI * 2); g.fill(); }
    // mouth
    g.fillStyle = '#050805'; g.beginPath(); g.ellipse(x, y + r * 0.35, r * 0.95, r * 0.6 * open, 0, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#e8f0d8';
    for (let i = 0; i < 7; i++) {
      const tx = x - r * 0.8 + i * r * 0.27, top = y + r * 0.35 - r * 0.6 * open, bot = y + r * 0.35 + r * 0.6 * open;
      poly(g, [[tx - r * 0.09, top - 1], [tx + r * 0.09, top - 1], [tx, top + r * 0.22]]); g.fill();
      poly(g, [[tx - r * 0.09, bot + 1], [tx + r * 0.09, bot + 1], [tx, bot - r * 0.22]]); g.fill();
    }
    // eye
    g.fillStyle = '#d0ff40'; g.beginPath(); g.ellipse(x, y - r * 0.25, r * 0.28, r * 0.18, 0, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#050805'; g.beginPath(); g.ellipse(x + Math.sin(t) * r * 0.1, y - r * 0.25, r * 0.06, r * 0.16, 0, 0, Math.PI * 2); g.fill();
    core(g, x, y + r * 0.35, r * 0.35 * open, '#7dff5a', tell, t);
  }
  // damage cracks + smoke at low HP
  if (d.frac < 0.5) {
    g.strokeStyle = '#000a'; g.lineWidth = 2;
    g.beginPath(); g.moveTo(x - r * 0.6, y - r * 0.2); g.lineTo(x - r * 0.3, y + r * 0.1); g.lineTo(x - r * 0.45, y + r * 0.4); g.stroke();
    if (d.frac < 0.25) { g.beginPath(); g.moveTo(x + r * 0.5, y - r * 0.4); g.lineTo(x + r * 0.2, y); g.lineTo(x + r * 0.4, y + r * 0.3); g.stroke(); }
  }
  g.restore();
}
