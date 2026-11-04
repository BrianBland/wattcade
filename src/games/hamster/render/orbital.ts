// The same homemade power company, at increasingly unreasonable scales.
import { FONT, TAU, rr } from './draw';
type G = CanvasRenderingContext2D;

export function satellite(g: G, x: number, y: number, size: number, angle: number, kind: 'solar' | 'cargo' | 'station' = 'solar') {
  g.save(); g.translate(x, y); g.rotate(angle); g.scale(size / 60, size / 60);
  g.strokeStyle = '#c7bca4'; g.lineWidth = 2;
  g.beginPath(); g.moveTo(-25, 0); g.lineTo(25, 0); g.stroke();
  for (const side of [-1, 1]) {
    const xx = side < 0 ? -29 : 12;
    g.fillStyle = '#35475e'; g.fillRect(xx, -12, 17, 24); g.strokeRect(xx, -12, 17, 24);
    g.strokeStyle = '#829fac'; g.lineWidth = .7;
    for (let i = 1; i < 4; i++) { g.beginPath(); g.moveTo(xx, -12 + i * 6); g.lineTo(xx + 17, -12 + i * 6); g.stroke(); }
    g.beginPath(); g.moveTo(xx + 8, -12); g.lineTo(xx + 8, 12); g.stroke(); g.strokeStyle = '#c7bca4'; g.lineWidth = 2;
  }
  g.fillStyle = kind === 'cargo' ? '#b88c59' : '#e2d6b4'; rr(g, -10, -15, 20, 30, 4); g.fill(); g.stroke();
  g.fillStyle = '#5b6b79'; g.beginPath(); g.arc(0, -3, 6, 0, TAU); g.fill();
  g.fillStyle = '#e4ba6f'; g.fillRect(-5, 7, 10, 3);
  g.beginPath(); g.moveTo(0, -15); g.lineTo(5, -23); g.stroke();
  if (kind === 'station') { g.strokeStyle = '#d7b479'; g.lineWidth = 3; g.beginPath(); g.ellipse(0, 0, 16, 25, -.3, 0, TAU); g.stroke(); }
  g.restore();
}

export function shippingLabel(g: G, x: number, y: number, width: number, title: string, sub: string) {
  g.save(); g.translate(x, y);
  g.fillStyle = 'rgba(25,23,36,.93)'; rr(g, 0, 0, width, 53, 7); g.fill();
  g.strokeStyle = '#8d7e65'; g.lineWidth = 1; g.stroke();
  g.fillStyle = '#d2b779'; g.fillRect(9, 9, 3, 34);
  g.font = `800 12px ${FONT}`; g.fillText(title, 21, 22, width - 31);
  g.fillStyle = '#c5bcd0'; g.font = `500 10px ${FONT}`; g.fillText(sub, 21, 39, width - 31);
  g.restore();
}

/** Draw a small arrival along a shipping lane, not a screen-covering celebration. */
export function cargoArrival(g: G, x: number, y: number, progress: number) {
  if (progress <= 0) return;
  g.save(); g.globalAlpha *= Math.min(1, progress * 5);
  satellite(g, x + progress * 55, y, 38, -.12, 'cargo');
  g.restore();
}
