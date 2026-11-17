// DOM foreground: the shell's font with the game's own riveted-plate theme (theme.ts). The map stays Canvas 2D.
import { knownLevel } from '../sim/levelCache';
import { BOSS_ESCALATION } from '../sim/boss';
import { WEAPONS, WEAPON_NAME, type Element } from '../sim/defs';
import type { TdSnapshot } from '../sim/types';
import type { Box, TdLayout } from './layout';
import { constructionStatus, rideObjective } from './objectives';
import { levelImage, levelSelectHtml, modesHtml, styleName, type ArtLookup } from './levelSelect';
import type { TdLevel } from '../sim/level';
import { THEME_CSS } from './theme';

export interface Hit extends Box { action: unknown }
/** Below this width the HUD goes narrow: one column of ride-select cards, with landscape-shaped pictures. */
export const NARROW_W = 560;
/** The loading card's live parts: how far the level's art is (0..1) and its picture. */
export interface LoadingView { progress: number }
/** A level's picture for one orientation (`preview`: the big one when it exists). */
export type TdArt = (level: TdLevel, turned: boolean, preview: boolean) => string | null;

const CSS = `
.td-hud { position:absolute; inset:0; pointer-events:none; color:var(--fg); font:inherit; }
.td-hud [hidden] { display:none!important; }
.td-box { position:absolute; box-sizing:border-box; }
.td-hud .panel { padding:10px 16px; }
.td-status { display:grid; grid-template-columns:1fr 1fr auto; gap:18px; align-items:center; }
.td-hud small { color:var(--dim); font-size:12px; letter-spacing:1px; text-transform:uppercase; }
.td-stat { min-width:0; }
.td-stat b { font-size:clamp(18px,2.5vw,26px); font-weight:900; font-style:italic; font-variant-numeric:tabular-nums; }
.td-stat small { margin-left:8px; }
.td-stat .bar { height:5px; margin-top:5px; }
.td-hud .bar > i { transition:none; }
.td-hp .bar > i { background:var(--lime); }
.td-hp.low .bar > i { background:var(--bad); }
.td-scrap { text-align:right; color:var(--warn); }
.td-current { display:flex; gap:16px; justify-content:space-between; align-items:center; }
.td-current b { color:var(--brood); font-size:clamp(16px,2vw,22px); font-style:italic; text-transform:uppercase; }
.td-current small { display:block; margin-top:3px; }
.td-next { color:var(--dim); font-size:15px; text-align:right; }
.td-hud .td-current.incoming { padding:8px 16px; }
.td-current.incoming .td-brood b { font-size:28px; line-height:1; }
.td-count { display:block; color:var(--brood); font-size:28px; font-weight:900; font-variant-numeric:tabular-nums; line-height:1; }
.td-event { display:flex; flex-direction:column; justify-content:center; gap:8px; text-align:center; text-shadow:0 2px 4px var(--bg); overflow:auto; }
.td-event b { font-size:clamp(24px,3.4vw,38px); color:var(--neon); text-transform:uppercase; }
.td-event span { font-size:18px; }
.td-objective { display:flex; flex-direction:column; gap:12px; overflow:auto; pointer-events:auto; overscroll-behavior:contain; }
.td-objective-main { flex:1; display:flex; flex-direction:column; justify-content:center; gap:10px; }
.td-objective h3 { margin:0; color:var(--neon); font-size:24px; line-height:1.15; font-style:italic; text-transform:uppercase; }
.td-objective p { margin:0; font-size:15px; line-height:1.4; overflow-wrap:anywhere; }
.td-objective-detail { color:var(--dim); }
.td-objective .bar { height:6px; }
.td-crew { border-top:1px solid var(--line); padding-top:12px; }
.td-crew b { display:block; margin-bottom:5px; font-size:14px; }
.td-crew p { color:var(--dim); font-size:13px; }
.td-hud[data-objective-compact=true] .td-objective { gap:8px; }
.td-hud[data-objective-compact=true] .td-objective-main { gap:6px; }
.td-hud[data-objective-compact=true] .td-objective h3 { font-size:20px; }
.td-hud[data-objective-compact=true] .td-objective p { font-size:13px; }
.td-hud[data-objective-compact=true] .td-crew { padding-top:8px; }
.td-hud[data-objective-compact=true] .td-crew p { font-size:12px; }
.td-menu { pointer-events:auto; overflow:auto; display:flex; flex-direction:column; gap:8px; overscroll-behavior:contain; }
.td-menu header { display:flex; justify-content:space-between; align-items:center; gap:8px; }
.td-menu h2 { margin:0; color:var(--neon); font-size:28px; font-style:italic; }
.td-menu p { margin:0; color:var(--dim); }
.td-menu .btn { flex-shrink:0; width:100%; text-align:left; display:flex; justify-content:space-between; padding:8px 12px; font-size:16px; }
.td-menu .btn small { display:block; font-size:12px; text-transform:none; letter-spacing:0; }
.td-menu .selected { border-color:var(--neon); }
.td-map { display:block; width:100%; height:100%; border-radius:6px; object-fit:cover; }
.td-map-wait { background:linear-gradient(100deg, transparent 30%, rgba(255,255,255,.08) 50%, transparent 70%) 0 0 / 250% 100%, var(--ground, #2b2d30); animation:td-shimmer 1.4s linear infinite; }
@keyframes td-shimmer { from { background-position:100% 0, 0 0; } to { background-position:-150% 0, 0 0; } }
.td-loading { display:grid; place-items:center; pointer-events:auto; }
.td-loading-card { width:min(440px, 100%); max-height:100%; box-sizing:border-box; display:flex; flex-direction:column; gap:10px; padding:14px; overflow:hidden; animation:td-rise .3s ease-out; }
@keyframes td-rise { from { opacity:0; transform:translateY(12px) scale(.98); } to { opacity:1; transform:none; } }
.td-loading-art { position:relative; overflow:hidden; border-radius:10px; aspect-ratio:var(--map-aspect); max-height:46vh; box-shadow:0 10px 30px rgba(0,0,0,.45), inset 0 0 0 1px var(--glass-line); }
.td-loading-art .td-map { position:absolute; inset:0; border-radius:0; animation:td-drift 9s ease-in-out infinite alternate; }
.td-loading-art::after { content:''; position:absolute; inset:0; background:linear-gradient(115deg, transparent 35%, rgba(130,240,255,.18) 50%, transparent 65%) 0 0 / 300% 100%; animation:td-sweep 2.2s ease-in-out infinite; }
@keyframes td-drift { from { transform:scale(1.04); } to { transform:scale(1.12) translate(-1.5%, 1%); } }
@keyframes td-sweep { from { background-position:100% 0; } to { background-position:-100% 0; } }
.td-loading-card small { color:var(--dim); }
.td-loading-card h2 { margin:0; color:var(--neon); font-size:clamp(22px,3.2vw,30px); font-style:italic; line-height:1.1; }
.td-loading-card p { margin:0; color:var(--dim); font-size:14px; }
.td-loading-bar { position:relative; height:8px; border-radius:99px; background:rgba(255,255,255,.08); overflow:hidden; }
.td-loading-bar > i { position:absolute; inset:0 auto 0 0; border-radius:inherit; background:linear-gradient(90deg, var(--neon), #ffd24a); box-shadow:0 0 12px var(--neon); transition:width .25s ease-out; }
.td-loading-bar > i::after { content:''; position:absolute; inset:0; background:linear-gradient(90deg, transparent, rgba(255,255,255,.55), transparent) 0 0 / 40% 100% no-repeat; animation:td-glint 1.1s linear infinite; }
@keyframes td-glint { from { background-position:-40% 0; } to { background-position:140% 0; } }
.td-loading-status { display:flex; justify-content:space-between; gap:8px; font-size:13px; color:var(--dim); }
.td-loading-status b { color:var(--fg); font-weight:700; }
.td-hud[data-wide="true"] .td-loading-card { width:min(620px, 100%); display:grid; grid-template-columns:minmax(0,1.15fr) minmax(0,1fr); align-items:center; column-gap:16px; }
.td-hud[data-wide="true"] .td-loading-art { grid-row:span 5; max-height:none; }
@media (prefers-reduced-motion: reduce) { .td-loading-art .td-map, .td-loading-art::after, .td-loading-bar > i::after, .td-map-wait { animation:none; } }
.td-cards { display:grid; grid-template-columns:repeat(3, minmax(0,1fr)); gap:8px; flex-shrink:0; }
.td-hud[data-narrow="true"] .td-cards { grid-template-columns:1fr; }
.td-menu .td-card { flex-direction:column; justify-content:flex-start; gap:8px; padding:8px; cursor:pointer; }
.td-card-pic, .td-preview-pic { position:relative; touch-action:pan-y; }
.td-card-pic { width:100%; }
.td-card-pic > .td-map, .td-card-pic > .td-card-art { width:100%; }
.td-hud[data-narrow="true"] .td-card-pic > .td-map, .td-hud[data-narrow="true"] .td-card-pic > .td-card-art { aspect-ratio:112 / 80; }
.td-card[data-swipe] { touch-action:pan-y; }
.td-step { position:absolute; top:50%; width:44px; height:44px; margin-top:-22px; display:grid; place-items:center; padding:0 0 3px; border-radius:50%; border:1px solid var(--glass-line); background:rgba(8,10,18,.62); color:var(--fg); font:700 30px/1 system-ui, sans-serif; cursor:pointer; backdrop-filter:blur(4px); -webkit-backdrop-filter:blur(4px); box-shadow:0 2px 8px rgba(0,0,0,.4); pointer-events:auto; }
.td-step.prev { left:6px; } .td-step.next { right:6px; }
.td-step:active { background:var(--neon); color:#05101a; }
.td-reroll { position:absolute; top:6px; right:6px; min-height:36px; padding:0 12px; border-radius:99px; border:1px solid var(--glass-line); background:rgba(8,10,18,.62); color:var(--fg); font:700 13px/1 inherit; cursor:pointer; backdrop-filter:blur(4px); -webkit-backdrop-filter:blur(4px); }
.td-reroll:active { background:var(--neon); color:#05101a; }
.td-preview-pic { justify-self:center; max-width:100%; }
.td-hud[data-wide="true"] .td-preview-pic { width:100%; }
.td-card .td-map, .td-card-art { width:100%; aspect-ratio:var(--map-aspect); height:auto; }
.td-card-art { display:grid; place-items:center; border-radius:6px; background:#1b1d26; font-size:44px; font-weight:800; color:var(--dim); }
.td-endless { color:var(--pink); } .td-quick { color:var(--neon); }
.td-levels { display:grid; grid-template-columns:1fr; gap:10px; min-height:0; }
.td-hud[data-wide="true"] .td-levels { grid-template-columns:minmax(0,1.25fr) minmax(0,1fr); align-items:start; }
.td-hud[data-wide="true"] .td-preview { order:2; position:sticky; top:0; }
.td-preview { display:grid; grid-template-columns:auto minmax(0,1fr); gap:10px; align-items:start; }
.td-hud[data-wide="true"] .td-preview { grid-template-columns:1fr; }
.td-preview .td-map { aspect-ratio:var(--map-aspect); width:auto; max-width:100%; height:28vh; }
.td-hud[data-wide="true"] .td-preview .td-map { width:100%; height:auto; }
.td-preview h3 { margin:0 0 4px; color:var(--neon); font-size:20px; }
.td-preview-text p { font-size:13px; margin:0 0 4px; }
.td-preview-actions { display:flex; gap:8px; margin-top:8px; }
.td-preview-actions .btn { width:auto; flex:1; justify-content:center; }
.td-grid { display:flex; flex-direction:column; gap:6px; }
.td-ground { display:grid; grid-template-columns:84px repeat(5, minmax(0,64px)); gap:6px; align-items:center; justify-content:start; }
.td-hud[data-narrow="true"] .td-ground { grid-template-columns:62px repeat(5, minmax(0,1fr)); gap:4px; }
.td-hud[data-narrow="true"] .td-ground > span { font-size:9px; letter-spacing:0; }
.td-hud[data-wide="true"] .td-ground { grid-template-columns:84px repeat(5, minmax(0,1fr)); justify-content:stretch; }
.td-ground > span { font-size:11px; color:var(--dim); text-transform:uppercase; letter-spacing:.06em; }
.td-tile { position:relative; padding:3px; border-radius:8px; border:1px solid var(--glass-line); background:var(--panel-solid); color:var(--fg); font:inherit; cursor:pointer; min-height:44px; }
.td-tile .td-map { aspect-ratio:var(--map-aspect); height:auto; }
.td-tile b { position:absolute; left:6px; top:5px; font-size:11px; text-shadow:0 1px 2px #000; }
.td-tile i { display:block; font-style:normal; font-size:11px; color:#ffd24a; text-align:center; margin-top:2px; }
.td-tile.selected { border-color:var(--neon); box-shadow:0 0 0 2px var(--neon); }
.td-tile.next:not(.selected) { border-color:#ffd24a; }
.td-tile.locked .td-map { opacity:.35; filter:grayscale(.8); }
.td-tile.locked i { color:var(--dim); }
.td-hud[data-narrow=true] .td-current { flex-direction:column; align-items:flex-start; justify-content:center; gap:6px; }
.td-hud[data-narrow=true] .td-next { text-align:left; font-size:14px; }
.td-hud[data-narrow=true] .td-stat small { display:block; margin:0; font-size:10px; letter-spacing:0; }
.td-hud[data-narrow=true] .td-status { gap:12px; }
.td-hud[data-narrow=true] .panel { padding:8px 12px; }
.td-hud[data-narrow=true] .td-current.incoming { flex-direction:row; align-items:center; }
.td-hud[data-narrow=true] .td-current.incoming .td-brood b { font-size:18px; }
.td-hud[data-narrow=true] .td-current.incoming .td-next { text-align:right; }
.td-hud[data-column=true] .td-status { grid-template-columns:1fr; gap:8px; align-content:center; }
.td-hud[data-column=true] .td-scrap { text-align:left; }
.td-hud[data-column=true] .td-current, .td-hud[data-column=true] .td-current.incoming { flex-direction:column; align-items:flex-start; justify-content:center; gap:6px; }
.td-hud[data-column=true] .td-next { text-align:left; font-size:14px; }
.td-hud[data-column=true] .td-current b, .td-hud[data-column=true] .td-current.incoming .td-brood b { font-size:20px; line-height:1.15; }
.td-hud[data-column=true] .td-stat b { font-size:22px; }
.td-hud[data-compact=true] .td-status, .td-hud[data-compact=true] .td-current { overflow:auto; pointer-events:auto; overscroll-behavior:contain; padding:6px 10px; }
.td-hud[data-compact=true] .td-status { grid-template-columns:1fr auto; gap:4px 8px; }
.td-hud[data-compact=true] .td-status > :first-child { grid-column:1 / -1; }
.td-hud[data-compact=true] .td-stat b { font-size:18px; }
.td-hud[data-compact=true] .td-stat small, .td-hud[data-compact=true] .td-current small { font-size:10px; letter-spacing:0; }
.td-hud[data-compact=true] .td-stat small { margin-left:4px; }
.td-hud[data-compact=true] .td-current, .td-hud[data-compact=true] .td-current.incoming { gap:4px; }
.td-hud[data-compact=true] .td-current b, .td-hud[data-compact=true] .td-current.incoming .td-brood b { font-size:16px; }
.td-hud[data-compact=true] .td-current .td-count { font-size:24px; }
`;

const color = (e: Element) => `var(--td-${e})`;
// Snapshot strings are game-owned, but garage descriptions may contain a profile-derived value.
const esc = (s: string) => s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

export class TdHud {
  readonly root = document.createElement('div');
  private status = this.box('td-status panel');
  private current = this.box('td-current panel');
  private event = this.box('td-event');
  private objective = this.box('td-objective panel');
  private menu = this.box('td-menu panel');
  private loadingCard = this.box('td-loading');
  /** Level pictures for the menus and the loading card (the renderer's LevelArt). */
  art: TdArt | null = null;
  private markup = new WeakMap<HTMLElement, string>();

  constructor(private send?: (a: unknown) => void) {
    this.root.className = 'td-hud';
    const style = document.createElement('style'); style.textContent = CSS + THEME_CSS; this.root.append(style);
    this.root.addEventListener('pointerdown', this.onSwipeStart);
    this.root.addEventListener('pointerup', this.onSwipeEnd);
    this.root.addEventListener('pointercancel', () => { this.swipe = null; });
    this.root.addEventListener('keydown', e => { // the cards are role=button divs (they hold ◀ ▶ buttons)
      const el = e.target as HTMLElement;
      if ((e.key === 'Enter' || e.key === ' ') && el.getAttribute?.('role') === 'button') { e.preventDefault(); el.click(); }
    });
    this.root.addEventListener('click', e => {
      if (this.swiped) { this.swiped = false; e.preventDefault(); e.stopPropagation(); return; } // the click that ends a swipe
      const button = (e.target as HTMLElement).closest<HTMLElement>('[data-command]');
      if (!button || (button as HTMLButtonElement).disabled) return;
      const index = Number(button.dataset.index);
      if (button.dataset.command === 'garageRow') this.send?.({ type: 'garageRow', row: index });
      if (button.dataset.command === 'quickReroll') this.send?.({ type: 'quickReroll' });
      if (button.dataset.command === 'garageStep') this.send?.({ type: 'garageStep', row: index, step: Number(button.dataset.step) });
      if (button.dataset.command === 'levelTile') this.send?.({ type: 'levelTile', index });
      if (button.dataset.command === 'levelStart') this.send?.({ type: 'levelStart' });
      if (button.dataset.command === 'levelBack') this.send?.({ type: 'levelBack' });
    });
  }

  private swipe: { id: number; x: number; y: number; el: HTMLElement } | null = null;
  private swiped = false;
  /** A sideways swipe on a card or the level picture steps it (left = next), like ◀ ▶. */
  private onSwipeStart = (e: PointerEvent) => {
    const el = (e.target as HTMLElement).closest<HTMLElement>('[data-swipe]');
    this.swipe = el && !(e.target as HTMLElement).closest('.td-step') ? { id: e.pointerId, x: e.clientX, y: e.clientY, el } : null;
  };
  private onSwipeEnd = (e: PointerEvent) => {
    const sw = this.swipe; this.swipe = null;
    if (!sw || sw.id !== e.pointerId) return;
    const s = swipeStep(e.clientX - sw.x, e.clientY - sw.y);
    if (!s) return;
    this.swiped = true; setTimeout(() => { this.swiped = false; }, 400);
    const index = Number(sw.el.dataset.index);
    if (sw.el.dataset.swipe === 'garageStep') this.send?.({ type: 'garageStep', row: index, step: s });
    else if (sw.el.dataset.swipe === 'levelTile') {
      const to = index + s;
      if (to >= 0 && to <= Number(sw.el.dataset.max)) this.send?.({ type: 'levelTile', index: to });
    }
  };

  private box(className: string) {
    const el = document.createElement('div'); el.className = `td-box ${className}`; this.root.append(el); return el;
  }
  private place(el: HTMLElement, b: Box) {
    Object.assign(el.style, { left: `${b.x}px`, top: `${b.y}px`, width: `${b.w}px`, height: `${b.h}px` });
  }
  private html(el: HTMLElement, html: string) {
    if (this.markup.get(el) === html) return;
    const focused = el.contains(document.activeElement) ? (document.activeElement as HTMLElement).dataset : null;
    const scroll = el.scrollTop;
    el.innerHTML = html; this.markup.set(el, html);
    if (focused?.command) el.querySelector<HTMLElement>(`[data-command="${focused.command}"]${focused.index === undefined ? '' : `[data-index="${focused.index}"]`}`)?.focus({ preventScroll: true });
    el.scrollTop = scroll;
  }
  resize(L: TdLayout, W: number) {
    this.root.dataset.narrow = String(W < NARROW_W);
    this.root.dataset.wide = String(L.field.turned);
    this.root.style.setProperty('--map-aspect', L.field.turned ? '112 / 80' : '80 / 112');
    this.root.dataset.column = String(L.column);
    this.root.dataset.compact = String(L.column && L.UH < 360);
    this.root.dataset.objectiveCompact = String(!!L.objective && L.objective.h < 280);
    for (const [el, box] of [[this.status, L.status], [this.current, L.current], [this.event, L.brood], [this.menu, L.garage], [this.loadingCard, L.garage]] as const) this.place(el, box);
    if (L.objective) this.place(this.objective, L.objective);
  }
  render(s: TdSnapshot, L: TdLayout, W: number, loading: LoadingView | null = null) {
    this.resize(L, W);
    const turned = L.field.turned, art: ArtLookup = (l, preview) => this.art?.(l, turned, preview) ?? null;
    const cardTurned = turned || W < NARROW_W, cardArt: ArtLookup = (l, preview) => this.art?.(l, cardTurned, preview) ?? null;
    this.loadingCard.hidden = !loading;
    if (loading) {
      this.html(this.loadingCard, loadingHtml(s, art));
      const p = Math.max(0, Math.min(1, loading.progress)), bar = this.loadingCard.querySelector<HTMLElement>('.td-loading-bar');
      if (bar) {
        bar.setAttribute('aria-valuenow', String(Math.round(p * 100)));
        (bar.firstElementChild as HTMLElement).style.width = `${Math.max(4, p * 100).toFixed(1)}%`;
        const status = this.loadingCard.querySelector('.td-loading-status')!;
        status.firstElementChild!.textContent = `${loadingStage(p)}…`; status.lastElementChild!.textContent = `${Math.round(p * 100)}%`;
      }
    }
    const run = s.phase === 'run' && !loading, bd = s.brood;
    for (const el of [this.status, this.current]) el.hidden = !run;
    const pct = (n: number) => `${Math.max(0, Math.min(100, n * 100))}%`;
    this.html(this.status, `<div class="td-stat"><b>WAVE ${s.wave}${s.run ? `<small>/${s.run.waves}</small>` : ''}</b><small>${s.lull > 0 ? 'Recovery' : `${Math.ceil(Math.max(0, s.waveMaxS - s.waveElapsed))}s remaining`}</small><div class="bar"><i style="width:${pct(s.waveElapsed / s.waveMaxS)}"></i></div></div><div class="td-stat td-hp ${s.baseHp / s.baseMaxHp < .25 ? 'low' : ''}"><b>${Math.ceil(s.baseHp)}<small>/ ${s.baseMaxHp} BASE</small></b><div class="bar"><i style="width:${pct(s.baseHp / s.baseMaxHp)}"></i></div></div><div class="td-stat td-scrap"><b>${s.scrap}</b><small>Scrap</small></div>`);
    this.current.style.setProperty('--brood', color(bd.color));
    const incoming = bd.countdownS > 0;
    this.current.classList.toggle('incoming', incoming);
    const forecast = incoming
      ? `<strong class="td-count">${Math.ceil(bd.countdownS)}s</strong><small>W${bd.wave} · ${s.set.warmup ? 'Warm-up' : s.set.role === 'boss' ? 'Boss' : s.set.role === 'easy' ? 'Easy' : `Set ${s.set.set} · ${s.set.pos}/${s.set.of}`} · ${s.set.role === 'easy' ? 'Recovery' : bd.countdownS <= bd.rampS ? 'Ramping' : 'Recover'}</small>`
      : s.nextBrood ? `Next: ${s.nextBrood.color.toUpperCase()} BROOD → ${WEAPON_NAME[s.nextBrood.weapon]}` : 'Final brood';
    this.html(this.current, `<div class="td-brood"><b>${bd.color} brood · ${WEAPON_NAME[bd.weapon]}</b><small>${esc(bd.setting)}</small></div><div class="td-next">${forecast}</div>`);
    const e = s.effort, boss = s.boss, bn = s.banner;
    let headline = '', sub = '';
    if (boss) {
      headline = boss.pending ? `Phase ${boss.phase + 1} in ${Math.ceil(boss.countdownS)}s` : boss.charge === 'warn' ? 'Ram charge incoming' : boss.charge === 'on' ? 'Ram charging' : boss.exposed ? `Exposed · ${Math.ceil(boss.windowLeftS)}s` : boss.telegraph ? `Sprint in ${Math.ceil(boss.windowLeftS)}s` : '';
      sub = boss.pending ? `${BOSS_ESCALATION[boss.color]} · same weapon` : boss.charge ? 'Burn it down before it closes' : boss.weapon === 'rail' ? 'Hold ▲ for ERG sprint' : 'Sprint for ×1.5 damage';
    } else if (e) {
      headline = e.state === 'announced' ? `${e.kind} in ${Math.ceil(e.countdownS)}s` : e.state === 'active' ? `${e.kind} · ${Math.ceil(Math.max(0, e.needS - e.heldS))}s more · ${Math.ceil(e.leftS)}s left` : `${e.kind} ${e.state}`;
      sub = e.kind === 'spin' ? `${e.minRpm}+ rpm · ≥${Math.round(e.minFtp * 100)}% FTP` : e.kind === 'grind' ? `${e.minRpm}–${e.maxRpm} rpm · ≥${Math.round(e.minFtp * 100)}% FTP` : `${Math.round(e.minFtp * 100)}–${Math.round(e.maxFtp * 100)}% FTP`;
    }
    const intro = s.fx.some((f) => f.kind === 'bossIntro' && s.t - f.t0 < f.life); // the canvas name card owns this moment
    if (!headline && bn && s.t - bn.t0 < 4 && !intro) { headline = bn.text; sub = bn.sub; }
    this.event.hidden = !!L.objective || !run || incoming || !!s.workshop || !headline;
    this.html(this.event, `<b>${esc(headline)}</b><span>${esc(sub)}</span>`);
    this.objective.hidden = !L.objective || !run || !!s.workshop;
    if (L.objective) {
      const o = rideObjective(s), crew = constructionStatus(s);
      this.html(this.objective, `<div class="td-objective-main"><small>${esc(o.label)}</small><h3>${esc(o.title)}</h3><p>${esc(o.target)}</p>${o.progress === undefined ? '' : `<div class="bar" role="progressbar" aria-label="Effort progress" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${Math.round(o.progress * 100)}"><i style="width:${pct(o.progress)}"></i></div>`}<p class="td-objective-detail">${esc(o.detail)}</p></div><div class="td-crew"><b>${esc(crew.title)}</b><p>${esc(crew.detail)}</p></div>`);
    }
    this.menu.hidden = !s.garage;
    if (s.garage) {
      const gv = s.garage;
      const sel = this.menu.querySelector<HTMLElement>('.selected');
      const previous = sel ? `${sel.dataset.command === 'levelTile' ? 'L' : ''}${sel.dataset.index}` : undefined;
      const auto = gv.breatherLeft > 0 ? `Take a breather · ${Math.ceil(gv.breatherLeft)}s` : `Pedal to start in ${Math.ceil(gv.autoLeft)}s`;
      const head = `<header><h2>${esc(gv.title)}</h2><b>${gv.stars}★</b></header><p>${esc(gv.subtitle)}</p>`;
      const results = gv.rows.some((r) => r.kind === 'next' || r.kind === 'finish');
      const body = gv.page === 'campaign'
        ? `<small>${auto} · ◀▶▲▼ choose · A ride · B back</small>${levelSelectHtml(gv, art)}`
        : results
          ? `<small>${auto} · ▲▼ choose · A select · B start</small>${gv.rows.map((r, i) => `<button class="btn ${i === gv.sel ? 'selected' : ''}" data-command="garageRow" data-index="${i}"><span>${esc(r.name)}<small>${esc(r.desc)}</small></span></button>`).join('')}`
          : `<small>${auto} · ▲▼ choose · A select · B start</small>${modesHtml(gv, { quick: s.nextMaps?.[0] && knownLevel(s.nextMaps[0]), endless: s.nextMaps?.[1] && knownLevel(s.nextMaps[1]) }, cardArt)}`;
      this.html(this.menu, head + body);
      const now = gv.page === 'campaign' ? `L${gv.levelSel}` : String(gv.sel);
      if (previous !== now) this.menu.querySelector('.selected')?.scrollIntoView({ block: 'nearest' });
    }
  }
}

/** A finished drag as a step: a mostly sideways move of 40+ px; left = next (+1), right = previous (-1), else 0. */
export function swipeStep(dx: number, dy: number): -1 | 0 | 1 {
  return Math.abs(dx) >= 40 && Math.abs(dx) > 1.5 * Math.abs(dy) ? (dx < 0 ? 1 : -1) : 0;
}

/** What the loading card says about where the work is. */
export function loadingStage(progress: number): string {
  return progress < 0.12 ? 'Unpacking the ground kit' : progress < 0.8 ? 'Laying the road' : progress < 1 ? 'Raising the outpost' : 'Waking the hive';
}
/** The card over the menu while a level's art is made: its picture, name, facts and a progress bar (set live by render). */
export function loadingHtml(s: TdSnapshot, art: ArtLookup): string {
  const l = s.level, run = s.run;
  const kicker = run ? (run.kind === 'campaign' ? 'Campaign' : 'Quick Ride') : 'Endless';
  const facts = run ? `${run.minutes} min · ${run.waves} waves · ${l.pads.length} pads · ${styleName(l.roadStyle ?? '')} road`
    : `Sets forever · ${l.pads.length} pads${l.roadStyle ? ` · ${styleName(l.roadStyle)} road` : ''}`;
  const name = run?.name ?? l.name;
  return `<div class="td-loading-card panel" role="status" aria-live="polite"><div class="td-loading-art">${levelImage(l, art, true)}</div>`
    + `<small>${esc(kicker)} · next up</small><h2>${esc(name)}</h2><p>${esc(facts)}</p>`
    + `<div class="td-loading-bar" role="progressbar" aria-label="Preparing the level" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0"><i style="width:4%"></i></div>`
    + `<div class="td-loading-status"><b>${loadingStage(0)}…</b><span>0%</span></div></div>`;
}

export function matchupCopy(s: Pick<TdSnapshot, 'matchup'>, element: Element): string {
  const strong = WEAPONS.reduce((a, b) => s.matchup[b][element] > s.matchup[a][element] ? b : a);
  const resisted = WEAPONS.reduce((a, b) => s.matchup[b][element] < s.matchup[a][element] ? b : a);
  return `${element.toUpperCase()} BROOD · ${WEAPON_NAME[strong].toUpperCase()} ✓ · ${WEAPON_NAME[resisted].toUpperCase()} ✗`;
}
