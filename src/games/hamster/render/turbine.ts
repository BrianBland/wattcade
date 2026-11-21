// Ferret Turbines: a real ferret in a real tube, turning something you can see turn.
import { TAU, rr } from './draw';
import { ferret } from './critters';
type G = CanvasRenderingContext2D;
type P = { x: number; y: number };

function rotor(g: G, x: number, y: number, r: number, ang: number, blades = 6, color = '#d9dde6') {
  g.save(); g.translate(x, y); g.rotate(ang);
  for (let i = 0; i < blades; i++) {
    g.rotate(TAU / blades);
    g.fillStyle = i % 2 ? color : '#b4bac6';
    g.beginPath(); g.moveTo(r * 0.12, -r * 0.08); g.quadraticCurveTo(r * 0.6, -r * 0.42, r * 0.96, -r * 0.12); g.lineTo(r * 0.92, r * 0.08); g.quadraticCurveTo(r * 0.5, r * 0.02, r * 0.12, r * 0.08); g.closePath(); g.fill();
  }
  g.restore();
  g.fillStyle = '#7a8090'; g.beginPath(); g.arc(x, y, r * 0.16, 0, TAU); g.fill();
  g.fillStyle = '#e7ebf2'; g.beginPath(); g.arc(x - r * 0.04, y - r * 0.04, r * 0.06, 0, TAU); g.fill();
}
function bolt(g: G, x: number, y: number, r: number) {
  g.fillStyle = '#ffd84a'; g.beginPath(); g.moveTo(x + r * 0.2, y - r); g.lineTo(x - r * 0.5, y + r * 0.1); g.lineTo(x, y + r * 0.1); g.lineTo(x - r * 0.2, y + r); g.lineTo(x + r * 0.5, y - r * 0.1); g.lineTo(x, y - r * 0.1); g.closePath(); g.fill();
}
function glassTube(g: G, path: () => void, w: number) {
  g.lineCap = 'round'; g.lineJoin = 'round';
  g.strokeStyle = 'rgba(40,60,80,0.35)'; g.lineWidth = w + 4; path(); g.stroke();
  g.strokeStyle = 'rgba(170,225,255,0.24)'; g.lineWidth = w; path(); g.stroke();
}
function glassShine(g: G, path: () => void, w: number) {
  g.save(); g.translate(0, -w * 0.28); g.strokeStyle = 'rgba(255,255,255,0.45)'; g.lineWidth = Math.max(1.5, w * 0.1); path(); g.stroke(); g.restore();
  g.save(); g.translate(0, w * 0.32); g.strokeStyle = 'rgba(255,255,255,0.12)'; g.lineWidth = Math.max(1, w * 0.06); path(); g.stroke(); g.restore();
}
function bezier(a: P, c1: P, c2: P, b: P) {
  return (p: number): [P, number] => {
    const q = 1 - p;
    const x = q ** 3 * a.x + 3 * q * q * p * c1.x + 3 * q * p * p * c2.x + p ** 3 * b.x, y = q ** 3 * a.y + 3 * q * q * p * c1.y + 3 * q * p * p * c2.y + p ** 3 * b.y;
    const dx = 3 * q * q * (c1.x - a.x) + 6 * q * p * (c2.x - c1.x) + 3 * p * p * (b.x - c2.x), dy = 3 * q * q * (c1.y - a.y) + 6 * q * p * (c2.y - c1.y) + 3 * p * p * (b.y - c2.y);
    return [{ x, y }, Math.atan2(dy, dx)];
  };
}

/**
 * One full-width Ferret Turbine run: a glass pipe wrapped in a copper coil, brass collars,
 * an inline turbine the ferret runs through, and a ferret bounding along inside.
 * The pipe enters at (x, ty) and leaves at (x + w, ty - 1.25·tw); `tw` is the tube width.
 */
export function ferretRun(g: G, x: number, w: number, ty: number, tw: number, t: number, speed: number, stopped: boolean, k = 0, bend = 1) {
  const a = { x, y: ty }, c1 = { x: x + w * 0.35, y: ty - tw * 3.1 * bend }, c2 = { x: x + w * 0.6, y: ty + tw * 2.5 * bend }, b = { x: x + w, y: ty - tw * 1.25 * bend };
  const bez = bezier(a, c1, c2, b), path = () => { g.beginPath(); g.moveTo(a.x, a.y); g.bezierCurveTo(c1.x, c1.y, c2.x, c2.y, b.x, b.y); };
  const turns = Math.max(3, Math.round(w / (tw * 4.5))), n = turns * 10, twist = stopped ? 0 : t * speed * 0.6;
  const coil = (front: boolean) => {
    g.strokeStyle = front ? 'rgba(214,146,92,0.85)' : 'rgba(150,90,50,0.35)'; g.lineWidth = Math.max(1, tw * 0.09); g.lineCap = 'round';
    g.beginPath();
    let pen = false;
    for (let i = 0; i <= n; i++) {
      const p = i / n, th = p * turns * TAU + twist, isFront = Math.cos(th) > 0;
      if (isFront !== front) { pen = false; continue; }
      const [pt, an] = bez(p), off = Math.sin(th) * tw * 0.55, px = pt.x - Math.sin(an) * off, py = pt.y + Math.cos(an) * off;
      if (pen) g.lineTo(px, py); else { g.moveTo(px, py); pen = true; }
    }
    g.stroke();
  };
  coil(false);
  glassTube(g, path, tw);
  const fp = stopped ? 0.3 + k * 0.17 : (t * 0.25 * speed + k * 0.27) % 1;
  const [pos, ang] = bez(fp);
  g.save(); g.translate(pos.x, pos.y); g.rotate(ang); g.translate(0, tw * 0.3);
  ferret(g, 0, 0, tw * 1.5, t * 10 * speed, { noShadow: true, sleep: stopped }, t); g.restore();
  glassShine(g, path, tw);
  coil(true);
  for (const p of w > 200 ? [0.06, 0.32, 0.56, 0.94] : [0.12]) {
    const [cp, ca] = bez(p); g.save(); g.translate(cp.x, cp.y); g.rotate(ca);
    g.fillStyle = '#c99a52'; rr(g, -tw * 0.11, -tw * 0.6, tw * 0.22, tw * 1.2, tw * 0.06); g.fill();
    g.fillStyle = 'rgba(255,240,200,0.45)'; g.fillRect(-tw * 0.07, -tw * 0.56, tw * 0.05, tw * 1.12); g.restore();
  }
  // inline turbine: a brass housing ringed around the pipe, its rotor spun by the passing ferret
  const tp = w > 200 ? 0.74 + (k % 2) * 0.1 : 0.78, [hp, ha] = bez(tp);
  g.save(); g.translate(hp.x, hp.y); g.rotate(ha);
  g.fillStyle = '#8a6a3a'; rr(g, -tw * 0.35, -tw * 0.95, tw * 0.7, tw * 1.9, tw * 0.25); g.fill();
  g.fillStyle = '#c99a52'; g.beginPath(); g.ellipse(tw * 0.2, 0, tw * 0.42, tw * 1.08, 0, 0, TAU); g.fill();
  g.fillStyle = '#20242d'; g.beginPath(); g.ellipse(tw * 0.24, 0, tw * 0.32, tw * 0.88, 0, 0, TAU); g.fill();
  g.save(); g.translate(tw * 0.24, 0); g.scale(0.36, 1); rotor(g, 0, 0, tw * 0.84, stopped ? k : t * 8 * speed + k, 8); g.restore();
  g.strokeStyle = 'rgba(255,240,200,0.6)'; g.lineWidth = Math.max(1, tw * 0.08); g.beginPath(); g.ellipse(tw * 0.2, 0, tw * 0.42, tw * 1.08, 0, Math.PI * 1.1, Math.PI * 1.6); g.stroke();
  g.restore();
  if (!stopped && Math.sin(t * 6 + k * 2.3) > 0.75) bolt(g, hp.x + tw * 0.2, hp.y - tw * 1.6, tw * 0.5);
}

/** Shop icon: one coiled pipe segment with a ferret in it and an inline turbine (56-unit box). */
export function ferretRunIcon(g: G, t: number) {
  ferretRun(g, -6, 70, 34, 18, t, 1, false, 0, 0.25);
}
