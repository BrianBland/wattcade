// Review the actual bike game with a simulated power source on the PR preview.
import { unlockAudio } from '../src/audio/sfx';
import { NullInput, createGameSession, testProfile } from '../src/core';
import type { Button } from '../src/contracts';
import { module as game } from '../src/games/cloudcup';

const host = document.querySelector('main')!,
  leftAction = document.querySelector<HTMLButtonElement>('[data-key="KeyZ"]')!;
const courseButton = document.querySelector<HTMLButtonElement>('[data-key="KeyX"]')!;
const distanceButton = document.querySelector<HTMLButtonElement>('[data-key="ArrowUp"]')!;
const keys: Record<string, Button> = {
  ArrowUp: 'up',
  ArrowLeft: 'left',
  ArrowRight: 'right',
  KeyZ: 'a',
  KeyX: 'b',
};
const sources = new Map<string, string>(),
  edges = new Set<Button>();
const base = new NullInput().state();
let pressed = new Set<Button>(),
  held = new Set<Button>();
function down(source: string, key: string) {
  if (sources.has(source)) return;
  unlockAudio();
  if (keys[key] && !Array.from(sources.values()).includes(key)) edges.add(keys[key]);
  sources.set(source, key);
}
const profile = testProfile();
const session = createGameSession({
  game,
  profile,
  fake: {},
  input: {
    beginTick() {
      pressed = new Set(edges);
      edges.clear();
      held = new Set([...sources.values()].map((k) => keys[k]).filter(Boolean));
    },
    state: () => ({ ...base, pressed, held, source: 'keyboard' }),
  },
});
const renderer = await game.loadRenderer();
renderer.mount(host, { profile });
await renderer.ready?.();
const resize = new ResizeObserver(() => renderer.resize?.(host.clientWidth, host.clientHeight));
resize.observe(host);
for (const button of document.querySelectorAll<HTMLButtonElement>('button[data-key]')) {
  button.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    button.setPointerCapture(e.pointerId);
    down('pointer' + e.pointerId, button.dataset.key!);
  });
  button.addEventListener('lostpointercapture', (e) => sources.delete('pointer' + e.pointerId));
}
window.addEventListener('keydown', (e) => {
  if (keys[e.code] || e.code === 'Space' || e.code === 'KeyC') {
    e.preventDefault();
    down(e.code, e.code);
  }
});
window.addEventListener('keyup', (e) => sources.delete(e.code));
window.addEventListener('blur', () => {
  sources.clear();
  edges.clear();
});
const again = document.getElementById('again')!;
again.onclick = () => location.reload();
session.fakeBike!.useScript(null);
let previous = performance.now(),
  frameId = 0;
function draw(time: number) {
  const controls = [...sources.values()];
  const sprint = controls.includes('Space'),
    coast = controls.includes('KeyC');
  session.fakeBike!.manual = {
    power: coast ? 0 : profile.ftp * (sprint ? 1.35 : 0.78),
    cadence: coast ? 0 : sprint ? 105 : 86,
    hr: null,
  };
  session.frame(Math.min(0.1, (time - previous) / 1000));
  previous = time;
  renderer.render(session.sim.snapshot(), session.ctx.bike(), session.ctx.input());
  if (!session.sim.inMenu?.() && !distanceButton.hidden) {
    leftAction.textContent = 'Left sweep · Z';
    courseButton.textContent = 'Right sweep · X';
    distanceButton.hidden = true;
  }
  if (session.sim.isOver()) {
    again.hidden = false;
    return;
  }
  frameId = requestAnimationFrame(draw);
}
frameId = requestAnimationFrame(draw);
window.addEventListener('pagehide', (e) => {
  if (e.persisted) return;
  cancelAnimationFrame(frameId);
  resize.disconnect();
  renderer.unmount();
  session.finish();
});
