// Pure layout for the shooter: where the 100x100 play field and the info panels go on a canvas whose
// bottom `insetB` px sit under the shell HUD. Backgrounds are drawn full-bleed; everything here is above it.
export interface Box { x: number; y: number; w: number; h: number }
export interface SfLayout {
  UH: number;            // usable height (above the HUD)
  sc: number; ox: number; oy: number; // field px = o + unit * sc
  field: Box;
  mode: 'sides' | 'top'; // where the info panels go
  left: Box; right: Box; // side panels ('sides') or the two halves of the top strip ('top')
}

const MIN_SIDE = 150, MIN_TOP = 70;

export function layout(CW: number, CH: number, insetB: number, units = 100): SfLayout {
  const UH = Math.max(160, CH - Math.max(0, insetB));
  // landscape: square field centred, panels in the side gutters
  let sc = Math.min(CW / units, UH / units);
  if ((CW - units * sc) / 2 >= MIN_SIDE || CW > UH) {
    sc = Math.min(UH / units, (CW - 2 * MIN_SIDE) / units);
    sc = Math.max(sc, Math.min(CW, UH) / units * 0.6);
    const fw = units * sc, ox = (CW - fw) / 2, oy = UH - units * sc;
    const side = Math.max(0, ox);
    return {
      UH, sc, ox, oy, field: { x: ox, y: oy, w: fw, h: units * sc }, mode: 'sides',
      left: { x: 0, y: 0, w: side, h: UH }, right: { x: ox + fw, y: 0, w: side, h: UH },
    };
  }
  // portrait: info strip on top, field fills the rest (bottom-aligned to the HUD line)
  const top = Math.max(MIN_TOP, Math.min(UH * 0.16, 140));
  sc = Math.min(CW / units, (UH - top) / units);
  const fw = units * sc, ox = (CW - fw) / 2, oy = UH - units * sc;
  return {
    UH, sc, ox, oy, field: { x: ox, y: oy, w: fw, h: units * sc }, mode: 'top',
    left: { x: 0, y: 0, w: CW / 2, h: Math.max(top, oy) }, right: { x: CW / 2, y: 0, w: CW / 2, h: Math.max(top, oy) },
  };
}
