// Arcade card: banner art + progress line (shell calls these; keep tiny, no renderer imports).
interface LighthouseSaveView { buildings?: Array<string | null>; shipsDockedTotal?: number; stormsWeatheredTotal?: number; lens?: number }

export function progressLine(save: unknown): string | null {
  const s = save as LighthouseSaveView | undefined;
  if (!s) return null;
  const built = (s.buildings ?? []).filter(Boolean).length;
  const parts = [built ? `${built} buildings` : '', s.shipsDockedTotal ? `${s.shipsDockedTotal} ships home` : '', s.stormsWeatheredTotal ? `${s.stormsWeatheredTotal} storms` : ''].filter(Boolean);
  return parts.length ? parts.join(' · ') : null;
}

/** Dusk sea, island and lighthouse with a sweeping beam; a little ship heads home. 230×100 units. */
export function drawCard(g: CanvasRenderingContext2D, w: number, h: number, t: number, color: string): void {
  g.save(); g.scale(w / 230, h / 100);
  const sky = g.createLinearGradient(0, 0, 0, 62); sky.addColorStop(0, '#1a1840'); sky.addColorStop(1, '#ff8a5a'); g.fillStyle = sky; g.fillRect(0, 0, 230, 62);
  for (let i = 0; i < 14; i++) { g.fillStyle = `rgba(255,255,255,${0.4 + 0.4 * Math.sin(t * 2 + i)})`; g.fillRect((i * 37) % 230, (i * 13) % 30, 1, 1); }
  g.fillStyle = '#1f4a7a'; g.fillRect(0, 62, 230, 38);
  g.fillStyle = '#7fb6e0'; for (let i = 0; i < 18; i++) g.fillRect(((i * 29 + t * 6) % 240) - 10, 66 + (i % 5) * 6, 6, 1);
  g.fillStyle = '#3f6a3a'; g.beginPath(); g.ellipse(70, 64, 46, 12, 0, Math.PI, 0); g.fill();
  // lighthouse in the rider's colour stripes
  g.fillStyle = '#f2f2f2'; g.beginPath(); g.moveTo(62, 58); g.lineTo(66, 22); g.lineTo(74, 22); g.lineTo(78, 58); g.closePath(); g.fill();
  g.fillStyle = color; g.fillRect(64.5, 34, 11, 5); g.fillRect(63.5, 46, 13, 5);
  g.fillStyle = '#333'; g.fillRect(64, 16, 12, 6); g.fillStyle = '#ffe680'; g.fillRect(66, 17, 8, 4);
  const a = Math.sin(t * 0.9) * 0.9;
  g.fillStyle = 'rgba(255,240,170,0.28)'; g.beginPath(); g.moveTo(70, 19); g.lineTo(70 + Math.cos(a) * 200, 19 + Math.sin(a) * 40 - 14); g.lineTo(70 + Math.cos(a) * 200, 19 + Math.sin(a) * 40 + 14); g.closePath(); g.fill();
  // ship
  const sx = 230 - ((t * 8) % 150);
  g.fillStyle = '#5a3b22'; g.fillRect(sx - 9, 70, 18, 4); g.fillStyle = '#fff'; g.beginPath(); g.moveTo(sx, 56); g.lineTo(sx, 70); g.lineTo(sx + 8, 69); g.closePath(); g.fill();
  g.restore();
}
