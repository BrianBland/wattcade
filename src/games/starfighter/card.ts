// Arcade card: banner art + progress line (shell calls these; keep tiny, no renderer imports).
export function progressLine(save: unknown): string | null {
  const s = save as { v?: number; best?: number; legacyBest?: number; onTargetS?: number; bank?: number; bestSector?: number } | undefined;
  if (!s) return null;
  if (s.v === 3) return `${Math.floor((s.onTargetS ?? 0) / 60)} groove minutes · best ${Math.round(s.best ?? 0).toLocaleString()}`;
  return s.best ? `legacy best ${Math.round(s.best).toLocaleString()}` : null;
}

/** Nebula + starfield, the ship (rider colour) and two wingmen firing at a hive boss and its drones. 230x100 units. */
export function drawCard(g: CanvasRenderingContext2D, w: number, h: number, t: number, color: string): void {
  g.save(); g.scale(w / 230, h / 100);
  const sky = g.createLinearGradient(0, 0, 0, 100); sky.addColorStop(0, '#05081a'); sky.addColorStop(1, '#160a2a');
  g.fillStyle = sky; g.fillRect(0, 0, 230, 100);
  for (const [x, y, r, c] of [[50, 30, 50, '#2b5bb033'], [190, 60, 60, '#8a2bb030'], [120, 90, 40, '#b0482b22']] as const) {
    const gr = g.createRadialGradient(x, y, 0, x, y, r); gr.addColorStop(0, c); gr.addColorStop(1, '#00000000'); g.fillStyle = gr; g.fillRect(x - r, y - r, r * 2, r * 2);
  }
  for (let i = 0; i < 46; i++) { const sp = 10 + (i % 3) * 16; g.fillStyle = i % 3 ? '#667' : '#dde'; g.fillRect((i * 53) % 230, (i * 31 + t * sp) % 100, 1, i % 3 ? 1 : 2.5); }
  // boss
  const bx = 115 + Math.sin(t * 0.7) * 30, by = 20;
  g.fillStyle = '#8a3a1a'; g.beginPath();
  for (let i = 0; i < 6; i++) { const a = i * Math.PI / 3 + Math.PI / 6; g.lineTo(bx + Math.cos(a) * 15, by + Math.sin(a) * 13); }
  g.closePath(); g.fill();
  for (let i = -1; i <= 1; i++) { g.fillStyle = Math.sin(t * 3 + i * 2) > 0 ? '#ffb347' : '#c4601e'; g.fillRect(bx + i * 7 - 2.5, by - 3, 5, 5); }
  const pulse = 3 + Math.sin(t * 6); g.fillStyle = '#ffe0a0'; g.beginPath(); g.arc(bx, by + 10, pulse, 0, 7); g.fill();
  // drones
  for (let i = 0; i < 4; i++) {
    const ex = 35 + i * 52 + Math.sin(t * 1.3 + i) * 8, ey = 44 + Math.sin(t * 2 + i) * 4;
    g.fillStyle = ['#ff5a4a', '#b06cff', '#4aa3ff', '#ffd84a'][i]; g.fillRect(ex - 5, ey - 3, 10, 5); g.fillRect(ex - 6, ey + 1, 2, 3); g.fillRect(ex + 4, ey + 1, 2, 3);
    g.fillStyle = '#fff3a0'; g.fillRect(ex - 2, ey - 1, 1.5, 1.5); g.fillRect(ex + 1, ey - 1, 1.5, 1.5);
  }
  // shots
  const sx = 115 + Math.sin(t * 1.1) * 45, sy = 84;
  for (let i = 0; i < 8; i++) {
    const p = (t * 2 + i / 8) % 1, side = i % 2 ? 1 : -1;
    g.fillStyle = side < 0 ? '#00f0ff' : '#ff2bd6'; g.fillRect(sx + side * 6 + side * p * 10, sy - 8 - p * 60, 1.6, 5);
  }
  // overdrive beam pulse every few seconds
  if (Math.sin(t * 0.9) > 0.75) { g.fillStyle = 'rgba(255,255,255,0.35)'; g.fillRect(sx - 4, 0, 8, sy - 6); }
  // ship + wingmen
  const ship = (x: number, y: number, k: number, c: string) => {
    g.fillStyle = c; g.beginPath(); g.moveTo(x, y - 9 * k); g.lineTo(x + 8 * k, y + 5 * k); g.lineTo(x, y + 2 * k); g.lineTo(x - 8 * k, y + 5 * k); g.closePath(); g.fill();
    g.fillStyle = '#e8fbff'; g.fillRect(x - 1 * k, y - 5 * k, 2 * k, 4 * k);
    g.fillStyle = '#ffb020'; g.fillRect(x - 1.5 * k, y + 3 * k, 3 * k, (3 + Math.sin(t * 20) * 1.5) * k);
  };
  ship(sx - 18, sy + 5, 0.55, '#ff5af0'); ship(sx + 18, sy + 5, 0.55, '#ff5af0'); ship(sx, sy, 1, color);
  // power capsule
  const cx = 60 + Math.sin(t * 0.6) * 10, cy = 66 + Math.sin(t * 3) * 2;
  g.fillStyle = '#ffd84a'; g.beginPath(); g.ellipse(cx, cy, 5, 3.2, 0, 0, 7); g.fill();
  g.fillStyle = '#0d0a18'; g.font = '900 5px sans-serif'; g.textAlign = 'center'; g.fillText('P', cx, cy + 1.8);
  g.restore();
}
