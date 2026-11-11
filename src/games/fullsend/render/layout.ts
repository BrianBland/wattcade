// Pure layout for the Full Send renderer. Everything foreground sits in the height above the shell HUD.

export interface Box { x: number; y: number; w: number; h: number }
export interface FullSendLayout {
  /** Usable height above the HUD (CSS px). */
  UH: number;
  /** Rider's screen x and the road line's y (CSS px). */
  riderX: number; roadY: number;
  /** Set-piece banner (title + instruction), the sprint meter, the speed readout and the medal stamp. */
  banner: Box; meter: Box; speed: Box; stamp: Box; status: Box;
  /** The setup screen (tour, options, start) and the first-ride tip card. */
  menu: Box; tip: Box;
}

export function layout(W: number, H: number, insetBottom: number, insetTop = 0): FullSendLayout {
  const UH = Math.max(160, H - Math.max(0, insetBottom));
  const top = Math.max(0, insetTop) + 12;
  const bw = Math.min(W - 32, 560);
  const banner: Box = { x: (W - bw) / 2, y: top, w: bw, h: Math.min(84, UH * 0.16) };
  const meter: Box = { x: (W - bw) / 2, y: banner.y + banner.h + 6, w: bw, h: Math.min(34, UH * 0.07) };
  const speed: Box = { x: 16, y: top, w: Math.min(220, W * 0.3), h: 74 }; // speed, trainer grade, lift meter
  const status: Box = { x: W - 16 - Math.min(240, W * 0.32), y: top, w: Math.min(240, W * 0.32), h: 56 };
  const sh = Math.min(120, UH * 0.22);
  const stamp: Box = { x: W / 2 - 160, y: UH * 0.36 - sh / 2, w: 320, h: sh };
  const mw = Math.min(W - 32, 460), mh = Math.min(UH - top - 12, 250);
  const menu: Box = { x: (W - mw) / 2, y: Math.max(top, (UH - mh) / 2), w: mw, h: mh };
  const tw = Math.min(W - 32, 540), th = 52;
  const tip: Box = { x: (W - tw) / 2, y: UH - th - 10, w: tw, h: th };
  return { UH, riderX: Math.round(W * 0.28), roadY: Math.round(UH * 0.68), banner, meter, speed, stamp, status, menu, tip };
}
