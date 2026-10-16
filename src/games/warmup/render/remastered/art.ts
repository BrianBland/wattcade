// Detailed scenery assets. Bounds are explicit because natural silhouettes do not make a uniform icon grid.
// Alpha-bound trimming removes transparent padding, leaving each sprite grounded by its visible foot.
import { hash01 } from '../../sim/terrain';
import type { G } from '../paint';
import type { BiomeId } from '../../sim/terrain';
export type SceneId = BiomeId | 'driveIn';
type DetailArt = 'cloud' | 'windmill' | 'sheep' | 'umbrella' | 'car' | 'concession';
export type PropArt = DetailArt | 'oak' | 'slenderOak' | 'jungleTree' | 'palm' | 'snowFir' | 'fir' | 'cactus' | 'sandstone' | 'basalt' | 'moonRock' | 'snowRock' | 'reef' | 'meadow' | 'scrub' | 'fern' | 'kelp' | 'dune' | 'winter' | 'farmhouse' | 'barn' | 'temple' | 'beachHut' | 'cabin' | 'lander';
type Box = readonly [number, number, number, number];
type Sprite = { image: HTMLImageElement | HTMLCanvasElement; box: Box };
const props = new Map<PropArt, Sprite>(), backgrounds = new Map<SceneId, Sprite>();
let pending: Promise<void> | undefined;
let ready = false;
const propNames: PropArt[] = ['oak', 'slenderOak', 'jungleTree', 'palm', 'snowFir', 'fir', 'cactus', 'sandstone', 'basalt', 'moonRock', 'snowRock', 'reef', 'meadow', 'scrub', 'fern', 'kelp', 'dune', 'winter', 'farmhouse', 'barn', 'temple', 'beachHut', 'cabin', 'lander'];
const rows = [
  { y: 0, end: 329, xs: [0, 313, 553, 837, 1090, 1300, 1536] },
  { y: 330, end: 569, xs: [0, 242, 524, 770, 1017, 1285, 1536] },
  { y: 570, end: 751, xs: [0, 282, 532, 798, 1034, 1287, 1536] },
  { y: 752, end: 1024, xs: [0, 296, 537, 807, 1055, 1293, 1536] },
];
const backNames: SceneId[] = ['countryside', 'desert', 'seaside', 'jungle', 'snow', 'underwater', 'volcano', 'moon'];
const backRows = [[0, 310], [315, 560], [570, 788], [790, 1024]];
function load(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => { const image = new Image(); image.onload = () => resolve(image); image.onerror = () => reject(new Error(`Scenery art failed to load: ${src}`)); image.src = src; });
}
function trim(image: HTMLImageElement, boxes: Box[], solidEdges = false): Box[] {
  const canvas = document.createElement('canvas'); canvas.width = image.width; canvas.height = image.height;
  const g = canvas.getContext('2d')!; g.drawImage(image, 0, 0);
  const rgba = g.getImageData(0, 0, image.width, image.height).data;
  return boxes.map(([x, y, w, h]) => {
    let left = x + w, top = y + h, right = x, bottom = y;
    for (let yy = y; yy < y + h; yy++) for (let xx = x; xx < x + w; xx++) if (rgba[(yy * image.width + xx) * 4 + 3] > 32) {
      left = Math.min(left, xx); right = Math.max(right, xx); top = Math.min(top, yy); bottom = Math.max(bottom, yy);
    }
    if (solidEdges) {
      const columns = new Uint16Array(w), minimum = Math.max(8, Math.floor(h * .12));
      for (let yy = y; yy < y + h; yy++) for (let xx = x; xx < x + w; xx++) if (rgba[(yy * image.width + xx) * 4 + 3] > 192) columns[xx - x]++;
      while (left < right && columns[left - x] < minimum) left++;
      while (right > left && columns[right - x] < minimum) right--;
    }
    if (right <= left || bottom <= top) throw new Error('Scenery atlas contains an empty sprite');
    return [left, top, right - left + 1, bottom - top + 1];
  });
}
export function loadSceneArt(): Promise<void> {
  return pending ??= Promise.all([load('/overworld/remastered/scenery-atlas.png'), load('/overworld/remastered/backdrop-atlas.png'), load('/overworld/remastered/details-atlas.png')]).then(([objects, landscape, details]) => {
    const boxes: Box[] = rows.flatMap(row => row.xs.slice(0, 6).map((x, i) => [x, row.y, row.xs[i + 1] - x, row.end - row.y] as Box));
    trim(objects, boxes).forEach((box, i) => props.set(propNames[i], { image: objects, box }));
    const bgBoxes: Box[] = backRows.flatMap(([y, end]) => [[0, y, 768, end - y], [772, y, 764, end - y]] as Box[]);
    trim(landscape, bgBoxes, true).forEach((box, i) => backgrounds.set(backNames[i], { image: landscape, box }));
    const detailNames: DetailArt[] = ['cloud', 'windmill', 'sheep', 'umbrella', 'car', 'concession'];
    const detailBoxes: Box[] = [[0, 0, 558, 520], [558, 0, 461, 520], [1019, 0, 517, 520], [0, 525, 480, 499], [480, 525, 565, 499], [1045, 525, 491, 499]];
    trim(details, detailBoxes).forEach((box, i) => props.set(detailNames[i], { image: details, box }));
    backgrounds.set('driveIn', backgrounds.get('desert')!); ready = true;
  });
}
export const sceneArtReady = () => ready;
type Bitmap = OffscreenCanvas | HTMLCanvasElement;
const propBitmaps = new Map<string, Bitmap>();
const panoramaBitmaps = new Map<string, Bitmap>();
function bitmap(width: number, height: number): Bitmap {
  if (typeof OffscreenCanvas !== 'undefined') return new OffscreenCanvas(width, height);
  const canvas = document.createElement('canvas'); canvas.width = width; canvas.height = height; return canvas;
}
export function prop(g: G, name: PropArt, x: number, foot: number, height: number, flip = false, _variant = 0): boolean {
  const sprite = props.get(name); if (!sprite) return false;
  // A whole logical unit is two raster pixels. Bounding this palette of sizes avoids a new bitmap at every subpixel.
  height = Math.max(1, Math.round(height));
  const key = `${name}:${height}`;
  let image = propBitmaps.get(key);
  if (!image) {
    let [sx, sy, sw, sh] = sprite.box;
    if (name === 'moonRock') sh *= .72;
    // A transparent gutter lets the filter sample beyond the silhouette without clipping its edge.
    image = bitmap(Math.ceil(height * 2 * sw / sh) + 4, height * 2 + 4);
    const target = image.getContext('2d') as G;
    target.imageSmoothingEnabled = true; target.drawImage(sprite.image, sx, sy, sw, sh, 2, 2, image.width - 4, image.height - 4);
    if (propBitmaps.size >= 256) propBitmaps.delete(propBitmaps.keys().next().value!);
    propBitmaps.set(key, image);
  } else { propBitmaps.delete(key); propBitmaps.set(key, image); }
  g.save(); g.imageSmoothingEnabled = true; g.translate(x, foot); if (flip) g.scale(-1, 1);
  g.drawImage(image, -image.width / 4, -height - 1, image.width / 2, image.height / 2); g.restore();
  return true;
}
/** Alternating mirrored panoramas share identical edge pixels, avoiding a hard cut or ghosted cliffs. */
export function backdrop(g: G, id: SceneId, w: number, base: number, scroll: number, height: number) {
  const sprite = backgrounds.get(id); if (!sprite) return;
  const [sx, sy, sw, sh] = sprite.box;
  const rasterHeight = Math.round(height * 2), key = `${id}:${rasterHeight}`;
  let image = panoramaBitmaps.get(key);
  if (!image) {
    // Bake adjacent mirrored tiles together. A single repeat pattern interpolates across joins
    // without separately snapped tile origins or transparent sampling at each drawImage edge.
    const tileWidth = Math.ceil(rasterHeight * sw / sh);
    image = bitmap(tileWidth * 2, rasterHeight);
    const target = image.getContext('2d') as G;
    target.imageSmoothingEnabled = true;
    target.drawImage(sprite.image, sx, sy, sw, sh, 0, 0, tileWidth, rasterHeight);
    target.translate(tileWidth * 2, 0); target.scale(-1, 1);
    target.drawImage(sprite.image, sx, sy, sw, sh, 0, 0, tileWidth, rasterHeight);
    if (panoramaBitmaps.size >= 32) panoramaBitmaps.delete(panoramaBitmaps.keys().next().value!);
    panoramaBitmaps.set(key, image);
  }
  const pattern = g.createPattern(image, 'repeat-x'); if (!pattern) return;
  pattern.setTransform(new DOMMatrix().translate(-scroll, base - height).scale(.5));
  g.save(); g.imageSmoothingEnabled = true; g.fillStyle = pattern;
  g.fillRect(0, base - height, w, height); g.restore();
}

export const coverArt: Record<SceneId, PropArt> = { countryside: 'meadow', seaside: 'dune', underwater: 'kelp', jungle: 'fern', desert: 'scrub', volcano: 'basalt', snow: 'winter', moon: 'moonRock', driveIn: 'scrub' };

/** Sparse hero props mixed with smaller clusters, rather than a uniform row of identical trees. */
export function sceneMid(g: G, id: SceneId, h: number, x: number, y: number): boolean {
  if (!ready) return false;
  if (id === 'driveIn') {
    if (h < .32) prop(g, 'car', x, y, 13 + h * 8, h > .16);
    else if (h < .4) prop(g, 'scrub', x, y, 10);
    else if (h < .45) prop(g, 'concession', x, y, 29);
    else if (h < .52) return false; // working lamps
    else if (h < .6) prop(g, 'cactus', x, y, 43 + h * 15);
    else if (h < .75) prop(g, 'scrub', x, y, 13);
    return true;
  }
  if (id === 'countryside') {
    if (h < .16) prop(g, 'oak', x, y, 70 + h * 120);
    else if (h < .31) prop(g, 'slenderOak', x, y, 49 + h * 70, h > .24);
    else if (h < .39) prop(g, 'farmhouse', x, y, 33 + h * 12);
    else if (h < .43) prop(g, 'barn', x, y, 35);
    else if (h < .47) prop(g, 'windmill', x, y, 43);
    else if (h < .52) prop(g, 'barn', x, y, 30);
    else if (h < .64) prop(g, 'sheep', x, y, 10 + h * 3);
    else if (h < .72) prop(g, 'meadow', x, y, 13);
    else if (h < .94) prop(g, 'meadow', x, y, 10 + h * 8);
  } else if (id === 'seaside') {
    if (h < .32) prop(g, 'palm', x, y, 53 + h * 60, h > .2);
    else if (h < .41) prop(g, 'beachHut', x, y, 29 + h * 12);
    else if (h < .5) prop(g, 'umbrella', x, y, 28);
    else if (h < .66) prop(g, 'moonRock', x, y, 8 + h * 8);
    else if (h < .94) prop(g, 'dune', x, y, 12 + h * 8);
  } else if (id === 'jungle') {
    if (h < .3) prop(g, 'jungleTree', x, y, 84 + h * 70);
    else if (h < .5) prop(g, 'fern', x, y, 18 + h * 13);
    else if (h < .56) prop(g, 'temple', x, y, 45);
    else if (h < .94) prop(g, 'fern', x, y, 9 + h * 13);
  } else if (id === 'desert') {
    if (h < .25) prop(g, 'cactus', x, y, 44 + h * 70, h > .16);
    else if (h < .45) prop(g, 'sandstone', x, y, 15 + h * 44);
    else if (h < .49) return false; // road sign and bleached bones
    else if (h < .94) prop(g, 'scrub', x, y, 9 + h * 7);
  } else if (id === 'underwater') {
    if (h < .3) prop(g, 'kelp', x, y, 39 + h * 45);
    else if (h < .48) prop(g, 'reef', x, y, 15 + h * 42);
    else if (h < .54) return false; // wreck and chest
    else if (h < .94) prop(g, 'reef', x, y, 9 + h * 16);
  } else if (id === 'snow') {
    if (h < .38) prop(g, 'snowFir', x, y, 58 + h * 68, h > .23);
    else if (h < .42) return false; // snowman
    else if (h < .49) prop(g, 'cabin', x, y, 37);
    else if (h < .7) prop(g, 'snowRock', x, y, 10 + h * 16);
    else if (h < .94) prop(g, 'winter', x, y, 8 + h * 9);
  } else if (id === 'volcano') {
    if (h >= .3 && h < .56) return false; // lava pools, dead trees, steam
    if (h < .9) prop(g, 'basalt', x, y, 13 + h * 22);
  } else if (id === 'moon') {
    if (h < .3) return false; // crater rims
    if (h < .42) prop(g, 'moonRock', x, y, 13 + h * 34);
    else if (h < .46) prop(g, 'lander', x, y, 28);
    else if (h < .53) return false; // flags and dishes
    else if (h < .9) prop(g, 'moonRock', x, y, 8 + h * 11);
  }
  return true;
}

const terrainTiles = new Map<SceneId, HTMLCanvasElement>();
const terrainRamps: Record<SceneId, string[]> = {
  countryside: ['#678b37', '#83a13f', '#a2b44b', '#4a732f', '#b8bd66'],
  jungle: ['#28452b', '#436537', '#64874b', '#223d2b', '#8a9b57'],
  seaside: ['#d9c298', '#e8d5ac', '#c3a980', '#ad936f', '#f4e3be'],
  desert: ['#d5a76f', '#e7bc82', '#edc38b', '#bc8d5d', '#a77349'],
  underwater: ['#a9ae8a', '#c1bd96', '#cfd0a4', '#8d9d80', '#d9d7b4'],
  snow: ['#dce8e9', '#ecf2ed', '#c6d8df', '#b8ccd6', '#f5f6ed'],
  moon: ['#8d99ad', '#a7b1bd', '#bac1c9', '#717f95', '#cbd0d4'],
  volcano: ['#443844', '#55434a', '#69535a', '#302b35', '#80645e'],
  driveIn: ['#573843', '#6a4650', '#815a62', '#402c3a', '#90666a'],
};
/** Half-unit grain forms a continuous ground surface under the larger grass/rock clumps. */
export function surfaceTexture(g: G, id: SceneId, width: number, height: number, scroll: number, alpha: number) {
  let tile = terrainTiles.get(id);
  if (!tile) {
    tile = document.createElement('canvas'); tile.width = 256; tile.height = 128;
    const t = tile.getContext('2d')!, ramp = terrainRamps[id];
    t.fillStyle = ramp[0]; t.fillRect(0, 0, 256, 128);
    for (let i = 0; i < 3100; i++) {
      const x = Math.floor(hash01(i * 17 + 3) * 256), y = Math.floor(hash01(i * 31 + 7) * 128);
      const h = hash01(i * 71 + 11); t.fillStyle = ramp[1 + Math.floor(h * 4)];
      const vegetated = id === 'countryside' || id === 'jungle';
      t.fillRect(x, y, vegetated ? 1 + (i % 3) : 1 + (i % 4), vegetated ? 1 + (i % 4) : 1);
      if (vegetated && i % 12 === 0) { t.fillStyle = ramp[3]; t.fillRect(x + 2, y + 2, 2, 1); }
    }
    terrainTiles.set(id, tile);
  }
  const pattern = g.createPattern(tile, 'repeat'); if (!pattern) return;
  pattern.setTransform(new DOMMatrix().translate(-scroll, 0).scale(.5));
  g.save(); g.globalAlpha *= alpha; g.fillStyle = pattern; g.fillRect(0, 0, width, height); g.restore();
}
