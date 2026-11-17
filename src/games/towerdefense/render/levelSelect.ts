// The ride select's tiles and map previews (HTML strings for the HUD layer; pure, so they test in Node). The pictures
// are the levels' real art (render/levelArt.ts), looked up through `art`; a tile waits on its ground colour meanwhile.
import { BAKED_LEVELS } from '../sim/baked';
import type { TdLevel } from '../sim/level';
import type { GarageRow, GarageView, LevelTile } from '../sim/types';

const esc = (s: string) => s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
/** Ground colours: the waiting tile, and the still's backing. */
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

/** A level's image URL (`preview`: the big one, when it exists), or null while it is being made. */
export type ArtLookup = (level: TdLevel, preview: boolean) => string | null;

/** A level's picture: its real art once made, else a shimmering tile in its ground colour. */
export function levelImage(level: TdLevel, art: ArtLookup | undefined, preview = false): string {
  const url = art?.(level, preview);
  if (url) return `<img class="td-map" src="${esc(url)}" alt="" draggable="false">`;
  const sw = GROUND_SWATCH[level.style] ?? GROUND_SWATCH.outpost;
  return `<div class="td-map td-map-wait" style="--ground:${sw.ground}"></div>`;
}
const tilePreview = (t: LevelTile, art: ArtLookup | undefined, preview = false) => {
  const l = BAKED_LEVELS[t.key];
  return l ? levelImage(l, art, preview) : '';
};
const facts = (t: LevelTile) => `${t.minutes} min · ${t.waves} waves · ${t.bosses} boss${t.bosses === 1 ? '' : 'es'} · ${t.pads} pads · ${styleName(t.roadStyle)} road`;

/**
 * The ride select: Campaign, Quick Ride and Endless as cards; intensity and stars as rows. `maps` are the next Quick
 * Ride and Endless maps once the background workers have built them (placeholders until then); `art` finds pictures.
 */
export function modesHtml(gv: GarageView, maps: { quick?: TdLevel | null; endless?: TdLevel | null } = {}, art?: ArtLookup): string {
  // The Quick Ride card carries its own ◀ ▶ (length) over the picture, swipes the same way, and rerolls its map.
  // (The Campaign card opens the level grid, which picks levels, so it has none.)
  const steps = (r: GarageRow, i: number) => r.kind !== 'quick' ? ''
    : `<button class="td-step prev" data-command="garageStep" data-index="${i}" data-step="-1" aria-label="Shorter ride">‹</button>`
      + `<button class="td-step next" data-command="garageStep" data-index="${i}" data-step="1" aria-label="Longer ride">›</button>`
      + `<button class="td-reroll" data-command="quickReroll" aria-label="New map">⟳ New map</button>`;
  const card = (r: GarageRow, i: number, art: string) => {
    const stepper = steps(r, i);
    return `<div class="btn td-card ${i === gv.sel ? 'selected' : ''}" role="button" tabindex="0" data-command="garageRow" data-index="${i}"${stepper ? ` data-swipe="garageStep"` : ''}>`
      + `<div class="td-card-pic">${art}${stepper}</div><span>${esc(r.name)}<small>${esc(r.desc)}</small></span></div>`;
  };
  const next = gv.levels[gv.campaignSel];
  const cards = gv.rows.map((r, i) => r.kind === 'campaign' ? card(r, i, next ? tilePreview(next, art, true) : '')
    : r.kind === 'quick' ? card(r, i, maps.quick ? levelImage(maps.quick, art, true) : '<div class="td-card-art td-quick">?</div>')
    : r.kind === 'start' ? card(r, i, maps.endless ? levelImage(maps.endless, art, true) : '<div class="td-card-art td-endless">∞</div>') : '').join('');
  const rows = gv.rows.map((r, i) => r.kind === 'campaign' || r.kind === 'quick' || r.kind === 'start' ? ''
    : `<button class="btn ${i === gv.sel ? 'selected' : ''}" data-command="garageRow" data-index="${i}"><span>${esc(r.name)}<small>${esc(r.desc)}</small></span></button>`).join('');
  return `<div class="td-cards">${cards}</div>${rows}`;
}

/**
 * The campaign page: one row of five tiles per ground, and a large preview of the selected level. `tileArt` finds the
 * grid's pictures (landscape-shaped in every orientation, so a row of five fills the panel's width).
 */
export function levelSelectHtml(gv: GarageView, art?: ArtLookup, tileArt: ArtLookup | undefined = art): string {
  const sel = gv.levels[gv.levelSel];
  const grounds: LevelTile[][] = [];
  for (const t of gv.levels) (grounds[Math.floor(t.index / 5)] ??= []).push(t);
  const grid = grounds.map((row) => `<div class="td-ground"><span>${esc(row[0].name.split(' ')[0])}</span>${row.map((t) =>
    `<button class="td-tile ${t.index === gv.levelSel ? 'selected' : ''} ${t.locked ? 'locked' : ''} ${t.index === gv.open ? 'next' : ''}" data-command="levelTile" data-index="${t.index}" aria-label="${esc(t.name)}${t.locked ? ' (locked)' : ''}">${tilePreview(t, tileArt)}<b>${esc(t.name.split(' ').slice(1).join(' '))}</b><i>${t.locked ? '🔒' : t.stars ? starText(t.stars) : 'new'}</i></button>`).join('')}</div>`).join('');
  const status = sel.locked ? `Locked · clear ${gv.levels[sel.index - 1]?.name ?? 'the level before'} first` : sel.stars ? `Best ${starText(sel.stars)} · ride again for more stars` : 'Not cleared yet';
  const step = (d: -1 | 1) => {
    const i = sel.index + d;
    return i < 0 || i >= gv.levels.length ? '' : `<button class="td-step ${d < 0 ? 'prev' : 'next'}" data-command="levelTile" data-index="${i}" aria-label="${d < 0 ? 'Previous' : 'Next'} level">${d < 0 ? '‹' : '›'}</button>`;
  };
  // ◀ ▶ over the big picture (and a swipe on it) step the level, like the controller's ◀ ▶
  const preview = `<div class="td-preview"><div class="td-preview-pic" data-swipe="levelTile" data-index="${sel.index}" data-max="${gv.levels.length - 1}">${tilePreview(sel, art, true)}${step(-1)}${step(1)}</div><div class="td-preview-text"><h3>${esc(sel.name)}</h3><p>${esc(facts(sel))}</p><p>${esc(status)}</p>`
    + `<div class="td-preview-actions"><button class="btn" data-command="levelStart" ${sel.locked ? 'disabled' : ''}>A · Ride</button><button class="btn" data-command="levelBack">B · Back</button></div></div></div>`;
  return `<div class="td-levels">${preview}<div class="td-grid">${grid}</div></div>`;
}
