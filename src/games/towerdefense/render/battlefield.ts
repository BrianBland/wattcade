import { BASE_X, BASE_Y, PADS, roadAt } from '../sim/defs';
import { PAD_R, PAINTED_PADS, PAINT_BOXES, type PaintOrientation } from '../sim/road';
import type { TdSnapshot } from '../sim/types';
import type { View } from './aliens/layer';
import { boundedLights, type Point } from './battlefieldMath';
import { COL, glowAt } from './sprites';
import { loadImage } from './assets';
interface Light extends Point { r: number; color: string; strength: number }

/**
 * The painted ground for the single road (docs/towerdefense/paint-guide). Each orientation has its own painting and
 * paint box; until the landscape one exists, landscape turns the portrait painting with the field (its light then
 * falls sideways). Without any painting the renderer draws vector ground.
 */
export class Battlefield {
  readonly loaded: Promise<void>;
  private paintings: Partial<Record<PaintOrientation, HTMLImageElement>> = {};
  private darkness: HTMLCanvasElement | null = null;
  private lightKey = '';
  constructor(base: string, onBackground: () => void) {
    // A missing painting is fine: the other orientation or the vector ground stands in.
    this.loaded = Promise.all((['portrait', 'landscape'] as const).map(o =>
      loadImage(`${base}td/environment/road/${o}.webp`).then(image => { this.paintings[o] = image; onBackground(); }, () => {}),
    )).then(() => {});
  }

  get ready() { return !!(this.paintings.portrait || this.paintings.landscape); }
  /** Paints the ground behind the field; false when no painting has loaded. */
  paint(g: CanvasRenderingContext2D, v: View, W: number, H: number) {
    const own = v.turned ? this.paintings.landscape : this.paintings.portrait;
    const o: PaintOrientation | null = own ? (v.turned ? 'landscape' : 'portrait') : this.paintings.portrait ? 'portrait' : null;
    if (!o) return false;
    const image = this.paintings[o]!, { x0, y0, x1, y1 } = PAINT_BOXES[o];
    g.fillStyle = '#0d1118'; g.fillRect(0, 0, W, H);
    g.save();
    if (o === 'landscape') { const c = v.P(x0, y1); g.drawImage(image, c.x, c.y, (y1 - y0) * v.k, (x1 - x0) * v.k); }
    else {
      // The portrait image's x runs along world x and its y along world y; a turned view carries both.
      const a = v.P(x0, y0); g.translate(a.x, a.y); if (v.turned) g.transform(0, 1, -1, 0, 0, 0);
      g.drawImage(image, 0, 0, (x1 - x0) * v.k, (y1 - y0) * v.k);
    }
    g.restore();
    for (const p of PADS.slice(PAINTED_PADS)) this.plate(g, v, p.x, p.y, p.id);
    return true;
  }
  /**
   * A cleared, packed-grit pad for pads the painting does not have yet: a soft dark rim, a grit disc in the clearings'
   * muted palette lit from the top of the field, and a few pebbles. Matches the painted clearings' ~4.8-unit radius.
   */
  private plate(g: CanvasRenderingContext2D, v: View, x: number, y: number, seed: number) {
    const c = v.P(x, y), r = (PAD_R + 0.4) * v.k, light = v.P(x, y - r / v.k * 0.5);
    g.save();
    const rim = g.createRadialGradient(c.x, c.y, r * 0.8, c.x, c.y, r * 1.35);
    rim.addColorStop(0, 'rgba(10,8,6,0.4)'); rim.addColorStop(1, 'rgba(10,8,6,0)');
    g.fillStyle = rim; g.beginPath(); g.arc(c.x, c.y, r * 1.35, 0, Math.PI * 2); g.fill();
    const dirt = g.createRadialGradient(light.x, light.y, 0, c.x, c.y, r);
    dirt.addColorStop(0, 'rgba(122,98,74,0.9)'); dirt.addColorStop(0.7, 'rgba(92,75,58,0.9)'); dirt.addColorStop(1, 'rgba(62,51,41,0.85)');
    g.fillStyle = dirt; g.beginPath(); g.arc(c.x, c.y, r, 0, Math.PI * 2); g.fill();
    g.strokeStyle = 'rgba(20,16,12,0.45)'; g.lineWidth = Math.max(1, v.k * 0.35); g.stroke();
    for (let i = 0; i < 14; i++) {
      const h = (n: number) => { const s = Math.sin((seed * 31 + i * 7 + n) * 12.9898) * 43758.5453; return s - Math.floor(s); };
      const a = h(1) * Math.PI * 2, d = Math.sqrt(h(2)) * r * 0.85, pr = (0.15 + h(3) * 0.3) * v.k;
      g.fillStyle = h(4) < 0.5 ? 'rgba(30,26,22,0.4)' : 'rgba(170,160,145,0.25)';
      g.beginPath(); g.arc(c.x + Math.cos(a) * d, c.y + Math.sin(a) * d, pr, 0, Math.PI * 2); g.fill();
    }
    g.restore();
  }
  /** The hive mouth breathes in the incoming brood's colour, so the spawn reads even under the status rows' edge. */
  hive(g: CanvasRenderingContext2D, v: View, s: TdSnapshot) {
    if (s.phase !== 'run') return;
    const p = roadAt(0), q = v.P(p.x, p.y), pulse = 0.5 + 0.5 * Math.sin(s.t * 2);
    g.save(); g.globalCompositeOperation = 'lighter';
    glowAt(g, COL[s.brood.color], q.x, q.y, (12 + 3 * pulse) * v.k, 0.18 + 0.12 * pulse);
    g.restore();
  }
  lighting(g: CanvasRenderingContext2D, v: View, s: TdSnapshot, W: number, H: number) {
    const lights: Light[] = [{ x: BASE_X, y: BASE_Y, r: 16, color: '#71e8ff', strength: 0.22 }];
    for (const tw of s.towers) { const p = PADS[tw.pad]; lights.push({ x: p.x, y: p.y, r: 8, color: COL[tw.kind === 'tesla' ? 'blue' : tw.kind === 'flamer' ? 'red' : 'purple'], strength: 0.14 }); }
    const ambientCount = lights.length;
    for (const b of s.burns) lights.push({ x: b.x, y: b.y, r: b.r * 1.4, color: '#ff8a3a', strength: 0.12 * b.k });
    for (const f of s.fx) {
      const strength = Math.max(0, 1 - (s.t - f.t0) / f.life) * 0.3; if (!strength || s.t < f.t0) continue;
      if (f.kind === 'tracer') lights.push({ x: f.x0, y: f.y0, r: 7, color: '#9bdcff', strength });
      else if (f.kind === 'boom' || f.kind === 'burst') lights.push({ x: f.x, y: f.y, r: Math.max(7, f.r * 1.5), color: '#ff9b50', strength });
      else if (f.kind === 'zap') for (const p of f.pts) lights.push({ ...p, r: 7, color: '#7cecff', strength });
      else if (f.kind === 'lens') lights.push({ x: f.x1, y: f.y1, r: 9, color: '#c694ff', strength });
      else if (f.kind === 'beam') for (let i = 1; i <= 4; i++) lights.push({ x: BASE_X + Math.sin(f.angle) * i * 22, y: BASE_Y - Math.cos(f.angle) * i * 22, r: 12, color: '#be91ff', strength });
    }
    const selected = boundedLights(lights);
    // Cache the punched ambient map until structures or layout change. Transient weapon light
    // uses additive sprites below, keeping dynamic canvas uploads out of the per-frame path.
    const w = Math.max(1, Math.ceil(W / 4)), h = Math.max(1, Math.ceil(H / 4)), o = v.P(0, 0);
    const key = `${w}|${h}|${v.k}|${o.x}|${o.y}|${v.turned}|${s.towers.map(t => t.pad).join(',')}`;
    if (!this.darkness) this.darkness = document.createElement('canvas');
    if (key !== this.lightKey) {
      this.lightKey = key; this.darkness.width = w; this.darkness.height = h;
      const d = this.darkness.getContext('2d')!;
      d.fillStyle = 'rgba(6,9,18,0.28)'; d.fillRect(0, 0, w, h); d.globalCompositeOperation = 'destination-out';
      for (const light of selected.slice(0, ambientCount)) {
        const q = v.P(light.x, light.y), x = q.x / 4, y = q.y / 4, r = light.r * v.k / 4;
        const gradient = d.createRadialGradient(x, y, 0, x, y, r); gradient.addColorStop(0, 'rgba(0,0,0,0.9)'); gradient.addColorStop(1, 'rgba(0,0,0,0)');
        d.fillStyle = gradient; d.fillRect(x - r, y - r, r * 2, r * 2);
      }
      d.globalCompositeOperation = 'source-over';
    }
    g.drawImage(this.darkness, 0, 0, W, H);
    g.save(); g.globalCompositeOperation = 'lighter';
    for (const light of selected) { const q = v.P(light.x, light.y); glowAt(g, light.color, q.x, q.y, light.r * v.k, light.strength); }
    g.restore();
  }
}
