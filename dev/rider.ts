import { loadSceneArt } from '../src/games/warmup/render/remastered/art';
import { createGameSession, NullInput, testProfile } from '../src/core';
import { module as game } from '../src/games/warmup';
import { WarmupRenderer } from '../src/games/warmup/render/renderer';
import { BIOMES, makeTerrain, type BiomeId } from '../src/games/warmup/sim/terrain';
import { BIKES } from '../src/cosmetics/draw/bikes';
import { drawRider } from '../src/cosmetics/draw/rider';
import { ITEMS } from '../src/cosmetics/catalog';
import type { WarmupSnapshot } from '../src/games/warmup/sim/sim';
import { riderLook } from '../src/cosmetics/unlocks';

const profile = testProfile({ color: '#27c5c7' });
profile.settings.overworldArt = new URLSearchParams(location.search).get('art') === 'legacy' ? 'legacy' : 'rich';
const look = riderLook(profile);
const scene = document.querySelector<HTMLDivElement>('#scene')!;
const cadence = document.querySelector<HTMLInputElement>('#cadence')!;
const pause = document.querySelector<HTMLInputElement>('#pause')!;
const biome = document.querySelector<HTMLSelectElement>('#biome')!;
const bike = document.querySelector<HTMLSelectElement>('#bike')!;
for (const id of Object.keys(BIKES)) bike.add(new Option(id, id));
const r = new WarmupRenderer();
const session = createGameSession({ game, profile, input: new NullInput(), fake: { script: 'z2' }, seed: 1 });
session.step(15 * 30);
r.mount(scene, { profile, insets: { top: 0, right: 0, bottom: 0, left: 0 } });
new ResizeObserver(() => r.resize(scene.clientWidth, scene.clientHeight)).observe(scene);
const baseSnapshot = session.sim.snapshot() as WarmupSnapshot;
const terrain = makeTerrain(baseSnapshot.terrainSeed, baseSnapshot.maxGrade);
bike.addEventListener('change', () => {
  r.unmount();
  r.mount(scene, { profile: testProfile({ ...profile, level: 100, achievements: ITEMS.flatMap(it => 'achievement' in it.source ? [it.source.achievement] : []), cosmetics: { loadout: { bike: bike.value }, picks: Object.fromEntries(ITEMS.filter(it => 'pick' in it.source).map((it, i) => [i, it.id])) } }) });
});
let revs = 0.125, last = performance.now(), distance = 40, animationTime = 1;
const tiles: { g: CanvasRenderingContext2D; id: string }[] = [];
for (const id of Object.keys(BIKES)) {
  const tile = document.createElement('div'); tile.className = 'tile';
  const c = document.createElement('canvas'); c.width = 176; c.height = 180;
  const label = document.createElement('span'); label.textContent = id;
  tile.append(c, label); document.querySelector('#gallery')!.append(tile);
  tiles.push({ g: c.getContext('2d')!, id });
}
const study = document.querySelector<HTMLCanvasElement>('#study')!.getContext('2d')!;
function draw(now: number) {
  const dt = Math.min(0.1, (now - last) / 1000); last = now;
  const rpm = Number(cadence.value), speed = rpm / 12;
  if (!pause.checked) { revs += dt * rpm / 60; distance += dt * speed; animationTime += dt; }
  document.querySelector('#rpm')!.textContent = `${rpm} rpm`;
  const id = biome.value as BiomeId;
  r.render({ ...baseSnapshot, d: distance, v: speed, from: id, to: id, biome: id, nextBiome: BIOMES[(BIOMES.indexOf(id) + 1) % BIOMES.length], grade: terrain.grade(distance) * baseSnapshot.hill, mix: 0, startBiome: BIOMES.indexOf(id), driveIn: 0 }, { ...session.bikeStore.get(), crankRevs: revs }, session.ctx.input());
  study.setTransform(1, 0, 0, 1, 0, 0); study.fillStyle = '#e3e8df'; study.fillRect(0, 0, 1120, 280);
  for (let i = 0; i < 4; i++) {
    study.save(); study.translate(140 + i * 280, 244); study.scale(8, 8);
    drawRider(study, { ...look, bike: bike.value }, i / 4, 3, { t: 1, speed: 6 }); study.restore();
    study.fillStyle = '#253647'; study.font = '14px system-ui'; study.fillText(`${i * 90}°`, 128 + i * 280, 270);
  }
  for (const { g, id: bikeId } of tiles) {
    g.setTransform(1, 0, 0, 1, 0, 0); g.clearRect(0, 0, 176, 180);
    g.save(); g.translate(88, 170); g.scale(4, 4);
    drawRider(g, { ...look, bike: bikeId }, revs, distance, { t: animationTime, speed }); g.restore();
  }
  (window as unknown as { __riderReady: boolean }).__riderReady = true;
  requestAnimationFrame(draw);
}
if (profile.settings.overworldArt === 'rich') await loadSceneArt();
requestAnimationFrame(draw);
