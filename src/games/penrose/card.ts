// Arcade card art (keep tiny, no renderer imports): an isometric loop of steps that climbs forever, with the rider's wheel.

/** 230×100 units. */
export function drawCard(g: CanvasRenderingContext2D, w: number, h: number, t: number, color: string): void {
  g.save(); g.scale(w / 230, h / 100);
  const sky = g.createLinearGradient(0, 0, 0, 100); sky.addColorStop(0, '#7FB8F5'); sky.addColorStop(0.6, '#F6E3F1'); sky.addColorStop(1, '#FFF1DA');
  g.fillStyle = sky; g.fillRect(0, 0, 230, 100);
  // iso: x right-down, y left-down, z up
  const P = (x: number, y: number, z: number): [number, number] => [115 + (x - y) * 9, 35 + (x + y) * 5.2 - z * 6];
  const poly = (pts: Array<[number, number]>, c: string) => { g.fillStyle = c; g.beginPath(); pts.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y))); g.closePath(); g.fill(); };
  // the ring of cells, in climbing order; the drop back to the start hides at the far corner
  const ring: Array<[number, number]> = [];
  for (let i = 0; i < 4; i++) ring.push([i, 0]);
  for (let i = 0; i < 4; i++) ring.push([4, i]);
  for (let i = 4; i > 0; i--) ring.push([i, 4]);
  for (let i = 4; i > 0; i--) ring.push([0, i]);
  const top = (k: number) => 0.35 * k, base = -1.5;
  const cells = ring.map((c, k) => ({ x: c[0], y: c[1], z: top(k) })).sort((a, b) => a.x + a.y - (b.x + b.y));
  for (const { x, y, z } of cells) {
    poly([P(x, y + 1, z), P(x + 1, y + 1, z), P(x + 1, y + 1, base), P(x, y + 1, base)], '#B49E7E');
    poly([P(x + 1, y, z), P(x + 1, y + 1, z), P(x + 1, y + 1, base), P(x + 1, y, base)], '#8C7A60');
    poly([P(x, y, z), P(x + 1, y, z), P(x + 1, y + 1, z), P(x, y + 1, z)], '#FBF3E4');
  }
  // the wheel rolls round the top of the steps
  const u = (t * 1.2) % ring.length, k = Math.floor(u), f = u - k, a = ring[k]!, b = ring[(k + 1) % ring.length]!;
  const z = k === ring.length - 1 ? top(k) : top(k) + (top(k + 1) - top(k)) * Math.max(0, f * 2 - 1);
  const [wx, wy] = P(a[0] + (b[0] - a[0]) * f + 0.5, a[1] + (b[1] - a[1]) * f + 0.5, z);
  g.strokeStyle = '#2A2640'; g.lineWidth = 1.6; g.fillStyle = color; g.beginPath(); g.arc(wx, wy - 4.5, 4.5, 0, Math.PI * 2); g.fill(); g.stroke();
  g.beginPath(); g.moveTo(wx, wy - 4.5); g.lineTo(wx + Math.cos(t * 5) * 4, wy - 4.5 + Math.sin(t * 5) * 4); g.stroke();
  g.restore();
}
