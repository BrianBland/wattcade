import type { BikeState, GameRenderer, InputState, Insets, Profile } from '../../../contracts';
import { H, W, SHIP_Y, type SfSnapshot } from '../sim/sim';

export class SfRenderer implements GameRenderer {
  private canvas!: HTMLCanvasElement;
  private g!: CanvasRenderingContext2D;
  private color = '#ffffff';
  private insetB = 0;

  mount(container: HTMLElement, ctx: { profile: Readonly<Profile>; insets?: Insets }) {
    this.insetB = ctx.insets?.bottom ?? 0;
    this.color = ctx.profile.color;
    this.canvas = document.createElement('canvas');
    this.canvas.style.cssText = 'width:100%;height:100%;display:block;background:#080a14';
    container.appendChild(this.canvas);
    this.g = this.canvas.getContext('2d')!;
    this.resize(container.clientWidth || 600, container.clientHeight || 800);
  }
  resize(w: number, h: number) { this.canvas.width = w; this.canvas.height = h; }
  setInsets(i: Insets) { this.insetB = i.bottom; }
  unmount() { this.canvas?.remove(); }

  render(snapshot: unknown, _bike: Readonly<BikeState>, _input: Readonly<InputState>) {
    const s = snapshot as SfSnapshot;
    const g = this.g, CW = this.canvas.width, CH = this.canvas.height;
    const UH = Math.max(100, CH - this.insetB); // play field sits above the HUD; the backdrop is full-bleed
    const sc = Math.min(CW / W, UH / H), ox = (CW - W * sc) / 2, oy = (UH - H * sc) / 2;
    const X = (x: number) => ox + x * sc, Y = (y: number) => oy + y * sc;
    g.fillStyle = s.hitFlash > 0 ? '#2a0c10' : '#080a14'; g.fillRect(0, 0, CW, CH);
    g.strokeStyle = '#1a2038'; g.beginPath(); g.moveTo(X(W / 2), Y(0)); g.lineTo(X(W / 2), Y(H)); g.stroke();
    for (const h of s.hazards) {
      g.fillStyle = h.kind === 'rock' ? '#7b7468' : '#ff9a3c';
      g.beginPath(); g.arc(X(h.x), Y(h.y), h.r * sc, 0, 7); g.fill();
    }
    for (const e of s.enemies) {
      g.fillStyle = e.kind === 'boss' ? '#ffd24a' : e.kind === 'tough' ? '#b06cff' : e.kind === 'crosser' ? '#4aa3ff' : '#ff5a4a';
      g.fillRect(X(e.x - e.r), Y(e.y - e.r), 2 * e.r * sc, 2 * e.r * sc);
      if (e.kind !== 'grunt') { g.fillStyle = '#6f6'; g.fillRect(X(e.x - e.r), Y(e.y - e.r) - 4, 2 * e.r * sc * Math.max(0, e.hp / e.maxHp), 3); }
    }
    g.fillStyle = '#e8f0ff';
    for (const b of s.bullets) g.fillRect(X(b.x) - 1.5, Y(b.y) - 3, 3, 6);
    if (s.overdrive) { g.fillStyle = '#ffffff55'; g.fillRect(X(s.shipX - 9), 0, 18 * sc, Y(SHIP_Y)); }
    g.fillStyle = this.color;
    g.beginPath(); g.moveTo(X(s.shipX), Y(SHIP_Y - 4)); g.lineTo(X(s.shipX - 4), Y(SHIP_Y + 3)); g.lineTo(X(s.shipX + 4), Y(SHIP_Y + 3)); g.closePath(); g.fill();
    g.fillStyle = s.gunL ? '#fff' : '#555'; g.fillRect(X(s.shipX - 5), Y(SHIP_Y), 2 * sc, 3 * sc);
    g.fillStyle = s.gunR ? '#fff' : '#555'; g.fillRect(X(s.shipX + 3), Y(SHIP_Y), 2 * sc, 3 * sc);
    // top HUD
    g.fillStyle = '#e8f0ff'; g.font = `${Math.max(12, 3.2 * sc)}px sans-serif`; g.textBaseline = 'top';
    g.fillText(`SCORE ${Math.round(s.score)}  x${s.mult.toFixed(1)}  ${s.phase === 'attack' ? 'ATTACK RUN ' + s.run : 'CRUISE'} ${Math.ceil(s.phaseLeft)}s${s.overdrive ? '  OVERDRIVE' : ''}`, 8, 6);
    g.fillStyle = '#333'; g.fillRect(8, 6 + 4.5 * sc, 30 * sc, 6); g.fillRect(8, 6 + 5.5 * sc + 6, 30 * sc, 6);
    g.fillStyle = '#4aa3ff'; g.fillRect(8, 6 + 4.5 * sc, 30 * sc * s.shield / s.shieldMax, 6);
    g.fillStyle = '#6f6'; g.fillRect(8, 6 + 5.5 * sc + 6, 30 * sc * s.hp / s.hpMax, 6);
  }
}
