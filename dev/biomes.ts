import { loadSceneArt } from '../src/games/warmup/render/remastered/art';
import { createGameSession, NullInput, testProfile } from '../src/core';
import { module as game } from '../src/games/warmup';
import { WarmupRenderer } from '../src/games/warmup/render/renderer';
import { BIOMES, BIOME_NAMES, biomeAt, makeTerrain, type BiomeId } from '../src/games/warmup/sim/terrain';
import type { WarmupSnapshot } from '../src/games/warmup/sim/sim';

const scene = document.querySelector<HTMLDivElement>('#scene')!;
const choice = document.querySelector<HTMLSelectElement>('#biome')!;
const blend = document.querySelector<HTMLInputElement>('#blend')!;
const ride = document.querySelector<HTMLInputElement>('#ride')!;
for (const id of BIOMES) choice.add(new Option(BIOME_NAMES[id], id));
choice.add(new Option('Drive-In', 'driveIn'));
const query = new URLSearchParams(location.search);
choice.value = query.get('biome') ?? 'countryside';
const art = document.querySelector<HTMLSelectElement>('#art')!;
art.value = ['classic', 'legacy'].includes(query.get('art') ?? '') ? 'legacy' : 'rich';
const profile = testProfile({ color: '#27c5c7' });
profile.settings.overworldArt = art.value as 'legacy' | 'rich';
const session = createGameSession({ game, profile, input: new NullInput(), fake: { script: 'z2' }, seed: 1, simOpts: { terrainSeed: 1, startBiome: 0 } });
session.step(450);
const base = session.sim.snapshot() as WarmupSnapshot;
const terrain = makeTerrain(base.terrainSeed, base.maxGrade);
const renderer = new WarmupRenderer();
renderer.mount(scene, { profile, insets: { top: 0, right: 0, bottom: 0, left: 0 } });
new ResizeObserver(() => {
  if (scene.clientWidth && scene.clientHeight) { renderer.resize(scene.clientWidth, scene.clientHeight); render(); }
}).observe(scene);
let distance = 600, revs = .125, last = performance.now();
function render() {
  if (!scene.clientWidth || !scene.clientHeight) return;
  const id = choice.value, driveIn = id === 'driveIn' ? 1 : 0;
  const start = Math.max(0, BIOMES.indexOf(id as BiomeId));
  const mix = Number(blend.value);
  const d = mix > 0 ? base.biomeM - base.blendM / 2 + mix * base.blendM : distance;
  const at = biomeAt(d, base.biomeM, start, base.blendM);
  const next = BIOMES[(start + 1) % BIOMES.length];
  renderer.setScreen(driveIn ? { x: scene.clientWidth * .54, y: scene.clientHeight * .2, w: scene.clientWidth * .3, h: scene.clientHeight * .23 } : null);
  renderer.render({ ...base, d, v: 6, t: d / 6, grade: terrain.grade(d) * base.hill, startBiome: start,
    biome: at.dom, from: at.cur, to: at.next, nextBiome: next, mix: at.mix,
    toNextM: at.toNextM, driveIn, driveInOn: !!driveIn }, { ...session.bikeStore.get(), crankRevs: revs }, session.ctx.input());
  document.querySelector('#mix')!.textContent = `${Math.round(mix * 100)}%`;
  document.querySelector('#next')!.textContent = driveIn ? 'Drive-In lobby · projector trailer and screen placement' : `${BIOME_NAMES[id as BiomeId]} → ${BIOME_NAMES[next]} · daylight via ?hour=15 or ?hour=21`;
}
const w = window as unknown as { __biomeRender: (id: string, mix?: number, distanceM?: number) => void; __biomeReady: boolean };
w.__biomeRender = (id, mix = 0, distanceM) => { if (distanceM !== undefined) distance = distanceM; choice.value = id; blend.value = String(mix); render(); };
art.addEventListener('change', () => {
  profile.settings.overworldArt = art.value as 'legacy' | 'rich';
  renderer.unmount(); renderer.mount(scene, { profile }); render();
  if (art.value === 'rich') void loadSceneArt().then(render);
});
choice.addEventListener('change', () => { blend.value = '0'; render(); });
blend.addEventListener('input', render);
function frame(now: number) {
  if (ride.checked) { const dt = Math.min(.1, (now - last) / 1000); distance += dt * 6; revs += dt * 1.2; }
  last = now; render(); w.__biomeReady = true; requestAnimationFrame(frame);
}
if (art.value === 'rich') await loadSceneArt();
if (query.has('manual')) { render(); w.__biomeReady = true; } else requestAnimationFrame(frame);
