// Perks in the renderer: the 1-of-3 picker after a boss, the HUD badges, and the hero/world visuals of held perks.
// Art comes from the atlas (perk.<id> relics, hero.<stance>.<kit>.<f> race kits, ov.<perk>.<f> overlays, drone);
// the runtime only adds pixel particles (Tailwind streaks, Chain Lube drips, Sealant bubbles) and light.
import type { PerkView } from '../sim/types';
import type { Rect } from './layout';
import { charFrame } from './art32';
import { pixelPanel, pixelMeter, pixelGem, mixHex } from './chrome';
import { fillText, fillTextShadow, displayText, displayWidth, pixelFont, textWidth } from './font';

/** Perks whose look is a kit overlay on the hero frame (the jerseys recolour the frame instead). */
export const OVERLAY_PERKS = ['discs', 'musette', 'aero', 'headlamp'] as const;
/** Overlay frames drawn behind the body on that facing (the rest go over it). */
export const OVERLAY_UNDER = new Set(['discs.d', 'discs.r', 'musette.r']);
export interface HeroPerkLook { kit: string | null; ovs: string[]; /** preview facing (aim angle) */ angle?: number; /** preview outfit */ stance?: string }
/** the facing that shows a perk best on the card preview */
const PREVIEW_ANGLE: Record<string, number> = { discs: -Math.PI / 2, aero: 0, musette: Math.PI / 2, headlamp: 0.3 };
/** stance lines show only while their stance is active (the kit goes on with the stance) */
export const STANCE_OF: Record<string, string> = { discs: 'vanguard', aero: 'ranger', tailwind: 'skirmisher', headlamp: 'arcanist' };
export function heroPerkLook(pv: PerkView | undefined, stance?: string): HeroPerkLook {
  if (!pv) return { kit: null, ovs: [] };
  const held = new Set(pv.ranks.map((r) => r.id as string).filter((id) => !STANCE_OF[id] || !stance || STANCE_OF[id] === stance));
  return { kit: pv.kit, ovs: OVERLAY_PERKS.filter((k) => held.has(k)) };
}

export interface PerkPickLayout { titleY: number; subY: number; cards: Rect[]; hintY: number; stacked: boolean }
/**
 * Picker layout above the HUD inset: title, three cards side by side (or stacked on narrow screens), and a hint/timer row.
 * Everything stays in [0, H - insetBottom].
 */
export function perkPickLayout(W: number, H: number, insetBottom: number, u: number, n = 3): PerkPickLayout {
  const pad = 12 * u, gap = 10 * u, base = H - insetBottom, titleY = Math.min(16 * u, base * 0.04), subY = titleY + 42 * u;
  const top = subY + 18 * u, hintH = 34 * u, bottom = base - hintH;
  const stacked = W < (3 * 170 + 4 * 12) * u;
  const avail = Math.max(0, bottom - top);
  const cards: Rect[] = [];
  if (!stacked) {
    const cw = Math.min(240 * u, (W - 2 * pad - (n - 1) * gap) / n), ch = Math.min(236 * u, avail);
    const x0 = W / 2 - (n * cw + (n - 1) * gap) / 2, y0 = top + Math.max(0, (avail - ch) / 2);
    for (let i = 0; i < n; i++) cards.push({ x: x0 + i * (cw + gap), y: y0, w: cw, h: ch });
  } else {
    const cw = Math.min(W - 2 * pad, 480 * u), ch = Math.max(0, Math.min(132 * u, (avail - (n - 1) * gap) / n));
    const y0 = top + Math.max(0, (avail - (n * ch + (n - 1) * gap)) / 2);
    for (let i = 0; i < n; i++) cards.push({ x: W / 2 - cw / 2, y: y0 + i * (ch + gap), w: cw, h: ch });
  }
  return { titleY, subY, cards, hintY: base - hintH / 2 + 4 * u, stacked };
}

function wrap(g: CanvasRenderingContext2D, text: string, maxW: number): string[] {
  const out: string[] = []; let line = '';
  for (const w of text.split(' ')) {
    const t = line ? line + ' ' + w : w;
    if (line && textWidth(g, t) > maxW) { out.push(line); line = w; } else line = t;
  }
  if (line) out.push(line);
  return out;
}

/** A relic icon (24 x 26 frames) at an integer scale, centred on x with its top at y. */
export function drawRelic(g: CanvasRenderingContext2D, id: string, x: number, y: number, scale: number, t: number): boolean {
  const c = charFrame(`perk.${id}`, Math.floor(t * 5)); if (!c) return false;
  const k = Math.max(1, Math.floor(scale)); g.imageSmoothingEnabled = false;
  g.drawImage(c, Math.round(x - c.width * k / 2), Math.round(y), c.width * k, c.height * k); return true;
}

const RARITY_COL = ['#cfc4b8', '#6ab0ff', '#ffd84a'];
type DrawHero = (g: CanvasRenderingContext2D, x: number, foot: number, look: HeroPerkLook) => void;
/**
 * The perk picker: dims the frozen world, shows three cards (relic, name, rarity, effect at the next rank, the hero wearing
 * it where the perk changes the hero), highlights the selection and runs the auto-pick timer. Returns the card hit boxes.
 */
export function drawPerkPicker(g: CanvasRenderingContext2D, pv: PerkView, W: number, H: number, insetBottom: number, u: number, dpr: number, t: number, heroLook: HeroPerkLook, drawHero: DrawHero): Rect[] {
  const o = pv.offer!; const L = perkPickLayout(W, H, insetBottom, u, o.cards.length), q = Math.max(1, Math.round(dpr * Math.max(1, u / dpr)));
  const fade = Math.min(1, o.age / 0.35);
  g.save();
  g.globalAlpha = 0.72 * fade; g.fillStyle = '#07060b'; g.fillRect(0, 0, W, H); g.globalAlpha = 1;
  const tq = Math.max(2, Math.min(Math.round(4 * dpr), Math.floor((W - 24 * u) / displayWidth('PICK A PERK', 1))));
  displayText(g, 'PICK A PERK', W / 2, L.titleY, tq, '#ffd84a', true);
  g.textAlign = 'center'; g.font = pixelFont(Math.round(12 * u)); g.fillStyle = '#c8bfcc';
  fillTextShadow(g, `${o.boss} defeated · floor ${o.floor} · keeps until you fall`, W / 2, L.subY, W - 24 * u);
  o.cards.forEach((c, i) => {
    const R = L.cards[i]; if (!R || R.h <= 0) return;
    const sel = i === o.sel, rise = sel ? Math.round(4 * u * Math.min(1, fade)) : 0, y = R.y - rise, rc = RARITY_COL[c.rarity] ?? '#fff';
    const slide = (1 - fade) * 30 * u * (i - 1);
    g.save(); g.translate(Math.round(slide), 0);
    if (sel) { g.globalAlpha = 0.35 + 0.2 * Math.sin(t * 5); g.fillStyle = c.color; g.fillRect(R.x - 3 * q, y - 3 * q, R.w + 6 * q, R.h + 6 * q); g.globalAlpha = 1; }
    pixelPanel(g, R.x, y, R.w, R.h, sel ? mixHex(c.color, '#ffffff', 0.2) : mixHex(rc, '#3a3243', 0.45), sel ? '#221a2cf4' : '#151120f0', q);
    g.fillStyle = rc; g.fillRect(Math.round(R.x + 3 * q), Math.round(y + 3 * q), Math.round(R.w - 6 * q), q);   // rarity stripe
    // the relic (and the hero wearing it, when the perk changes the hero)
    const look = c.id === 'yellow' || c.id === 'polka' || c.id === 'green' || c.id === 'rainbow' ? { kit: c.id, ovs: heroLook.ovs }
      : (OVERLAY_PERKS as readonly string[]).includes(c.id) ? { kit: heroLook.kit, ovs: [...new Set([...heroLook.ovs.filter((k) => !STANCE_OF[k] || !STANCE_OF[c.id] || STANCE_OF[k] === STANCE_OF[c.id]), c.id])], angle: PREVIEW_ANGLE[c.id], stance: STANCE_OF[c.id] } : null;
    const tx = (s: string, x: number, yy: number, mw: number) => fillTextShadow(g, s, x, yy, mw);
    if (!L.stacked) {
      const art = Math.min(R.h * 0.34, R.w * 0.42), sc = Math.max(1, Math.floor(art / 26));
      const ix = look ? R.x + R.w * 0.32 : R.x + R.w / 2, iy = y + 14 * u;
      drawRelic(g, c.id, ix, iy + Math.round(Math.sin(t * 3 + i) * sc), sc, t + i * 0.3);
      if (look) drawHeroScaled(g, R.x + R.w * 0.72, iy + 28 * sc, sc, look, drawHero);
      let ty = iy + 26 * sc + 22 * u;
      g.textAlign = 'center'; g.font = pixelFont(Math.round(15 * u)); g.fillStyle = '#fff';
      tx(c.name, R.x + R.w / 2, ty, R.w - 10 * u); ty += 16 * u;
      g.font = pixelFont(Math.round(10 * u)); g.fillStyle = rc;
      tx(`${c.slot} · ${c.rarityName}${c.max > 1 ? ` · rank ${c.rank + 1}/${c.max}` : ''}`, R.x + R.w / 2, ty, R.w - 10 * u); ty += 18 * u;
      g.font = pixelFont(Math.round(12 * u)); g.fillStyle = '#ffe6a8';
      for (const ln of wrap(g, c.desc, R.w - 18 * u).slice(0, 3)) { if (ty > y + R.h - 26 * u) break; tx(ln, R.x + R.w / 2, ty, R.w - 10 * u); ty += 14 * u; }
      g.font = pixelFont(Math.round(10 * u)); g.fillStyle = '#9a90a6';
      if (ty + 4 * u < y + R.h - 12 * u) tx(c.blurb, R.x + R.w / 2, Math.max(ty + 4 * u, y + R.h - 14 * u), R.w - 12 * u);
      for (let k = 0; k < c.max && c.max > 1; k++) pixelGem(g, R.x + R.w / 2 + (k - (c.max - 1) / 2) * 9 * q, y + R.h - 7 * q, k < c.rank ? c.color : k === c.rank ? (Math.sin(t * 6) > 0 ? c.color : '#3a3243') : '#3a3243', q);
    } else {
      const sc = Math.max(1, Math.floor((R.h - 12 * u) / 28)), ix = R.x + 10 * u + 12 * sc;
      drawRelic(g, c.id, ix, y + (R.h - 26 * sc) / 2, sc, t + i * 0.3);
      let left = ix + 16 * sc;
      if (look && R.w > 420 * u) { drawHeroScaled(g, left + 14 * sc, y + R.h / 2 + 16 * sc, sc, look, drawHero); left += 32 * sc; }
      const mw = R.x + R.w - 10 * u - left; let ty = y + 22 * u;
      g.textAlign = 'left'; g.font = pixelFont(Math.round(14 * u)); g.fillStyle = '#fff'; tx(c.name, left, ty, mw); ty += 15 * u;
      g.font = pixelFont(Math.round(10 * u)); g.fillStyle = rc; tx(`${c.slot}${c.max > 1 ? ` · rank ${c.rank + 1}/${c.max}` : c.rarity ? ` · ${c.rarityName}` : ''}`, left, ty, mw); ty += 15 * u;
      g.font = pixelFont(Math.round(11 * u)); g.fillStyle = '#ffe6a8';
      for (const ln of wrap(g, c.desc, mw).slice(0, 3)) { if (ty > y + R.h - 6 * u) break; tx(ln, left, ty, mw); ty += 13 * u; }
    }
    g.restore();
  });
  // auto-pick timer and controls
  const left = Math.max(0, o.autoS - o.age), bw = Math.min(W - 40 * u, 320 * u);
  pixelMeter(g, W / 2 - bw / 2, L.hintY - 22 * u, bw, 5 * u, left / o.autoS, '#ffd84a', q);
  g.textAlign = 'center'; g.font = pixelFont(Math.round(11 * u)); g.fillStyle = '#c8bfcc';
  fillText(g, `Tap a card, or D-pad + A · takes the highlighted one in ${Math.ceil(left)}s`, W / 2, L.hintY, W - 24 * u);
  g.restore(); g.textAlign = 'left';
  return L.cards.map((R) => ({ ...R }));
}
function drawHeroScaled(g: CanvasRenderingContext2D, x: number, foot: number, sc: number, look: HeroPerkLook, drawHero: DrawHero) {
  const c = heroCanvas ??= document.createElement('canvas'); c.width = 40; c.height = 40;
  const hg = c.getContext('2d')!; hg.clearRect(0, 0, 40, 40); hg.imageSmoothingEnabled = false;
  drawHero(hg, 20, 36, look);
  g.imageSmoothingEnabled = false; g.drawImage(c, Math.round(x - 20 * sc), Math.round(foot - 36 * sc), 40 * sc, 40 * sc);
}
let heroCanvas: HTMLCanvasElement | null = null;

/** Held perks as relic badges in a row (HUD); returns the row height used. */
export function drawPerkBadges(g: CanvasRenderingContext2D, pv: PerkView, x: number, y: number, maxW: number, hu: number, t: number): number {
  if (!pv.ranks.length) return 0;
  const s = Math.max(1, Math.round(hu * 0.55)), cell = 26 * s * 0.62 + 3 * hu; let cx = x;
  for (const r of pv.ranks) {
    if (cx + cell > x + maxW) break;
    const c = charFrame(`perk.${r.id}`, 0);
    if (c) { const k = s * 0.62, w = c.width * k, h = c.height * k; g.imageSmoothingEnabled = false; g.drawImage(c, Math.round(cx), Math.round(y), Math.round(w), Math.round(h)); }
    if (r.rank > 1) { g.font = pixelFont(Math.round(8 * hu)); g.fillStyle = '#fff'; g.textAlign = 'right'; fillTextShadow(g, String(r.rank), cx + cell - 2 * hu, y + 16 * hu); g.textAlign = 'left'; }
    cx += cell;
  }
  void t; return 16 * hu;
}

/** Pixel particles of held perks around the hero (world px; hero foot at fx, fy). Emissive layer. */
export function drawPerkParticles(g: CanvasRenderingContext2D, pv: PerkView, fx: number, fy: number, moving: boolean, t: number, hpFull: boolean, stance?: string) {
  const rank = (id: string) => (STANCE_OF[id] && stance && STANCE_OF[id] !== stance ? 0 : pv.ranks.find((r) => r.id === id)?.rank ?? 0);
  const tw = rank('tailwind');
  if (tw && moving) for (let i = 0; i < 3 + tw * 2; i++) {   // wind streaks sweeping past
    const ph = (t * 1.6 + i * 0.37) % 1, y = Math.round(fy - 4 - ((i * 7) % 22)), x = Math.round(fx - 14 + ph * 28 - ((i * 5) % 6));
    g.globalAlpha = Math.sin(ph * Math.PI) * 0.75; g.fillStyle = i % 3 ? '#a6d0ff' : '#e8f6ff'; g.fillRect(x, y, 3 + (i % 3) * 2, 1);
  }
  const lube = rank('lube');
  for (let i = 0; i < lube * 2; i++) {   // gold drips off the drivetrain
    const ph = (t * 0.9 + i * 0.29) % 1, x = Math.round(fx - 6 + ((i * 11) % 13)), y = Math.round(fy - 14 + ph * 14);
    g.globalAlpha = 1 - ph; g.fillStyle = ph < 0.3 ? '#ffe08a' : '#f0b030'; g.fillRect(x, y, 1, ph < 0.5 ? 2 : 1);
  }
  const seal = rank('sealant');
  if (seal && !hpFull) for (let i = 0; i < 2 + seal * 2; i++) {   // sealant bubbles while it heals
    const ph = (t * 0.7 + i * 0.23) % 1, x = Math.round(fx - 8 + ((i * 7) % 17) + Math.sin(t * 3 + i) * 1.5), y = Math.round(fy - 6 - ph * 24);
    g.globalAlpha = Math.sin(ph * Math.PI); g.fillStyle = i % 2 ? '#7ee07a' : '#e6ffd8'; g.fillRect(x, y, 1, 1); if (i % 3 === 0) { g.fillRect(x + 1, y, 1, 1); }
  }
  g.globalAlpha = 1;
}

/** A Domestique drone (16 x 16 frames, foot anchor) with a small muzzle flash right after it shoots. */
export function drawDrone(g: CanvasRenderingContext2D, x: number, y: number, t: number, shot: number, k: number) {
  const c = charFrame('drone', Math.floor(t * 12 + k * 2)); if (!c) return;
  g.globalAlpha = 0.35; g.fillStyle = '#100d1c'; g.fillRect(Math.round(x - 4), Math.round(y + 10), 8, 2); g.globalAlpha = 1;
  g.drawImage(c, Math.round(x - 8), Math.round(y - 13));
  if (shot < 0.08) { g.fillStyle = '#fff4c0'; g.fillRect(Math.round(x - 1), Math.round(y - 4), 3, 3); }
}
