// Arcade card + picker preview for Wattsurf (pure Canvas 2D; no renderer imports).
import type { MediaTimeline, Profile } from '../../contracts';
import { buildTrack, rateTrack, type Difficulty } from './sim/track';
import type { WattsurfSave } from './sim/sim';

export function progressLine(save: unknown): string | null {
  const s = save as WattsurfSave | undefined;
  if (!s?.plays) return null;
  return `${s.plays} ride${s.plays === 1 ? '' : 's'}${s.bestScore ? ` · best ${s.bestScore.toLocaleString()}` : ''}`;
}

/** A neon track ribbon diving toward a horizon, blocks streaming at the craft. 230×100 units. */
export function drawCard(g: CanvasRenderingContext2D, w: number, h: number, t: number, color: string): void {
  g.save(); g.scale(w / 230, h / 100);
  const hue = (t * 25) % 360;
  g.fillStyle = '#05040c'; g.fillRect(0, 0, 230, 100);
  const sky = g.createLinearGradient(0, 0, 0, 45); sky.addColorStop(0, `hsl(${hue},80%,8%)`); sky.addColorStop(1, `hsl(${hue},90%,30%)`);
  g.fillStyle = sky; g.fillRect(0, 0, 230, 45);
  for (let i = 0; i < 24; i++) { const bh = 4 + 14 * Math.abs(Math.sin(i * 1.7 + t * 3)); g.fillStyle = `hsla(${(hue + 180) % 360},90%,60%,.5)`; g.fillRect(i * 10, 45 - bh, 7, bh); }
  // track in perspective
  const vx = 115, vy = 45;
  g.fillStyle = '#0d0b1c'; g.beginPath(); g.moveTo(vx - 4, vy); g.lineTo(vx + 4, vy); g.lineTo(200, 100); g.lineTo(30, 100); g.fill();
  g.strokeStyle = `hsl(${hue},100%,65%)`; g.lineWidth = 2;
  for (const s of [-1, 1]) { g.beginPath(); g.moveTo(vx + s * 4, vy); g.lineTo(115 + s * 85, 100); g.stroke(); }
  g.lineWidth = 0.6; g.strokeStyle = `hsla(${hue},100%,70%,.5)`;
  for (const s of [-1 / 3, 1 / 3]) { g.beginPath(); g.moveTo(vx + s * 8, vy); g.lineTo(115 + s * 170, 100); g.stroke(); }
  const cols = ['#9b5cff', '#3d8bff', '#3dff8a', '#ffd23d', '#ff3d5a'];
  for (let i = 0; i < 7; i++) {
    const u = ((t * 0.5 + i / 7) % 1) ** 2, lane = [-1, 0, 1, 0, -1, 1, 0][i];
    const y = vy + u * 55, x = 115 + lane * u * 57, s = 1 + u * 9;
    g.fillStyle = cols[i % 5]; g.shadowColor = cols[i % 5]; g.shadowBlur = 6; g.fillRect(x - s / 2, y - s, s, s);
  }
  g.shadowBlur = 8; g.shadowColor = color; g.fillStyle = color;
  g.beginPath(); g.moveTo(115, 82); g.lineTo(127, 96); g.lineTo(103, 96); g.fill();
  g.restore();
}

/** Picker preview: the track's side profile (climbs/dives), block density, sprint markers, and an effort estimate. */
export function mediaPreview(g: CanvasRenderingContext2D, w: number, h: number, tl: MediaTimeline, profile: Readonly<Profile>): void {
  const save = profile.gameData.wattsurf as WattsurfSave | undefined;
  const difficulty: Difficulty = save?.lastDifficulty ?? 'pro';
  const tr = buildTrack(tl, { difficulty, mode: 'mono', seed: 1 });
  const n = tr.height.length; let lo = Infinity, hi = -Infinity;
  for (let i = 0; i < n; i++) { lo = Math.min(lo, tr.height[i]); hi = Math.max(hi, tr.height[i]); }
  const top = 28, bot = h - 6, X = (p: number) => (p / tr.durationS) * w, Y = (v: number) => bot - ((v - lo) / (hi - lo || 1)) * (bot - top);
  for (const z of tr.zones) { g.fillStyle = `hsla(${z.hue},80%,50%,${z.kind === 'drop' ? 0.35 : 0.14})`; g.fillRect(X(z.t0), top, X(z.t1) - X(z.t0), bot - top); }
  // block density as a strip along the bottom
  const bins = Math.max(1, Math.floor(w / 3)), dens = new Array(bins).fill(0);
  for (const b of tr.blocks) dens[Math.min(bins - 1, Math.floor((b.t / tr.durationS) * bins))]++;
  const dmax = Math.max(1, ...dens);
  dens.forEach((c, i) => { g.fillStyle = `rgba(0,240,255,${0.15 + 0.85 * (c / dmax)})`; g.fillRect(i * 3, bot, 2, -4 - 10 * (c / dmax)); });
  g.strokeStyle = '#fff'; g.lineWidth = 2; g.beginPath();
  for (let i = 0; i < n; i += 5) { const x = X(i / tr.hz), y = Y(tr.height[i]); if (i) g.lineTo(x, y); else g.moveTo(x, y); }
  g.stroke();
  g.fillStyle = '#ff2bd6'; g.font = 'bold 11px system-ui'; g.textAlign = 'center';
  for (const z of tr.zones) if (z.kind === 'drop') g.fillText('⚡', X((z.t0 + z.t1) / 2), top + 11);
  const r = rateTrack(tr);
  g.textAlign = 'left'; g.fillStyle = '#e9e6ff'; g.font = 'bold 11px system-ui';
  g.fillText(`${difficulty.toUpperCase()} · ${r.blocksPerMin} blocks/min · ~${r.tss} TSS · ${r.minutesZ4} min Z4+ · ${'★'.repeat(r.stars)}`, 4, 13);
}
