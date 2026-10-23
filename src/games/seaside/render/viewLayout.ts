// Where the first-person view sits around the shell HUD: the 3D world is drawn full-bleed (background), but the
// optical centre (horizon, focus of the ride) is moved to the middle of the area above the HUD, and the hands/bars
// rest on that area's bottom edge. Pure.
import type { Insets } from '../../../contracts';

export interface ViewLayout {
  /** Camera view offset (px, + = image shifted up) for PerspectiveCamera.setViewOffset. */ offsetY: number;
  /** Canvas y (px) of the optical centre. */ centreY: number;
  /** Canvas y (px) the top of the bars/gloves should sit at. */ handsY: number;
  /** Visible band (px) above the HUD. */ top: number; bottom: number;
}

export function viewLayout(H: number, insets: Insets, handsFrac = 0.16): ViewLayout {
  const top = Math.max(0, insets.top), bottom = Math.max(top + 1, H - Math.max(0, insets.bottom));
  const centreY = (top + bottom) / 2;
  const handsY = bottom - (bottom - top) * handsFrac;
  return { offsetY: H / 2 - centreY, centreY, handsY, top, bottom };
}

/** Camera-space y (m) at depth `depth` (m, positive) that projects to canvas row `y`, for a camera of vertical fov `fovDeg`. */
export function rowToCameraY(y: number, L: ViewLayout, H: number, fovDeg: number, depth: number): number {
  return -((y - L.centreY) / (H / 2)) * Math.tan((fovDeg * Math.PI) / 360) * depth;
}
