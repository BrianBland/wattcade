// Pure: the overworld hand-off. The warm-up lobby draws the same biome art at a chunkier pixel (about 230 rows vs our
// 300) with the rider further down and left. Arriving from it, we start at its framing and ease out to ours; at the end
// of the ride we ease back in, so the cut to (or from) the overworld lands on a matching picture.

/** Rows the warm-up renderer targets (its pixel = floor(canvas height / this)). */
export const LOBBY_ROWS = 230;
/** Where the warm-up puts its rider, as fractions of width and of the usable height. */
export const LOBBY_ANCHOR = { x: 0.3, y: 0.8 };
export const HANDOFF = { holdS: 0.5, inS: 1.6, outS: 1.8 };

const ease = (p: number) => { const q = Math.max(0, Math.min(1, p)); return q * q * (3 - 2 * q); };

/** How "overworld" the frame is (1 = the lobby's framing, 0 = ours), `sinceIn` seconds after arriving and `sinceOut`
 *  seconds after the ride ended (null if not ending). */
export function handoffMix(fromLobby: boolean, sinceIn: number, sinceOut: number | null): number {
  const entering = fromLobby ? 1 - ease((sinceIn - HANDOFF.holdS) / HANDOFF.inS) : 0;
  const leaving = sinceOut == null ? 0 : ease(sinceOut / HANDOFF.outS);
  return Math.max(entering, leaving);
}

/** Speed zoom: slow = closer in, flat out = the widest view. 1 = the buffer as drawn (the widest); the camera eases
 *  toward this so it never jumps. Tunable here (render-only, not a bike↔game number). */
export const SPEED_ZOOM = { slowV: 10, fastV: 70, near: 1.4, far: 1 };
export function speedZoom(v: number): number {
  const p = Math.max(0, Math.min(1, (v - SPEED_ZOOM.slowV) / (SPEED_ZOOM.fastV - SPEED_ZOOM.slowV)));
  return SPEED_ZOOM.near + (SPEED_ZOOM.far - SPEED_ZOOM.near) * ease(p);
}

/** Destination rect (device px) for the low-res buffer, zoomed by `zoom` (≥ 1) about the rider, and at hand-off mix f
 *  blended to the lobby's pixel size with the rider where the lobby has it. `rider` is the rider's buffer position;
 *  `uh` the usable height in device px. */
export function handoffRect(f: number, o: { canvasW: number; canvasH: number; px: number; bufW: number; bufH: number; rider: { x: number; y: number }; uh: number; zoom?: number }) {
  const lobbyPx = Math.max(2, Math.floor(o.canvasH / LOBBY_ROWS)), z0 = Math.max(1, o.zoom ?? 1);
  const z = z0 + (lobbyPx / o.px - z0) * f;
  const ourX = o.rider.x * o.px, ourY = o.rider.y * o.px;
  const ax = ourX + (o.canvasW * LOBBY_ANCHOR.x - ourX) * f, ay = ourY + (o.uh * LOBBY_ANCHOR.y - ourY) * f;
  return { x: ax - o.rider.x * o.px * z, y: ay - o.rider.y * o.px * z, w: o.bufW * o.px * z, h: o.bufH * o.px * z, z };
}
