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

/** Destination rect (device px) for the low-res buffer so that, at mix f, pixels are the lobby's size and the rider sits
 *  where the lobby has it. `rider` is the rider's buffer position; `uh` the usable height in device px. */
export function handoffRect(f: number, o: { canvasW: number; canvasH: number; px: number; bufW: number; bufH: number; rider: { x: number; y: number }; uh: number }) {
  const lobbyPx = Math.max(2, Math.floor(o.canvasH / LOBBY_ROWS));
  const z = 1 + (lobbyPx / o.px - 1) * f;
  const ourX = o.rider.x * o.px, ourY = o.rider.y * o.px;
  const ax = ourX + (o.canvasW * LOBBY_ANCHOR.x - ourX) * f, ay = ourY + (o.uh * LOBBY_ANCHOR.y - ourY) * f;
  return { x: ax - o.rider.x * o.px * z, y: ay - o.rider.y * o.px * z, w: o.bufW * o.px * z, h: o.bufH * o.px * z, z };
}
