// Original simple art, retained for the per-player Classic overworld mode.
// Shared pixel-art painting helpers and the BiomeLook shape. Everything draws into the low-res buffer.
import { hash01 } from '../../sim/terrain';

export type G = CanvasRenderingContext2D;

export interface BiomeLook {
  sky: [string, string];          // top, horizon
  haze: string;                   // far backdrop colour
  ridge: string;                  // the real-terrain ridge (the road ahead, seen from afar)
  mid: string;                    // mid ground band
  ground: string; groundDark: string;
  road: string; roadEdge: string; roadKind: 'asphalt' | 'planks' | 'dust';
  stars: number;                  // 0..1 star visibility
  /** Distant scenery band (parallax ~0.05). `u` = layer scroll in px, `y` = band base. */
  backdrop(g: G, w: number, y: number, u: number, t: number): void;
  /** Mid-layer prop standing on (x, y). Return without drawing to leave the slot empty. */
  midProp(g: G, h: number, x: number, y: number, t: number): void;
  /** Small foreground bit below the road. */
  foreProp(g: G, h: number, x: number, y: number): void;
  /** Sky decoration (sun, Earth, ...). */
  celestial(g: G, w: number, h: number, t: number): void;
  /** Ambient flyers/swimmers spawned by the renderer. */
  actor: 'bird' | 'gull' | 'ufo' | 'fish' | 'parrot' | 'vulture' | 'ember' | 'none';
  /** Weather particles drifting over the scene. */
  particles?: 'snow' | 'ash' | 'bubbles' | 'fireflies' | 'dust';
  /** Also spawns tumbleweeds (desert-like biomes). */
  weeds?: boolean;
  /** 0..1 headlight on / dusk dimming regardless of the real clock (the Drive-In is always dusk). */
  lights?: number; dusk?: number;
  /** Rider headgear. */
  rider: 'road' | 'bubble' | 'scuba';
  /** Outdoors on Earth: follows the real time of day (night sky, sunset tint). */
  outdoor: boolean;
  /** Quiet ambient noise bed (see audio/sfx setAmbient). */
  ambient?: { vol: number; freq: number; q?: number };
}

export const rect = (g: G, c: string, x: number, y: number, w: number, h: number) => { g.fillStyle = c; g.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h)); };
export const disc = (g: G, c: string, x: number, y: number, r: number) => { g.fillStyle = c; g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill(); };
export const tri = (g: G, c: string, x1: number, y1: number, x2: number, y2: number, x3: number, y3: number) => {
  g.fillStyle = c; g.beginPath(); g.moveTo(x1, y1); g.lineTo(x2, y2); g.lineTo(x3, y3); g.closePath(); g.fill();
};
/** Smooth 1D value noise in [0,1]. */
export function noise1(x: number, seed = 0): number {
  const i = Math.floor(x), f = x - i, s = f * f * (3 - 2 * f);
  return hash01(i + seed * 1013) * (1 - s) + hash01(i + 1 + seed * 1013) * s;
}
export function silhouette(g: G, c: string, w: number, base: number, u: number, amp: number, scale: number, seed: number, jag = 0) {
  g.fillStyle = c; g.beginPath(); g.moveTo(0, base + 40);
  for (let x = 0; x <= w; x += 2) {
    const n = noise1((x + u) / scale, seed) * 0.7 + noise1((x + u) / (scale / 3), seed + 1) * 0.3;
    const j = jag ? Math.abs(((x + u) % 9) - 4.5) * jag : 0;
    g.lineTo(x, base - n * amp - j);
  }
  g.lineTo(w, base + 40); g.closePath(); g.fill();
}

