// Paint guides for the single-road background, and an overlay check for a finished painting.
// td-sketch.html?guide=portrait|landscape            flat-colour guide at the painting's pixel size
// td-sketch.html?guide=portrait&check=/path/to.webp   the painting with the sim's road, pads and apron on top
import { FIELD_H, FIELD_W, PAD_R, PAINT_BOX, paintSize, ROAD, ROAD_HALF_WIDTH, ROAD_PADS, SHOULDER, HIVE_MOUTH, TURRET, TURRET_R, worldToPaint, type PaintOrientation, type Pt } from '../src/games/towerdefense/sim/road';

export const GUIDE_COLORS = {
  sides: '#5c5c66', field: '#80808a', hive: '#6b3d8c', deepHive: '#43215e', yard: '#4f6170',
  shoulder: '#9a7448', road: '#dcb47e', mouth: '#1e0b2a', pad: '#3fae6a', apron: '#d8a630', safe: '#ffffff',
};

export async function drawGuide(canvas: HTMLCanvasElement, o: PaintOrientation, check: string | null, long = 1536) {
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
  const { x0, y0, x1, y1 } = PAINT_BOX;
  const safe = () => {
    const a = P({ x: 0, y: 0 }), b = P({ x: FIELD_W, y: FIELD_H });
    g.strokeStyle = GUIDE_COLORS.safe; g.lineWidth = 3; g.setLineDash([14, 10]);
    g.strokeRect(Math.min(a.x, b.x), Math.min(a.y, b.y), Math.abs(b.x - a.x), Math.abs(b.y - a.y)); g.setLineDash([]);
  };

  if (check) {
    const img = new Image(); img.src = check; await img.decode();
    g.drawImage(img, 0, 0, w, h);
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
  g.fillStyle = GUIDE_COLORS.pad; for (const p of ROAD_PADS) { circle(p, PAD_R + 1); g.fill(); }
  safe();
}
