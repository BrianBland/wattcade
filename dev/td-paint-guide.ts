// Paint guides for the single-road background, and an overlay check for a finished painting.
// td-sketch.html?guide=portrait|landscape            flat-colour guide at the painting's pixel size
// td-sketch.html?guide=portrait&check=/path/to.webp   the painting with the sim's road, pads and apron on top
// ...&mock=1                                           the painting (or guide) with the game's real sprites instead
import type { BikeState } from '../src/contracts';
import { KINDS, type Element, type Kind, type TowerKind } from '../src/games/towerdefense/sim/defs';
import type { EnemyView, TdSnapshot } from '../src/games/towerdefense/sim/types';
import { AlienLayer, type View } from '../src/games/towerdefense/render/aliens/layer';
import { Machinery } from '../src/games/towerdefense/render/machinery';
import { FLYER_SPAWNS, SPAWN_Y, FIELD_H, FIELD_W, PAD_R, PAINT_BOXES, paintSize, ROAD, ROAD_HALF_WIDTH, ROAD_PADS, SHOULDER, HIVE_MOUTH, TURRET, TURRET_R, worldToPaint, type PaintOrientation, type Pt } from '../src/games/towerdefense/sim/road';

export const GUIDE_COLORS = {
  sides: '#5c5c66', field: '#80808a', hive: '#6b3d8c', deepHive: '#43215e', yard: '#4f6170',
  shoulder: '#9a7448', road: '#dcb47e', mouth: '#1e0b2a', pad: '#3fae6a', apron: '#d8a630', safe: '#ffffff',
};

export async function drawGuide(canvas: HTMLCanvasElement, o: PaintOrientation, check: string | null, long = 1536, mock = false) {
  const { w, h, pxPerUnit: k } = paintSize(o, long);
  canvas.width = w; canvas.height = h;
  canvas.style.cssText = `width:${w}px;height:${h}px;display:block`;
  document.documentElement.style.overflow = document.body.style.overflow = 'auto';
  const g = canvas.getContext('2d')!;
  const P = (p: Pt) => worldToPaint(o, p, long);
  const rect = (x0: number, y0: number, x1: number, y1: number, color: string) => {
    const a = P({ x: x0, y: y0 }), b = P({ x: x1, y: y1 });
    g.fillStyle = color; g.fillRect(Math.min(a.x, b.x), Math.min(a.y, b.y), Math.abs(b.x - a.x), Math.abs(b.y - a.y));
  };
  const path = (pts: readonly Pt[]) => { g.beginPath(); pts.forEach((p, i) => { const s = P(p); i ? g.lineTo(s.x, s.y) : g.moveTo(s.x, s.y); }); };
  const circle = (p: Pt, r: number) => { const s = P(p); g.beginPath(); g.arc(s.x, s.y, r * k, 0, Math.PI * 2); };
  const { x0, y0, x1, y1 } = PAINT_BOXES[o];
  const safe = () => {
    const a = P({ x: 0, y: 0 }), b = P({ x: FIELD_W, y: FIELD_H });
    g.strokeStyle = GUIDE_COLORS.safe; g.lineWidth = 3; g.setLineDash([14, 10]);
    g.strokeRect(Math.min(a.x, b.x), Math.min(a.y, b.y), Math.abs(b.x - a.x), Math.abs(b.y - a.y)); g.setLineDash([]);
  };

  if (check) {
    const img = new Image(); img.src = check; await img.decode();
    g.drawImage(img, 0, 0, w, h);
    if (mock) { await drawMock(g, p => worldToPaint(o, p, long), paintSize(o, long).pxPerUnit); return; }
    // Road edges and shoulder edges, offset along the sampled normals.
    const offset = (d: number) => ROAD.map((p, i) => {
      const a = ROAD[Math.max(0, i - 1)], b = ROAD[Math.min(ROAD.length - 1, i + 1)], len = Math.hypot(b.x - a.x, b.y - a.y) || 1;
      return { x: p.x - (b.y - a.y) / len * d, y: p.y + (b.x - a.x) / len * d };
    });
    g.lineWidth = 2;
    for (const side of [-1, 1]) {
      g.strokeStyle = '#00e5ff'; g.setLineDash([]); path(offset(side * ROAD_HALF_WIDTH)); g.stroke();
      g.strokeStyle = 'rgba(0,229,255,0.6)'; g.setLineDash([8, 6]); path(offset(side * (ROAD_HALF_WIDTH + SHOULDER))); g.stroke();
    }
    g.strokeStyle = 'rgba(255,255,255,0.7)'; g.setLineDash([4, 8]); path(ROAD); g.stroke(); g.setLineDash([]);
    g.strokeStyle = '#ff3df2'; g.lineWidth = 3; for (const p of ROAD_PADS) { circle(p, PAD_R); g.stroke(); }
    g.strokeStyle = '#ffe14a'; circle(TURRET, TURRET_R); g.stroke();
    safe();
    document.body.dataset.clearings = JSON.stringify(measureClearings(img, o, long));
    return;
  }

  // Zones: sides first, then the field, the hive beyond the spawn edge, and the yard behind the turret.
  rect(x0, y0, x1, y1, GUIDE_COLORS.sides);
  rect(0, 0, FIELD_W, FIELD_H, GUIDE_COLORS.field);
  rect(x0, y0, x1, 0, GUIDE_COLORS.hive);
  rect(x0, y0, x1, -28, GUIDE_COLORS.deepHive);
  rect(x0, FIELD_H, x1, y1, GUIDE_COLORS.yard);
  // Road with its shoulders, including the run into the hive.
  g.lineCap = 'round'; g.lineJoin = 'round';
  for (const [width, color] of [[(ROAD_HALF_WIDTH + SHOULDER) * 2, GUIDE_COLORS.shoulder], [ROAD_HALF_WIDTH * 2, GUIDE_COLORS.road]] as const) {
    g.strokeStyle = color; g.lineWidth = width * k;
    path(ROAD); g.stroke();
  }
  g.fillStyle = GUIDE_COLORS.mouth; circle(HIVE_MOUTH, 9); g.fill();
  g.fillStyle = GUIDE_COLORS.apron; circle(TURRET, TURRET_R + 1); g.fill();
  g.fillStyle = GUIDE_COLORS.pad; for (const p of ROAD_PADS) { circle(p, PAD_R + 0.6); g.fill(); }
  if (mock) { await drawMock(g, p => worldToPaint(o, p, long), paintSize(o, long).pxPerUnit); return; }
  safe();
}

/**
 * Review mock: the game's real outpost, towers and alien puppets drawn over a painting at sim size, upright as the
 * game draws them in both orientations. Positions are converted to image pixels first, so one view serves both.
 * Never baked into the painting.
 */
export async function drawMock(g: CanvasRenderingContext2D, px: (p: Pt) => Pt, k: number, dpr = 1) {
  const at = (p: Pt): View => ({ X: () => px(p).x, Y: () => px(p).y, k, dpr });
  const flat: View = { X: x => x, Y: y => y, k, dpr }; // aliens get image-pixel positions directly
  const base = import.meta.env.BASE_URL;
  const machinery = new Machinery(base), aliens = new AlienLayer(base);
  await Promise.all([machinery.loaded, aliens.loaded]);
  await aliens.prepare(flat);

  // Enemies by distance along the road from the spawn edge, plus Gliders on the flyer routes.
  const along = (d: number, side = 0): { p: Pt; dir: Pt } => {
    let s = 0;
    for (let i = 1; i < ROAD.length; i++) {
      const a = ROAD[i - 1], b = ROAD[i]; if (b.y < SPAWN_Y) continue;
      const len = Math.hypot(b.x - a.x, b.y - a.y); s += len;
      if (s >= d) { const nx = -(b.y - a.y) / len, ny = (b.x - a.x) / len; return { p: { x: b.x + nx * side, y: b.y + ny * side }, dir: { x: b.x - a.x, y: b.y - a.y } }; }
    }
    return { p: TURRET, dir: { x: 0, y: 1 } };
  };
  const roster: Array<[Kind, number, number, Element]> = [
    ['mini', 22, -1.6, 'blue'], ['mini', 25, 1.4, 'blue'], ['mini', 28, -0.6, 'blue'], ['mini', 31, 1.8, 'blue'],
    ['brute', 60, 0, 'red'], ['charger', 88, -1, 'red'], ['armor', 126, 0.8, 'purple'], ['boss', 150, 0, 'red'],
    ['carrier', 178, -0.5, 'purple'], ['prism', 200, 1, 'purple'], ['brute', 222, -1, 'red'], ['mini', 238, 1, 'blue'], ['mini', 241, -1.2, 'blue'],
  ];
  const enemies: EnemyView[] = [];
  const enemy = (id: number, kind: Kind, p: Pt, element: Element): EnemyView => ({
    id, kind, lane: 0, x: p.x, y: p.y, angle: 0, dist: 0, radius: KINDS[kind].radius, element, gold: kind === 'boss', hp: 1, maxHp: 1, hurt: 9,
    charging: false, shiftIn: 0, next: null, progress: 0, bossPhase: 0, telegraph: false, exposed: false, staggerS: 0,
  });
  const before: EnemyView[] = [];
  roster.forEach(([kind, d, side, el], i) => {
    const now = along(d, side), prev = along(d - 1.5, side), a = px(now.p), b = px(prev.p);
    enemies.push(enemy(i + 1, kind, { x: a.x, y: a.y }, el)); before.push(enemy(i + 1, kind, { x: b.x, y: b.y }, el));
  });
  FLYER_SPAWNS.forEach((f, j) => [0.3, 0.36, 0.55].slice(0, j === 1 ? 3 : 1).forEach((u, i) => {
    const w = (v: number) => px({ x: f.x + (TURRET.x - f.x) * v + (i - 1) * 1.6, y: f.y + (TURRET.y - f.y) * v });
    const id = 100 + j * 10 + i; enemies.push(enemy(id, 'dart', w(u + (j === 1 ? 0 : 0.2)), 'blue')); before.push(enemy(id, 'dart', w(u + (j === 1 ? 0 : 0.2) - 0.02), 'blue'));
  }));
  const snap = (list: EnemyView[], t: number) => ({ enemies: list, fx: [], wave: 1, lull: 0, t } as unknown as TdSnapshot);
  aliens.update(snap(before, 0), flat, 0, () => {});
  aliens.update(snap(enemies, 0.5), flat, 1, () => {});

  // Four towers aimed at the nearest enemy; the other pads get the game's build marker.
  const towers: Array<[number, TowerKind, number]> = [[0, 'tesla', 3], [2, 'mortar', 2], [6, 'lens', 4], [4, 'tesla', 1]];
  const aimAt = (from: Pt) => {
    const f = px(from), e = enemies.reduce((best, q) => Math.hypot(q.x - f.x, q.y - f.y) < Math.hypot(best.x - f.x, best.y - f.y) ? q : best);
    return Math.atan2(e.x - f.x, f.y - e.y);
  };
  const s = { t: 0.5, grid: 1, weapon: 'gatling', aimAngle: aimAt(TURRET), fx: [], baseHp: 100, baseMaxHp: 100, railCharges: 0, railMaxCharges: 3, railProgress: 0 } as unknown as TdSnapshot;
  g.save();
  ROAD_PADS.forEach((p, i) => {
    if (towers.some(t => t[0] === i)) return;
    const c = px(p); g.strokeStyle = 'rgba(255,210,74,0.55)'; g.lineWidth = Math.max(1.5, 0.3 * k);
    g.beginPath(); for (let j = 0; j < 6; j++) { const a = j / 6 * Math.PI * 2 + Math.PI / 6; const x = c.x + Math.cos(a) * 3.6 * k, y = c.y + Math.sin(a) * 3.6 * k; j ? g.lineTo(x, y) : g.moveTo(x, y); } g.closePath(); g.stroke();
  });
  aliens.draw(g, snap(enemies, 0.5), flat, 0.5, () => {});
  for (const [pad, kind, level] of towers) machinery.tower(g, { pad: 0, kind, level, angle: aimAt(ROAD_PADS[pad]), charge: 1, firedAt: -9 }, at(ROAD_PADS[pad]), s);
  machinery.base(g, at(TURRET), s, { crankRevs: 0.3 } as BikeState);
  g.restore();
}

/**
 * A painting composed into a live viewport: the field fits between the status rows (`top`) and the HUD (`bottom`)
 * the way the single-road layout will, the painting's overflow fills the rest, and the real sprites sit on top.
 * Landscape turns the field (turret left, hive right). A portrait painting in a landscape viewport is turned with
 * it, so its light falls sideways: fine for checking layout, not lighting.
 */
export async function drawCompose(canvas: HTMLCanvasElement, bg: string, W: number, H: number, top: number, bottom: number, dpr: number, turned: boolean, painting: PaintOrientation) {
  const rotate = turned;
  canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr);
  const g = canvas.getContext('2d')!; g.setTransform(dpr, 0, 0, dpr, 0, 0);
  const pad = 12, area = { x: pad, y: top, w: W - 2 * pad, h: bottom - pad - top };
  const k = rotate ? Math.min(area.h / FIELD_W, area.w / FIELD_H) : Math.min(area.w / FIELD_W, area.h / FIELD_H);
  const ox = rotate ? area.x : area.x + (area.w - FIELD_W * k) / 2;
  const oy = rotate ? area.y + (area.h - FIELD_W * k) / 2 : area.y + area.h - FIELD_H * k;
  const P = (p: Pt) => rotate ? { x: ox + (FIELD_H - p.y) * k, y: oy + p.x * k } : { x: ox + p.x * k, y: oy + p.y * k };
  const img = new Image(); img.src = bg; await img.decode();
  const { x0, y0, x1, y1 } = PAINT_BOXES[painting], a = P({ x: x0, y: y0 }), b = P({ x: x1, y: y1 });
  g.fillStyle = '#0a0e16'; g.fillRect(0, 0, W, H);
  g.save();
  if (painting === 'landscape') { const c = P({ x: x0, y: y1 }); g.drawImage(img, c.x, c.y, (y1 - y0) * k, (x1 - x0) * k); }
  else {
    // The portrait image's x runs along world x and its y along world y; P's rotation carries both.
    g.translate(a.x, a.y); if (rotate) g.transform(0, 1, -1, 0, 0, 0);
    g.drawImage(img, 0, 0, (x1 - x0) * k, (y1 - y0) * k);
  }
  g.restore();
  await drawMock(g, P, k, dpr);
  // Where the painting runs out, if it does: a red frame flags uncovered screen.
  const l = Math.min(a.x, b.x), t = Math.min(a.y, b.y), r = Math.max(a.x, b.x), btm = Math.max(a.y, b.y);
  if (l > 0 || t > 0 || r < W || btm < H) { g.strokeStyle = '#ff3030'; g.lineWidth = 4; g.strokeRect(l, t, r - l, btm - t); }
  return k;
}

/**
 * Where each painted clearing actually is: the centroid of ground lighter than halfway between the clearing's core
 * and the surrounding rock, within 7.5 units of the pad. Offsets and radius in world units.
 */
export function measureClearings(img: HTMLImageElement, o: PaintOrientation, long: number) {
  const { w, h, pxPerUnit: k } = paintSize(o, long);
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const g = c.getContext('2d', { willReadFrequently: true })!; g.drawImage(img, 0, 0, w, h);
  const d = g.getImageData(0, 0, w, h).data;
  const lum = (x: number, y: number) => { const i = (y * w + x) * 4; return 0.3 * d[i] + 0.59 * d[i + 1] + 0.11 * d[i + 2]; };
  return ROAD_PADS.map((p, id) => {
    const { x: cx, y: cy } = worldToPaint(o, p, long), R = 7.5 * k;
    const box = (f: (x: number, y: number, r: number) => void) => {
      for (let y = Math.max(0, Math.floor(cy - R)); y <= Math.min(h - 1, cy + R); y++)
        for (let x = Math.max(0, Math.floor(cx - R)); x <= Math.min(w - 1, cx + R); x++) f(x, y, Math.hypot(x - cx, y - cy) / k);
    };
    let core = 0, nc = 0, rock = 0, nr = 0;
    box((x, y, r) => { if (r < 2.5) { core += lum(x, y); nc++; } else if (r > 6.5 && r < 7.5) { rock += lum(x, y); nr++; } });
    const threshold = (core / nc + rock / nr) / 2;
    let sx = 0, sy = 0, n = 0;
    box((x, y, r) => { if (r <= 7.5 && lum(x, y) > threshold) { sx += x; sy += y; n++; } });
    // Back to world axes: landscape images run world y right-to-left and world x down.
    const ix = (sx / n - cx) / k, iy = (sy / n - cy) / k;
    const [dx, dy] = o === 'portrait' ? [ix, iy] : [iy, -ix];
    return { pad: id, dx: +dx.toFixed(2), dy: +dy.toFixed(2), off: +Math.hypot(dx, dy).toFixed(2), r: +(Math.sqrt(n / Math.PI) / k).toFixed(2) };
  });
}
