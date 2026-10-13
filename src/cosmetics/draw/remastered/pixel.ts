import { shade } from './prims';
import type { G, P } from '../prims';

const RAMP = [1.2, 1.09, 1, .9, .78, .65, .52];
const hash = (x: number, y: number) => (((x * 73856093) ^ (y * 19349663)) >>> 0) % 97 / 96;

let layer: OffscreenCanvas | HTMLCanvasElement | undefined;
const palettes = new Map<string, number[][]>();
const patches = new Map<string, { image: ImageData; left: number; top: number }>();

/** Paint on the sprite's integer grid. Connected clusters break up tonal
 * boundaries; the patch is composited through the caller's contour, preserving
 * patterns and transparency. A small pixel buffer avoids thousands of paths. */
function surface(g: G, color: string, x: number, y: number, w: number, h: number, light: (x: number, y: number) => number, geometry: string) {
  const m = g.getTransform?.();
  if (!m) return;
  const d = m.a * m.d - m.b * m.c; if (Math.abs(d) < 1e-8) return;
  if (!layer) {
    if (typeof OffscreenCanvas !== 'undefined') layer = new OffscreenCanvas(128,128);
    else if (typeof document !== 'undefined') { layer = document.createElement('canvas'); layer.width = layer.height = 128; }
  }
  const sg = layer?.getContext('2d',{willReadFrequently:true}) as G | undefined;
  if (!sg || !layer) return;
  const key = [color,geometry,m.a,m.b,m.c,m.d,m.e,m.f].join('|');
  const cached = patches.get(key);
  if (cached) {
    patches.delete(key); patches.set(key,cached);
    const {image,left,top} = cached;
    if (layer.width < image.width) layer.width = image.width;
    if (layer.height < image.height) layer.height = image.height;
    sg.putImageData(image,0,0);
    g.save(); g.setTransform(1,0,0,1,0,0); g.imageSmoothingEnabled = false;
    g.drawImage(layer,0,0,image.width,image.height,left,top,image.width,image.height); g.restore();
    return;
  }
  const corners = [[x,y],[x+w,y],[x+w,y+h],[x,y+h]].map(([u,v]) => [m.a*u+m.c*v+m.e,m.b*u+m.d*v+m.f]);
  const left = Math.floor(Math.min(...corners.map(p => p[0]))), right = Math.ceil(Math.max(...corners.map(p => p[0])));
  const top = Math.floor(Math.min(...corners.map(p => p[1]))), bottom = Math.ceil(Math.max(...corners.map(p => p[1])));
  const width = right-left, height = bottom-top;
  if (layer.width < width) layer.width = width;
  if (layer.height < height) layer.height = height;
  let palette = palettes.get(color);
  if (!palette) {
    palette = RAMP.map(value => {
      sg.clearRect(0,0,1,1); sg.fillStyle = shade(color,value); sg.fillRect(0,0,1,1);
      return Array.from(sg.getImageData(0,0,1,1).data.slice(0,3));
    });
    if (palettes.size >= 128) palettes.delete(palettes.keys().next().value!);
    palettes.set(color,palette);
  }
  const patch = sg.createImageData(width,height), p = patch.data;
  for (let py = top; py < bottom; py++) for (let px = left; px < right; px++) {
    const dx = px + .5 - m.e, dy = py + .5 - m.f;
    const u = (m.d*dx-m.c*dy)/d, v = (-m.b*dx+m.a*dy)/d;
    if (u < x || u > x+w || v < y || v > y+h) continue;
    const lighting = light(u,v); if (lighting !== lighting) continue;
    const cluster = hash(Math.floor(u*2),Math.floor(v*2))-.5;
    const grain = hash(Math.floor(u*4),Math.floor(v*4))-.5;
    const tone = Math.max(0,Math.min(6,Math.floor(lighting*6 + cluster*.85 + grain*.3)));
    const i = ((py-top)*width+px-left)*4, c = palette[tone];
    p[i]=c[0]; p[i+1]=c[1]; p[i+2]=c[2]; p[i+3]=255;
  }
  if (patches.size >= 128) patches.delete(patches.keys().next().value!);
  patches.set(key,{image:patch,left,top});
  sg.putImageData(patch,0,0);
  g.save(); g.setTransform(1,0,0,1,0,0); g.imageSmoothingEnabled = false;
  g.drawImage(layer,0,0,width,height,left,top,width,height); g.restore();
}

export function pixelCloth(g: G, color: string, length: number, width: number) {
  surface(g,color,-1.5,-width/2-1,length+3,width+2,(u,v) =>
    (v+width/2)/width + Math.sin(u*1.8+v*.7)*.045 + Math.sin(u*.8-v*2)*.035,`cloth:${length}:${width}`);
}

/** Light wraps a continuous limb; the only tonal boundaries are pixel clusters. */
export function pixelLimb(g: G, color: string, points: P[], widths: number[]) {
  const pad = Math.max(...widths)+.5;
  const x = Math.min(...points.map(p=>p[0]))-pad, y = Math.min(...points.map(p=>p[1]))-pad;
  const w = Math.max(...points.map(p=>p[0]))+pad-x, h = Math.max(...points.map(p=>p[1]))+pad-y;
  const segments = points.slice(1).map((b,i) => {
    const a = points[i], dx = b[0]-a[0], dy = b[1]-a[1], len = Math.hypot(dx,dy)||1;
    return {a,dx,dy,len,nx:-dy/len,ny:dx/len,wa:widths[i],wb:widths[i+1]};
  });
  surface(g,color,x,y,w,h,(u,v) => {
    let best = Infinity, tone = .5;
    for (const s of segments) {
      const t = Math.max(0,Math.min(1,((u-s.a[0])*s.dx+(v-s.a[1])*s.dy)/(s.len*s.len)));
      const cx = s.a[0]+s.dx*t, cy = s.a[1]+s.dy*t, dist = (u-cx)**2+(v-cy)**2;
      if (dist >= best) continue; best = dist;
      const signed = (u-cx)*s.nx+(v-cy)*s.ny, width = s.wa+(s.wb-s.wa)*t;
      const litSide = s.nx*-.65+s.ny*-.8 >= 0 ? 1 : -1;
      tone = dist > (width*1.35)**2 ? NaN : .48-signed*litSide/(width*2.3) + t*(1-t)*.14;
    }
    return tone;
  },`limb:${points.flat().join(',')}:${widths.join(',')}`);
}

/** Solid artwork gets a hard cutout and a compact palette, without soft fringes.
 * Glass/biome masks retain their deliberate transparency. */
export function finishPixels(g: G, size: number, translucent: boolean) {
  const frame = g.getImageData(0,0,size,size), p = frame.data;
  for (let i = 0; i < p.length; i += 4) {
    if (!translucent) p[i+3] = p[i+3] >= 128 ? 255 : 0;
    if (!p[i+3]) { p[i]=p[i+1]=p[i+2]=0; continue; }
    for (let c = 0; c < 3; c++) p[i+c] = Math.min(255,Math.round(p[i+c]/8)*8);
  }
  g.putImageData(frame,0,0);
}

/** Thin wires retain a full pixel, even when a spoke sits between raster columns. */
export function pixelWires(g: G, color: string, segments: Array<[P,P]>) {
  const m = g.getTransform?.(); if (!m || typeof Path2D === 'undefined') return;
  const path = new Path2D();
  for (const [a,b] of segments) {
    let x = Math.round(m.a*a[0]+m.c*a[1]+m.e), y = Math.round(m.b*a[0]+m.d*a[1]+m.f);
    const bx = Math.round(m.a*b[0]+m.c*b[1]+m.e), by = Math.round(m.b*b[0]+m.d*b[1]+m.f);
    const dx = Math.abs(bx-x), dy = -Math.abs(by-y), sx = x < bx ? 1 : -1, sy = y < by ? 1 : -1;
    let error = dx+dy;
    while (true) {
      path.rect(x,y,1,1); if (x === bx && y === by) break;
      const e = error*2; if (e >= dy) { error += dy; x += sx; } if (e <= dx) { error += dx; y += sy; }
    }
  }
  g.save(); g.setTransform(1,0,0,1,0,0); g.fillStyle = color; g.fill(path); g.restore();
}
