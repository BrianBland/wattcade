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
  ArrowDown: 'down',
  ArrowUp: 'up',
  ArrowLeft: 'left',
  ArrowRight: 'right',
  KeyZ: 'a',
  KeyX: 'b',
};
const cupButton = document.querySelector<HTMLButtonElement>('[data-key="ArrowDown"]')!;
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
const gridCourse = new URLSearchParams(location.search).get('course');
if (gridCourse === 'cup') {
  edges.add('down');
  session.step(1);
}
const courseSteps =
  gridCourse === 'cablehead'
    ? 4
    : gridCourse === 'cinder'
      ? 3
      : gridCourse === 'stormglass'
        ? 2
        : gridCourse === 'kiln'
          ? 1
          : 0;
for (let i = 0; i < courseSteps; i++) {
  edges.add('b');
  session.step(1);
}
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
  const state = session.sim.snapshot() as import('../src/games/cloudcup/sim/race').RaceView;
  renderer.render(state, session.ctx.bike(), session.ctx.input(), session.loop.frameFraction);
  leftAction.textContent = state.menu ? 'Start · Z' : 'Left sweep · Z';
  courseButton.textContent = state.menu ? 'Course · X' : 'Right sweep · X';
  courseButton.hidden = state.menu && state.cupStage >= 0;
  distanceButton.hidden = !state.menu || state.cupStage >= 0;
  cupButton.hidden = !state.menu || state.cupStage > 0;
  cupButton.textContent = state.cupStage === 0 ? 'Single race · ↓' : 'Cup · ↓';
  if (session.sim.isOver()) {
    if (state.cupStage === 4) {
      const place = 1 + state.cupPoints.slice(1).filter((p) => p > state.cupPoints[0]).length;
      again.textContent =
        'Cup ' + ['1st', '2nd', '3rd', '4th'][place - 1] + ' · ' + state.cupPoints[0] + ' pts · Race again';
    }
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
