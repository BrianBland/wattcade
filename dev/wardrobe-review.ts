import { ITEMS } from '../src/cosmetics/catalog';
import { riderLook, withItem } from '../src/cosmetics/unlocks';
import { drawRider } from '../src/cosmetics/draw/rider';
import type { Item, OutfitLook, RiderLook, Slot } from '../src/cosmetics/types';

type Concept = { id: string; name: string; detail: string; outfit: OutfitLook };
type Group = { id: string; name: string; detail: string; items: Concept[] };
export const GROUPS: Group[] = [
  { id: 'bottoms', name: 'Bottoms', detail: 'A separate lower half: shorts, technical tights, and a very questionable trouser choice.', items: [
    { id: 'club', name: 'Club shorts', detail: 'Navy cycling shorts with a clean cream hem.', outfit: { bottoms: 'club' } },
    { id: 'aurora', name: 'Aurora tights', detail: 'Full-length teal with mint panels and calf chevrons.', outfit: { bottoms: 'aurora' } },
    { id: 'disco', name: 'Disco flares', detail: 'Hot pink, gold side stripes, enormous bell bottoms.', outfit: { bottoms: 'disco' } },
  ] },
  { id: 'footwear', name: 'Footwear', detail: 'Small pieces that follow every pedal stroke. Prioritize a clear sole, color, or silhouette.', items: [
    { id: 'road', name: 'Road shoes', detail: 'Ivory uppers, blue straps, a dark sole.', outfit: { footwear: 'road' } },
    { id: 'winged', name: 'Winged boots', detail: 'Teal boots with little golden messenger wings.', outfit: { footwear: 'winged' } },
    { id: 'ducks', name: 'Duck slippers', detail: 'Two yellow ducks. Entirely unsuitable for clipless pedals.', outfit: { footwear: 'ducks' } },
  ] },
  { id: 'eyewear', name: 'Eyewear', detail: 'Independent of headwear. Full-face helmets hide glasses; translucent helmets keep them visible.', items: [
    { id: 'shades', name: 'Club shades', detail: 'Black frames and one cool blue glint.', outfit: { eyewear: 'shades' } },
    { id: 'visor', name: 'Prism visor', detail: 'A magenta wraparound shield with a mint reflection.', outfit: { eyewear: 'visor' } },
    { id: 'stars', name: 'Star specs', detail: 'Oversized gold stars and blue lenses.', outfit: { eyewear: 'stars' } },
  ] },
  { id: 'back', name: 'Back', detail: 'A silhouette slot: a small bag, serious cargo, or propulsion no trainer manufacturer recommends.', items: [
    { id: 'musette', name: 'Musette', detail: 'A little sage canvas bag and cream shoulder strap.', outfit: { back: 'musette' } },
    { id: 'courier', name: 'Courier rolltop', detail: 'Burnt orange, rolled canvas, a big brass buckle.', outfit: { back: 'courier' } },
    { id: 'rocket', name: 'Twin rocket pack', detail: 'Retro silver boosters; the flames flicker as you ride.', outfit: { back: 'rocket' } },
  ] },
  { id: 'gloves', name: 'Hands', detail: 'The visibility test: subtle mitts, a longer armored cuff, and claws that take over the handlebars.', items: [
    { id: 'mitts', name: 'Club mitts', detail: 'Cream fingerless gloves with teal cuffs.', outfit: { gloves: 'mitts' } },
    { id: 'gauntlets', name: 'Dynamo gauntlets', detail: 'Steel forearm plates and a bright mint power cell.', outfit: { gloves: 'gauntlets' } },
    { id: 'claws', name: 'Lobster claws', detail: 'Red pincers. Excellent grip, terrible shifting.', outfit: { gloves: 'claws' } },
  ] },
];

const params = new URLSearchParams(location.search);
let seed = Number(params.get('seed') ?? 42) >>> 0;
let night = false, playing = false, time = 1.2;
const vanilla = riderLook({ color: '#25aab2', level: 1, achievements: [] });
const tiers = ['Simple', 'Interesting', 'Wacky'];
const forbiddenHats = new Set(['pumpkin', 'knight', 'football', 'bucket', 'dino', 'welder', 'bubble', 'cloud', 'umbrella', 'lungs']);
const bikePool = ['road', 'bmx', 'mtb', 'cruiser', 'chopper', 'bamboo', 'hobbyhorse', 'pennyfarthing'];
type RenderCard = { canvas: HTMLCanvasElement; concept: Concept; mixed: RiderLook; names: string; caption: HTMLElement };
const cards: RenderCard[] = [];
let random: () => number;
function reseed() { let state = seed; random = () => { state = (Math.imul(state, 1664525) + 1013904223) >>> 0; return state / 4294967296; }; }
function pick<T>(arr: T[]): T { return arr[Math.floor(random() * arr.length)]; }
function mixedLook(): { look: RiderLook; names: string } {
  let look = vanilla;
  const names: string[] = [];
  const pools: Array<[Slot, Item[]]> = [
    ['bike', ITEMS.filter(i => i.slot === 'bike' && bikePool.includes(i.id))],
    ['hat', ITEMS.filter(i => i.slot === 'hat' && !forbiddenHats.has(i.id))],
    ['jersey', ITEMS.filter(i => i.slot === 'jersey')],
    ['paint', ITEMS.filter(i => i.slot === 'paint')],
  ];
  for (const [, pool] of pools) { const it = pick(pool); look = withItem(look, it); names.push(it.name); }
  if (random() > .5) { const it = pick(ITEMS.filter(i => i.slot === 'pet' && ['corgi', 'cat', 'hamster', 'dragon'].includes(i.id))); look = withItem(look, it); names.push(it.name); }
  if (random() > .65) { const it = pick(ITEMS.filter(i => i.slot === 'trail' && ['sparks', 'leaves', 'hearts', 'rainbow'].includes(i.id))); look = withItem(look, it); names.push(it.name); }
  return { look, names: names.join(' · ') };
}

const groupsEl = document.querySelector<HTMLElement>('#groups')!;
function section(group: Group, index: number) {
  const section = document.createElement('section'); section.className = `group${group.id === 'combined' ? ' combined' : ''}`; section.id = group.id;
  const heading = document.createElement('div'); heading.className = 'group-head';
  const number = document.createElement('span'); number.className = 'group-number'; number.textContent = String(index + 1).padStart(2, '0');
  const h = document.createElement('h2'); h.textContent = group.name;
  const p = document.createElement('p'); p.textContent = group.detail;
  heading.append(number, h, p); section.append(heading);
  const grid = document.createElement('div'); grid.className = 'cards'; section.append(grid);
  group.items.forEach((concept, i) => {
    const card = document.createElement('article'); card.className = 'card';
    const head = document.createElement('div'); head.className = 'card-head';
    const tier = document.createElement('span'); tier.className = 'tier'; tier.textContent = tiers[i];
    const name = document.createElement('h3'); name.textContent = concept.name;
    const detail = document.createElement('p'); detail.textContent = concept.detail;
    head.append(tier, name, detail);
    const canvas = document.createElement('canvas'); canvas.width = 432; canvas.height = 450;
    canvas.setAttribute('aria-label', `${concept.name} with vanilla and existing cosmetics, plus smaller rider views`);
    const caption = document.createElement('div'); caption.className = 'mix-caption';
    card.append(head, canvas, caption); grid.append(card);
    cards.push({ canvas, concept, mixed: vanilla, names: '', caption });
  });
  groupsEl.append(section);
}
GROUPS.forEach(section);
section({ id: 'combined', name: 'Five slots, one rider', detail: 'All five new pieces equipped together. Starter kit above, existing Locker remix below.', items: tiers.map((tier, i) => ({
  id: `full-${i}`, name: `${tier} / full outfit`, detail: GROUPS.map(g => g.items[i].name).join(' + '),
  outfit: Object.assign({}, ...GROUPS.map(g => g.items[i].outfit)) as OutfitLook,
})) }, 5);

function label(g: CanvasRenderingContext2D, s: string, x: number, y: number, size = 10, color?: string) {
  g.fillStyle = color ?? (night ? '#adbeb3' : '#7c8978'); g.font = `600 ${size}px system-ui`; g.textAlign = 'left'; g.fillText(s, x, y);
}
function rider(g: CanvasRenderingContext2D, look: RiderLook, x: number, y: number, scale: number, t: number) {
  g.save(); g.translate(x, y); g.scale(scale, scale); drawRider(g, look, .18 + (t - 1.2) * 1.2, t * 6, { t, speed: 6 }); g.restore();
}
function renderCard(card: RenderCard, t: number) {
  const g = card.canvas.getContext('2d')!;
  g.fillStyle = night ? '#1c3038' : '#fffdf5'; g.fillRect(0, 0, 432, 450);
  for (const y of [175, 350]) {
    g.fillStyle = night ? '#2d4245' : '#f0f0e5'; g.fillRect(0, y, 432, 12);
    g.fillStyle = night ? '#506365' : '#d3d9c9'; g.fillRect(0, y, 432, 1);
  }
  label(g, 'VANILLA + NEW PIECE', 20, 28);
  const conceptLook = { ...vanilla, outfit: card.concept.outfit };
  const mixed = { ...card.mixed, outfit: card.concept.outfit };
  const scale = 4.6;
  rider(g, conceptLook, 252, 176, scale, t);
  label(g, 'EXISTING LOCKER + NEW PIECE', 20, 205);
  rider(g, mixed, 252, 351, card.mixed.bike === 'pennyfarthing' ? 4 : scale, t);
  label(g, 'SMALL / 1.5×', 20, 389); label(g, 'SMALL / 2.5×', 233, 389);
  rider(g, conceptLook, 126, 439, 1.5, t); rider(g, mixed, 337, 439, card.mixed.bike === 'pennyfarthing' ? 2 : 2.5, t);
}

const overview = document.querySelector<HTMLCanvasElement>('#overview')!;
function renderOverview(t: number) {
  const g = overview.getContext('2d')!;
  g.fillStyle = '#eeeade'; g.fillRect(0, 0, overview.width, overview.height);
  label(g, 'WATTCADE / WARDROBE STUDIES', 36, 37, 14, '#7c8978');
  label(g, 'Five new slots. Fifteen new ways to ride.', 36, 85, 36, '#233342');
  label(g, 'Each pair: vanilla + new item  /  random existing outfit + new item. Actual game renderer.', 36, 118, 16, '#617063');
  const columns = ['SIMPLE', 'INTERESTING', 'WACKY'];
  columns.forEach((s, i) => label(g, s, 36 + i * 500, 156, 13, '#9b5942'));
  GROUPS.forEach((group, row) => {
    const y = 182 + row * 300;
    group.items.forEach((concept, col) => {
      const x = 24 + col * 500, card = cards[row * 3 + col];
      g.fillStyle = '#fffdf5'; g.beginPath(); g.roundRect(x, y, 484, 284, 10); g.fill();
      label(g, group.name.toUpperCase(), x + 17, y + 25, 10, '#7c8978');
      label(g, concept.name, x + 17, y + 52, 20, '#233342');
      g.fillStyle = '#d3d9c9'; g.fillRect(x + 15, y + 229, 454, 1);
      rider(g, { ...vanilla, outfit: concept.outfit }, x + 130, y + 229, 4.2, t);
      rider(g, { ...card.mixed, outfit: concept.outfit, trail: 'none', pet: 'none' }, x + 364, y + 229, card.mixed.bike === 'pennyfarthing' ? 3.6 : 4.2, t);
      label(g, 'VANILLA', x + 65, y + 260, 10, '#7c8978'); label(g, 'EXISTING MIX', x + 302, y + 260, 10, '#7c8978');
    });
  });
  label(g, 'Render concepts · Seed ' + seed + ' · Bottoms / Footwear / Eyewear / Back / Hands', 36, 1716, 13, '#617063');
}
function renderAll(t: number) { cards.forEach(c => renderCard(c, t)); renderOverview(t); }
function shuffle() {
  reseed(); cards.forEach(c => {
    const mix = mixedLook(); c.mixed = mix.look; c.names = mix.names;
    c.caption.textContent = `Existing mix: ${c.names}`;
  });
  document.querySelector('#seed')!.textContent = `Outfit seed ${seed}`;
  renderAll(time);
}
document.querySelector('#shuffle')!.addEventListener('click', () => { seed++; shuffle(); });
document.querySelector('#background')!.addEventListener('click', e => {
  night = !night; const button = e.currentTarget as HTMLButtonElement;
  button.textContent = night ? 'Try day backdrop' : 'Try night backdrop'; button.setAttribute('aria-pressed', String(night)); renderAll(time);
});
document.querySelector('#animate')!.addEventListener('click', e => {
  playing = !playing; const button = e.currentTarget as HTMLButtonElement;
  button.textContent = playing ? 'Pause pedaling' : 'Play pedaling'; button.setAttribute('aria-pressed', String(playing));
});
let previous = 0;
function frame(now: number) {
  if (playing && now - previous >= 1000 / 30) { time += Math.min((now - previous) / 1000, .05); previous = now; renderAll(time); }
  else if (!playing) previous = now;
  requestAnimationFrame(frame);
}
if (params.get('overview') === '1') document.body.classList.add('overview');
shuffle(); requestAnimationFrame(frame);
declare global { interface Window { __wardrobeReady?: boolean; __wardrobeFrame?: (t: number) => void; __wardrobeCards?: RenderCard[] } }
window.__wardrobeFrame = t => { time = t; renderAll(t); };
window.__wardrobeCards = cards;
window.__wardrobeReady = true;
