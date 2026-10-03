// Arcade card: banner art + progress line (shell calls these; keep tiny, no renderer imports).
export function progressLine(save: unknown): string | null {
  const sv = save as { bestWave?: number; bank?: number } | undefined;
  if (!sv?.bestWave) return null;
  return `Best: wave ${sv.bestWave}${sv.bank ? ` · ${sv.bank} parts` : ''}`;
}

const COLS = ['#4aa8ff', '#ff5a3c', '#b46cff'];
type P = [number, number];
const LANES: Array<[P, P, P, P]> = [
  [[-10, 20], [70, 10], [60, 80], [115, 88]],
  [[115, -10], [100, 30], [130, 50], [115, 88]],
  [[240, 20], [160, 10], [170, 80], [115, 88]],
];
const at = (c: [P, P, P, P], t: number): P => {
  const u = 1 - t, a = u * u * u, b = 3 * u * u * t, d = 3 * u * t * t, e = t * t * t;
  return [a * c[0][0] + b * c[1][0] + d * c[2][0] + e * c[3][0], a * c[0][1] + b * c[1][1] + d * c[2][1] + e * c[3][1]];
};
/** Three lanes of colour-coded enemies converge on a spinning dynamo whose turret picks them off. 230×100 units. */
export function drawCard(g: CanvasRenderingContext2D, w: number, h: number, t: number, color: string): void {
  g.save(); g.scale(w / 230, h / 100);
  g.fillStyle = '#0d131e'; g.fillRect(0, 0, 230, 100);
  g.strokeStyle = 'rgba(120,150,200,0.07)'; g.lineWidth = 1;
  for (let x = 0; x < 230; x += 12) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, 100); g.stroke(); }
  g.lineCap = 'round';
  for (const c of LANES) {
    g.beginPath(); g.moveTo(...c[0]); g.bezierCurveTo(...c[1], ...c[2], ...c[3]);
    g.strokeStyle = '#26324a'; g.lineWidth = 9; g.stroke(); g.strokeStyle = '#18202e'; g.lineWidth = 7; g.stroke();
  }
  const enemies: Array<{ p: P; c: string }> = [];
  LANES.forEach((c, l) => { for (let i = 0; i < 3; i++) { const k = ((t * 0.09 + i / 3 + l * 0.21) % 1) * 0.86; enemies.push({ p: at(c, k), c: COLS[(i + l) % 3] }); } });
  for (const e of enemies) { g.fillStyle = e.c; g.beginPath(); g.arc(e.p[0], e.p[1], 3.4, 0, Math.PI * 2); g.fill(); }
  const bx = 115, by = 88;
  const target = enemies.reduce((a, b) => (Math.hypot(b.p[0] - bx, b.p[1] - by) < Math.hypot(a.p[0] - bx, a.p[1] - by) ? b : a));
  const ang = Math.atan2(target.p[1] - by, target.p[0] - bx);
  g.fillStyle = '#1c2230'; g.beginPath(); g.arc(bx, by, 11, 0, Math.PI * 2); g.fill();
  for (let i = 0; i < 8; i++) { const a = t * 3 + (i / 8) * Math.PI * 2; g.fillStyle = i % 2 ? '#b07a3a' : '#d49a52'; g.fillRect(bx + Math.cos(a) * 7 - 1.5, by + Math.sin(a) * 7 - 1.5, 3, 3); }
  g.save(); g.translate(bx, by); g.rotate(ang); g.fillStyle = '#9aa6bb'; g.fillRect(0, -1.6, 13, 3.2); g.restore();
  g.fillStyle = color; g.beginPath(); g.arc(bx, by, 4, 0, Math.PI * 2); g.fill();
  if (Math.sin(t * 9) > 0.2) { g.strokeStyle = target.c; g.lineWidth = 1.6; g.beginPath(); g.moveTo(bx + Math.cos(ang) * 13, by + Math.sin(ang) * 13); g.lineTo(target.p[0], target.p[1]); g.stroke(); }
  g.restore();
}
