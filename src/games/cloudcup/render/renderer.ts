import { NO_INSETS, type GameRenderer, type Insets } from '../../../contracts';
import { classes, halfWidth, FINISH, LAP, type RaceView } from '../sim/race';
import { isle, poly, skiff, sky } from '../art';

const colors = ['#ff776c', '#a4d777', '#bc9adc'];
const ordinals = ['1st', '2nd', '3rd', '4th'];
export function playBounds(w: number, h: number, i: Insets) {
  return { x: i.left, y: i.top, w: Math.max(1, w - i.left - i.right), h: Math.max(1, h - i.top - i.bottom) };
}
export class Renderer implements GameRenderer {
  private canvas!: HTMLCanvasElement;
  private g!: CanvasRenderingContext2D;
  private insets = NO_INSETS;
  private color = '#ffd566';
  mount(host: HTMLElement, ctx: Parameters<GameRenderer['mount']>[1]) {
    this.canvas = document.createElement('canvas');
    this.canvas.style.cssText = 'width:100%;height:100%;display:block';
    host.append(this.canvas);
    this.g = this.canvas.getContext('2d')!;
    this.color = ctx.profile.color;
    this.setInsets(ctx.insets ?? NO_INSETS);
    this.resize(host.clientWidth, host.clientHeight);
  }
  resize(w: number, h: number) {
    const d = Math.min(2, window.devicePixelRatio || 1);
    this.canvas.width = Math.round(w * d);
    this.canvas.height = Math.round(h * d);
    this.g.setTransform(d, 0, 0, d, 0, 0);
  }
  setInsets(i: Insets) {
    this.insets = i;
  }
  unmount() {
    this.canvas.remove();
  }
  render(s: RaceView) {
    const g = this.g,
      W = this.canvas.clientWidth,
      H = this.canvas.clientHeight;
    const b = playBounds(W, H, this.insets);
    sky(g, W, H, s.at * 0.06);
    g.save();
    g.translate(b.x, b.y);
    g.beginPath();
    g.rect(0, 0, b.w, b.h);
    g.clip();
    const w = b.w,
      h = b.h,
      horizon = h * 0.35,
      near = h * 0.83;
    // Reciprocal depth projects every road edge, pickup and craft into the same bend.
    function point(z: number, offset: number) {
      const k = 38 / (38 + z),
        bend = Math.sin(((s.at + z) / LAP) * Math.PI * 4);
      return {
        x: w * (0.5 + (1 - k) * 0.22 * bend + offset * 0.31 * k),
        y: horizon + (near - horizon) * k,
        k,
      };
    }
    isle(g, w * (0.19 + 0.07 * Math.sin(s.at / 171)), h * 0.36, Math.min(w / 560, h / 350), s.time);
    isle(g, w * (0.86 + 0.06 * Math.cos(s.at / 171)), h * 0.4, Math.min(w / 670, h / 410), s.time + 1);
    const strip = (far: number, close: number, l: number, r: number, c: string) => {
      const a = point(far, l),
        b = point(far, r),
        d = point(close, l),
        e = point(close, r);
      poly(g, c, [a.x, a.y, b.x, b.y, e.x, e.y, d.x, d.y]);
    };
    for (let m = Math.floor((s.at + 380) / 6) * 6; m > s.at - 20; m -= 6) {
      const z = m - s.at,
        close = Math.max(-17, z - 6);
      if (z <= close) continue;
      const alt = Math.floor(m / 12) % 2 === 0;
      strip(z, close, -1.58, 1.58, alt ? '#e8846c' : '#fff0c7');
      strip(z, close, -1.47, 1.47, alt ? '#6c7d9c' : '#697997');
      if (alt) for (const l of [-1.41, 1.41]) strip(z, close, l - 0.012, l + 0.012, '#b2c3cd');
      if (m >= 0 && m % LAP === 0)
        for (let j = 0; j < 12; j++)
          strip(z, close, -1.47 + j * 0.245, -1.47 + (j + 1) * 0.245, j % 2 ? '#384761' : '#fff0d2');
    }
    const drawables: { z: number; draw(): void }[] = [];
    for (const marker of [...s.markers, ...(s.squall ? [s.squall] : [])]) {
      const z = marker.at - s.at;
      if (z < 0 || z > 380) continue;
      drawables.push({
        z,
        draw: () => {
          const p = point(z, marker.x),
            a = w * 0.31 * halfWidth[marker.kind] * p.k;
          strip(
            z + 5,
            z,
            marker.x - halfWidth[marker.kind],
            marker.x + halfWidth[marker.kind],
            { boost: '#eca64c', gust: '#75d4c6', squall: '#ac82ca' }[marker.kind],
          );
          g.save();
          g.translate(p.x, p.y);
          g.scale(a / 30, a / 30);
          if (marker.kind === 'boost') {
            poly(g, '#ef9e3a', [-30, 2, -21, -8, 21, -8, 30, 2], true);
            poly(g, '#fff5b3', [-17, 0, 0, -7, 17, 0, 7, 0, 0, -3, -7, 0]);
          } else {
            const gust = marker.kind === 'gust';
            poly(g, gust ? '#7ee7d3' : '#bc91da', [0, -38, 18, -22, 0, -5, -18, -22], true);
            poly(
              g,
              gust ? '#21686e' : '#644781',
              gust ? [-10, -21, 7, -27, 1, -17, 0, -21] : [1, -33, -7, -21, -1, -21, -3, -12, 8, -25, 2, -25],
            );
          }
          g.restore();
        },
      });
    }
    s.rivals.forEach((r, i) => {
      const z = r.at - s.at;
      if (z < -8 || z > 380 || r.finish !== null) return;
      const p = point(z, r.x);
      drawables.push({
        z,
        draw: () => skiff(g, p.x, p.y, Math.min(w / 680, h / 350) * p.k, colors[i], 0, false, i),
      });
    });
    const player = point(0, s.x);
    drawables.push({
      z: 0,
      draw: () =>
        skiff(
          g,
          player.x,
          player.y,
          Math.min(w / 680, h / 350),
          this.color,
          s.lateralSpeed * 0.1,
          s.boost > 0,
        ),
    });
    drawables.sort((a, b) => b.z - a.z).forEach((obj) => obj.draw());
    const font = Math.max(12, Math.min(23, h * 0.045, w * 0.04));
    function text(
      str: string,
      x: number,
      y: number,
      size: number,
      color: string,
      align: CanvasTextAlign = 'left',
    ) {
      g.textAlign = align;
      g.font = 'bold ' + size + 'px system-ui';
      g.fillStyle = color;
      g.fillText(str, x, y, w * 0.95);
    }
    if (s.menu) {
      g.fillStyle = '#243651ed';
      g.fillRect(w * 0.08, h * 0.07, w * 0.84, h * 0.26);
      text('WINDMILL ISLES   /   CLOUDCUP', w * 0.5, h * 0.135, font * 0.77, '#ffcf8c', 'center');
      text('‹   ' + classes[s.tier] + '   ›', w * 0.5, h * 0.23, font * 1.5, '#fff4da', 'center');
      text('Choose pace with paddles   ·   A to race', w * 0.5, h * 0.292, font * 0.84, '#cce9df', 'center');
    } else {
      g.fillStyle = '#243651';
      g.fillRect(0, 0, w, font * 2);
      text(ordinals[s.place - 1] + ' / 4', font * 0.5, font * 1.38, font * 1.2, '#ffd394');
      text(
        s.at >= FINISH ? 'FINISH' : 'LAP ' + s.lap + ' / 3',
        w * 0.5,
        font * 1.32,
        font,
        '#fff6dc',
        'center',
      );
      text(s.item ? 'A · GUST' : classes[s.tier], w - font * 0.5, font * 1.32, font, '#9ae4d4', 'right');
      g.fillStyle = '#ffb563';
      g.fillRect(0, font * 2, (w * s.at) / FINISH, 3);
      if (s.notice > 0 || s.at >= FINISH) {
        const msg = s.at >= FINISH ? ordinals[s.place - 1] + ' at Windmill Isles' : s.message;
        g.fillStyle = '#34435a';
        g.fillRect(w * 0.16, font * 2.5, w * 0.68, font * 1.65);
        text(msg, w * 0.5, font * 3.65, font, '#fff2d1', 'center');
      }
    }
    g.restore();
  }
}
