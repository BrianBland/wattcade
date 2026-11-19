import { NO_INSETS, type GameRenderer, type Insets } from '../../../contracts';
import { classes, halfWidth, FINISH, LAP, type RaceView } from '../sim/race';
import { art, drum, glob, jet, panorama, poly, roadSurface, splat } from '../art';

const ordinals = ['1st', '2nd', '3rd', '4th'];
export function playBounds(w: number, h: number, i: Insets) {
  return { x: i.left, y: i.top, w: Math.max(1, w - i.left - i.right), h: Math.max(1, h - i.top - i.bottom) };
}
export class Renderer implements GameRenderer {
  private canvas!: HTMLCanvasElement;
  private g!: CanvasRenderingContext2D;
  private asphalt!: HTMLCanvasElement;
  private insets = NO_INSETS;
  async ready() {
    const { yard, rider, rivals } = art();
    await Promise.all([yard, rider, ...rivals].map((image) => image.decode()));
  }
  mount(host: HTMLElement, ctx: Parameters<GameRenderer['mount']>[1]) {
    this.canvas = document.createElement('canvas');
    this.canvas.style.cssText = 'width:100%;height:100%;display:block';
    host.append(this.canvas);
    this.g = this.canvas.getContext('2d')!;
    this.asphalt = roadSurface();

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
    panorama(g, W, H, Math.sin(s.at / 171));
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
      g.globalAlpha = Math.max(0, Math.min(1, (380 - z) / 100));
      if (m % 54 === 0) {
        for (const offset of [-1.5, 1.5]) {
          const pier = point(z, offset);
          g.fillStyle = '#63434b';
          g.fillRect(pier.x, pier.y, 5 * pier.k, h * 0.35 * pier.k);
        }
      }
      strip(z, close, -1.58, 1.58, alt ? '#cca337' : '#3c2f36');
      strip(z, close, -1.47, 1.47, alt ? '#53434a' : '#514148');
      // Warp a slice of the same asphalt tile into each projected segment.
      const farLeft = point(z, -1.47),
        farRight = point(z, 1.47);
      const nearLeft = point(close, -1.47),
        nearRight = point(close, 1.47);
      const left = Math.min(farLeft.x, nearLeft.x),
        right = Math.max(farRight.x, nearRight.x);
      g.save();
      g.beginPath();
      g.moveTo(farLeft.x, farLeft.y);
      g.lineTo(farRight.x, farRight.y);
      g.lineTo(nearRight.x, nearRight.y + 0.45);
      g.lineTo(nearLeft.x, nearLeft.y + 0.45);
      g.closePath();
      g.clip();
      const row = (((-(m / 6) % 16) + 16) % 16) * 32;
      g.globalAlpha *= 0.43;
      g.drawImage(this.asphalt, 0, row, 768, 32, left, farLeft.y, right - left, nearLeft.y - farLeft.y + 0.6);
      g.restore();
      if (alt) for (const l of [-1.41, 1.41]) strip(z, close, l - 0.012, l + 0.012, '#e3b773');
      if (m >= 0 && m % LAP === 0)
        for (let j = 0; j < 12; j++)
          strip(z, close, -1.47 + j * 0.245, -1.47 + (j + 1) * 0.245, j % 2 ? '#384761' : '#fff0d2');
    }
    g.globalAlpha = 1;
    const drawables: { z: number; draw(): void }[] = [];
    const gateZ = (Math.floor(s.at / LAP) + 1) * LAP - s.at;
    if (gateZ < 380) {
      const p = point(gateZ, 0),
        span = 0.49 * w * p.k,
        height = h * 0.32 * p.k;
      drawables.push({
        z: gateZ,
        draw: () => {
          g.save();
          g.translate(p.x, p.y);
          g.fillStyle = '#332831';
          g.fillRect(-span, -height, 6 * p.k, height);
          g.fillRect(span - 6 * p.k, -height, 6 * p.k, height);
          g.fillRect(-span, -height, span * 2, height * 0.26);
          g.fillStyle = '#f7c04d';
          g.font = 'italic 900 ' + height * 0.18 + 'px system-ui';
          g.textAlign = 'center';
          g.fillText(s.lap === 3 ? 'FINISH' : 'MAGNET MILE', 0, -height * 0.8);
          g.restore();
        },
      });
    }
    for (const marker of [...s.markers, ...(s.slick ? [s.slick] : [])]) {
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
            { boost: '#eca64c', goo: '#8b9b40', slick: '#57403b' }[marker.kind],
          );
          g.save();
          g.translate(p.x, p.y);
          g.scale(a / 30, a / 30);
          if (marker.kind === 'boost') {
            poly(g, '#ef9e3a', [-30, 2, -21, -8, 21, -8, 30, 2], true);
            poly(g, '#fff5b3', [-17, 0, 0, -7, 17, 0, 7, 0, 0, -3, -7, 0]);
          } else {
            if (marker.kind === 'goo') drum(g);
            else splat(g, 0, -2, 12, 2.5);
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
        draw: () => jet(g, p.x, p.y, Math.min(w / 680, h / 350) * p.k, 0, false, r.slow, s.time, i),
      });
    });
    const player = point(0, s.x);
    drawables.push({
      z: 0,
      draw: () =>
        jet(
          g,
          player.x,
          player.y,
          Math.min(w / 680, h / 350),
          s.lateralSpeed * 0.1,
          s.boost > 0,
          s.slow,
          s.time,
        ),
    });
    if (s.shot) {
      const { target, progress, fromAt, fromX } = s.shot,
        rival = s.rivals[target];
      const z = Math.max(-8, fromAt + (rival.at - fromAt) * progress - s.at);
      const p = point(z, fromX + (rival.x - fromX) * progress);
      drawables.push({
        z: z - 0.01,
        draw: () => {
          const arc = Math.sin(progress * Math.PI);
          const y = p.y - h * (0.12 + 0.24 * arc) * p.k;
          splat(g, p.x, p.y, 4 * p.k, 2.4);
          glob(g, p.x, y, Math.min(22, w * 0.024) * p.k);
        },
      });
    }
    // Salvage-yard turn boards sit beside the asphalt and pass the rider at race speed.
    for (let dist = Math.ceil(s.at / 72) * 72; dist < s.at + 300; dist += 72) {
      const side = Math.sin((dist / LAP) * 4 * Math.PI) > 0 ? -1 : 1;
      const z = dist - s.at,
        p = point(z, 1.7 * side),
        scale = p.k * Math.min(w / 690, h / 350);
      drawables.push({
        z,
        draw: () => {
          g.save();
          g.translate(p.x, p.y);
          g.scale(scale, scale);
          g.fillStyle = '#422f37';
          g.fillRect(-3, -24, 6, 24);
          poly(g, '#322936', [-22, -38, 22, -38, 22, -18, -22, -18], true);
          g.scale(-side, 1);
          for (const x of [-12, 4])
            poly(g, '#ffcf51', [x, -35, x + 7, -35, x + 15, -28, x + 7, -21, x, -21, x + 8, -28]);
          g.restore();
        },
      });
    }
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
      g.font = 'italic 900 ' + size + 'px system-ui';
      g.fillStyle = color;
      g.fillText(str, x, y, w * 0.95);
    }
    if (s.menu) {
      const left = w * 0.055,
        top = h * 0.09,
        wide = Math.min(w * 0.84, 580);
      poly(g, '#261d2cf2', [
        left,
        top,
        left + wide,
        top,
        left + wide - 18,
        top + h * 0.26,
        left,
        top + h * 0.26,
      ]);
      g.fillStyle = '#e5f54b';
      g.fillRect(left, top, 6, h * 0.26);
      text('MAGNET MILE    /    3 LAPS', left + 16, top + h * 0.052, font * 0.78, '#ebdcbd');
      text('SCRAPJET RALLY', left + 16, top + h * 0.149, font * 1.8, '#fff1cb');
      text('‹  ' + classes[s.tier] + '  ›     ·     A to race', left + 16, top + h * 0.225, font, '#d5ed54');
    } else {
      const plaque = (x: number, y: number, width: number, height: number, color: string) => {
        poly(g, color, [x + 7, y, x + width, y, x + width - 7, y + height, x, y + height]);
      };
      plaque(8, 8, font * 7.5, font * 2, '#251d2bf2');
      text(ordinals[s.place - 1].toUpperCase(), 18, 8 + font * 1.43, font * 1.52, '#f4ecce');
      text('LAP ' + s.lap + '/3', font * 4, 8 + font * 1.3, font * 0.78, '#e6f26a');
      plaque(w - font * 6 - 8, 8, font * 6, font * 1.62, s.item ? '#e2f44b' : '#281f2de6');
      text(
        s.item ? 'A  ·  LOB GOO' : classes[s.tier].toUpperCase(),
        w - 20,
        8 + font * 1.12,
        font * 0.84,
        s.item ? '#302237' : '#ffdbba',
        'right',
      );
      g.fillStyle = '#73d7c9';
      g.fillRect(16, 10 + font * 2, (font * 7 * s.at) / FINISH, 3);
      if (s.notice > 0 || s.slow > 0 || s.at >= FINISH) {
        const msg =
          s.at >= FINISH
            ? ordinals[s.place - 1] + ' at Magnet Mile'
            : s.slow > 0
              ? 'GUMMED UP  ·  Sprint at ' + Math.round(s.purgeFtp * 100) + '% FTP'
              : s.message;
        const width = Math.min(w * 0.94, Math.max(font * 12, g.measureText(msg).width * 1.5 + 40));
        const x = (w - width) / 2,
          y = h * 0.17;
        plaque(x, y, width, font * 1.85, '#261c2eea');
        text(msg, w * 0.5, y + font * 1.28, font, '#eeef9e', 'center');
        if (s.slow > 0) {
          g.fillStyle = '#d3f43f';
          g.fillRect(x + 6, y + font * 1.85, (width - 12) * s.purge, 4);
        }
      }
    }
    g.restore();
  }
}
