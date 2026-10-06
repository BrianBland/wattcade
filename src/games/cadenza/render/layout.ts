// Pure layout math for the Cadenza renderer (unit-tested): HUD boxes and camera framing above the shell HUD.

export interface Box { x: number; y: number; w: number; h: number }
export interface Layout {
  /** Usable height above the shell HUD. */
  UH: number;
  /** three.js setViewOffset y shift so the craft sits in the usable area. */
  viewOffsetY: number;
  score: Box;    // top-left: score, multiplier, chain
  zone: Box;     // top-right: ZONE nn · kind, time left, target
  shield: Box;   // top-centre: shield bar
  song: Box;     // under the score: now playing + credit
  callout: Box;  // big centred "ZONE 07 / DROP" callout
  menu: Box;     // pre-game menu panel
  launch: Box;   // the launch meter (bottom centre, above the shell HUD)
  recap: Box;    // end-of-song recap card
}

export function layout(W: number, H: number, insetB: number): Layout {
  const b = Math.max(0, Math.min(insetB, H / 2));
  const UH = Math.max(160, H - b);
  const pad = 12, narrow = W < 720;
  const colW = Math.min(W - 2 * pad, narrow ? W - 2 * pad : 280);
  const score: Box = { x: pad, y: pad, w: colW, h: 74 };
  const zone: Box = narrow ? { x: pad, y: score.y + score.h + 6, w: colW, h: 70 } : { x: W - pad - 260, y: pad, w: 260, h: 84 };
  const song: Box = narrow ? { x: pad, y: zone.y + zone.h + 6, w: colW, h: 40 } : { x: pad, y: score.y + score.h + 6, w: colW, h: 40 };
  const sw = Math.min(narrow ? W - 2 * pad : 360, W - 2 * pad);
  const shield: Box = narrow ? { x: pad, y: song.y + song.h + 6, w: sw, h: 22 } : { x: (W - sw) / 2, y: pad, w: sw, h: 22 };
  const cw = Math.min(W - 2 * pad, 560), ch = Math.min(120, Math.max(60, UH - (shield.y + shield.h + 8) - pad));
  const callout: Box = { x: (W - cw) / 2, y: Math.min(UH - ch - pad, Math.max(shield.y + shield.h + 8, UH * 0.28)), w: cw, h: ch };
  const mw = Math.min(W - 2 * pad, 460), mh = Math.min(UH - 2 * pad, 340);
  const menu: Box = { x: (W - mw) / 2, y: Math.max(pad, (UH - mh) / 2), w: mw, h: mh };
  const lw = Math.min(W - 2 * pad, 420), lh = 64;
  const launch: Box = { x: (W - lw) / 2, y: UH - lh - pad, w: lw, h: lh };
  const rw = Math.min(W - 2 * pad, 300), rh = Math.min(250, UH - 2 * pad);
  const recapTop = narrow ? Math.max(pad, (UH - rh) / 2) : Math.min(UH - rh - pad, zone.y + zone.h + 10);
  const recap: Box = { x: narrow ? (W - rw) / 2 : W - pad - rw, y: Math.max(pad, recapTop), w: rw, h: rh };
  return { UH, viewOffsetY: b / 2, score, zone, shield, song, callout, menu, launch, recap };
}
