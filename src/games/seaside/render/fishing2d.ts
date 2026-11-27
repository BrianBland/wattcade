// Fishing on the placeholder canvas (#187): spots, rod, line, bobber, ripples, the fish, prompts and the catch card.
// The voxel rig (`fishingRig.ts`) is the real view; over the voxel world (`hudOnly`) only the markers, prompt, meter and
// card are drawn here.
import { money, saleCents } from '../sim/economy';
import type { FishId } from '../sim/catalogue';
import type { FishingView } from '../sim/fishing';
import { fishPose } from './fishingPose';
import type { Box, FishLayout } from './layout';
import { FONT_H, HOT, PAPER, PAPER_DIM, pixelBar, pixelLabel, pixelPanel, pixelText, textCells, unitFor } from './pixelHud';

const FISH_COLOR: Record<FishId, [string, string]> = {
  perch: ['#9fb8a8', '#5f7d6e'], greenling: ['#7d8f4a', '#c46a3a'], rockfish: ['#e8603c', '#f6c29a'], lingcod: ['#8a7f5a', '#4e5a3a'],
  parrotfish: ['#3fc4b0', '#f08ac0'], tang: ['#f6d22a', '#ffffff'], magmaEel: ['#2a1410', '#ff8a1a'],
};
const WATER: Record<string, [string, string]> = { lava: ['#c2451c', '#5a1408'], beach: ['#5fd0d8', '#1a7a9a'] };

const prompts = (f: FishingView): string => {
  switch (f.phase) {
    case 'spot': return `◀ ▶ pick a spot · Ⓐ cast${f.autoIn >= 0 && f.autoIn < 5 ? ` (${Math.ceil(f.autoIn)})` : ''}`;
    case 'wait': return f.twitch ? 'Twitching the lure…' : 'Reel slow… spin faster to twitch';
    case 'bite': return 'Ⓐ  STRIKE!';
    case 'pull': return 'PULL!';
    case 'escape': return 'It got away.';
    case 'done': return f.caught.length ? `${f.caught.length} in the bucket · ${money(f.caught.reduce((a, c) => a + saleCents(c), 0))}` : 'Nothing biting.';
    default: return '';
  }
};

export function drawFishing(g: CanvasRenderingContext2D, f: FishingView, L: FishLayout, stage: Box, t: number, hudOnly = false): void {
  const wb = L.water, [top, deep] = WATER[f.location] ?? ['#7cc3d3', '#1f5f78'];
  if (!hudOnly) {
    const grad = g.createLinearGradient(0, wb.y, 0, wb.y + wb.h);
    grad.addColorStop(0, top); grad.addColorStop(1, deep);
    g.fillStyle = grad; g.fillRect(wb.x, wb.y, wb.w, wb.h);
  }

  // spot markers: all of them while picking, the chosen one after
  f.spots.forEach((sp, i) => {
    const b = L.spots[i], on = i === f.spot;
    if (f.phase !== 'spot' && !on) return;
    g.globalAlpha = f.phase === 'spot' ? 1 : 0.45;
    const label = on && f.phase === 'spot' ? `▶ ${sp.name}` : sp.name, u = fit(label, b, 0.34);
    pixelLabel(g, label, pixelPanel(g, b, Math.max(2, u), on ? PAPER : PAPER_DIM), u, PAPER.ink);
    g.globalAlpha = 1;
  });

  if (!hudOnly) drawRod(g, f, L, stage, t);
  drawHud(g, f, L);
}

function drawRod(g: CanvasRenderingContext2D, f: FishingView, L: FishLayout, stage: Box, t: number): void {
  const wb = L.water;
  // rod, line, bobber, fish
  const p = fishPose(f, t), sx = (u: number) => stage.x + stage.w * u, sy = (v: number) => stage.y + stage.h * v;
  const butt = { x: sx(0.86), y: sy(1) }, tip = { x: sx(0.72 + 0.05 * p.rodSwing), y: sy(0.18 + 0.12 * p.bend) };
  g.strokeStyle = '#2b2118'; g.lineWidth = 5; g.lineCap = 'round';
  g.beginPath(); g.moveTo(butt.x, butt.y);
  g.quadraticCurveTo(sx(0.86 - 0.02 * p.bend), sy(0.45 + 0.1 * p.bend), tip.x, tip.y); g.stroke();
  const water = { x: sx(0.5 + 0.42 * p.end.x), y: wb.y + wb.h * (0.62 - 0.45 * p.end.far) };
  const k = p.end.fly, end = { x: tip.x + (water.x - tip.x) * k, y: tip.y + stage.h * 0.08 + (water.y - tip.y - stage.h * 0.08) * k - stage.h * p.end.lift };
  g.strokeStyle = 'rgba(255,255,255,.85)'; g.lineWidth = 1.5;
  g.beginPath(); g.moveTo(tip.x, tip.y);
  g.quadraticCurveTo((tip.x + end.x) / 2, Math.max(tip.y, end.y) + stage.h * 0.15 * p.sag, end.x, end.y); g.stroke();
  for (const r of p.rings) {
    g.strokeStyle = `rgba(255,255,255,${(1 - r.age) * 0.8})`; g.lineWidth = 2;
    g.beginPath(); g.ellipse(water.x, water.y, 6 + 40 * r.age * r.size, (6 + 40 * r.age * r.size) * 0.3, 0, 0, Math.PI * 2); g.stroke();
  }
  if (p.bobber) {
    g.fillStyle = '#e8322a'; g.beginPath(); g.arc(end.x, end.y - 4, 7, Math.PI, 0); g.fill();
    g.fillStyle = '#fff'; g.beginPath(); g.arc(end.x, end.y - 4, 7, 0, Math.PI); g.fill();
  }
  if (p.fish && f.fish) {
    const [c1, c2] = FISH_COLOR[f.fish.id], len = Math.max(28, stage.w * 0.07 * (0.6 + f.fish.lenM));
    const h = p.fish.haul, hx = tip.x - stage.w * 0.06, hy = tip.y + stage.h * 0.25;
    const fx = water.x + (hx - water.x) * h, fy = water.y - stage.h * p.fish.leap * (1 - h) + (hy - water.y) * h;
    g.save(); g.translate(fx, fy); g.rotate(p.fish.roll);
    g.fillStyle = c1; g.beginPath(); g.ellipse(0, 0, len / 2, len * (f.fish.id === 'magmaEel' ? 0.09 : 0.2), 0, 0, Math.PI * 2); g.fill();
    g.beginPath(); g.moveTo(-len * 0.45, 0); g.lineTo(-len * 0.7, -len * 0.16); g.lineTo(-len * 0.7, len * 0.16); g.fill();
    g.fillStyle = c2; g.fillRect(-len * 0.2, -len * 0.04, len * 0.4, len * 0.05);
    g.fillStyle = '#141414'; g.beginPath(); g.arc(len * 0.32, -len * 0.04, Math.max(2, len * 0.03), 0, Math.PI * 2); g.fill();
    g.restore();
  }

}

function drawHud(g: CanvasRenderingContext2D, f: FishingView, L: FishLayout): void {
  // prompt (sized to its words, centred where the layout puts it) + the fight meter
  const text = prompts(f);
  if (text) {
    const b = L.prompt, hot = f.phase === 'bite' || f.phase === 'pull', u = fit(text, b, 0.4), w = Math.min(b.w, (textCells(text) + 10) * u);
    pixelLabel(g, text, pixelPanel(g, { x: b.x + (b.w - w) / 2, y: b.y, w, h: b.h }, Math.max(2, u), hot ? HOT : PAPER), u, hot ? '#fff6ec' : PAPER.ink);
  }
  if (f.phase === 'pull') {
    const m = L.meter, u = Math.max(2, Math.floor(m.h / 4));
    const bar = pixelBar(g, { x: m.x, y: m.y - u, w: m.w, h: m.h + 2 * u }, u, 1 - f.stamina, '#7ad36a');
    const x = Math.round((bar.x + bar.w * f.tension) / u) * u;
    g.fillStyle = PAPER.ink; g.fillRect(x - 2 * u, bar.y - 2 * u, 4 * u, bar.h + 4 * u);
    g.fillStyle = `rgb(255,${Math.round(220 - 180 * f.tension)},60)`; g.fillRect(x - u, bar.y - u, 2 * u, bar.h + 2 * u);
  }

  // catch card
  if (f.phase === 'card' && f.fish) {
    const c = L.card, k = Math.min(1, f.phaseT / 0.25), fish = f.fish;
    g.globalAlpha = k;
    const b = pixelPanel(g, c, Math.max(2, Math.floor(c.h / 60)), PAPER), mid = b.x + b.w / 2, ink = PAPER.ink;
    const line = (t: string, at: number, size: number, color = ink) => {
      const u = Math.max(1, Math.min(Math.floor((b.h * size) / FONT_H), Math.floor((b.w - 24) / Math.max(1, textCells(t)))));
      pixelText(g, t, mid, b.y + b.h * at - (FONT_H * u) / 2, u, color, 'center');
    };
    line(fish.name, 0.24, 0.15);
    line(`${fish.kg} kg · ${Math.round(fish.lenM * 100)} cm`, 0.48, 0.1);
    line(money(saleCents(fish)), 0.7, 0.15, '#b43c2b');
    if (fish.credit < 1) line('late strike: half price', 0.88, 0.07);
    g.globalAlpha = 1;
  }
}

/** The font pixel for a label in a box: about `k` of its height, shrunk to fit its width. */
function fit(text: string, b: Box, k: number): number {
  return Math.max(1, Math.min(unitFor(b.h, k), Math.floor((b.w - 16) / (textCells(text) + 6))));
}
