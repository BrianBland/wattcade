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

export function jet(g: G, x: number, y: number, size: number, bank: number, boost: boolean, t: number) {
  const bike = art().rider;
  if (!bike.width) return;
  g.save();
  g.translate(x, y);
  g.scale(size, size);
  oval(g, 0, 5, 33, 6, '#231b3490');
  g.translate(0, -5 + Math.sin(t * 9) * 1.5);
  g.rotate(bank);
  const plume = boost ? 34 : 13;
  const flame = g.createLinearGradient(0, -7, 0, plume + 4);
  flame.addColorStop(0, '#b3ffff');
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
  g.restore();
}
export function drawCard(g: G, w: number, h: number, t: number) {
  panorama(g, w, h, Math.sin(t * 0.2));
  poly(g, '#443341', [0, h, w * 0.44, h * 0.51, w * 0.51, h * 0.51, w, h]);
  poly(g, '#e8a036', [0, h, w * 0.44, h * 0.51, w * 0.448, h * 0.51, w * 0.08, h]);
  jet(g, w * 0.47, h * 0.93, h * 0.0065, -0.1, true, t);
}
