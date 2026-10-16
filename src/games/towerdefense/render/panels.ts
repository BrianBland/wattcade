// DOM foreground uses the shell's font, glass surfaces and color tokens. The map stays Canvas 2D.
import { WEAPONS, WEAPON_NAME, type Element } from '../sim/defs';
import type { TdSnapshot } from '../sim/types';
import type { Box, TdLayout } from './layout';

export interface Hit extends Box { action: unknown }

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
.td-menu { pointer-events:auto; overflow:auto; display:flex; flex-direction:column; gap:8px; overscroll-behavior:contain; }
.td-menu header { display:flex; justify-content:space-between; align-items:center; gap:8px; }
.td-menu h2 { margin:0; color:var(--neon); font-size:28px; font-style:italic; }
.td-menu p { margin:0; color:var(--dim); }
.td-menu .btn { flex-shrink:0; width:100%; text-align:left; display:flex; justify-content:space-between; padding:8px 12px; font-size:16px; }
.td-menu .btn small { display:block; font-size:12px; text-transform:none; letter-spacing:0; }
.td-menu .selected { border-color:var(--neon); }
.td-hud[data-narrow=true] .td-current { flex-direction:column; align-items:flex-start; justify-content:center; gap:6px; }
.td-hud[data-narrow=true] .td-next { text-align:left; font-size:14px; }
.td-hud[data-narrow=true] .td-stat small { display:block; margin:0; font-size:10px; letter-spacing:0; }
.td-hud[data-narrow=true] .td-status { gap:12px; }
.td-hud[data-narrow=true] .panel { padding:8px 12px; }
.td-hud[data-narrow=true] .td-current.incoming { flex-direction:row; align-items:center; }
.td-hud[data-narrow=true] .td-current.incoming .td-brood b { font-size:18px; }
.td-hud[data-narrow=true] .td-current.incoming .td-next { text-align:right; }
`;

const color = (e: Element) => ({ blue: 'var(--neon)', red: 'var(--bad)', purple: 'var(--pink)' })[e];
// Snapshot strings are game-owned, but garage descriptions may contain a profile-derived value.
const esc = (s: string) => s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

export class TdHud {
  readonly root = document.createElement('div');
  private status = this.box('td-status panel');
  private current = this.box('td-current panel');
  private event = this.box('td-event');
  private menu = this.box('td-menu panel');
  private markup = new WeakMap<HTMLElement, string>();

  constructor(private send?: (a: unknown) => void) {
    this.root.className = 'td-hud';
    const style = document.createElement('style'); style.textContent = CSS; this.root.append(style);
    this.root.addEventListener('click', e => {
      const button = (e.target as HTMLElement).closest<HTMLButtonElement>('button[data-command]');
      if (!button || button.disabled) return;
      const index = Number(button.dataset.index);
      if (button.dataset.command === 'garageRow') this.send?.({ type: 'garageRow', row: index });
    });
  }

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
    this.root.dataset.narrow = String(W < 560);
    for (const [el, box] of [[this.status, L.status], [this.current, L.current], [this.event, L.brood], [this.menu, L.garage]] as const) this.place(el, box);
  }
  render(s: TdSnapshot, L: TdLayout, W: number) {
    this.resize(L, W);
    const run = s.phase === 'run', bd = s.brood;
    for (const el of [this.status, this.current]) el.hidden = !run;
    const pct = (n: number) => `${Math.max(0, Math.min(100, n * 100))}%`;
    this.html(this.status, `<div class="td-stat"><b>WAVE ${s.wave}</b><small>${s.lull > 0 ? 'Recovery' : `${Math.ceil(Math.max(0, s.waveMaxS - s.waveElapsed))}s remaining`}</small><div class="bar"><i style="width:${pct(s.waveElapsed / s.waveMaxS)}"></i></div></div><div class="td-stat td-hp ${s.baseHp / s.baseMaxHp < .25 ? 'low' : ''}"><b>${Math.ceil(s.baseHp)}<small>/ ${s.baseMaxHp} BASE · ${s.cores} CORES</small></b><div class="bar"><i style="width:${pct(s.baseHp / s.baseMaxHp)}"></i></div></div><div class="td-stat td-scrap"><b>${s.scrap}</b><small>Scrap</small></div>`);
    this.current.style.setProperty('--brood', color(bd.color));
    const incoming = bd.countdownS > 0;
    this.current.classList.toggle('incoming', incoming);
    const forecast = incoming
      ? `<strong class="td-count">${Math.ceil(bd.countdownS)}s</strong><small>W${bd.wave}${s.forecast.boss ? ' Boss' : ''} · ${bd.countdownS <= bd.rampS ? 'Ramping' : 'Recover'}</small>`
      : s.nextBrood ? `Next: ${s.nextBrood.color.toUpperCase()} BROOD → ${WEAPON_NAME[s.nextBrood.weapon]}` : 'Final brood';
    this.html(this.current, `<div class="td-brood"><b>${bd.color} brood · ${WEAPON_NAME[bd.weapon]}</b><small>${esc(bd.setting)}</small></div><div class="td-next">${forecast}</div>`);
    const e = s.effort, boss = s.boss, bn = s.banner;
    let headline = '', sub = '';
    if (boss) {
      headline = boss.next ? `${boss.next} in ${Math.ceil(boss.countdownS)}s` : boss.exposed ? `Exposed · ${Math.ceil(boss.windowLeftS)}s` : boss.telegraph ? `Sprint in ${Math.ceil(boss.windowLeftS)}s` : '';
      sub = boss.next ? 'Weapon changes after the countdown' : boss.weapon === 'rail' ? 'Hold ▲ for ERG sprint' : 'Sprint for ×1.5 damage';
    } else if (e) {
      headline = e.state === 'announced' ? `${e.kind} in ${Math.ceil(e.countdownS)}s` : e.state === 'active' ? `${e.kind} · ${Math.ceil(Math.max(0, e.needS - e.heldS))}s more · ${Math.ceil(e.leftS)}s left` : `${e.kind} ${e.state}`;
      sub = e.kind === 'spin' ? `${e.minRpm}+ rpm · ≥${Math.round(e.minFtp * 100)}% FTP` : e.kind === 'grind' ? `${e.minRpm}–${e.maxRpm} rpm · ≥${Math.round(e.minFtp * 100)}% FTP` : `${Math.round(e.minFtp * 100)}–${Math.round(e.maxFtp * 100)}% FTP`;
    }
    if (!headline && bn && s.t - bn.t0 < 4) { headline = bn.text; sub = bn.sub; }
    this.event.hidden = !run || incoming || !!s.workshop || !headline;
    this.html(this.event, `<b>${esc(headline)}</b><span>${esc(sub)}</span>`);
    this.menu.hidden = !s.garage;
    if (s.garage) {
      const gv = s.garage;
      const previous = this.menu.querySelector<HTMLElement>('.selected')?.dataset.index;
      this.html(this.menu, `<header><h2>Garage</h2><b>${gv.bank} parts</b></header><p>Best wave ${gv.bestWave} · Run ${gv.runs + 1}</p><small>Pedal to start in ${Math.ceil(gv.autoLeft)}s · ▲▼ choose · A buy · B start</small>${gv.rows.map((r, i) => `<button class="btn ${i === gv.sel ? 'selected' : ''}" data-command="garageRow" data-index="${i}"><span>${esc(r.name)}<small>${esc(r.desc)}</small></span><span>${r.cost ?? ''}</span></button>`).join('')}`);
      if (previous !== String(gv.sel)) this.menu.querySelector('.selected')?.scrollIntoView({ block: 'nearest' });
    }
  }
}

export function matchupCopy(s: Pick<TdSnapshot, 'matchup'>, element: Element): string {
  const strong = WEAPONS.reduce((a, b) => s.matchup[b][element] > s.matchup[a][element] ? b : a);
  const resisted = WEAPONS.reduce((a, b) => s.matchup[b][element] < s.matchup[a][element] ? b : a);
  return `${element.toUpperCase()} BROOD · ${WEAPON_NAME[strong].toUpperCase()} ✓ · ${WEAPON_NAME[resisted].toUpperCase()} ✗`;
}
