import { drawRider } from '../src/cosmetics/draw/rider';
import { riderLook, withItem } from '../src/cosmetics/unlocks';
import { item } from '../src/cosmetics/catalog';

const canvas = document.querySelector<HTMLCanvasElement>('#stage')!, g = canvas.getContext('2d')!;
const base = riderLook({ color: '#19b5bc', level: 50, achievements: [] });
const looks = [base, withItem(base, item('jersey', 'polka')!), withItem(withItem(base, item('jersey', 'stars')!), item('hat', 'wizard')!)];
const names = ['Club Rider', 'Polka Dots', 'Wizard + Starry Night'];
function render(t: number) {
  // 80 rpm for six seconds, a smooth 0.75s ease to coasting, then stationary
  // pedals while the wheels keep rolling. Integrate cadence analytically.
  const easeT = Math.max(0, Math.min(0.75, t - 6));
  const crank = Math.min(t, 6) * 80 / 60 + (80 / 60) * (easeT / 2 + 0.75 / (2 * Math.PI) * Math.sin(Math.PI * easeT / 0.75));
  const rpm = t < 6 ? 80 : t < 6.75 ? 40 * (1 + Math.cos(Math.PI * easeT / 0.75)) : 0;
  g.fillStyle = '#f4f0e5'; g.fillRect(0, 0, 960, 540);
  g.textAlign = 'left'; g.fillStyle = '#182132'; g.font = 'bold 24px sans-serif'; g.fillText('R2 / CLUB RIDER IN MOTION', 28, 40);
  g.font = '16px sans-serif'; g.fillText(`Real renderer · 60 fps · ${Math.round(rpm)} rpm${rpm === 0 ? ' · coasting' : ''}`, 28, 68);
  for (let i = 0; i < looks.length; i++) {
    const x = 160 + i * 320;
    g.fillStyle = '#d9d4c9'; g.fillRect(x - 130, 350, 260, 2);
    g.save(); g.translate(x, 348); g.scale(9, 9); drawRider(g, looks[i], crank, t * 5, { t, speed: 5 }); g.restore();
    g.textAlign = 'center'; g.fillStyle = '#182132'; g.font = '18px sans-serif'; g.fillText(names[i], x, 383);
  }
  g.fillStyle = '#182132'; g.fillRect(0, 411, 960, 129);
  g.textAlign = 'left'; g.fillStyle = '#d6e4e8'; g.font = '14px sans-serif'; g.fillText('World scale / 3×', 28, 438);
  const tiny = document.createElement('canvas'); tiny.width = 52; tiny.height = 40;
  const tg = tiny.getContext('2d')!; tg.translate(26, 36); drawRider(tg, base, crank, t * 5, { t, speed: 5 });
  g.imageSmoothingEnabled = false; g.drawImage(tiny, 394, 418, 156, 120);
  g.textAlign = 'right'; g.fillStyle = '#adbfca'; g.font = '14px sans-serif'; g.fillText('Steady head · opposed pedals · feet stay on crank', 934, 514);
}
declare global { interface Window { __riderFrame: (t: number) => void } }
window.__riderFrame = render;
if (!new URLSearchParams(location.search).has('manual')) {
  const start = performance.now();
  const frame = (now: number) => { render(((now - start) / 1000) % 8); requestAnimationFrame(frame); };
  requestAnimationFrame(frame);
} else render(0.165);
