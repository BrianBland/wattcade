// Arcade card: banner art + progress line (shell calls these; keep tiny, no renderer imports).
import { fmtJ } from './sim/econ';
import type { HamsterSave } from './sim/sim';

export function progressLine(save: unknown): string | null {
  const s = save as Partial<HamsterSave> | undefined;
  if (!s || !s.life) return null;
  return [`${fmtJ(s.life)} lifetime`, s.rebirths ? `${s.rebirths} rebirths` : ''].filter(Boolean).join(' · ');
}

/** A hamster sprinting in a glowing wheel, sparks of energy flying off. 230×100 units. */
export function drawCard(g: CanvasRenderingContext2D, w: number, h: number, t: number, color: string): void {
  g.save(); g.scale(w / 230, h / 100);
  const bg = g.createLinearGradient(0, 0, 230, 100); bg.addColorStop(0, '#2a1440'); bg.addColorStop(1, '#14284a'); g.fillStyle = bg; g.fillRect(0, 0, 230, 100);
  const cx = 115, cy = 50, r = 36, spin = t * 4;
  g.strokeStyle = color; g.lineWidth = 4; g.beginPath(); g.arc(cx, cy, r, 0, Math.PI * 2); g.stroke();
  g.strokeStyle = '#ffffff40'; g.lineWidth = 1.5;
  for (let i = 0; i < 10; i++) { const a = spin + (i * Math.PI) / 5; g.beginPath(); g.moveTo(cx, cy); g.lineTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r); g.stroke(); }
  g.fillStyle = '#888'; g.fillRect(cx - 3, cy, 6, 46);
  // hamster, legs blur
  const hx = cx, hy = cy + r - 12, leg = Math.sin(t * 30) * 2;
  g.fillStyle = '#e8b06a'; g.beginPath(); g.ellipse(hx, hy, 11, 7, 0, 0, Math.PI * 2); g.fill();
  g.fillStyle = '#fff3e0'; g.beginPath(); g.ellipse(hx + 6, hy + 2, 5, 4, 0, 0, Math.PI * 2); g.fill();
  g.fillStyle = '#e8b06a'; g.beginPath(); g.arc(hx + 9, hy - 4, 5, 0, Math.PI * 2); g.fill();
  g.fillStyle = '#111'; g.fillRect(hx + 11, hy - 6, 2, 2); g.fillStyle = '#ff9aa8'; g.fillRect(hx + 7, hy - 10, 3, 3);
  g.fillStyle = '#c88a4a'; g.fillRect(hx - 6 + leg, hy + 5, 3, 3); g.fillRect(hx + 3 - leg, hy + 5, 3, 3);
  // energy sparks
  for (let i = 0; i < 8; i++) {
    const p = (t * 0.8 + i / 8) % 1, a = (i * 2.4) % (Math.PI * 2);
    g.globalAlpha = 1 - p; g.fillStyle = i % 2 ? '#ffe066' : '#b6ff3b';
    g.font = '700 9px system-ui'; g.fillText(i % 3 ? '⚡' : '+J', cx + Math.cos(a) * (r + 6 + p * 40), cy + Math.sin(a) * (r + 6 + p * 30));
  }
  g.globalAlpha = 1;
  g.restore();
}
