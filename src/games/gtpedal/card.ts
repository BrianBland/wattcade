// Arcade card: banner art + progress line (no renderer imports).
interface GtpSave { rides?: number; stealsTotal?: number; bestAirS?: number }

export function progressLine(save: unknown): string | null {
  const s = save as GtpSave | undefined;
  if (!s) return null;
  const parts = [s.stealsTotal ? `${s.stealsTotal} bikes stolen` : '', s.bestAirS ? `best air ${s.bestAirS.toFixed(1)} s` : ''].filter(Boolean);
  return parts.length ? parts.join(' · ') : s.rides ? `${s.rides} rides` : null;
}

/** Green berm, a rider in the rider's colour launching off it, a cop on a Segway giving chase. 230×100 units. */
export function drawCard(g: CanvasRenderingContext2D, w: number, h: number, t: number, color: string): void {
  g.save(); g.scale(w / 230, h / 100);
  g.fillStyle = '#9fd8ff'; g.fillRect(0, 0, 230, 100);
  g.fillStyle = '#e8b86b'; g.fillRect(150, 20, 40, 60); g.fillStyle = '#c7a3d9'; g.fillRect(190, 35, 40, 45);
  g.fillStyle = '#7fd36a'; g.fillRect(0, 80, 230, 20);
  g.fillStyle = '#5cbf4a'; g.beginPath(); g.moveTo(40, 80); g.quadraticCurveTo(85, 80, 95, 58); g.lineTo(95, 80); g.closePath(); g.fill();
  const p = (t * 0.5) % 1, x = 95 + p * 110, y = 58 - Math.sin(p * Math.PI) * 40;
  g.save(); g.translate(x, y); g.rotate(p * Math.PI * 2);
  g.strokeStyle = '#222'; g.lineWidth = 1.5; g.beginPath(); g.arc(-6, 6, 4, 0, 7); g.arc(6, 6, 4, 0, 7); g.stroke();
  g.fillStyle = color; g.fillRect(-3, -8, 6, 10); g.restore();
  const cx = 20 + ((t * 18) % 60);
  g.fillStyle = '#1d3fbf'; g.fillRect(cx, 66, 5, 10); g.fillStyle = '#333'; g.fillRect(cx - 2, 76, 9, 3);
  g.restore();
}
