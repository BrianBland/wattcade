// Arcade card: banner art + progress line (shell calls these; keep tiny, no renderer imports).
import type { DungeonSave } from './sim/sim';

export function progressLine(save: unknown): string | null {
  const s = save as DungeonSave | undefined;
  if (!s || !(s.runs || s.bestFloor)) return null;
  return [s.bestFloor ? `Best floor ${s.bestFloor}` : '', s.bank ? `${Math.round(s.bank).toLocaleString()} coins` : '', s.runs ? `${s.runs} runs` : ''].filter(Boolean).join(' · ');
}

/** Torch-lit corridor: the hero (rider colour) fires bolts at a bobbing slime; coins glint. 230×100 units. */
export function drawCard(g: CanvasRenderingContext2D, w: number, h: number, t: number, color: string): void {
  g.save(); g.scale(w / 230, h / 100);
  g.fillStyle = '#17121f'; g.fillRect(0, 0, 230, 100);
  for (let y = 0; y < 70; y += 10) for (let x = (y / 10) % 2 ? -10 : 0; x < 230; x += 20) { g.fillStyle = (x + y) % 40 ? '#2a2236' : '#251e30'; g.fillRect(x + 1, y + 1, 18, 8); }
  g.fillStyle = '#3a2f2a'; g.fillRect(0, 70, 230, 30);
  for (const tx of [40, 190]) {
    const f = 0.7 + 0.3 * Math.sin(t * 9 + tx);
    const glow = g.createRadialGradient(tx, 30, 1, tx, 30, 40); glow.addColorStop(0, `rgba(255,160,60,${0.35 * f})`); glow.addColorStop(1, 'rgba(255,160,60,0)');
    g.fillStyle = glow; g.fillRect(tx - 40, -10, 80, 80);
    g.fillStyle = '#6b4a2a'; g.fillRect(tx - 1.5, 30, 3, 10);
    g.fillStyle = '#ffb020'; g.beginPath(); g.ellipse(tx, 27, 3, 5 * f, 0, 0, Math.PI * 2); g.fill();
  }
  // hero
  const hx = 60, hy = 72 + Math.sin(t * 6) * 1;
  g.fillStyle = color; g.fillRect(hx - 5, hy - 16, 10, 12);
  g.fillStyle = '#f1c27d'; g.fillRect(hx - 4, hy - 23, 8, 7);
  g.fillStyle = '#5b3a29'; g.fillRect(hx - 5, hy - 4, 4, 4); g.fillRect(hx + 1, hy - 4, 4, 4);
  // bolts
  for (let i = 0; i < 3; i++) { const p = (t * 1.6 + i / 3) % 1; g.fillStyle = '#8ef2ff'; g.fillRect(hx + 8 + p * 100, hy - 13, 6, 2); }
  // slime
  const sq = 1 + 0.15 * Math.sin(t * 5);
  g.fillStyle = '#5ad65a'; g.beginPath(); g.ellipse(175, 72 - 6 * sq, 13 / sq, 8 * sq, 0, Math.PI, 0); g.fill(); g.fillRect(162 + (1 - 1 / sq) * 13, 72 - 6 * sq, 26 / sq, 6 * sq);
  g.fillStyle = '#111'; g.fillRect(170, 62, 2, 3); g.fillRect(178, 62, 2, 3);
  // coins
  for (let i = 0; i < 4; i++) { const tw = Math.sin(t * 4 + i * 1.7) > 0.6; g.fillStyle = tw ? '#fff6b0' : '#ffd23b'; g.fillRect(100 + i * 11, 84 + (i % 2) * 3, 4, 4); }
  g.restore();
}
