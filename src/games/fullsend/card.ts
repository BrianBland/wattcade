// Arcade card art: a rocket bike blasting off a mega ramp at sunset. Shell calls this; keep it tiny, no renderer imports.

const hash = (n: number) => { const s = Math.sin(n * 127.1) * 43758.5453; return s - Math.floor(s); };

/** A rider on a rocket bike, flame roaring. Drawn at the origin, wheels on y = 0, facing right. */
function rocketBike(g: CanvasRenderingContext2D, t: number, color: string) {
  // the plume: shock diamonds in a long flame
  const fl = 1 + Math.sin(t * 31) * 0.08 + Math.sin(t * 17) * 0.06;
  const grad = g.createLinearGradient(-6, 0, -70 * fl, 0);
  grad.addColorStop(0, '#fff6c8'); grad.addColorStop(0.25, '#ffd23b'); grad.addColorStop(0.6, '#ff6a1a'); grad.addColorStop(1, 'rgba(255,60,20,0)');
  g.fillStyle = grad;
  g.beginPath(); g.moveTo(-6, -14); g.quadraticCurveTo(-40 * fl, -20, -70 * fl, -11); g.quadraticCurveTo(-40 * fl, -2, -6, -8); g.closePath(); g.fill();
  g.fillStyle = 'rgba(255,255,255,0.85)';
  for (let i = 0; i < 3; i++) { const x = -14 - i * 10 * fl; g.beginPath(); g.ellipse(x, -11, 3 - i * 0.6, 1.6, 0, 0, Math.PI * 2); g.fill(); }
  // the rocket
  g.fillStyle = '#c6ccd6'; g.fillRect(-7, -14, 20, 6);
  g.fillStyle = '#ff4d6d'; g.beginPath(); g.moveTo(13, -14); g.lineTo(18, -11); g.lineTo(13, -8); g.closePath(); g.fill();
  g.fillStyle = '#ff4d6d'; g.beginPath(); g.moveTo(-7, -14); g.lineTo(-11, -18); g.lineTo(-3, -14); g.closePath(); g.fill();
  // wheels
  g.strokeStyle = '#15151c'; g.lineWidth = 2;
  for (const wx of [-6, 14]) { g.beginPath(); g.arc(wx, -5, 5, 0, Math.PI * 2); g.stroke(); }
  g.strokeStyle = '#8a92a6'; g.lineWidth = 0.6;
  for (const wx of [-6, 14]) for (let k = 0; k < 3; k++) { const a = t * 25 + (k * Math.PI) / 3; g.beginPath(); g.moveTo(wx - Math.cos(a) * 4.5, -5 - Math.sin(a) * 4.5); g.lineTo(wx + Math.cos(a) * 4.5, -5 + Math.sin(a) * 4.5); g.stroke(); }
  // frame (rider colour) and rider, tucked
  g.strokeStyle = color; g.lineWidth = 2; g.lineCap = 'round';
  g.beginPath(); g.moveTo(-6, -5); g.lineTo(3, -5); g.lineTo(12, -13); g.moveTo(3, -5); g.lineTo(0, -14); g.lineTo(12, -13); g.lineTo(14, -5); g.stroke();
  g.strokeStyle = '#2a2f40'; g.lineWidth = 3;
  g.beginPath(); g.moveTo(0, -16); g.lineTo(9, -21); g.lineTo(13, -15); g.stroke(); // back and arm
  const c = t * 12;
  g.lineWidth = 2.4; g.beginPath(); g.moveTo(0, -16); g.lineTo(3 + Math.cos(c) * 3, -9 + Math.sin(c) * 2); g.lineTo(3 + Math.cos(c) * 4, -5 + Math.sin(c) * 4); g.stroke();
  g.fillStyle = color; g.beginPath(); g.arc(11, -24, 3.6, Math.PI, 0); g.fill(); // helmet
  g.fillStyle = '#ffd9b0'; g.beginPath(); g.arc(12, -22.5, 2, 0, Math.PI * 2); g.fill();
  g.lineCap = 'butt';
}

/** 230×100 units: dusk sky, parallax hills, a mega ramp, and you leaving it with the rocket wide open. */
export function drawCard(g: CanvasRenderingContext2D, w: number, h: number, t: number, color: string): void {
  g.save(); g.scale(w / 230, h / 100);
  const sky = g.createLinearGradient(0, 0, 0, 100);
  sky.addColorStop(0, '#1a1446'); sky.addColorStop(0.55, '#c8406a'); sky.addColorStop(1, '#ffb05a');
  g.fillStyle = sky; g.fillRect(0, 0, 230, 100);
  for (let i = 0; i < 30; i++) { g.globalAlpha = 0.4 + 0.6 * Math.abs(Math.sin(t * 2 + i)); g.fillStyle = '#fff'; g.fillRect(hash(i) * 230, hash(i + 50) * 40, 0.8, 0.8); }
  g.globalAlpha = 1;
  g.fillStyle = '#ffe6a0'; g.beginPath(); g.arc(178, 66, 13, 0, Math.PI * 2); g.fill(); // low sun
  const hills = (base: number, amp: number, speed: number, col: string) => {
    g.fillStyle = col; g.beginPath(); g.moveTo(0, 100);
    for (let x = 0; x <= 230; x += 5) { const u = x + t * speed; g.lineTo(x, base - amp * (0.6 * Math.sin(u / 23) + 0.4 * Math.sin(u / 9 + 1))); }
    g.lineTo(230, 100); g.closePath(); g.fill();
  };
  hills(76, 9, 6, '#6a2f5a'); hills(86, 5, 18, '#3a1c3e');
  g.fillStyle = '#24152c'; g.fillRect(0, 90, 230, 10); // the road
  g.fillStyle = '#ffd23b'; for (let x = -((t * 80) % 16); x < 230; x += 16) g.fillRect(x, 94, 7, 1);
  // the mega ramp, scrolling away to the left
  const rx = 95 - ((t * 40) % 300);
  g.fillStyle = '#3c4256'; g.beginPath(); g.moveTo(rx - 40, 90); g.quadraticCurveTo(rx - 5, 90, rx, 62); g.lineTo(rx, 90); g.closePath(); g.fill();
  g.strokeStyle = '#c6ccd6'; g.lineWidth = 1.5; g.beginPath(); g.moveTo(rx - 40, 90); g.quadraticCurveTo(rx - 5, 90, rx, 62); g.stroke();
  // speed lines
  g.strokeStyle = 'rgba(255,255,255,0.35)'; g.lineWidth = 0.7;
  for (let i = 0; i < 9; i++) { const y = 10 + hash(i + 9) * 70, x = 230 - ((t * (160 + hash(i) * 120) + hash(i + 3) * 230) % 270); g.beginPath(); g.moveTo(x, y); g.lineTo(x + 18 + hash(i + 5) * 14, y); g.stroke(); }
  // the bike: climbing at a steep angle, bobbing
  g.save(); g.translate(120, 58 + Math.sin(t * 2.2) * 3); g.rotate(-0.42 + Math.sin(t * 1.3) * 0.05); g.scale(1.25, 1.25);
  rocketBike(g, t, color);
  g.restore();
  g.restore();
}
