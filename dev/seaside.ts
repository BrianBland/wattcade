// Seaside art-direction stills.  /dev/seaside.html?still=highway|turnout|shop[&stats=1]
import { stillHighway, stillTurnout } from '../src/games/seaside/stills/coastStills';
import { stillShop, shopOverlay, stillLouSheet } from '../src/games/seaside/stills/shopStill';

const q = new URLSearchParams(location.search);
const still = q.get('still') ?? 'highway';
const W = 1600, H = 900;
const canvas = document.getElementById('c') as HTMLCanvasElement;
const overlay = document.getElementById('overlay')!;
const t0 = performance.now();
const st = still === 'turnout' ? stillTurnout(canvas, W, H) : still === 'shop' ? stillShop(canvas, W, H) : still === 'lou' ? stillLouSheet(canvas, W, H) : stillHighway(canvas, W, H);
if (still === 'highway') overlay.innerHTML = '<div class="bubble">Good day for it.</div>';
if (still === 'turnout') overlay.innerHTML = '<div class="bubble">Lunch, maybe.</div>';
if (still === 'shop') overlay.innerHTML = shopOverlay();
st.renderer.render(st.scene, st.camera);
const info = st.renderer.info.render;
const stats = [...st.stats, `tris ${info.triangles.toLocaleString()} · calls ${info.calls} · build+render ${Math.round(performance.now() - t0)} ms`].join('\n');
const pre = document.getElementById('stats')!;
pre.textContent = stats;
if (q.get('stats')) pre.style.opacity = '1';
console.log(stats);
(window as unknown as { __done: string }).__done = stats;
