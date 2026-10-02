// Arcade card: banner art + progress line (shell calls these; keep tiny, no renderer imports).
export function progressLine(save: unknown): string | null {
  const b = (save as { best?: number } | undefined)?.best;
  return b ? `Best score ${Math.round(b).toLocaleString()}` : null;
}

/** Scrolling starfield, the ship (rider colour) firing twin guns at a wave of invaders. 230×100 units. */
export function drawCard(g: CanvasRenderingContext2D, w: number, h: number, t: number, color: string): void {
  g.save(); g.scale(w / 230, h / 100);
  g.fillStyle = '#060818'; g.fillRect(0, 0, 230, 100);
  for (let i = 0; i < 40; i++) { const sp = 10 + (i % 3) * 14; g.fillStyle = i % 3 ? '#556' : '#ccd'; g.fillRect((i * 53) % 230, ((i * 31 + t * sp) % 100), 1, i % 3 ? 1 : 2); }
  const sx = 115 + Math.sin(t * 1.3) * 50, sy = 82;
  for (let i = 0; i < 6; i++) { const p = (t * 1.8 + i / 6) % 1; g.fillStyle = i % 2 ? '#ff2bd6' : '#00f0ff'; g.fillRect(sx + (i % 2 ? 6 : -8) - Math.sin(t * 1.3 - p) * 0, sy - 6 - p * 80, 2, 5); }
  g.fillStyle = color; g.beginPath(); g.moveTo(sx, sy - 10); g.lineTo(sx + 9, sy + 6); g.lineTo(sx, sy + 2); g.lineTo(sx - 9, sy + 6); g.closePath(); g.fill();
  g.fillStyle = '#ffb020'; g.fillRect(sx - 2, sy + 4, 4, 3 + Math.sin(t * 20) * 1.5);
  for (let i = 0; i < 6; i++) {
    const ex = 30 + i * 34 + Math.sin(t * 1.1) * 12, ey = 22 + Math.sin(t * 2 + i) * 4, open = Math.sin(t * 6 + i) > 0;
    g.fillStyle = ['#ff5a4a', '#b06cff', '#4aa3ff'][i % 3];
    g.fillRect(ex - 6, ey - 3, 12, 6); g.fillRect(ex - (open ? 9 : 7), ey + 1, 3, 4); g.fillRect(ex + (open ? 6 : 4), ey + 1, 3, 4);
    g.fillStyle = '#000'; g.fillRect(ex - 3, ey - 1, 2, 2); g.fillRect(ex + 1, ey - 1, 2, 2);
  }
  g.restore();
}
