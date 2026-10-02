// Arcade card: banner art + progress line (shell calls these; keep tiny, no renderer imports).
export function progressLine(save: unknown): string | null {
  const b = (save as { bestWave?: number } | undefined)?.bestWave;
  return b ? `Best: wave ${b}` : null;
}

const COLS = ['#ff4d4d', '#3b82ff', '#2de26a'];
/** A lane of coloured enemies marching on a turret that swings to shoot them. 230×100 units. */
export function drawCard(g: CanvasRenderingContext2D, w: number, h: number, t: number, color: string): void {
  g.save(); g.scale(w / 230, h / 100);
  g.fillStyle = '#0d1424'; g.fillRect(0, 0, 230, 100);
  g.strokeStyle = '#1c2a44'; g.lineWidth = 1;
  for (let x = 0; x < 230; x += 14) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, 100); g.stroke(); }
  for (let y = 0; y < 100; y += 14) { g.beginPath(); g.moveTo(0, y); g.lineTo(230, y); g.stroke(); }
  g.fillStyle = '#26324c'; g.fillRect(0, 58, 230, 16);
  const enemies = [0, 1, 2, 3, 4].map((i) => ({ x: ((t * 22 + i * 46) % 260) - 20, c: COLS[i % 3] }));
  for (const e of enemies) { g.fillStyle = e.c; g.beginPath(); g.arc(e.x, 66, 5, 0, Math.PI * 2); g.fill(); g.fillStyle = '#fff'; g.fillRect(e.x - 1, 64, 2, 2); }
  // turret aims at the closest enemy to x=150 and fires
  const target = enemies.reduce((a, b) => (Math.abs(b.x - 150) < Math.abs(a.x - 150) ? b : a));
  const tx = 150, ty = 32, ang = Math.atan2(66 - ty, target.x - tx);
  g.fillStyle = '#3a4a6a'; g.fillRect(tx - 10, ty - 6, 20, 16);
  g.save(); g.translate(tx, ty); g.rotate(ang); g.fillStyle = color; g.fillRect(0, -2.5, 16, 5); g.restore();
  g.fillStyle = color; g.beginPath(); g.arc(tx, ty, 6, 0, Math.PI * 2); g.fill();
  if (Math.sin(t * 8) > 0.3) { g.strokeStyle = target.c; g.lineWidth = 2; g.beginPath(); g.moveTo(tx + Math.cos(ang) * 16, ty + Math.sin(ang) * 16); g.lineTo(target.x, 66); g.stroke(); }
  g.restore();
}
