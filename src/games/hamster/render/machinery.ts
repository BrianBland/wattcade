// Foreground equipment for the middle eras, drawn in the same 2D workshop materials.
import { FONT, FURS, TAU, hamster, rr } from './draw';
type G = CanvasRenderingContext2D;

/** A bolted control cabinet. Motion follows the wheel clock, so it rests when the rider rests. */
export function switchboard(g: G, x: number, y: number, scale: number, phase: number, running: boolean) {
  g.save(); g.translate(x, y); g.scale(scale, scale);
  g.fillStyle = '#1c1825'; rr(g, -63, 2, 126, 114, 9); g.fill();
  g.fillStyle = '#716f78'; rr(g, -60, -4, 120, 108, 7); g.fill();
  g.strokeStyle = '#aea99f'; g.lineWidth = 2; g.stroke();
  g.fillStyle = '#474450'; rr(g, -51, 5, 102, 88, 4); g.fill();
  for (const xx of [-54, 54]) for (const yy of [2, 97]) {
    g.fillStyle = '#b9b2a5'; g.beginPath(); g.arc(xx, yy, 2, 0, TAU); g.fill();
    g.strokeStyle = '#514952'; g.lineWidth = 1; g.beginPath(); g.moveTo(xx - 1, yy + 1); g.lineTo(xx + 1, yy - 1); g.stroke();
  }
  for (let i = 0; i < 2; i++) {
    const cx = -25 + i * 50;
    g.fillStyle = '#eadbb7'; rr(g, cx - 20, 13, 40, 30, 4); g.fill();
    g.strokeStyle = '#aa8d65'; g.lineWidth = 1; g.beginPath(); g.arc(cx, 38, 16, Math.PI + .2, TAU - .2); g.stroke();
    const a = Math.PI + .3 + (running ? 1.5 + Math.sin(phase * .3 + i) * .3 : 0);
    g.strokeStyle = '#995d55'; g.lineWidth = 2; g.beginPath(); g.moveTo(cx, 38); g.lineTo(cx + Math.cos(a) * 14, 38 + Math.sin(a) * 14); g.stroke();
  }
  for (let i = 0; i < 4; i++) {
    const xx = -36 + i * 24;
    g.fillStyle = running ? i === 3 ? '#dfb86d' : '#91c5a0' : '#72636a'; g.beginPath(); g.arc(xx, 59, 4, 0, TAU); g.fill();
    g.strokeStyle = '#272332'; g.lineWidth = 5; g.beginPath(); g.moveTo(xx, 72); g.lineTo(xx, 83); g.stroke();
    g.fillStyle = '#c4b6a0'; rr(g, xx - 4, running ? 71 : 78, 8, 5, 2); g.fill();
  }
  g.fillStyle = '#ddc28c'; g.fillRect(-44, 96, 88, 17);
  g.fillStyle = '#5d4544'; g.font = `900 8px ${FONT}`; g.textAlign = 'center'; g.fillText('DO NOT UNPLUG GERALD', 0, 107);
  g.restore();
}

/** A seated administrator whose only job appears to be approving more administrators. */
export function dispatchDesk(g: G, x: number, y: number, scale: number, phase: number, running: boolean, delivery = 0) {
  g.save(); g.translate(x, y); g.scale(scale, scale);
  hamster(g, -12, -10, 32, 0, { fur: FURS.grey, sleep: !running, noShadow: true }, phase);
  // Shirt collar and bureaucratic tie.
  g.fillStyle = '#e8dcc6'; g.beginPath(); g.moveTo(-7, -20); g.lineTo(0, -15); g.lineTo(-5, -12); g.fill();
  g.fillStyle = '#bc7882'; g.fillRect(-5, -13, 3, 9);
  g.fillStyle = '#6d5051'; g.fillRect(-52, 0, 104, 8); g.fillRect(-47, 8, 5, 32); g.fillRect(42, 8, 5, 32);
  g.fillStyle = '#b78c67'; g.fillRect(-54, -3, 108, 5);
  g.fillStyle = '#353342'; rr(g, -48, -35, 31, 28, 3); g.fill();
  g.fillStyle = running ? '#97bcb1' : '#67666c'; g.fillRect(-44, -31, 23, 19);
  g.strokeStyle = '#435f5b'; g.lineWidth = 1; for (let i = 0; i < 4; i++) { g.beginPath(); g.moveTo(-41, -27 + i * 4); g.lineTo(-25 + i % 2 * 3, -27 + i * 4); g.stroke(); }
  g.fillStyle = '#eee1c5'; for (let i = 0; i < 4; i++) g.fillRect(10 + i % 2, -7 - i * 2, 26, 3);
  const lift = delivery > 0 ? Math.sin((1 - delivery) * Math.PI * 3) ** 2 * 16 : running ? Math.max(0, Math.sin(phase * .3)) * 5 : 0;
  g.fillStyle = '#653f46'; rr(g, 17, -19 - lift, 13, 9, 2); g.fill(); g.fillRect(13, -11 - lift, 21, 4);
  g.fillStyle = '#d9c399'; g.fillRect(-36, 14, 72, 17);
  g.fillStyle = '#694f4b'; g.textAlign = 'center'; g.font = `900 8px ${FONT}`; g.fillText('SEED ANALYST', 0, 25);
  g.restore();
}

export function deliveryCrate(g: G, x: number, y: number, scale: number, progress: number) {
  if (progress <= 0) return;
  g.save(); g.translate(x + (1 - Math.min(1, (1 - progress) * 8)) * 24, y); g.scale(scale, scale);
  g.globalAlpha *= Math.min(1, progress * 5);
  g.fillStyle = '#9b704c'; rr(g, -39, -32, 78, 37, 3); g.fill();
  g.fillStyle = '#c99a64'; g.fillRect(-37, -30, 74, 5); g.fillRect(-37, -1, 74, 5);
  g.fillStyle = '#e8d3a7'; g.save(); g.rotate(-.07); g.fillRect(-30, -24, 60, 21);
  g.textAlign = 'center'; g.fillStyle = '#6b5345'; g.font = `900 8px ${FONT}`; g.fillText('NEW EMPLOYEE', 0, -15); g.font = `600 7px ${FONT}`; g.fillText('some assembly required', 0, -7); g.restore();
  g.restore();
}
