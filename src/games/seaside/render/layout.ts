// Foreground boxes for the placeholder renderer. Everything sits in the usable height above the shell HUD.
import type { HudOcclusion, Insets } from '../../../contracts';

export interface Box { x: number; y: number; w: number; h: number }
export interface SeasideLayout {
  /** Usable height (H − insets.bottom). */
  UH: number;
  /** Monologue bubble, top-left (storyboard). */
  bubble: Box;
  /** Scene title plate and progress bar. */
  plate: Box;
  /** Centred chapter card. */
  card: Box;
  /** Chapter-select menu rows. */
  menu: Box[];
  /** The placeholder scene box (grey). */
  stage: Box;
  /** Fishing (#187), inside the stage: tappable spot markers, the prompt, the stamina meter, the catch card. */
  fish: FishLayout;
}

export interface FishLayout {
  /** Water band the spots, bobber and line are drawn in. */
  water: Box;
  spots: Box[];
  prompt: Box;
  meter: Box;
  card: Box;
}

export function layout(W: number, H: number, insets: Insets, menuItems = 0, spots = 3): SeasideLayout {
  const top = Math.max(0, insets.top), left = Math.max(0, insets.left), right = Math.max(0, insets.right);
  const UH = Math.max(160, H - Math.max(0, insets.bottom));
  const pad = Math.max(12, Math.min(W, UH) * 0.03);
  const bw = Math.min(W - left - right - 2 * pad, Math.max(220, W * 0.42));
  const bh = Math.max(40, Math.min(72, UH * 0.09));
  const bubble = { x: left + pad, y: top + pad, w: bw, h: bh };
  const ph = Math.max(36, Math.min(56, UH * 0.07));
  const plate = { x: left + pad, y: UH - pad - ph, w: W - left - right - 2 * pad, h: ph };
  const cw = Math.min(W * 0.6, 520), ch = Math.min(UH * 0.22, 140);
  const card = { x: (W - cw) / 2, y: (UH - ch) / 2, w: cw, h: ch };
  const stageTop = bubble.y + bh + pad, stageBot = plate.y - pad;
  const stage = { x: left + pad * 2, y: stageTop, w: W - left - right - pad * 4, h: Math.max(0, stageBot - stageTop) };
  const rh = Math.max(44, Math.min(64, UH * 0.08)), rw = Math.min(W * 0.7, 560), gap = rh * 0.25;
  const total = menuItems * rh + Math.max(0, menuItems - 1) * gap;
  const y0 = Math.max(top + pad, (UH - total) / 2);
  const menu = Array.from({ length: menuItems }, (_, i) => ({ x: (W - rw) / 2, y: y0 + i * (rh + gap), w: rw, h: rh }));
  return { UH, bubble, plate, card, menu, stage, fish: fishLayout(stage, spots) };
}

/** The end title "Seaside" (Bodoni Moda italic): big, a little above the middle of the space above the HUD
 *  (the climbing rider is below it). `em` is the word's set width in ems. */
export const END_TITLE = { text: 'Seaside', em: 3.9 };
export function endTitle(W: number, UH: number, top: number): { y: number; px: number } {
  const t = Math.max(0, top), px = Math.max(28, Math.min((UH - t) * 0.2, (W * 0.84) / END_TITLE.em));
  return { y: t + (UH - t) * 0.38, px };
}

/** Music credit lines under the end title (only when a cue uses a CC track): small, centred, kept above the HUD. */
export function endCredits(W: number, UH: number, top: number, n: number): { ys: number[]; px: number } {
  const T = endTitle(W, UH, top), px = Math.max(11, Math.min(15, W / 70)), gap = px * 1.5;
  const y0 = Math.min(T.y + T.px * 0.85, UH - px - gap * Math.max(0, n - 1));
  return { ys: Array.from({ length: n }, (_, i) => y0 + i * gap), px };
}

/** Fishing boxes inside the stage (so above the HUD too): markers ≥ 44 px tall for touch. */
export function fishLayout(stage: Box, n: number): FishLayout {
  const { x, y, w, h } = stage;
  const water = { x, y: y + h * 0.3, w, h: h * 0.7 };
  const mh = Math.max(44, Math.min(64, h * 0.14)), mw = Math.min(200, (w - 24) / Math.max(1, n) - 12);
  const spots = Array.from({ length: n }, (_, i) => {
    const cx = x + (w * (i + 0.5)) / n;
    return { x: cx - mw / 2, y: y + h * 0.36, w: mw, h: mh };
  });
  const pw = Math.min(w * 0.7, 420), ph = Math.max(40, Math.min(64, h * 0.13));
  const prompt = { x: x + (w - pw) / 2, y: y + h * 0.04, w: pw, h: ph };
  const meter = { x: x + (w - pw) / 2, y: prompt.y + ph + 8, w: pw, h: Math.max(10, ph * 0.3) };
  const cw = Math.min(w * 0.8, 380), ch = Math.min(h * 0.62, 200);
  const card = { x: x + (w - cw) / 2, y: y + (h - ch) / 2, w: cw, h: ch };
  return { water, spots, prompt, meter, card };
}

export const inside = (b: Box, x: number, y: number) => x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h;
export const overlaps = (a: Box, b: HudOcclusion) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

/** Chapter 2a's HUD pieces (#190): the depth meter scratched down the left, the parts tally top-right, the popup. */
export interface BellyHud { meter: Box; tally: Box; popup: Box }
export function bellyHud(W: number, H: number, insets: Insets): BellyHud {
  const L = layout(W, H, insets), pad = Math.max(12, Math.min(W, L.UH) * 0.03), left = Math.max(0, insets.left), right = Math.max(0, insets.right);
  const top = L.bubble.y + L.bubble.h + pad, bottom = L.plate.y - pad;
  const mh = Math.max(80, Math.min(360, (bottom - top) * 0.8));
  const meter = { x: left + pad, y: top + Math.max(0, (bottom - top - mh) / 2), w: Math.max(40, Math.min(64, W * 0.05)), h: Math.min(mh, Math.max(0, bottom - top)) };
  const tw = Math.min(300, W * 0.32), th = Math.max(32, Math.min(44, L.UH * 0.06));
  const tally = { x: W - right - pad - tw, y: Math.max(0, insets.top) + pad, w: tw, h: th };
  const pw = Math.min(W * 0.7, 440), ph = Math.max(48, Math.min(72, L.UH * 0.1));
  const popup = { x: (W - pw) / 2, y: Math.max(top, L.UH * 0.3 - ph / 2), w: pw, h: ph };
  return { meter, tally, popup };
}
