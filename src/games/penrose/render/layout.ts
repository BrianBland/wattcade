import type { Insets } from '../../../contracts';

export interface Box { x: number; y: number; w: number; h: number }

/**
 * The play stage and the hint panel for a W x H surface. The sky is full-bleed; the stage (where the level is framed,
 * machines and their tap targets included) fills the space inside the insets, so nothing lands under the HUD. The hint
 * (hidden unless asked for from the pause menu) lies over the top of the stage.
 */
export function layout(W: number, H: number, insets: Insets): { stage: Box; status: Box } {
  const top = Math.max(0, insets.top), bottom = Math.max(0, insets.bottom), left = Math.max(0, insets.left), right = Math.max(0, insets.right);
  const w = Math.max(160, W - left - right), h = Math.max(120, H - top - bottom);
  const statusH = Math.min(100, Math.round(h * 0.14));
  return {
    status: { x: left, y: top, w, h: statusH },
    stage: { x: left, y: top, w, h },
  };
}
