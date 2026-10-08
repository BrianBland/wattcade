// End-of-ride postcard: the recap's caption lines and pop-in timing (pure), the card's DOM, and a small album of past
// postcards kept per rider in IndexedDB (images are ~30 KB JPEG thumbnails; the sim save stays small).
import { createStore, get, set, type UseStore } from 'idb-keyval';
import { FESTIVALS } from '../sim/extras';

export interface Postcard { img: string; date: string; lines: string[]; season: string; ride: number }
export interface RideTally {
  shipsDocked: number; buildingsBuilt: number; upgrades: number; whales: number; visitors: number; festivals: number;
  stormsWeathered: number; bloomGained: number; festivalsHeld: number;
}

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
/** Up to four lines for the back of the card, most special first. */
export function postcardLines(t: RideTally): string[] {
  const out: string[] = [];
  if (t.festivals) out.push(...FESTIVALS.slice(Math.max(0, t.festivalsHeld - t.festivals), t.festivalsHeld).map((f) => `🎉 The ${f.name}!`));
  if (t.visitors) out.push(`✨ ${plural(t.visitors, 'special visitor')}`);
  if (t.whales) out.push(t.whales === 1 ? '🐋 A whale came by!' : `🐋 ${t.whales} whales came by!`);
  if (t.shipsDocked) out.push(`⛵ ${plural(t.shipsDocked, 'ship')} safely home`);
  if (t.buildingsBuilt) out.push(`🏠 ${plural(t.buildingsBuilt, 'new building')}${t.upgrades ? `, ${plural(t.upgrades, 'upgrade')}` : ''}`);
  else if (t.upgrades) out.push(`⬆️ ${plural(t.upgrades, 'upgrade')}`);
  if (t.stormsWeathered) out.push(`⛈ ${plural(t.stormsWeathered, 'storm')} weathered`);
  if (t.bloomGained >= 0.01) out.push(`🌸 The island bloomed +${Math.round(t.bloomGained * 100)}%`);
  return out.length ? out.slice(0, 4) : ['🌊 A quiet day by the sea'];
}

/** When (recap seconds) each of `n` new buildings pops in: spread over [t0, t1], never closer than 0.25 s. */
export function popSchedule(n: number, t0 = 1, t1 = 6.5): number[] {
  if (n <= 0) return [];
  const step = n === 1 ? 0 : Math.max(0.25, Math.min(1.2, (t1 - t0) / (n - 1)));
  return Array.from({ length: n }, (_, i) => t0 + i * step);
}

const SEASON_ICON: Record<string, string> = { spring: '🌸', summer: '☀️', autumn: '🍂', winter: '❄️' };
export const POSTCARD_CSS = `
.lh-pc { position:absolute; left:50%; top:50%; width:min(480px, 64%, 62vh); transform: translate(-50%,-50%) rotate(-2.5deg); background:#fbf6ea; color:#3a3226; padding:12px 12px 14px; border-radius:6px; box-shadow: 0 18px 50px #0009; text-shadow:none; animation: lh-pc-in .9s cubic-bezier(.2,1.4,.4,1) both; pointer-events:none; z-index:6 }
.lh-pc img { display:block; width:100%; max-height:44vh; object-fit:cover; border-radius:3px; border:1px solid #0002 }
.lh-pc .back { display:flex; gap:12px; margin-top:10px; align-items:flex-start }
.lh-pc .msg { flex:1; font: 20px/1.25 'Segoe Print', 'Bradley Hand', 'Comic Sans MS', cursive; }
.lh-pc .msg h2 { margin:0 0 4px; font-size:22px; color:#1f4a7a }
.lh-pc .msg div { font-size:15px }
.lh-pc .stamp { width:74px; padding:6px 4px; border:3px dotted #c0392b; text-align:center; font: 700 11px system-ui; color:#c0392b; transform: rotate(4deg) }
.lh-pc .stamp b { display:block; font-size:30px; line-height:1.1 }
.lh-pc .post { margin-top:6px; width:74px; height:74px; border:2px solid #3a322688; border-radius:50%; display:flex; align-items:center; justify-content:center; text-align:center; font: 700 10px/1.2 system-ui; color:#3a3226aa; transform: rotate(-12deg) }
@keyframes lh-pc-in { from { transform: translate(-50%,-160%) rotate(14deg); opacity:0 } to { transform: translate(-50%,-50%) rotate(-2.5deg); opacity:1 } }
.lh-ui.recap .lh-panel, .lh-ui.recap .lh-toasts { opacity:0; transition: opacity .8s }
.lh-album { display:flex; gap:8px; flex-wrap:wrap } .lh-album figure { margin:0; width:120px; font-size:11px; opacity:.85 } .lh-album img { width:120px; border-radius:4px; border:3px solid #fbf6ea; transform: rotate(-2deg) }
`;

export function postcardEl(p: Postcard): HTMLElement {
  const el = document.createElement('div'); el.className = 'lh-pc';
  const img = document.createElement('img'); img.src = p.img; el.appendChild(img);
  const back = document.createElement('div'); back.className = 'back';
  const msg = document.createElement('div'); msg.className = 'msg';
  const h = document.createElement('h2'); h.textContent = "Greetings from Keeper's Isle!"; msg.appendChild(h);
  for (const l of p.lines) { const d = document.createElement('div'); d.textContent = l; msg.appendChild(d); }
  const side = document.createElement('div');
  const stamp = document.createElement('div'); stamp.className = 'stamp';
  const icon = document.createElement('b'); icon.textContent = SEASON_ICON[p.season] ?? '🏝️'; stamp.append(icon, document.createTextNode(`RIDE ${p.ride}`));
  const post = document.createElement('div'); post.className = 'post'; post.textContent = p.date.toUpperCase();
  side.append(stamp, post);
  back.append(msg, side); el.appendChild(back);
  return el;
}

/** Shrink the frame just rendered to a JPEG thumbnail. Call right after renderer.render() (no preserveDrawingBuffer needed). */
export function snapshot(canvas: HTMLCanvasElement, width = 520): string {
  const c = document.createElement('canvas'), k = width / Math.max(1, canvas.width);
  c.width = width; c.height = Math.round(canvas.height * k);
  c.getContext('2d')!.drawImage(canvas, 0, 0, c.width, c.height);
  return c.toDataURL('image/jpeg', 0.78);
}

const MAX_ALBUM = 24;
let store: UseStore | null = null;
const db = () => (store ??= createStore('wattcade-lighthouse', 'postcards'));
export async function loadAlbum(profileId: string): Promise<Postcard[]> {
  try { return ((await get<Postcard[]>(profileId, db())) ?? []).slice(-MAX_ALBUM); } catch { return []; }
}
export async function addToAlbum(profileId: string, p: Postcard): Promise<Postcard[]> {
  const list = [...(await loadAlbum(profileId)), p].slice(-MAX_ALBUM);
  try { await set(profileId, list, db()); } catch { /* storage full or unavailable: keep the card on screen only */ }
  return list;
}
