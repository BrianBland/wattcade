// The ride select's tiles and map previews (HTML strings for the HUD layer; pure, so they test in Node).
import { BAKED_LEVELS } from '../sim/baked';
import { levelGeometry, type TdLevel } from '../sim/level';
import { FIELD_H, FIELD_W } from '../sim/defs';
import type { GarageRow, GarageView, LevelTile } from '../sim/types';

type Pt = { x: number; y: number };
const esc = (s: string) => s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
/** Ground swatches for the previews (the real ground art is too heavy for thumbnails). */
export const GROUND_SWATCH: Record<string, { ground: string; road: string }> = {
  outpost: { ground: '#3d4038', road: '#b89a6a' }, scrapyard: { ground: '#3b3631', road: '#a98a62' },
  badlands: { ground: '#5a4330', road: '#d0a671' }, volcanic: { ground: '#2e2220', road: '#8a6a5a' },
  overgrown: { ground: '#2c3d2a', road: '#b7a07a' }, blight: { ground: '#33283d', road: '#9c8aa6' },
};
const STYLE_NAME: Record<string, string> = {
  lasso: 'Lasso', ring: 'Ring', zigzag: 'Zigzag', trident: 'Trident', switchback: 'Switchback', crossover: 'Crossover', fork: 'Fork', merge: 'Merge',
};
export const styleName = (s: string) => STYLE_NAME[s] ?? s;
const starText = (n: number) => `${'★'.repeat(n)}${'☆'.repeat(3 - n)}`;

const previews = new Map<string, string>();
/** An SVG map of a level: ground, every road, pads, the turret and the hive. `turned` matches the landscape field. */
export function levelPreviewSvg(level: TdLevel, turned: boolean, detail = true): string {
  const cacheKey = `${level.id}|${level.seed}|${level.name}|${turned}|${detail}`;
  const hit = previews.get(cacheKey);
  if (hit) return hit;
  const geo = levelGeometry(level), sw = GROUND_SWATCH[level.style] ?? GROUND_SWATCH.outpost;
  const at = (p: Pt) => (turned ? { x: FIELD_H - p.y, y: p.x } : p);
  const n = (v: number) => Math.round(v * 10) / 10;
  const line = (pts: readonly Pt[]) => pts.filter((_, i) => i % 3 === 0 || i === pts.length - 1).map(at).map((p) => `${n(p.x)},${n(p.y)}`).join(' ');
  const [w, h] = turned ? [FIELD_H, FIELD_W] : [FIELD_W, FIELD_H];
  const roads = geo.roads.map((r) => `<polyline points="${line(r)}"/>`).join('');
  const t = at(level.turret), m = at(level.hiveMouth);
  const pads = detail ? level.pads.map((p) => { const q = at(p); return `<circle cx="${n(q.x)}" cy="${n(q.y)}" r="2.6"/>`; }).join('') : '';
  const svg = `<svg class="td-map" viewBox="0 0 ${w} ${h}" preserveAspectRatio="xMidYMid slice" aria-hidden="true">`
    + `<rect width="${w}" height="${h}" fill="${sw.ground}"/>`
    + `<g fill="none" stroke="${sw.road}" stroke-width="${n(level.roadHalfWidth * 2)}" stroke-linecap="round" stroke-linejoin="round">${roads}</g>`
    + `<g fill="none" stroke="#ffd24a" stroke-width="0.8">${pads}</g>`
    + `<circle cx="${n(m.x)}" cy="${n(m.y)}" r="5" fill="#1a1024" stroke="#b46cff" stroke-width="1"/>`
    + `<circle cx="${n(t.x)}" cy="${n(t.y)}" r="${n(level.turretR * 0.8)}" fill="#c98a2c" stroke="#ffe08a" stroke-width="1"/></svg>`;
  previews.set(cacheKey, svg);
  return svg;
}
const tilePreview = (t: LevelTile, turned: boolean, detail: boolean) => {
  const l = BAKED_LEVELS[t.key];
  return l ? levelPreviewSvg(l, turned, detail) : '';
};
const facts = (t: LevelTile) => `${t.minutes} min · ${t.waves} waves · ${t.bosses} boss${t.bosses === 1 ? '' : 'es'} · ${t.pads} pads · ${styleName(t.roadStyle)} road`;

/** The ride select: Campaign, Quick Ride and Endless as cards; intensity and stars as rows. */
export function modesHtml(gv: GarageView, turned: boolean): string {
  const card = (r: GarageRow, i: number, art: string) => `<button class="btn td-card ${i === gv.sel ? 'selected' : ''}" data-command="garageRow" data-index="${i}">${art}<span>${esc(r.name)}<small>${esc(r.desc)}</small></span></button>`;
  const next = gv.levels[gv.campaignSel];
  const cards = gv.rows.map((r, i) => r.kind === 'campaign' ? card(r, i, next ? tilePreview(next, turned, false) : '')
    : r.kind === 'quick' ? card(r, i, '<div class="td-card-art td-quick">?</div>')
    : r.kind === 'start' ? card(r, i, '<div class="td-card-art td-endless">∞</div>') : '').join('');
  const rows = gv.rows.map((r, i) => r.kind === 'campaign' || r.kind === 'quick' || r.kind === 'start' ? ''
    : `<button class="btn ${i === gv.sel ? 'selected' : ''}" data-command="garageRow" data-index="${i}"><span>${esc(r.name)}<small>${esc(r.desc)}</small></span></button>`).join('');
  return `<div class="td-cards">${cards}</div>${rows}`;
}

/** The campaign page: one row of five tiles per ground, and a large preview of the selected level. */
export function levelSelectHtml(gv: GarageView, turned: boolean): string {
  const sel = gv.levels[gv.levelSel];
  const grounds: LevelTile[][] = [];
  for (const t of gv.levels) (grounds[Math.floor(t.index / 5)] ??= []).push(t);
  const grid = grounds.map((row) => `<div class="td-ground"><span>${esc(row[0].name.split(' ')[0])}</span>${row.map((t) =>
    `<button class="td-tile ${t.index === gv.levelSel ? 'selected' : ''} ${t.locked ? 'locked' : ''} ${t.index === gv.open ? 'next' : ''}" data-command="levelTile" data-index="${t.index}" aria-label="${esc(t.name)}${t.locked ? ' (locked)' : ''}">${tilePreview(t, turned, false)}<b>${esc(t.name.split(' ').slice(1).join(' '))}</b><i>${t.locked ? '🔒' : t.stars ? starText(t.stars) : 'new'}</i></button>`).join('')}</div>`).join('');
  const status = sel.locked ? `Locked · clear ${gv.levels[sel.index - 1]?.name ?? 'the level before'} first` : sel.stars ? `Best ${starText(sel.stars)} · ride again for more stars` : 'Not cleared yet';
  const preview = `<div class="td-preview">${tilePreview(sel, turned, true)}<div class="td-preview-text"><h3>${esc(sel.name)}</h3><p>${esc(facts(sel))}</p><p>${esc(status)}</p>`
    + `<div class="td-preview-actions"><button class="btn" data-command="levelStart" ${sel.locked ? 'disabled' : ''}>A · Ride</button><button class="btn" data-command="levelBack">B · Back</button></div></div></div>`;
  return `<div class="td-levels">${preview}<div class="td-grid">${grid}</div></div>`;
}
