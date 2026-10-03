// Arcade card: banner art + progress line (shell calls these; keep tiny, no renderer imports).
export interface WatershedSave { rides?: number; bestCarved?: number; bestDelta?: number }

export function progressLine(save: unknown): string | null {
  const s = save as WatershedSave | undefined;
  if (!s?.rides) return null;
  return `${s.rides} ride${s.rides === 1 ? '' : 's'} · best gorge ${s.bestCarved ?? 0} · best delta ${s.bestDelta ?? 0}`;
}

/** A valley falling to the sea with fat exaggerated drops bouncing down a river. 230×100 units. */
export function drawCard(g: CanvasRenderingContext2D, w: number, h: number, t: number, color: string): void {
  g.save(); g.scale(w / 230, h / 100);
  const sky = g.createLinearGradient(0, 0, 0, 60); sky.addColorStop(0, '#7cc4ef'); sky.addColorStop(1, '#d9f0fb'); g.fillStyle = sky; g.fillRect(0, 0, 230, 100);
  g.fillStyle = '#e9f3f7'; g.beginPath(); g.moveTo(0, 40); g.lineTo(30, 12); g.lineTo(55, 34); g.lineTo(80, 18); g.lineTo(120, 60); g.lineTo(0, 70); g.fill();
  g.fillStyle = '#5c8a4a'; g.beginPath(); g.moveTo(0, 46); g.quadraticCurveTo(70, 40, 160, 78); g.lineTo(0, 100); g.fill();
  g.fillStyle = '#7aa25c'; g.beginPath(); g.moveTo(20, 100); g.quadraticCurveTo(110, 50, 230, 74); g.lineTo(230, 100); g.fill();
  g.fillStyle = '#2f7fb8'; g.fillRect(150, 78, 80, 22);
  g.fillStyle = '#d8c48a'; g.beginPath(); g.ellipse(160, 80, 20, 4, 0, 0, Math.PI * 2); g.fill();
  // river line + drops
  const path = (u: number): [number, number] => [20 + u * 140, 40 + u * 38 + Math.sin(u * 9) * 5];
  g.strokeStyle = '#3d97d3'; g.lineWidth = 4; g.beginPath();
  for (let u = 0; u <= 1.001; u += 0.05) { const [x, y] = path(u); u === 0 ? g.moveTo(x, y) : g.lineTo(x, y); }
  g.stroke();
  for (let i = 0; i < 9; i++) {
    const u = ((t * 0.12 + i / 9) % 1), [x, y] = path(u), r = 2.2 + (i % 3);
    g.fillStyle = '#9fd8ff'; g.beginPath(); g.ellipse(x, y - r * 0.6, r * 1.3, r, 0.5, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#fff'; g.fillRect(x - r * 0.5, y - r * 1.1, 1, 1);
  }
  g.fillStyle = color; g.beginPath(); g.arc(path(0)[0], path(0)[1] - 2, 4, 0, Math.PI * 2); g.fill();
  g.restore();
}
