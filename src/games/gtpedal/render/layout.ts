/** Pure HUD layout for a W×H surface whose bottom `insetB` px sit under the shell HUD. */
export interface Rect { x: number; y: number; w: number; h: number }
export function layout(W: number, H: number, insetB: number): { UH: number; status: Rect; toast: Rect; focusY: number } {
  const UH = Math.max(120, H - Math.max(0, insetB));
  const status: Rect = { x: 12, y: 12, w: Math.min(360, W - 24), h: 64 };
  const toast: Rect = { x: W / 2 - 120, y: Math.max(status.y + status.h + 8, UH * 0.62), w: 240, h: 40 };
  if (toast.y + toast.h > UH) toast.y = UH - toast.h - 4;
  return { UH, status, toast, focusY: UH * 0.6 };
}
/** Camera view offset (px) that moves the screen centre into the usable band above the HUD. */
export const viewOffsetY = (insetB: number) => Math.max(0, insetB) / 2;
