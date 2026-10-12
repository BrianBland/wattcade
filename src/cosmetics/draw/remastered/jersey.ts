import type { JerseyLook } from '../../types';
import { circle, line, poly, quad, shade, TAU, type G, type P } from '../prims';

/** Shaped jersey in a hip-to-shoulder frame; patterns stay clipped to the cloth. */
export function drawTorso(g: G, j: JerseyLook, hip: P, sh: P, t: number) {
  const L = Math.hypot(sh[0] - hip[0], sh[1] - hip[1]), w = 4.4;
  g.save();
  g.translate(hip[0], hip[1]); g.rotate(Math.atan2(sh[1] - hip[1], sh[0] - hip[0]));
  g.beginPath();
  g.moveTo(-0.6, -1.5); g.lineTo(L * 0.38, -2.3); g.lineTo(L - 0.5, -2.1);
  g.lineTo(L + 1, -0.7); g.lineTo(L + 0.5, 1.3); g.lineTo(L * 0.46, 1.7); g.lineTo(-0.4, 1.4);
  g.closePath();
  g.fillStyle = j.base; g.fill(); g.strokeStyle = '#142130'; g.lineWidth = 0.65; g.lineJoin = 'round'; g.stroke();
  g.clip();
  pattern(g, j, L, w, t);
  // Broad light/shadow planes leave the pattern visible even on the tiny rider.
  g.globalAlpha *= 0.3;
  poly(g, shade(j.base, 1.7), [-1, -2.4], [L, -2.4], [L * 0.7, -1.2], [1, -0.9]);
  poly(g, '#142130', [-1, 0.7], [L, 0.7], [L, 2.5], [-1, 2.5]);
  g.globalAlpha /= .3;
  const cloth = g.createLinearGradient(0, -2.2, 0, 1.8);
  cloth.addColorStop(0, '#fff4d52b'); cloth.addColorStop(.4, '#ffffff00'); cloth.addColorStop(1, '#10223c35');
  g.fillStyle = cloth; g.fillRect(-1, -3, L + 3, 6);
  // Fine weave and stitched seams remain restrained enough to read the jersey pattern.
  g.fillStyle = '#fff4dd12';
  for (let u = .7; u < L; u += 1.2) for (let v = -1.6; v < 1.3; v += .8) g.fillRect(u, v, .3, .12);
  line(g, shade(j.base, .55), .2, [-.2, .9], [L * .45, 1.25], [L - .5, .85]);
  line(g, '#fff2d577', .16, [L - .4, -1.75], [L + .35, -.75]);
  line(g, shade(j.base, .6), .22, [L - 1, -.9], [L * .65, -.35]);
  line(g, '#f6e8c588', .12, [L - .92, -.82], [L * .67, -.28]);
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
  g.strokeStyle = shade(j.ink, .55); g.lineWidth = .28; g.stroke();
  quad(g, shade(j.ink, 1.35), .22, sh, [sh[0] - 3, sh[1] + 3 + wave], tip);
}

function pattern(g: G, j: JerseyLook, L: number, w: number, t: number) {
  const ink = j.ink, h = w / 2;
  const hoops = (step: number, width: number, c = ink, from = 0.5) => { for (let u = from; u < L; u += step) { g.fillStyle = c; g.fillRect(u, -w, width, 2 * w); } };
  const along = (vs: number[], width: number, c = ink) => { for (const v of vs) { g.fillStyle = c; g.fillRect(-1, v - width / 2, L + 2, width); } };
  switch (j.pattern) {
    case 'plain': line(g, shade(j.base, 0.75), 0.5, [L - 0.6, -h], [L - 0.6, h]); break;
    case 'vstripes': along([-1.1, 0, 1.1], 0.45); break;
    case 'hoops': hoops(1.8, 0.8); break;
    case 'bee': hoops(2, 1); break;
    case 'lighthouse': hoops(2.2, 1.1); break;
    case 'dots': for (let u = 0.8; u < L; u += 1.7) for (let v = -h + 0.6 + ((u / 1.7) % 2 ? 0.8 : 0); v < h; v += 1.6) circle(g, ink, u, v, 0.48); break;
    case 'rainbow': ['#2a5bd7', '#e8322b', '#15151c', '#ffd400', '#22b14c'].forEach((c, i) => { g.fillStyle = c; g.fillRect(L * 0.45 + i * 0.55, -w, 0.55, 2 * w); }); break;
    case 'band': hoops(99, 1.2, ink, L * 0.5); break;
    case 'checker': for (let u = 0, i = 0; u < L; u += 1.2, i++) for (let v = -h, k = 0; v < h; v += 1.2, k++) if ((i + k) % 2) { g.fillStyle = ink; g.fillRect(u, v, 1.2, 1.2); } break;
    case 'sash': g.save(); g.rotate(-0.55); g.fillStyle = ink; g.fillRect(-2, -0.7, L + 4, 1.4); g.restore(); break;
    case 'hazard': for (let u = -w; u < L + w; u += 1.8) poly(g, ink, [u, -h], [u + 0.9, -h], [u + 0.9 + w, h], [u + w, h]); break;
    case 'tiger': for (let u = 0.6; u < L; u += 1.6) poly(g, ink, [u, -h], [u + 0.5, -h], [u + 1.2, 0], [u + 0.3, -0.4]); break;
    case 'zebra': for (let u = 0.4; u < L; u += 1.5) quad(g, ink, 0.55, [u, -h], [u + 1, 0], [u, h]); break;
    case 'camo': [[1, -0.6, 1.2], [3, 0.8, 1], [5.2, -0.4, 1.3], [7, 0.9, 0.9], [2.2, 1.4, 0.7]].forEach(([u, v, r]) => circle(g, ink, u, v, r)); break;
    case 'galaxy': {
      const gr = g.createLinearGradient(0, 0, L, 0); gr.addColorStop(0, j.base); gr.addColorStop(0.6, shade(ink, 0.6)); gr.addColorStop(1, j.base);
      g.fillStyle = gr; g.fillRect(-1, -w, L + 2, 2 * w);
      for (let i = 0; i < 7; i++) circle(g, '#ffffff', (i * 1.37) % L, ((i * 0.71) % w) - h, 0.22 + (i % 3) * 0.08);
      break;
    }
    case 'stars': for (let i = 0; i < 5; i++) star(g, ink, 0.9 + i * 1.6, (i % 2 ? 0.7 : -0.6), 0.55); break;
    case 'tux': g.fillStyle = ink; g.fillRect(-1, h - 1.2, L + 2, 1.2); poly(g, '#e8322b', [L - 1.2, h - 0.9], [L - 0.4, h - 0.3], [L - 1.2, h + 0.2]); break;
    case 'cape': circle(g, ink, L * 0.6, 0.4, 0.9); break; // emblem
    case 'floral': [[1, -0.5], [3.4, 0.8], [5.6, -0.7], [7.6, 0.6]].forEach(([u, v]) => { for (let k = 0; k < 5; k++) circle(g, ink, u + Math.cos(k * 1.26) * 0.55, v + Math.sin(k * 1.26) * 0.55, 0.38); circle(g, '#ffe066', u, v, 0.3); }); break;
    case 'retro': g.fillStyle = ink; g.fillRect(L * 0.5, -w, 1.6, 2 * w); g.fillRect(L - 0.8, -w, 0.8, 2 * w); break;
    case 'mail': for (let u = 0.4; u < L; u += 0.9) for (let v = -h; v < h + 1; v += 0.9) { g.strokeStyle = ink; g.lineWidth = 0.22; g.beginPath(); g.arc(u, v + (Math.round(u / 0.9) % 2) * 0.45, 0.45, 0, Math.PI); g.stroke(); } break;
    case 'bones': line(g, ink, 0.45, [0.4, 0.3], [L - 0.5, 0.3]); for (let u = 1.6; u < L - 1; u += 1.2) line(g, ink, 0.35, [u, -h + 0.5], [u + 0.4, h - 0.5]); break;
    case 'suit': line(g, ink, 0.3, [0, h - 0.8], [L, h - 0.8]); circle(g, ink, L * 0.62, -0.4, 0.7); break;
    case 'hamster': circle(g, ink, L * 0.55, 0.3, 1.3); circle(g, ink, L * 0.55 + 1.1, -0.6, 0.45); circle(g, ink, L * 0.55 + 1.1, 1.2, 0.45); circle(g, '#3a2410', L * 0.55 + 0.4, -0.2, 0.2); circle(g, '#3a2410', L * 0.55 + 0.4, 0.8, 0.2); break;
    case 'coat': g.fillStyle = ink; g.fillRect(L * 0.3, h - 1.4, 1.2, 1); for (let u = 1; u < L; u += 1.8) circle(g, '#9a9aa8', u, h - 0.4, 0.22); break;
    case 'eq': for (let i = 0; i < 6; i++) { const lvl = 0.5 + 0.5 * Math.abs(Math.sin(t * (3 + i) + i)); g.fillStyle = ink; g.fillRect(0.3, -h + i * (w / 6), (L - 0.6) * lvl, w / 6 - 0.15); } break;
    case 'disco': for (let u = 0, i = 0; u < L; u += 0.9, i++) for (let v = -h, k = 0; v < h; v += 0.9, k++) { const f = 0.5 + 0.5 * Math.sin(t * 6 + i * 1.7 + k * 2.3); g.fillStyle = f > 0.85 ? ink : shade(j.base, 0.75 + f * 0.4); g.fillRect(u, v, 0.8, 0.8); } break;
    case 'waves': for (let u = 0.8; u < L; u += 1.6) { g.strokeStyle = ink; g.lineWidth = 0.4; g.beginPath(); for (let v = -h; v <= h; v += 0.4) g.lineTo(u + Math.sin(v * 2.2 + t * 2) * 0.35, v); g.stroke(); } break;
    case 'overalls': g.fillStyle = ink; g.fillRect(-1, -w, L * 0.55 + 1, 2 * w); g.fillRect(L * 0.5, -0.2, L, 0.6); break;
    case 'argyle': for (let u = -1; u < L; u += 2) for (const v of [-h, 0, h]) poly(g, ink, [u, v], [u + 1, v - 0.9], [u + 2, v], [u + 1, v + 0.9]); break;
    case 'tiedye': for (let r = 5, i = 0; r > 0; r -= 0.8, i++) circle(g, `hsl(${(i * 55 + t * 30) % 360} 85% 60%)`, L * 0.5, 0, r); break;
    case 'leopard': for (const [u, v] of [[1, -0.7], [2.6, 0.8], [4.2, -0.3], [5.8, 0.9], [7.2, -0.8], [3.4, -1.2]]) { g.strokeStyle = ink; g.lineWidth = 0.32; g.beginPath(); g.arc(u, v, 0.5, 0.3, TAU - 0.4); g.stroke(); } break;
    case 'plaid': g.globalAlpha *= 0.7; along([-1, 0.9], 0.6); hoops(2, 0.6); g.globalAlpha /= 0.7; break;
    case 'pajamas': along([-1.2, 0.2], 0.25); for (let u = 1.2; u < L; u += 2) circle(g, '#ffffff', u, h - 0.5, 0.25); break;
    case 'circuit': line(g, ink, 0.25, [0.5, -1], [3, -1], [4, 0.5], [7, 0.5]); line(g, ink, 0.25, [1.5, 1.2], [5, 1.2], [6, -0.8]); circle(g, ink, 3, -1, 0.35); circle(g, ink, 6, -0.8, 0.35); break;
    case 'neon': g.globalAlpha *= 0.85; along([-1, 0, 1], 0.18); hoops(1.2, 0.18); g.globalAlpha /= 0.85; break;
    case 'marble': quad(g, ink, 0.25, [0, -1.2], [3, 1], [L, -0.4]); quad(g, ink, 0.18, [2, 1.6], [5, -1.4], [L, 1.2]); break;
    case 'royal': g.fillStyle = ink; g.fillRect(L - 1.5, -w, 1.5, 2 * w); for (const v of [-1, 0.4]) circle(g, '#15151c', L - 0.8, v, 0.2); break;
    case 'bolt': poly(g, ink, [0.4, 0.6], [L * 0.5, -0.3], [L * 0.5, 0.5], [L - 0.5, -0.8], [L * 0.55, 0.9], [L * 0.55, 0.1]); break;
    case 'flames': for (let i = 0; i < 4; i++) { const v = -h + 0.5 + i * 0.9, len = 3 + Math.sin(t * 8 + i * 2) * 0.8 + (i % 2) * 1.5; poly(g, ink, [-0.5, v - 0.45], [len, v], [-0.5, v + 0.45]); } break;
  }
}

function star(g: G, c: string, x: number, y: number, r: number) {
  g.fillStyle = c; g.beginPath();
  for (let i = 0; i < 8; i++) { const a = (i * Math.PI) / 4, rr = i % 2 ? r * 0.4 : r; g.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr); }
  g.closePath(); g.fill();
}
