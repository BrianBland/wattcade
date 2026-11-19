type G = CanvasRenderingContext2D;
const ink = '#283351';
export function poly(g: G, fill: string, points: number[], stroke = false) {
  g.beginPath();
  g.moveTo(points[0], points[1]);
  for (let i = 2; i < points.length; i += 2) g.lineTo(points[i], points[i + 1]);
  g.closePath();
  g.fillStyle = fill;
  g.fill();
  if (stroke) {
    g.strokeStyle = ink;
    g.lineWidth = 2;
    g.lineJoin = 'round';
    g.stroke();
  }
}
function oval(g: G, x: number, y: number, w: number, h: number, color: string) {
  g.beginPath();
  g.ellipse(x, y, w, h, 0, 0, Math.PI * 2);
  g.fillStyle = color;
  g.fill();
}

function loadArt() {
  const load = (file: string) => {
    const img = new Image();
    img.src = '/scrapjet/' + file + '.webp';
    return img;
  };
  return {
    yard: load('magnet-mile'),
    rider: load('number-seven'),
    rivals: [0, 1, 2].map((i) => load('rival-' + i)),
  };
}
let paintings: ReturnType<typeof loadArt> | undefined;
export function art() {
  return (paintings ??= loadArt());
}
export function panorama(g: G, w: number, h: number, turn: number) {
  const { yard } = art();
  g.fillStyle = '#985657';
  g.fillRect(0, 0, w, h);
  if (!yard.naturalWidth) return;
  const scale = Math.max((w * 1.12) / yard.naturalWidth, h / yard.naturalHeight);
  const width = yard.naturalWidth * scale,
    height = yard.naturalHeight * scale;
  g.drawImage(yard, (w - width) * (0.5 + 0.18 * turn), (h - height) * 0.3, width, height);
}

export function splat(g: G, x: number, y: number, r: number, stretch = 1) {
  g.save();
  g.translate(x, y);
  g.scale(r * stretch, r);
  g.beginPath();
  g.moveTo(-0.8, -0.1);
  g.bezierCurveTo(-1.36, -0.47, -1, -0.77, -0.65, -0.54);
  g.bezierCurveTo(-0.12, -0.24, -0.6, -1.18, -0.21, -1.08);
  g.bezierCurveTo(0.02, -1, 0.14, -0.34, 0.45, -0.63);
  g.bezierCurveTo(0.92, -1.02, 0.99, -0.75, 0.69, -0.32);
  g.bezierCurveTo(0.36, 0.02, 1.12, -0.12, 1.04, 0.18);
  g.bezierCurveTo(0.92, 0.48, 0.43, 0.23, 0.39, 0.51);
  g.bezierCurveTo(0.32, 1.14, 0.03, 0.99, -0.1, 0.62);
  g.bezierCurveTo(-0.25, 0.18, -0.76, 0.94, -0.92, 0.63);
  g.bezierCurveTo(-1.05, 0.4, -0.42, 0.16, -0.8, -0.1);
  g.closePath();
  g.fillStyle = '#c9ef35';
  g.fill();
  g.lineWidth = 0.045;
  g.strokeStyle = '#4b363c';
  g.stroke();
  oval(g, -1.06, 0.32, 0.105, 0.08, '#d7f33d');
  oval(g, 0.78, 0.56, 0.08, 0.07, '#c4dc2e');
  oval(g, -0.25, -0.24, 0.22, 0.09, '#ffffa3');
  oval(g, 0.23, 0.4, 0.14, 0.06, '#769626');
  g.restore();
}
export function glob(g: G, x: number, y: number, r: number) {
  oval(g, x + r * 1.4, y + r * 0.62, r * 0.25, r * 0.17, '#B9DC2B');
  oval(g, x + r * 0.78, y + r * 0.34, r * 0.5, r * 0.31, '#badf30');
  oval(g, x, y, r, r * 0.84, '#40532e');
  oval(g, x - r * 0.05, y - r * 0.12, r * 0.94, r * 0.74, '#c1ef28');
  oval(g, x - r * 0.31, y - r * 0.39, r * 0.27, r * 0.12, '#ffffaf');
}
export function drum(g: G) {
  poly(g, '#282136', [-12, -26, 11, -26, 13, -7, 9, -3, -10, -3, -14, -7], true);
  g.fillStyle = '#c2f43b';
  g.fillRect(-11, -22, 22, 13);
  poly(g, '#522643', [0, -22, 5, -16, 4, -12, 0, -11, -4, -13, -4, -16]);
  oval(g, -1, -26, 12, 3, '#ffefb5');
}
export function jet(
  g: G,
  x: number,
  y: number,
  size: number,
  bank: number,
  boost: boolean,
  stickySeconds: number,
  t: number,
  pilot = -1,
) {
  const sheets = art(),
    bike = pilot < 0 ? sheets.rider : sheets.rivals[pilot];
  if (!bike.width) return;
  g.save();
  g.translate(x, y);
  g.scale(size, size);
  oval(g, 0, 5, 33, 6, '#231b3490');
  g.translate(0, -5 + Math.sin(t * 9 + pilot) * 1.5);
  g.rotate(bank);
  const plume = boost ? 34 : 13;
  const flame = g.createLinearGradient(0, -7, 0, plume + 4);
  flame.addColorStop(0, stickySeconds > 0 ? '#c3f555' : '#b3ffff');
  flame.addColorStop(0.45, '#30e0cebf');
  flame.addColorStop(1, '#58c4fc00');
  g.fillStyle = flame;
  g.beginPath();
  g.moveTo(-8, -8);
  g.quadraticCurveTo(-7, 4, 0, plume + Math.sin(t * 39) * 3);
  g.quadraticCurveTo(9, 2, 8, -8);
  g.fill();
  poly(g, '#fff6cd', [-4, -5, 4, -5, 0, plume * 0.63]);
  const height = 106,
    width = (height * bike.width) / bike.height;
  g.drawImage(bike, -width / 2, -height, width, height);
  if (stickySeconds > 0) {
    const burstAge = (pilot < 0 ? 8 : 4) - stickySeconds;
    if (burstAge >= 0 && burstAge < 0.5) {
      g.save();
      g.globalAlpha = 1 - burstAge * 2;
      for (let i = 0; i < 9; i++) {
        const angle = i * 2.4,
          travel = burstAge * (58 + i * 4);
        oval(
          g,
          Math.cos(angle) * travel,
          -17 + Math.sin(angle) * travel + burstAge * burstAge * 46,
          3,
          2,
          '#dcff42',
        );
      }
      g.restore();
    }
    splat(g, 0, -12, 14, 1.4);
    splat(g, -19, -27, 7);
    oval(g, 7, -3, 2.5, 6 + 2 * Math.sin(t * 5), '#c2ef3c');
  }
  g.restore();
}
export function drawCard(g: G, w: number, h: number, t: number) {
  panorama(g, w, h, Math.sin(t * 0.2));
  poly(g, '#443341', [0, h, w * 0.44, h * 0.51, w * 0.51, h * 0.51, w, h]);
  poly(g, '#e8a036', [0, h, w * 0.44, h * 0.51, w * 0.448, h * 0.51, w * 0.08, h]);
  jet(g, w * 0.47, h * 0.93, h * 0.0065, -0.1, true, 0, t);
}

// Repeating print texture anchored to the course. Bake once so grit and tyre marks
// travel under the jet instead of flickering independently from frame to frame.
export function roadSurface() {
  const tile = document.createElement('canvas');
  tile.width = 768;
  tile.height = 512;
  const g = tile.getContext('2d')!;
  let seed = 109;
  const random = () => {
    seed = (Math.imul(1664525, seed) + 1013904223) >>> 0;
    return seed / 4294967296;
  };
  g.fillStyle = '#654847';
  g.fillRect(0, 0, 768, 512);
  for (let i = 0; i < 18000; i++) {
    g.fillStyle = i % 3 ? '#30272e45' : '#d6987560';
    g.fillRect(random() * 768, random() * 512, 1 + random() * 3, 1 + random() * 4);
  }
  for (let i = 0; i < 12; i++) {
    const x = random() * 768;
    g.beginPath();
    g.moveTo(x, 0);
    g.bezierCurveTo(x + 35, 160, x - 20, 360, x, 512);
    g.strokeStyle = '#392b3138';
    g.lineWidth = 2 + random() * 8;
    g.stroke();
  }
  return tile;
}
