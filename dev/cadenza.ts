// Dev harness: Cadenza on the fake bike with a synth queue (no audio), without the shell.
//   /dev/cadenza.html?script=target-follow&style=edm&songs=2&sec=40&autopilot=1&inset=120&speed=1&menu=1&diff=pro
import { createGameSession, NullInput, testProfile } from '../src/core';
import { InputHub } from '../src/input';
import { synthTimeline } from '../src/media/synth/queue';
import { module } from '../src/games/cadenza';

const q = new URLSearchParams(location.search);
const inset = Number(q.get('inset') ?? (q.has('trial') ? 110 : 120)), speed = Number(q.get('speed') ?? 1);
const hub = new InputHub(); hub.attachKeyboard(window);
const timeline = synthTimeline({ style: (q.get('style') ?? 'edm') as 'edm', songs: Number(q.get('songs') ?? 2), seed: Number(q.get('seed') ?? 1), mix: 'automix' });
const session = createGameSession({
  game: module, profile: testProfile(), input: q.get('autopilot') ? new NullInput() : hub, fake: { script: q.get('script') ?? 'target-follow' },
  media: { timeline }, simOpts: { ...(q.get('autopilot') ? { autopilot: true } : {}), ...(q.get('menu') ? {} : { difficulty: q.get('diff') ?? 'pro' }) },
});
session.step(Math.round(Number(q.get('sec') ?? 0) * 30));
const app = document.getElementById('app')!, bar = document.getElementById('hudfake')!;
bar.style.height = `${inset}px`;
const r = await module.loadRenderer();
r.mount(app, { profile: testProfile(), send: (a) => session.sim.receive?.(a), insets: { top: 0, right: 0, bottom: inset, left: 0 } });
let paused = false;
if (q.has('trial')) {
  const controls = document.getElementById('controls')!; controls.hidden = false;
  for (const [id, button] of [['left', 'left'], ['right', 'right']] as const) {
    const el = document.getElementById(id)!;
    el.addEventListener('pointerdown', (e) => { e.preventDefault(); el.setPointerCapture(e.pointerId); hub.holdTouch(e.pointerId, button); });
    const release = (e: PointerEvent) => hub.releaseTouch(e.pointerId);
    el.addEventListener('pointerup', release); el.addEventListener('pointercancel', release); el.addEventListener('lostpointercapture', release);
  }
  const pause = document.getElementById('pause')!;
  pause.addEventListener('click', () => { paused = !paused; pause.textContent = paused ? 'Resume' : 'Pause'; });
  document.getElementById('restart')!.addEventListener('click', () => location.reload());
  window.addEventListener('blur', () => { paused = true; pause.textContent = 'Resume'; });
}
let last = performance.now(), tickBudget = 0;
const loop = (now: number) => {
  const dt = Math.min(0.1, (now - last) / 1000); last = now;
  if (!paused) {
    tickBudget += dt * speed * 30;
    const steps = Math.floor(tickBudget); tickBudget -= steps;
    if (steps) session.step(steps);
  }
  const b = session.bikeStore.get();
  bar.textContent = `${Math.round(b.power3s)} W · ${Math.round(b.cadence3s)} rpm · grade ${(session.mixer.command as any)?.gradePct?.toFixed?.(1) ?? '-'}% · p ${session.media!.positionS().toFixed(1)} s`;
  r.render(session.sim.snapshot(), b, session.ctx.input());
  (window as any).__frames = ((window as any).__frames ?? 0) + 1;
  requestAnimationFrame(loop);
};
requestAnimationFrame(loop);
