/** Pure layout math for the arcade carousel: a wide hero card in the middle, compact cards either side, wrapping. */

/** Card art is drawn in a 230×100 space. */
export const ART_ASPECT = 23 / 10;
/** Height the hero needs below its art (title, tags, blurb, progress, play row). */
export const HERO_DETAILS_H = 210;
/** Strip under the hero for the page dots. */
export const DOTS_H = 28;
/** Height a side card needs below its art (title). */
export const SIDE_DETAILS_H = 44;

export interface CarouselSizes { heroW: number; sideW: number; gap: number; heroH: number; sideH: number }

/** Card sizes for a carousel area of `w`×`h` px: the hero gets as much art as fits, sides stay compact. */
export function carouselSizes(w: number, h: number): CarouselSizes {
  const gap = 14;
  const heroW = Math.round(Math.max(260, Math.min(w * 0.6, 680, (h - HERO_DETAILS_H - DOTS_H) * ART_ASPECT)));
  const sideW = Math.round(Math.max(110, Math.min(w * 0.15, 200, heroW * 0.36)));
  return { heroW, sideW, gap, heroH: Math.round(heroW / ART_ASPECT + HERO_DETAILS_H), sideH: Math.round(sideW / ART_ASPECT + SIDE_DETAILS_H) };
}

/** Signed slot of item `i` relative to the focused one, wrapping so neighbours sit on both sides (-⌊n/2⌋ … ⌈n/2⌉-1). */
export function slotOf(i: number, focus: number, n: number): number {
  if (n <= 0) return 0;
  const half = Math.floor(n / 2);
  return ((((i - focus + half) % n) + n) % n) - half;
}

/** Left edge of the card in slot `d`, relative to the carousel's centre line. */
export function slotLeft(d: number, s: CarouselSizes): number {
  if (d === 0) return -s.heroW / 2;
  const a = Math.abs(d);
  return d > 0 ? s.heroW / 2 + s.gap + (a - 1) * (s.sideW + s.gap) : -s.heroW / 2 - a * (s.sideW + s.gap);
}

/** Wrap an index into 0…n-1. */
export const wrapIndex = (i: number, n: number) => (n > 0 ? ((i % n) + n) % n : 0);
