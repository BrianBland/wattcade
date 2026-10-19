// Gateway landmarks that stand over the road at each biome boundary, so the change of scenery feels motivated.
// A portal seen side-on: two posts and a beam you ride under, with a name board on top. Styled by destination biome.
import type { BiomeId } from '../sim/terrain';
import { disc, rect, tri, type G } from './paint';

export interface GatewayStyle { post: string; post2: string; board: string; trim: string; text: string; kind: 'wood' | 'coral' | 'vine' | 'ranch' | 'obsidian' | 'snow' | 'metal' | 'driftwood' }

export const GATEWAYS: Record<BiomeId, GatewayStyle> = {
  countryside: { post: '#7a4a2a', post2: '#5b3a22', board: '#f4ecd8', trim: '#c0392b', text: '#3a2a1a', kind: 'wood' },
  seaside: { post: '#b9a98a', post2: '#8a7a5a', board: '#f1f8ff', trim: '#2b7fc4', text: '#16405e', kind: 'driftwood' },
  underwater: { post: '#ff6b8a', post2: '#c56cf0', board: '#0f4a66', trim: '#7fe0ff', text: '#d8f6ff', kind: 'coral' },
  jungle: { post: '#7a7a5a', post2: '#5a5a3a', board: '#2f6e34', trim: '#ffd23b', text: '#f1ffd0', kind: 'vine' },
  desert: { post: '#6b4a2a', post2: '#4a321c', board: '#e0b07a', trim: '#a85a32', text: '#4a2410', kind: 'ranch' },
  volcano: { post: '#1e1418', post2: '#3a2a2a', board: '#2a1818', trim: '#ff7a2a', text: '#ffd0a0', kind: 'obsidian' },
  snow: { post: '#7a4a2a', post2: '#5b3a22', board: '#f4f8ff', trim: '#4a7ab8', text: '#24405e', kind: 'snow' },
  moon: { post: '#c9c9d4', post2: '#8a8a98', board: '#12121e', trim: '#00f0ff', text: '#aef8ff', kind: 'metal' },
  autumn: { post: '#785137', post2: '#573e32', board: '#f3dfaa', trim: '#c77c36', text: '#573e32', kind: 'wood' },
  marsh: { post: '#a58860', post2: '#725f48', board: '#dfe9c9', trim: '#518b80', text: '#294f51', kind: 'driftwood' },
  market: { post: '#55424b', post2: '#3b3446', board: '#28364f', trim: '#e6b85c', text: '#f3dfaa', kind: 'wood' },
  sky: { post: '#e6d8ac', post2: '#b6a5a8', board: '#f7edcc', trim: '#9189b6', text: '#534f77', kind: 'vine' },
};

export const GATEWAY_H = 52, GATEWAY_HALF = 17, BOARD_W = 54, BOARD_H = 10;
/** The name board's centre, relative to the road point under the gateway (for the full-res label). */
export const boardCentre = (): [number, number] => [0, -(GATEWAY_H + 1 + BOARD_H / 2)];

/** Draw the gateway with its feet on the road at (x, y). Everything stays in the low-res buffer; `t` animates lights. */
export function drawGateway(g: G, st: GatewayStyle, x: number, y: number, t: number) {
  const H = GATEWAY_H, hw = GATEWAY_HALF;
  for (const sx of [-hw, hw]) {
    const px = x + sx;
    rect(g, st.post, px - 2, y - H, 4, H); rect(g, st.post2, px, y - H, 2, H);
    if (st.kind === 'vine') { g.strokeStyle = '#3aa046'; g.lineWidth = 1; for (let i = 0; i < 3; i++) { g.beginPath(); g.moveTo(px - 2 + i, y - H + 4); g.lineTo(px - 3 + i * 2 + Math.sin(t + i) * 0.6, y - H + 18 + i * 6); g.stroke(); } }
    if (st.kind === 'coral') for (let i = 0; i < 3; i++) { rect(g, st.post, px - 4 + i * 3, y - H + 6 + i * 11, 2, 5); disc(g, '#ffd23b', px + (i - 1) * 2, y - H - 2 + i, 1.2); }
    if (st.kind === 'snow') { rect(g, '#ffffff', px - 3, y - H, 6, 2); for (let i = 0; i < 2; i++) tri(g, '#bfe6ff', px - 2 + i * 3, y - H + 2, px - 1 + i * 3, y - H + 2, px - 1.5 + i * 3, y - H + 7); }
    if (st.kind === 'obsidian') { const k = 0.5 + 0.5 * Math.sin(t * 3 + sx); g.globalAlpha = 0.5 + 0.5 * k; rect(g, st.trim, px - 1, y - H + 10, 2, 3); rect(g, st.trim, px - 1, y - H + 24, 2, 3); g.globalAlpha = 1; }
    if (st.kind === 'metal' && Math.sin(t * 4 + sx) > 0) disc(g, '#ff4d6d', px, y - H - 2, 1.4);
    if (st.kind === 'driftwood') { rect(g, '#e8e0cc', px - 3, y - 6, 6, 1); }
  }
  // beam, then the name board standing on it
  rect(g, st.post, x - hw - 3, y - H, hw * 2 + 6, 4); rect(g, st.post2, x - hw - 3, y - H + 3, hw * 2 + 6, 1);
  const bx = x - BOARD_W / 2, by = y - H - 1 - BOARD_H;
  rect(g, st.trim, bx - 1, by - 1, BOARD_W + 2, BOARD_H + 2); rect(g, st.board, bx, by, BOARD_W, BOARD_H);
  if (st.kind === 'ranch') { rect(g, '#f4f0e6', x - 3, y - H + 4, 6, 3); rect(g, '#f4f0e6', x - 5, y - H + 5, 2, 2); rect(g, '#f4f0e6', x + 3, y - H + 5, 2, 2); } // steer skull
  if (st.kind === 'wood') { disc(g, '#ff6b8a', bx + 3, by - 1, 1.2); disc(g, '#ffe14d', bx + BOARD_W - 4, by - 1, 1.2); }
  if (st.kind === 'driftwood') { disc(g, '#ff4d6d', x + hw - 2, y - H + 10, 3); disc(g, '#ffffff', x + hw - 2, y - H + 10, 1.4); } // lifebuoy
  if (st.kind === 'metal') { g.globalAlpha = 0.6 + 0.4 * Math.sin(t * 5); rect(g, st.trim, bx, by + BOARD_H, BOARD_W, 1); g.globalAlpha = 1; }
  if (st.kind === 'snow') { rect(g, '#ffffff', bx - 1, by - 3, BOARD_W + 2, 2); }
}
