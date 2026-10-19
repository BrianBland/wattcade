import { hash01 } from '../sim/terrain';
import { rect, type G } from './paint';

type Point = [number, number];
const path = (g: G, points: Point[]) => {
  g.beginPath();
  points.forEach(([x, y], i) => i ? g.lineTo(Math.round(x), Math.round(y)) : g.moveTo(Math.round(x), Math.round(y)));
  g.closePath();
};
const face = (g: G, color: string, points: Point[]) => {
  g.fillStyle = color; path(g, points); g.fill();
};

/** A broken piece of terrain: overlapping broad rock chunks establish a loose
 * downward taper. Faces stop at shelves and neighbouring chunks, with only the
 * central fragment reaching the deepest tip. Avoid a fan of crystal facets. */
export function jaggedSkyRock(g: G, left: number, width: number, top: (x: number) => number, seed: number, depth: number, near = false) {
  const colors = near ? ['#77717c', '#595765', '#98918e'] : ['#a39bc1', '#8f86b0', '#b4acce'];
  const lean = (hash01(seed * 37 + 11) - .5) * .23;
  const point = (u: number, d: number): Point => {
    const warped = u + Math.sin(u * Math.PI) * lean * (.35 + d * .65);
    const x = left + warped * width;
    const uneven = 1 + (hash01(seed * 41 + Math.floor(u * 9)) - .5) * .28;
    return [x, top(x) + d * depth * uneven];
  };
  const points = (coords: Point[]) => coords.map(([u, d]) => point(u, d));
  // Large shoulders, deep clefts and three unequal hanging fragments. The
  // silhouette tapers overall, but it is not a mathematically trimmed triangle.
  const bottom: Point[] = [
    [0,.06],[.055,.22],[.10,.25],[.14,.39],[.19,.31],
    [.24,.53],[.29,.64],[.34,.54],[.365,.39],
    [.405,.72],[.45,.79],[.49,1],[.535,.92],[.58,.72],
    [.62,.52],[.66,.59],[.70,.73],[.75,.57],[.79,.43],
    [.82,.47],[.86,.25],[.90,.33],[.955,.15],[1,.06],
  ];
  const outline = points([[0,0],[1,0],...bottom.slice().reverse()]);
  face(g, colors[0], outline);
  g.save(); path(g, outline); g.clip();
  // Back/right cliff: a substantial plane with its own broken shoulder and tip.
  face(g, colors[1], points([
    [.65,0],[1,0],[1,1],[.69,1],[.62,.61],[.69,.43],[.66,.26],
  ]));
  // Left exposed block ends at a shelf well above the deepest central fragment.
  face(g, colors[2], points([
    [0,0],[.27,0],[.34,.13],[.29,.28],[.32,.42],
    [.29,.64],[.24,.53],[.19,.31],[.14,.39],[.055,.22],
  ]));
  // A second, offset chunk overlaps that shelf rather than sharing its apex.
  face(g, colors[0], points([
    [.21,.02],[.43,0],[.47,.19],[.405,.31],[.43,.48],
    [.365,.60],[.34,.54],[.365,.39],[.29,.38],
  ]));
  // Central fragment: a broad knee, a short ledge, then an unequal pointed end.
  face(g, colors[2], points([
    [.40,.16],[.55,.10],[.61,.27],[.56,.42],[.58,.56],
    [.535,.92],[.49,1],[.45,.79],[.405,.72],[.43,.48],[.405,.31],
  ]));
  face(g, colors[0], points([
    [.55,.10],[.61,.27],[.56,.42],[.58,.56],
    [.535,.92],[.49,1],[.48,.72],[.52,.48],[.50,.32],
  ]));
  // A shorter front/right fragment obscures part of the central block.
  face(g, colors[0], points([
    [.63,.15],[.82,.12],[.86,.25],[.82,.47],
    [.79,.43],[.75,.57],[.70,.73],[.66,.59],[.62,.52],[.68,.37],
  ]));
  face(g, colors[2], points([
    [.63,.15],[.70,.17],[.72,.33],[.68,.37],
    [.70,.53],[.70,.73],[.66,.59],[.62,.52],
  ]));
  // Two quiet broken ledges establish rock joints without outlining every face.
  face(g, colors[1], points([[.23,.27],[.31,.29],[.40,.25],[.43,.29],[.32,.32]]));
  face(g, colors[1], points([[.57,.40],[.65,.36],[.73,.39],[.68,.42],[.60,.44]]));
  g.restore();

  // Soil and sod drape over the cliff at varied depths, tying the rock mass to
  // the garden. Positions are world-seeded, so the lip stays stable in motion.
  for (let i = 0; i < 8; i++) {
    const u = (i + .15 + hash01(seed * 13 + i) * .45) / 8;
    const [x, y] = point(u, 0), span = Math.max(2, width * (.035 + hash01(seed * 23 + i) * .035));
    const drop = 2 + hash01(seed * 17 + i * 7) * (near ? 7 : 5);
    rect(g, near ? '#727f58' : '#99aa82', x, y, span, drop);
    rect(g, near ? '#92a66b' : '#adc18e', x, y, span, Math.max(1, drop * .4));
  }
}
