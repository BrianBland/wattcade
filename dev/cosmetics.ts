import { ITEMS } from '../src/cosmetics/catalog';
import { drawRider } from '../src/cosmetics/draw/rider';
import { drawPet as remasteredPet, FLIERS } from '../src/cosmetics/draw/remastered/pets';
import { drawPet as classicPet } from '../src/cosmetics/draw/classic/pets';
import { drawTrail as remasteredTrail } from '../src/cosmetics/draw/remastered/trails';
import { drawTrail as classicTrail } from '../src/cosmetics/draw/classic/trails';
import { riderLook, withItem } from '../src/cosmetics/unlocks';
import type { Item, Slot } from '../src/cosmetics/types';

const style = document.querySelector<HTMLSelectElement>('#style')!;
const slot = document.querySelector<HTMLSelectElement>('#slot')!;
const color = document.querySelector<HTMLInputElement>('#color')!;
const speed = document.querySelector<HTMLInputElement>('#speed')!;
const cadence = document.querySelector<HTMLInputElement>('#cadence')!;
const freeze = document.querySelector<HTMLInputElement>('#freeze')!;
const query = new URLSearchParams(location.search);
style.value = query.get('style') === 'classic' ? 'legacy' : 'rich';
for (const [id, name] of [['hat', 'Hats'], ['jersey', 'Jerseys'], ['bike', 'Bikes'], ['paint', 'Paint'], ['pet', 'Pets'], ['trail', 'Trails']]) slot.add(new Option(name, id));
slot.value = query.get('slot') ?? 'hat';
let tiles: Array<{ canvas: HTMLCanvasElement; item: Item }> = [];
let time = 2, crank = .125, distance = 12, last = performance.now();
function build() {
  const gallery = document.querySelector<HTMLDivElement>('#gallery')!; gallery.replaceChildren(); tiles = [];
  for (const item of ITEMS.filter(it => it.slot === slot.value as Slot)) {
    const figure = document.createElement('figure'), canvas = document.createElement('canvas'), caption = document.createElement('figcaption');
    canvas.width = 480; canvas.height = 340; caption.textContent = item.name;
    figure.append(canvas, caption); gallery.append(figure); tiles.push({canvas, item});
  }
  draw();
}
function draw() {
  const base = { ...riderLook({level: 1, achievements: [], color: color.value}), artMode: style.value as 'rich' | 'legacy' };
  for (const {canvas, item} of tiles) {
    const g = canvas.getContext('2d')!; g.setTransform(1, 0, 0, 1, 0, 0); g.clearRect(0, 0, 480, 340);
    g.strokeStyle = '#91a4b544'; g.lineWidth = 1; g.beginPath(); g.moveTo(0, 290); g.lineTo(480, 290); g.stroke();
    if (item.slot === 'pet' && item.id !== 'none') {
      g.translate(235, FLIERS.has(item.id) ? 170 : 250); g.scale(18, 18);
      (style.value === 'legacy' ? classicPet : remasteredPet)(g, item.id, {t: time, speed: Number(speed.value), gait: distance * Math.PI * 2 / 1.1, color: color.value});
    } else if (item.slot === 'trail' && item.id !== 'none') {
      g.translate(445, 200); g.scale(9, 9);
      (style.value === 'legacy' ? classicTrail : remasteredTrail)(g, item.id, {t: time, speed: Number(speed.value), color: color.value, x0: -.5});
    } else {
      const zoom = item.slot === 'hat' ? 14 : item.slot === 'jersey' ? 9 : 6.8;
      g.translate(item.slot === 'hat' ? 190 : 235, item.slot === 'hat' ? 500 : 290); g.scale(zoom, zoom);
      drawRider(g, withItem(base, item), crank, distance, { t: time, speed: Number(speed.value) });
    }
  }
}
slot.addEventListener('change', build);
for (const el of [style, color, speed, cadence, freeze]) el.addEventListener('input', draw);
function frame(now: number) {
  const dt = Math.min(.1, (now - last) / 1000); last = now;
  if (!freeze.checked) { time += dt; crank += dt * Number(cadence.value) / 60; distance += dt * Number(speed.value); }
  if (now % 100 < 35) draw();
  requestAnimationFrame(frame);
}
build();
(window as unknown as {__cosmeticsReady: boolean}).__cosmeticsReady = true;
if (!query.has('manual')) requestAnimationFrame(frame);
