// Small, seeded silhouettes and three-tone planes for overworld scenery.
// Integer vertices keep props crisp in the low-resolution scene buffer.
import { hash01 } from '../../sim/terrain';
import { rect, type G } from '../paint';
export type Point = readonly [number, number];
export type Ramp = readonly [string, string, string]; // shadow, body, light

type Surface = OffscreenCanvas | HTMLCanvasElement;
const sprites = new Map<string, Surface>();
const MAX_SPRITES = 256;
let painting = false;
/** Cache bounded static props at scene resolution; nested leaf clusters paint into the parent sprite. */
function stamp(g: G, key: string, x: number, y: number, box: readonly [number, number, number, number], draw: (target: G, x: number, y: number) => void) {
  if (painting || (typeof OffscreenCanvas === 'undefined' && typeof document === 'undefined')) { draw(g, x, y); return; }
  let sprite = sprites.get(key);
  if (!sprite) {
    const [left, top, width, height] = box;
    const canvas = typeof OffscreenCanvas !== 'undefined' ? new OffscreenCanvas(width, height) : document.createElement('canvas');
    canvas.width = width; canvas.height = height;
    const target = canvas.getContext('2d') as G | null;
    if (!target) { draw(g, x, y); return; }
    target.translate(-left, -top);
    painting = true;
    try { draw(target, 0, 0); } finally { painting = false; }
    sprite = canvas;
    if (sprites.size >= MAX_SPRITES) sprites.delete(sprites.keys().next().value!);
    sprites.set(key, sprite);
  } else { // refresh the least-recently-used entry
    sprites.delete(key); sprites.set(key, sprite);
  }
  g.save(); g.imageSmoothingEnabled = false;
  g.drawImage(sprite, Math.round(x) + box[0], Math.round(y) + box[1]); g.restore();
}

export function polygon(g: G, color: string, points: readonly Point[]) {
  g.fillStyle = color; g.beginPath();
  points.forEach(([x, y], i) => { if (i) g.lineTo(Math.round(x), Math.round(y)); else g.moveTo(Math.round(x), Math.round(y)); });
  g.closePath(); g.fill();
}
export function contactShadow(g: G, x: number, y: number, radius: number, color = '#192e2a30') {
  g.fillStyle = color; g.beginPath(); g.ellipse(Math.round(x + radius * .25), Math.round(y), radius, Math.max(1, radius * .2), 0, 0, Math.PI * 2); g.fill();
}
export function rock(g: G, h: number, x: number, y: number, r: number, ramp: Ramp) {
  stamp(g, `rock:${h}:${r}:${ramp.join(':')}`, x, y, [-Math.ceil(r * 1.5) - 2, -Math.ceil(r * 1.4) - 2, Math.ceil(r * 3) + 6, Math.ceil(r * 1.6) + 6], (target, px, py) => paintRock(target, h, px, py, r, ramp));
}
function paintRock(g: G, h: number, x: number, y: number, r: number, ramp: Ramp) {
  contactShadow(g, x, y, r * 1.15);
  polygon(g, ramp[0], [[x - r, y], [x - r * .9, y - r * .7], [x - r * .3, y - r * 1.2], [x + r * .5, y - r], [x + r, y - r * .3], [x + r * .8, y]]);
  polygon(g, ramp[1], [[x - r, y - 1], [x - r * .85, y - r * .7], [x - r * .3, y - r * 1.2], [x + r * .25, y - r * .45], [x + r * .1, y - 1]]);
  polygon(g, ramp[2], [[x - r * .85, y - r * .7], [x - r * .3, y - r * 1.2], [x + r * .5, y - r], [x + r * .25, y - r * .45]]);
  if (r > 4) rect(g, ramp[0], x - r * .2, y - r * .7, 1, 2 + h * 2);
}
export function foliage(g: G, h: number, x: number, y: number, r: number, ramp: Ramp) {
  stamp(g, `foliage:${h}:${r}:${ramp.join(':')}`, x, y, [-Math.ceil(r) - 2, -Math.ceil(r) - 2, Math.ceil(r * 2) + 4, Math.ceil(r * 1.7) + 4], (target, px, py) => paintFoliage(target, h, px, py, r, ramp));
}
function paintFoliage(g: G, h: number, x: number, y: number, r: number, ramp: Ramp) {
  const points: Point[] = [[-9, 2], [-10, -2], [-7, -4], [-7, -7], [-3, -8], [-2, -10], [3, -9], [6, -7], [9, -4], [8, 0], [10, 2], [7, 5], [3, 6], [-2, 5], [-5, 6], [-8, 4]];
  polygon(g, ramp[0], points.map(([a, b]) => [x + a * r / 10, y + b * r / 10]));
  polygon(g, ramp[1], [[x - r * .9, y - r * .2], [x - r * .6, y - r * .6], [x - r * .15, y - r * .85], [x + r * .35, y - r * .7], [x + r * .65, y - r * .25], [x + r * .4, y + r * .2], [x - r * .2, y + r * .3], [x - r * .65, y + r * .15]]);
  for (let i = 0; i < 5; i++) {
    const u = hash01(Math.floor(h * 10000) + i * 17), v = hash01(Math.floor(h * 10000) + i * 31 + 4);
    rect(g, ramp[2], x - r * .6 + u * r * .95, y - r * .75 + v * r * .5, 2 + u * 2, 1 + v * 2);
  }
}
export function oak(g: G, h: number, x: number, y: number, jungle = false) {
  stamp(g, `oak:${h}:${jungle}`, x, y, [-36, -64, 76, 70], (target, px, py) => paintOak(target, h, px, py, jungle));
}
function paintOak(g: G, h: number, x: number, y: number, jungle = false) {
  const tall = (jungle ? 31 : 22) + h * 14, r = (jungle ? 12 : 9) + h * 5;
  const ramp: Ramp = jungle ? ['#183f30', '#286640', '#58934c'] : ['#274a32', '#4c7c3e', '#8eaf59'];
  contactShadow(g, x, y, r * .8);
  polygon(g, '#4a3529', [[x - 2, y], [x - 1, y - tall], [x + 2, y - tall], [x + 3, y]]);
  rect(g, '#936d42', x - 1, y - tall * .8, 1, tall * .8);
  polygon(g, '#4a3529', [[x, y - 9], [x - r * .6, y - tall * .75], [x - r * .55 + 2, y - tall * .75], [x + 1, y - 13]]);
  polygon(g, '#4a3529', [[x + 1, y - 12], [x + r * .65, y - tall * .8], [x + r * .7, y - tall * .8 + 2], [x + 2, y - 9]]);
  foliage(g, h, x - r * .55, y - tall * .68, r * .78, ramp);
  foliage(g, h + .2, x + r * .55, y - tall * .72, r * .82, ramp);
  foliage(g, h + .4, x, y - tall * .93, r, ramp);
}
export function grass(g: G, h: number, x: number, y: number, ramp: Ramp) {
  polygon(g, ramp[0], [[x - 3, y], [x - 4, y - 3], [x, y - 1], [x + 3, y - 4], [x + 3, y], [x + 5, y - 2], [x + 5, y + 1]]);
  rect(g, ramp[1], x - 1, y - 3 - h * 2, 1, 4 + h * 2);
  rect(g, ramp[2], x + 2, y - 2 - h * 2, 1, 3 + h * 2);
}
export function pineTree(g: G, h: number, x: number, y: number) {
  stamp(g, `pine:${h}`, x, y, [-20, -56, 42, 62], (target, px, py) => paintPineTree(target, h, px, py));
}
function paintPineTree(g: G, h: number, x: number, y: number) {
  const s = .9 + h * .6;
  contactShadow(g, x, y, 8 * s, '#59759625');
  rect(g, '#514739', x - 1, y - 7 * s, 3, 7 * s);
  for (let i = 0; i < 4; i++) {
    const yy = y - (5 + i * 5) * s, w = (10 - i * 2) * s;
    polygon(g, '#23463e', [[x - w, yy], [x - w * .6, yy - 4 * s], [x, yy - 11 * s], [x + w * .6, yy - 4 * s], [x + w, yy], [x + w * .3, yy - 1], [x + w * .4, yy + 2], [x - w * .3, yy + 1]]);
    polygon(g, '#3d6a54', [[x - w, yy], [x, yy - 11 * s], [x - 1, yy - 2 * s]]);
    polygon(g, '#f2f6f4', [[x - w * .65, yy - 3 * s], [x, yy - 11 * s], [x + w * .5, yy - 4 * s], [x + w * .1, yy - 5 * s], [x - w * .1, yy - 3 * s], [x - w * .3, yy - 4 * s]]);
    rect(g, '#b9d0df', x + w * .1, yy - 5 * s, Math.max(1, w * .35), 1);
  }
}
