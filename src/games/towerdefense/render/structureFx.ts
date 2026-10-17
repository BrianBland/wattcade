// Towers and the outpost reacting to the game: upgrade parts that drop in and land, level pips, and base damage states.
// Pure timing/threshold helpers (unit-tested); the renderer and machinery draw them.

/** A dropping part: falls for FALL_S (matching the clank in the `boltOn` sound), then squashes for SQUASH_S. */
export const FALL_S = 0.2, SQUASH_S = 0.14, DROP_HEIGHT = 70; // manifest px (towers are 224 px)
/** On a fresh build the base lands first, then the head. */
export const HEAD_DELAY_S = 0.22;
export const dropDone = (age: number, delay = 0) => age - delay >= FALL_S + SQUASH_S;

/** Lift (manifest px above the rest pose), squash (vertical scale), and whether this frame is the landing. */
export function dropPose(age: number, delay = 0): { lift: number; sy: number; visible: boolean } {
  const a = age - delay;
  if (a < 0) return { lift: DROP_HEIGHT, sy: 1, visible: false };
  if (a < FALL_S) { const k = a / FALL_S; return { lift: DROP_HEIGHT * (1 - k * k), sy: 1.06, visible: true }; }
  const k = Math.min(1, (a - FALL_S) / SQUASH_S);
  return { lift: 0, sy: 1 - 0.14 * Math.sin(k * Math.PI) * (1 - k * 0.5), visible: true };
}

/** Which tower parts drop for a change from `from` to `level`: everything but the pad on a build, else every newly added level's parts. */
export function dropsFor(part: { name: string; minLevel?: number }, level: number, built: boolean, from = level - 1): { drops: boolean; delay: number } {
  if (part.name === 'pad') return { drops: false, delay: 0 };
  if (built) return { drops: true, delay: part.name === 'base' ? 0 : HEAD_DELAY_S };
  const m = part.minLevel ?? 1;
  return { drops: m > from && m <= level, delay: 0 };
}

/** New-pip flash strength after an upgrade (0..1 over 0.9 s). */
export const pipFlash = (age: number) => (age < 0 || age > 0.9 ? 0 : 1 - age / 0.9);

/** Base damage states by HP fraction. Decal stages match the outpost manifest (damage_1 < 50%, damage_2 < 25%). */
export function damageState(hpFrac: number) {
  return { sparks: hpFrac < 0.75, steam: hpFrac < 0.5, lights: hpFrac < 0.25, stage: hpFrac < 0.25 ? 2 : hpFrac < 0.5 ? 1 : 0 };
}
/** Seconds between alarm sounds while the base is critical. */
export const ALARM_EVERY_S = 2.5;
