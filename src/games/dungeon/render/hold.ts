// Pure placement for the hero's held weapon (no DOM). Native world pixels, origin at the hero's sim position.
/** The hero art's hands (rows 9–10) sit about 4 px either side of center and 1 px above the sim position. */
export const HAND = { side: 4, up: 1, reach: 2 } as const;
export interface HoldPose {
  /** Where the held art's rotation pivot (its canvas center) is drawn. */
  x: number;
  y: number;
  /** Aiming away from the camera: draw the weapon before the hero so the body covers it, not the reverse. */
  behind: boolean;
}
/**
 * The weapon is gripped at its handle by the hand on the facing side and extends outward along the aim,
 * so it stays clear of the hero's face and body. The barrel snaps to heldRows' eight directions.
 * `grip` is the pivot-to-handle distance (weaponGrip); `kick` pulls it back along the aim for recoil.
 */
export function holdPose(hx: number, hy: number, angle: number, grip: number, kick = 0): HoldPose {
  // Facing follows the true aim (as the hero sprite does); the barrel follows the 8-way held art.
  const face = Math.cos(angle) >= 0 ? 1 : -1, snap = Math.round(angle / (Math.PI / 4)) * (Math.PI / 4);
  const ca = Math.cos(snap), sa = Math.sin(snap);
  // Straight up/down the weapon hangs beside the body rather than over it, so the hand moves out a pixel.
  const handX = hx + face * (HAND.side + Math.abs(sa)) + ca, handY = hy - HAND.up + sa * HAND.reach;
  return { x: handX + ca * (grip - kick), y: handY + sa * (grip - kick), behind: sa < -0.25 };
}
