import type { JerseyLook } from '../types';
import { circle, line, poly, quad, rect, shade, TAU, type G, type P } from './prims';

/**
 * A broad, tapered jersey with a shoulder and a distinct hem. Drawn in a local frame:
 * u along the torso (0 = hip … L = shoulder), v across it (−w/2 = back … +w/2 = chest).
 */
export function drawTorso(g: G, j: JerseyLook, hip: P, sh: P, t: number) {
  const L = Math.hypot(sh[0] - hip[0], sh[1] - hip[1]) + 0.6, w = 5.4;
  g.save();
  g.translate(hip[0], hip[1]); g.rotate(Math.atan2(sh[1] - hip[1], sh[0] - hip[0]));
  g.beginPath();
  const outline: P[] = [[-0.4, -1.7], [1.2, -2.2], [L - 1.8, -2.7], [L, -1.6],
    [L, 1.5], [L - 1.8, 2.7], [1, 2.1], [-0.4, 1.4]];
  g.moveTo(...outline[0]); for (const p of outline.slice(1)) g.lineTo(...p);
  g.closePath(); g.clip();
  g.fillStyle = j.base; g.fillRect(-1, -w, L + 2, 2 * w);
  pattern(g, j, L, w, t);
  // Two flat trim shapes give plain jerseys structure without adding texture.
  g.fillStyle = shade(j.base, 0.8); g.fillRect(-0.4, -w, 0.8, w * 2);
  g.fillStyle = shade(j.base, 0.9); g.fillRect(-0.4, -w / 2, L + 1, 0.5);
  g.restore();
}

/** Thigh (shorts) and shin colours. */
export function legsOf(j: JerseyLook): { thigh: string; shin: string | null } {
  if (j.pattern === 'overalls') return { thigh: j.ink, shin: j.ink };
  if (j.pattern === 'pajamas') return { thigh: j.base, shin: j.base };
  if (j.pattern === 'tux') return { thigh: '#15151c', shin: '#15151c' };
  if (j.pattern === 'suit') return { thigh: j.base, shin: j.base };
  return { thigh: '#22222b', shin: null };
}

/** A cape behind the rider, streaming back from the shoulder (superhero jersey). */
export function drawCape(g: G, j: JerseyLook, sh: P, t: number, speed: number) {
  if (j.pattern !== 'cape') return;
  const flow = Math.min(1, speed / 8), wave = Math.sin(t * 9) * (0.6 + flow);
  const tip: P = [sh[0] - 6 - 5 * flow, sh[1] + 9 - 6 * flow + wave];
  g.fillStyle = j.ink; g.beginPath(); g.moveTo(sh[0] + 0.5, sh[1] - 0.6);
  g.quadraticCurveTo(sh[0] - 4, sh[1] + 1 + wave * 0.5, tip[0], tip[1]);
  g.lineTo(tip[0] + 2.2, tip[1] + 2.2); g.quadraticCurveTo(sh[0] - 2, sh[1] + 6, sh[0] - 0.6, sh[1] + 2.5); g.closePath(); g.fill();
}

function pattern(g: G, j: JerseyLook, L: number, w: number, t: number) {
  const ink = j.ink, h = w / 2;
  const hoops = (step: number, width: number, c = ink, from = 0.5) => { for (let u = from; u < L; u += step) { g.fillStyle = c; g.fillRect(u, -w, width, 2 * w); } };
  const along = (vs: number[], width: number, c = ink) => { for (const v of vs) { g.fillStyle = c; g.fillRect(-1, v - width / 2, L + 2, width); } };
  switch (j.pattern) {
    case 'plain': line(g, shade(j.base, 0.75), 0.5, [L - 0.6, -h], [L - 0.6, h]); break;
    case 'vstripes': along([-1.25, 1.1], 0.8); break;
    case 'hoops': hoops(1.8, 0.8); break;
    case 'bee': hoops(2, 1); break;
    case 'lighthouse': hoops(2.2, 1.1); break;
    case 'dots': for (const [u, v] of [[1.6, -1], [4.2, 1.1], [6.7, -1.1]]) circle(g, ink, u, v, 0.9); break;
    case 'rainbow': ['#2a5bd7', '#e8322b', '#15151c', '#ffd400', '#22b14c'].forEach((c, i) => { g.fillStyle = c; g.fillRect(1.6 + i * 0.95, -w, 0.95, 2 * w); }); break;
    case 'band': hoops(99, 1.2, ink, L * 0.5); break;
    case 'checker': for (let u = 0, i = 0; u < L; u += 2, i++) for (let v = -h, k = 0; v < h; v += 2, k++) if ((i + k) % 2) { g.fillStyle = ink; g.fillRect(u, v, 2, 2); } break;
    case 'sash': g.save(); g.rotate(-0.55); g.fillStyle = ink; g.fillRect(-2, -0.7, L + 4, 1.4); g.restore(); break;
    case 'hazard': for (let u = -w; u < L + w; u += 1.8) poly(g, ink, [u, -h], [u + 0.9, -h], [u + 0.9 + w, h], [u + w, h]); break;
    case 'tiger': for (let u = 0.6; u < L; u += 1.6) poly(g, ink, [u, -h], [u + 0.5, -h], [u + 1.2, 0], [u + 0.3, -0.4]); break;
    case 'zebra': for (let u = 0.4; u < L; u += 1.5) quad(g, ink, 0.55, [u, -h], [u + 1, 0], [u, h]); break;
    case 'camo': [[1, -0.6, 1.2], [3, 0.8, 1], [5.2, -0.4, 1.3], [7, 0.9, 0.9], [2.2, 1.4, 0.7]].forEach(([u, v, r]) => circle(g, ink, u, v, r)); break;
    case 'galaxy': {
      poly(g, shade(ink, 0.65), [0, -h], [L * 0.7, -h], [L, h], [L * 0.4, h]);
      star(g, '#ffffff', 2, -0.8, 0.8); star(g, '#ffffff', 5.9, 1, 0.6);
      break;
    }
    case 'stars': star(g, ink, 2.1, -0.7, 1.2); star(g, ink, 5.7, 0.9, 1); break;
    case 'tux': g.fillStyle = ink; g.fillRect(-1, h - 1.2, L + 2, 1.2); poly(g, '#e8322b', [L - 1.2, h - 0.9], [L - 0.4, h - 0.3], [L - 1.2, h + 0.2]); break;
    case 'cape': circle(g, ink, L * 0.6, 0.4, 1.3); break; // emblem
    case 'floral': [[1.5, -0.9], [4.1, 1], [6.7, -.8]].forEach(([u, v]) => { for (let k = 0; k < 4; k++) circle(g, ink, u + Math.cos(k * 1.57) * 0.75, v + Math.sin(k * 1.57) * 0.75, 0.55); circle(g, '#ffe066', u, v, 0.4); }); break;
    case 'retro': g.fillStyle = ink; g.fillRect(L * 0.5, -w, 1.6, 2 * w); g.fillRect(L - 0.8, -w, 0.8, 2 * w); break;
    case 'mail': for (let u = 0.4; u < L; u += 0.9) for (let v = -h; v < h + 1; v += 0.9) { g.strokeStyle = ink; g.lineWidth = 0.22; g.beginPath(); g.arc(u, v + (Math.round(u / 0.9) % 2) * 0.45, 0.45, 0, Math.PI); g.stroke(); } break;
    case 'bones': line(g, ink, 0.45, [0.4, 0.3], [L - 0.5, 0.3]); for (let u = 1.6; u < L - 1; u += 1.2) line(g, ink, 0.35, [u, -h + 0.5], [u + 0.4, h - 0.5]); break;
    case 'suit': line(g, ink, 0.3, [0, h - 0.8], [L, h - 0.8]); circle(g, ink, L * 0.62, -0.4, 0.7); break;
    case 'hamster': circle(g, ink, L * 0.55, 0.3, 1.3); circle(g, ink, L * 0.55 + 1.1, -0.6, 0.45); circle(g, ink, L * 0.55 + 1.1, 1.2, 0.45); circle(g, '#3a2410', L * 0.55 + 0.4, -0.2, 0.2); circle(g, '#3a2410', L * 0.55 + 0.4, 0.8, 0.2); break;
    case 'coat': g.fillStyle = ink; g.fillRect(L * 0.3, h - 1.4, 1.2, 1); for (let u = 1; u < L; u += 1.8) circle(g, '#9a9aa8', u, h - 0.4, 0.22); break;
    case 'eq': for (let i = 0; i < 6; i++) { const lvl = 0.5 + 0.5 * Math.abs(Math.sin(t * (3 + i) + i)); g.fillStyle = ink; g.fillRect(0.3, -h + i * (w / 6), (L - 0.6) * lvl, w / 6 - 0.15); } break;
    case 'disco': for (let u = 0, i = 0; u < L; u += 1.5, i++) for (let v = -h, k = 0; v < h; v += 1.5, k++) { const f = Math.sin(t * 6 + i * 1.7 + k * 2.3); g.fillStyle = f > 0.7 ? ink : shade(j.base, f > 0 ? 1 : 0.7); g.fillRect(u, v, 1.4, 1.4); } break;
    case 'waves': for (let u = 0.8; u < L; u += 1.6) { g.strokeStyle = ink; g.lineWidth = 0.4; g.beginPath(); for (let v = -h; v <= h; v += 0.4) g.lineTo(u + Math.sin(v * 2.2 + t * 2) * 0.35, v); g.stroke(); } break;
    case 'overalls': g.fillStyle = ink; g.fillRect(-1, -w, L * 0.55 + 1, 2 * w); g.fillRect(L * 0.5, -0.2, L, 0.6); break;
    case 'argyle': for (let u = -1; u < L; u += 2) for (const v of [-h, 0, h]) poly(g, ink, [u, v], [u + 1, v - 0.9], [u + 2, v], [u + 1, v + 0.9]); break;
    case 'tiedye': ['#dd658f', '#edbb56', '#64bca4'].forEach((col, i) => circle(g, col, L * 0.5, 0, 4 - i * 1.2)); break;
    case 'leopard': for (const [u, v] of [[1, -0.7], [2.6, 0.8], [4.2, -0.3], [5.8, 0.9], [7.2, -0.8], [3.4, -1.2]]) { g.strokeStyle = ink; g.lineWidth = 0.32; g.beginPath(); g.arc(u, v, 0.5, 0.3, TAU - 0.4); g.stroke(); } break;
    case 'plaid': g.globalAlpha *= 0.7; along([-1, 0.9], 0.6); hoops(2, 0.6); g.globalAlpha /= 0.7; break;
    case 'pajamas': along([-1.2, 0.2], 0.25); for (let u = 1.2; u < L; u += 2) circle(g, '#ffffff', u, h - 0.5, 0.25); break;
    case 'circuit': line(g, ink, 0.6, [0.5, -1.3], [3, -1.3], [4, 1], [7, 1]); circle(g, ink, 3, -1.3, 0.65); circle(g, ink, 7, 1, 0.65); break;
    case 'neon': along([-1.4, 1.4], 0.5); hoops(2.8, 0.5); break;
    case 'marble': quad(g, ink, 0.25, [0, -1.2], [3, 1], [L, -0.4]); quad(g, ink, 0.18, [2, 1.6], [5, -1.4], [L, 1.2]); break;
    case 'royal': g.fillStyle = ink; g.fillRect(L - 1.5, -w, 1.5, 2 * w); for (const v of [-1, 0.4]) circle(g, '#15151c', L - 0.8, v, 0.2); break;
    case 'embers': for (let i = 0; i < 5; i++) { const u = 0.6 + (i * 1.7) % (L - 1), v = -h + 0.6 + ((i * 1.3) % (2 * h - 1)); circle(g, ink, u, v, 0.35 + (i % 3) * 0.2); circle(g, '#ff8a1a', u + 0.5, v + 0.4, 0.2); } break;
    case 'scrap': for (let u = 0.4; u < L; u += 1.6) for (let v = -h + 0.3; v < h; v += 1.4) rect(g, ink, u, v, 0.9, 0.7); break;
    case 'dynamo': { g.strokeStyle = ink; g.lineWidth = 0.4; g.beginPath(); g.arc(L * 0.6, 0, 1.6, t * 4, t * 4 + 4); g.stroke(); circle(g, ink, L * 0.6, 0, 0.4); break; }
    case 'chevrons': for (let u = 0.4; u < L; u += 2.2) poly(g, ink, [u, -h + 0.4], [u + 1.4, 0], [u, h - 0.4], [u + 0.5, h - 0.4], [u + 1.9, 0], [u + 0.5, -h + 0.4]); break;
    case 'bolt': poly(g, ink, [0.4, 0.6], [L * 0.5, -0.3], [L * 0.5, 0.5], [L - 0.5, -0.8], [L * 0.55, 0.9], [L * 0.55, 0.1]); break;
    case 'flames': for (let i = 0; i < 4; i++) { const v = -h + 0.5 + i * 0.9, len = 3 + Math.sin(t * 8 + i * 2) * 0.8 + (i % 2) * 1.5; poly(g, ink, [-0.5, v - 0.45], [len, v], [-0.5, v + 0.45]); } break;
  }
}

function star(g: G, c: string, x: number, y: number, r: number) {
  g.fillStyle = c;
  g.fillRect(x - r, y - r / 3, r * 2, r * 2 / 3);
  g.fillRect(x - r / 3, y - r, r * 2 / 3, r * 2);
}

/** A front-facing jersey thumbnail using the same pattern as the worn kit. */
export function drawJerseyItem(g: G, j: JerseyLook, t: number) {
  const outline: P[] = [[-2,-10],[-4,-9.5],[-6.5,-6],[-4.5,-4.5],[-3.5,-6],[-3.5,0],[3.5,0],[3.5,-6],[4.5,-4.5],[6.5,-6],[4,-9.5],[2,-10]];
  g.save(); g.beginPath(); g.moveTo(...outline[0]); for(const p of outline.slice(1))g.lineTo(...p);g.closePath();g.clip();
  g.fillStyle=j.base;g.fillRect(-7,-11,14,12);
  if(j.pattern==='bolt')poly(g,j.ink,[1.6,-9.2],[-2.8,-4.7],[-.5,-4.7],[-1.8,-1.2],[3,-6.6],[.6,-6.6]);
  else if(j.pattern==='argyle'){
    for(let row=0;row<4;row++)for(let col=0;col<3;col++){const x=-3+col*3,y=-9+row*3;poly(g,j.ink,[x,y-1.5],[x+1.5,y],[x,y+1.5],[x-1.5,y]);}
  }else if(['bee','hoops','lighthouse'].includes(j.pattern)){
    for(let y=-8.4;y<0;y+=3){g.fillStyle=j.ink;g.fillRect(-7,y,14,1.4);}
  }else {g.save();g.rotate(-Math.PI/2);pattern(g,j,10,10,t);g.restore();}
  g.fillStyle='#202b38';g.fillRect(-1.7,-10,3.4,.9);
  g.fillStyle=shade(j.base,.75);g.fillRect(-3.5,-.6,7,.6);g.restore();
  if(j.pattern==='cape')poly(g,j.ink,[3,-8],[8,-6],[5,0],[3,0]);
}
