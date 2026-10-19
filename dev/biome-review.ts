import { createGameSession, testProfile, NullInput } from '../src/core';
import { module as warmup } from '../src/games/warmup';
import { BIOMES, BIOME_NAMES, type BiomeId } from '../src/games/warmup/sim/terrain';
import type { GameRenderer } from '../src/contracts';

const manual = new URLSearchParams(location.search).has('manual');
let clock = 1000;
if (manual) performance.now = () => clock;
const profile = testProfile({ color: '#19b5bc' });
const scenes: Array<{ renderer: GameRenderer; session: ReturnType<typeof createGameSession> }> = [];
const group = new URLSearchParams(location.search).get('group') ?? 'new';
const ids: BiomeId[] = group === 'green' ? ['countryside','seaside','jungle','snow'] : group === 'other' ? ['underwater','desert','volcano','moon'] : ['autumn','marsh','market','sky'];
document.querySelector('h1')!.textContent = `WORLD POLISH / ${group.toUpperCase()} · ACTUAL GAME RENDERERS`;
for (const id of ids) {
  const title = BIOME_NAMES[id];
  const section = document.createElement('section'); section.dataset.biome = id;
  section.innerHTML = `<div class="scene"></div><div class="caption">${title}</div>`; document.querySelector('main')!.append(section);
  const session = createGameSession({ game: warmup, profile, input: new NullInput(), fake: { script: 'z2' }, seed: 2,
    simOpts: { startBiome: BIOMES.indexOf(id), startDistance: 480, terrainSeed: 17 } });
  session.step(30 * 15);
  const renderer = await warmup.loadRenderer();
  renderer.mount(section.querySelector('.scene')!, { profile, send() {}, insets: { top: 0, bottom: 0, left: 0, right: 0 } });
  renderer.resize?.(1200, 800); await renderer.ready?.();
  scenes.push({ renderer, session });
}
function advance(seconds: number) {
  clock += seconds * 1000;
  for (const { renderer, session } of scenes) {
    session.frame(seconds);
    renderer.render(session.sim.snapshot(), session.ctx.bike(), session.ctx.input());
  }
}
declare global { interface Window { __biomesAdvance: (seconds: number) => void } }
window.__biomesAdvance = advance;
advance(0);
if (!manual) {
  let last = performance.now();
  const frame = (now: number) => { advance(Math.min(0.1, (now - last) / 1000)); last = now; requestAnimationFrame(frame); };
  requestAnimationFrame(frame);
}
