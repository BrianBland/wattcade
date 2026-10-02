import type { G } from './biomes';

export interface RiderLook { jersey: string; helmet: 'road' | 'bubble' | 'scuba' }

type P = [number, number];
const line = (g: G, c: string, w: number, ...pts: P[]) => {
  g.strokeStyle = c; g.lineWidth = w; g.lineCap = 'round'; g.lineJoin = 'round';
  g.beginPath(); g.moveTo(pts[0][0], pts[0][1]); for (const p of pts.slice(1)) g.lineTo(p[0], p[1]); g.stroke();
};
/** Two-bone leg: knee bends forward (+x). */
function knee(h: P, p: P, l1: number, l2: number): P {
  const dx = p[0] - h[0], dy = p[1] - h[1];
  const dist = Math.min(l1 + l2 - 0.01, Math.max(0.1, Math.hypot(dx, dy)));
  const a = Math.atan2(dy, dx);
  const b = Math.acos(Math.min(1, Math.max(-1, (l1 * l1 + dist * dist - l2 * l2) / (2 * l1 * dist))));
  return [h[0] + l1 * Math.cos(a - b), h[1] + l1 * Math.sin(a - b)];
}
function wheel(g: G, x: number, y: number, r: number, spin: number) {
  g.strokeStyle = '#1b1b22'; g.lineWidth = 1.6; g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.stroke();
  g.strokeStyle = '#c8c8d0'; g.lineWidth = 0.6;
  for (let i = 0; i < 3; i++) {
    const a = spin + (i * Math.PI) / 3;
    g.beginPath(); g.moveTo(x - Math.cos(a) * r, y - Math.sin(a) * r); g.lineTo(x + Math.cos(a) * r, y + Math.sin(a) * r); g.stroke();
  }
}

/**
 * Side-on rider drawn around the rear/front wheel contact midpoint (0,0), facing +x, ~24 px tall.
 * `crank` in revolutions, `wheelM` metres travelled (spins the wheels), `t` seconds (scuba bubbles).
 */
export function drawRider(g: G, look: RiderLook, crank: number, wheelM: number, t = 0) {
  const r = 4.5, spin = wheelM / 0.34;
  const bb: P = [0, -5], hip: P = [-3, -14], sh: P = [3, -20], head: P = [5.2, -23];
  const th = crank * Math.PI * 2, cr = 2.8;
  const pedal = (a: number): P => [bb[0] + Math.cos(a) * cr, bb[1] + Math.sin(a) * cr];
  const leg = (a: number, c: string, sock: string) => {
    const p = pedal(a), k = knee(hip, p, 6.4, 6.6);
    line(g, c, 2.2, hip, k); line(g, sock, 2, k, p); line(g, '#222', 1.6, [p[0] - 1, p[1]], [p[0] + 1.2, p[1]]);
  };
  if (look.helmet === 'scuba') { // air tank on the back
    g.fillStyle = '#e8e8f0'; g.beginPath(); g.ellipse(-2.6, -18.6, 1.8, 4.2, -0.9, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#ffb020'; g.fillRect(-4.5, -21.8, 2, 1);
  }
  leg(th + Math.PI, '#15151c', '#c49a6c');               // far leg
  wheel(g, -7, -r, r, spin); wheel(g, 7, -r, r, spin);
  line(g, '#d8dbe6', 1.3, [-7, -r], bb, [-3.2, -12.5], [-7, -r]); // rear triangle + seat tube
  line(g, '#d8dbe6', 1.3, bb, [5, -12], [-3.2, -12.5]);          // down + top tube
  line(g, '#d8dbe6', 1.3, [5, -12], [7, -r]);                    // fork
  line(g, '#333', 1.4, [-4.5, -13.2], [-1.8, -13.2]);            // saddle
  line(g, '#333', 1.3, [5, -12], [6.6, -13.6], [7.4, -12.4]);    // stem + drop
  line(g, '#999', 0.8, bb, pedal(th));                           // crank
  leg(th, '#22222b', '#f1c27d');                                 // near leg
  line(g, look.jersey, 3.4, hip, sh);                            // torso
  line(g, '#f1c27d', 1.6, sh, [5.6, -16.4], [6.8, -13.6]);       // arm
  line(g, look.jersey, 2, sh, [4.6, -17.8]);                     // sleeve
  g.fillStyle = '#f1c27d'; g.beginPath(); g.arc(head[0], head[1], 2.4, 0, Math.PI * 2); g.fill();
  if (look.helmet === 'scuba') {
    g.fillStyle = '#1b1b22'; g.beginPath(); g.ellipse(head[0] - 0.3, head[1] - 1.2, 2.8, 1.8, 0, Math.PI, 0); g.fill(); // hood
    g.fillStyle = '#7fe0ff'; g.fillRect(head[0] + 0.4, head[1] - 1.2, 2.6, 1.6);                                     // mask
    g.strokeStyle = '#1b1b22'; g.lineWidth = 0.8; g.beginPath(); g.moveTo(head[0] + 1.6, head[1] + 1.4); g.lineTo(-2, -17); g.stroke(); // hose
    g.fillStyle = '#d8f6ffcc';
    for (let i = 0; i < 3; i++) { const a = ((t * 0.9 + i / 3) % 1); g.fillRect(Math.round(head[0] + 2 + Math.sin(a * 9 + i) * 1.5), Math.round(head[1] - 4 - a * 14), a > 0.6 ? 2 : 1, a > 0.6 ? 2 : 1); }
  } else if (look.helmet === 'bubble') {
    g.fillStyle = '#d7f1ff55'; g.strokeStyle = '#e8f6ff'; g.lineWidth = 0.8;
    g.beginPath(); g.arc(head[0], head[1], 4, 0, Math.PI * 2); g.fill(); g.stroke();
    g.fillStyle = '#ffffffaa'; g.fillRect(head[0] + 1, head[1] - 3, 1.2, 1.2);
  } else {
    g.fillStyle = '#f5f5fa'; g.beginPath(); g.ellipse(head[0] - 0.4, head[1] - 1.4, 3, 2, -0.2, Math.PI, 0); g.fill();
    g.fillStyle = look.jersey; g.fillRect(head[0] - 2.4, head[1] - 2.6, 4.4, 0.9);
  }
}
