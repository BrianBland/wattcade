import type { BikeState, GameRenderer, InputState, Profile } from '../../../contracts';
import { BASE_X, BASE_Y, FIELD, LANE_ANGLES, enemyXY, type TdSnapshot } from '../sim/sim';

const COL: Record<string, string> = { blue: '#4aa3ff', red: '#ff5a4a', purple: '#b06cff', gold: '#ffd24a' };

export class TdRenderer implements GameRenderer {
  private canvas!: HTMLCanvasElement;
  private g!: CanvasRenderingContext2D;
  private color = '#ffffff';

  mount(container: HTMLElement, ctx: { profile: Readonly<Profile> }) {
    this.color = ctx.profile.color;
    this.canvas = document.createElement('canvas');
    this.canvas.style.cssText = 'width:100%;height:100%;display:block;background:#10131a';
    container.appendChild(this.canvas);
    this.g = this.canvas.getContext('2d')!;
    this.resize(container.clientWidth || 800, container.clientHeight || 600);
  }
  resize(w: number, h: number) { this.canvas.width = w; this.canvas.height = h; }
  unmount() { this.canvas?.remove(); }

  render(snapshot: unknown, bike: Readonly<BikeState>, _input: Readonly<InputState>) {
    const s = snapshot as TdSnapshot;
    const g = this.g, W = this.canvas.width, H = this.canvas.height;
    const sc = Math.min(W, H) / FIELD, ox = (W - FIELD * sc) / 2, oy = (H - FIELD * sc) / 2;
    const X = (x: number) => ox + x * sc, Y = (y: number) => oy + y * sc;
    g.clearRect(0, 0, W, H);
    g.fillStyle = '#10131a'; g.fillRect(0, 0, W, H);
    // lanes
    g.lineWidth = 2; g.strokeStyle = '#232a3a';
    LANE_ANGLES.forEach((a, i) => {
      const p = enemyXY(a, 90);
      g.strokeStyle = i === s.lane ? '#3a4766' : '#232a3a';
      g.beginPath(); g.moveTo(X(BASE_X), Y(BASE_Y)); g.lineTo(X(p.x), Y(p.y)); g.stroke();
    });
    // enemies
    for (const e of s.enemies) {
      const r = e.kind === 'boss' ? 5 : e.kind === 'armor' ? 3.2 : e.kind === 'brute' ? 2.6 : 1.4;
      g.fillStyle = COL[e.color]; g.beginPath(); g.arc(X(e.x), Y(e.y), r * sc, 0, 7); g.fill();
      if (e.shield) { g.strokeStyle = COL[e.shield]; g.lineWidth = 3; g.beginPath(); g.arc(X(e.x), Y(e.y), (r + 1.2) * sc, 0, 7); g.stroke(); }
      if (e.kind !== 'mini') {
        g.fillStyle = '#000'; g.fillRect(X(e.x) - r * sc, Y(e.y) - (r + 2) * sc, 2 * r * sc, 3);
        g.fillStyle = '#6f6'; g.fillRect(X(e.x) - r * sc, Y(e.y) - (r + 2) * sc, 2 * r * sc * Math.max(0, e.hp / e.maxHp), 3);
      }
    }
    // aim line, flame, beams, tracers
    const tip = (a: number, r: number) => enemyXY(a, r);
    g.strokeStyle = s.autoAim ? '#ffffff55' : '#ffffffaa'; g.lineWidth = 1;
    let p = tip(s.aimAngle, 90); g.beginPath(); g.moveTo(X(BASE_X), Y(BASE_Y)); g.lineTo(X(p.x), Y(p.y)); g.stroke();
    if (s.flaming) {
      g.fillStyle = '#ff5a4a66'; g.beginPath(); g.moveTo(X(BASE_X), Y(BASE_Y));
      for (const d of [-1, 1]) { p = tip(s.aimAngle + d * s.flameHalfAngle, s.flameRange); g.lineTo(X(p.x), Y(p.y)); }
      g.closePath(); g.fill();
    }
    for (const b of s.beams) { p = tip(b.angle, 95); g.strokeStyle = COL.purple; g.lineWidth = 4; g.beginPath(); g.moveTo(X(BASE_X), Y(BASE_Y)); g.lineTo(X(p.x), Y(p.y)); g.stroke(); }
    g.strokeStyle = COL.blue; g.lineWidth = 2;
    for (const tr of s.tracers) { p = tip(tr.angle, tr.r); g.beginPath(); g.moveTo(X(BASE_X), Y(BASE_Y)); g.lineTo(X(p.x), Y(p.y)); g.stroke(); }
    // turret / base
    g.fillStyle = '#2a3042'; g.fillRect(X(BASE_X - 8), Y(BASE_Y), 16 * sc, 8 * sc);
    g.fillStyle = this.color; g.beginPath(); g.arc(X(BASE_X), Y(BASE_Y), 3.5 * sc, 0, 7); g.fill();
    // HUD
    g.fillStyle = '#fff'; g.font = `${Math.max(12, 3 * sc)}px sans-serif`;
    const BTN: Record<string, string> = { gatling: 'A', flame: 'B', rail: 'Y' };
    g.fillText(`Wave ${s.wave}   [${BTN[s.weapon]}] ${s.weapon.toUpperCase()}`, 10, 22);
    g.fillStyle = '#333'; g.fillRect(10, 30, 120, 6);
    g.fillStyle = '#ffd24a'; g.fillRect(10, 30, 120 * (s.swapLeft > 0 ? 1 - s.swapLeft / s.swapS : 1), 6);
    g.fillStyle = '#fff';
    for (let i = 0; i < s.railMaxCharges; i++) {
      g.fillStyle = i < s.railCharges ? COL.purple : '#333';
      g.beginPath(); g.arc(18 + i * 18, 54, 7, 0, 7); g.fill();
    }
    g.fillStyle = COL.purple; g.fillRect(10, 66, 60 * s.railProgress, 4);
    g.fillStyle = '#222'; g.fillRect(10, H - 22, W - 20, 12);
    g.fillStyle = s.baseHp / s.baseMaxHp > 0.3 ? '#4c8' : '#e44'; g.fillRect(10, H - 22, (W - 20) * s.baseHp / s.baseMaxHp, 12);
    if (s.over) { g.fillStyle = '#fff'; g.font = '32px sans-serif'; g.fillText(`Base destroyed - ${s.wavesSurvived} waves`, W / 2 - 180, H / 2); }
  }
}
