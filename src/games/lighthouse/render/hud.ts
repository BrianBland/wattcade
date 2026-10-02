// DOM overlay for Keeper's Light: resources, sea gauges with docking limits, ship forecast, storm banner,
// a big coaching line (readable from the saddle), toasts, and the build panel (tap-friendly).
import type { Snap } from './snap';

const DISTRICT_NAME: Record<string, string> = { harbour: 'the harbour', hillside: 'the hillside', hilltop: 'the hilltop', headland: 'the headland', islet: 'Gull Rock' };
const RANKS = ['Apprentice Keeper', 'Keeper', 'Senior Keeper', 'Harbourmaster', 'Master of the Light', 'Admiral of the Light'];
/** Endless title from lifetime ships and storms. */
export function keeperRank(ships: number, storms: number) { const pts = ships + storms * 10; const i = Math.min(RANKS.length - 1, Math.floor(Math.sqrt(pts / 25))); return { name: RANKS[i], next: i < RANKS.length - 1 ? (i + 1) * (i + 1) * 25 - pts : 0 }; }
import { PLOTS } from '../sim/layout';

const SHIP_ICON: Record<string, string> = { smack: '⛵', schooner: '⛵', steamer: '🚢' };
const SHIP_KIND: Record<string, string> = { smack: 'Fishing smack', schooner: 'Schooner', steamer: 'Steamer' };
const CHECK: Record<string, [string, string]> = {
  ok: ['Clear to dock', 'ok'], fog: ['Fog too thick', 'bad'], chop: ['Seas too rough', 'bad'], dark: ['Lamp too dim', 'bad'],
};

const CSS = `
.lh-ui { position:absolute; inset:0; pointer-events:none; font: 600 15px/1.25 system-ui, -apple-system, sans-serif; color:#fff; text-shadow: 0 1px 2px #0008; -webkit-user-select:none; user-select:none; }
.lh-panel { background: rgba(12,22,36,0.62); border: 1px solid rgba(255,255,255,0.14); border-radius: 14px; backdrop-filter: blur(6px); -webkit-backdrop-filter: blur(6px); }
.lh-tl { position:absolute; left:12px; top:12px; padding:10px 12px; min-width: 210px; }
.lh-res { display:flex; gap:14px; font-size:19px; margin-bottom:8px; }
.lh-res b { font-variant-numeric: tabular-nums; }
.lh-g { display:grid; grid-template-columns: 52px 150px 18px; align-items:center; gap:4px 8px; font-size:13px; }
.lh-bar { position:relative; height:10px; border-radius:6px; background: rgba(255,255,255,0.14); overflow:visible; }
.lh-bar i { position:absolute; left:0; top:0; bottom:0; border-radius:6px; transition: width .3s; }
.lh-bar u { position:absolute; top:-3px; bottom:-3px; width:2px; background:#fff; border-radius:1px; text-decoration:none; }
.lh-ok { color:#7dff9a } .lh-bad { color:#ff8a7a }
.lh-next { margin-top:7px; font-size:12px; opacity:.8; max-width: 250px }
.lh-tr { position:absolute; right:12px; top:12px; width: 238px; padding:10px 12px; }
.lh-tr h4 { margin:0 0 6px; font-size:12px; letter-spacing:.08em; text-transform:uppercase; opacity:.75 }
.lh-ship { padding:6px 0; border-top: 1px solid rgba(255,255,255,0.1); }
.lh-ship:first-of-type { border-top:none }
.lh-ship .row { display:flex; justify-content:space-between; gap:6px }
.lh-ship .prog { height:5px; border-radius:3px; background: rgba(255,255,255,0.15); margin:4px 0 3px; }
.lh-ship .prog i { display:block; height:100%; border-radius:3px; background:#8fd3ff }
.lh-chip { font-size:12px; padding:1px 7px; border-radius:9px; }
.lh-chip.ok { background:#1f7a3e } .lh-chip.bad { background:#9a2b25 } .lh-chip.done { background:#5a4a1a }
.lh-storm { position:absolute; left:50%; top:12px; transform:translateX(-50%); padding:10px 18px; text-align:center; font-size:20px; min-width: 300px; }
.lh-storm.warn { background: rgba(120,70,10,0.75) } .lh-storm.on { background: rgba(70,20,30,0.8) } .lh-storm.surge { background: rgba(120,90,10,0.85); animation: lh-pulse .5s infinite alternate }
.lh-storm .bar { height:8px; border-radius:4px; background:rgba(255,255,255,.2); margin-top:6px; overflow:hidden } .lh-storm .bar i { display:block; height:100%; background:#ffd84a }
@keyframes lh-pulse { from { transform:translateX(-50%) scale(1) } to { transform:translateX(-50%) scale(1.05) } }
.lh-coach { position:absolute; left:12px; bottom:12px; padding:10px 16px; font-size:22px; border-left: 6px solid #7dff9a; max-width: 52%; }
.lh-toasts { position:absolute; left:50%; bottom:72px; transform:translateX(-50%); display:flex; flex-direction:column; align-items:center; gap:6px; }
.lh-toast { padding:6px 14px; border-radius:18px; background: rgba(12,22,36,0.72); font-size:16px; white-space:nowrap; transition: opacity .6s; }
.lh-br { position:absolute; right:12px; bottom:12px; display:flex; gap:8px; pointer-events:auto; }
.lh-btn { pointer-events:auto; cursor:pointer; border:1px solid rgba(255,255,255,0.25); color:#fff; background: rgba(12,22,36,0.72); border-radius:14px; padding:10px 16px; font: 700 17px system-ui, sans-serif; }
.lh-btn.hot { background: #2f7d3f; animation: lh-glow 1s infinite alternate }
@keyframes lh-glow { from { box-shadow: 0 0 0 #ffd84a } to { box-shadow: 0 0 14px #ffd84a } }
.lh-build { position:absolute; right:12px; bottom:12px; width: 330px; padding:12px; pointer-events:auto; }
.lh-build h3 { margin:0 0 2px; font-size:18px } .lh-build .sub { font-size:12px; opacity:.75; margin-bottom:8px }
.lh-opt { display:grid; grid-template-columns: 30px 1fr auto; gap:2px 8px; align-items:center; padding:7px 8px; border-radius:10px; cursor:pointer; border:2px solid transparent; }
.lh-opt.sel { background: rgba(255,255,255,0.12); border-color:#ffd84a }
.lh-opt .ic { font-size:22px; grid-row: span 2 } .lh-opt .nm { font-size:16px } .lh-opt .cost { font-size:13px; text-align:right; font-variant-numeric: tabular-nums }
.lh-opt .ef { font-size:12px; opacity:.8; grid-column: 2 / 4 } .lh-opt.dim { opacity:.5 }
.lh-opt .why { color:#ff9a8a }
.lh-build .acts { display:flex; gap:8px; margin-top:10px } .lh-build .acts .lh-btn { flex:1; text-align:center }
.lh-btn.go { background:#2f7d3f } .lh-btn.go.no { background:#555; opacity:.7 }
.lh-hint { font-size:12px; opacity:.75; margin-top:6px; text-align:center }
.lh-list { max-height: 330px; overflow: hidden; }
.lh-bonus { margin-top:8px; padding:6px 8px; border-radius:8px; background: rgba(255,216,74,0.14); color:#ffe9a0; font-size:13px }
.lh-streak { margin-top:6px; font-size:13px } .lh-streak b { color:#ffe9a0 }
.lh-log { position:absolute; left:50%; top:50%; transform:translate(-50%,-50%); width:min(680px, 94%); max-height:90%; overflow:auto; padding:14px 18px; pointer-events:auto; font-size:14px }
.lh-cols { display:grid; grid-template-columns: 1fr 1fr; gap: 0 22px } @media (max-width: 760px) { .lh-cols { grid-template-columns: 1fr } }
.lh-log h2 { margin:0 0 2px; font-size:22px } .lh-log h4 { margin:12px 0 6px; font-size:12px; letter-spacing:.08em; text-transform:uppercase; opacity:.7 }
.lh-log .grid { display:grid; grid-template-columns: 1fr auto; gap:3px 16px } .lh-log .grid b { font-variant-numeric: tabular-nums; text-align:right }
.lh-dist { display:flex; justify-content:space-between; padding:3px 0 } .lh-goal { height:6px; border-radius:3px; background:rgba(255,255,255,.15); margin:2px 0 6px; overflow:hidden } .lh-goal i { display:block; height:100%; background:#8fd3ff }
@media (max-width: 760px) { .lh-tr { width: 190px } .lh-coach { font-size:17px; max-width: 60% } .lh-g { grid-template-columns: 44px 100px 16px } .lh-build { width: 290px } }
`;

export class Hud {
  private root: HTMLDivElement;
  private tl: HTMLDivElement; private tr: HTMLDivElement; private storm: HTMLDivElement; private coach: HTMLDivElement;
  private toasts: HTMLDivElement; private br: HTMLDivElement; private build: HTMLDivElement; private log: HTMLDivElement;
  private cache = new Map<HTMLElement, string>();
  private lastT = -1;

  constructor(container: HTMLElement, private send?: (a: unknown) => void) {
    const style = document.createElement('style'); style.textContent = CSS;
    const root = document.createElement('div'); root.className = 'lh-ui'; root.appendChild(style);
    const mk = (cls: string) => { const d = document.createElement('div'); d.className = cls; root.appendChild(d); return d; };
    this.tl = mk('lh-panel lh-tl'); this.tr = mk('lh-panel lh-tr'); this.storm = mk('lh-panel lh-storm'); this.coach = mk('lh-panel lh-coach');
    this.toasts = mk('lh-toasts'); this.br = mk('lh-br'); this.build = mk('lh-panel lh-build'); this.log = mk('lh-panel lh-log');
    container.appendChild(root); this.root = root;
    root.addEventListener('pointerdown', (e) => {
      const el = (e.target as HTMLElement).closest('[data-act]') as HTMLElement | null;
      if (!el || !this.send) return;
      e.preventDefault(); e.stopPropagation();
      const act = el.dataset.act!;
      if (act === 'build') this.send({ type: 'build' });
      else if (act === 'open') this.send({ type: 'mode', mode: 'build' });
      else if (act === 'close') this.send({ type: 'mode', mode: 'watch' });
      else if (act === 'view') this.send({ type: 'view' });
      else if (act === 'log') this.send({ type: 'log' });
      else if (act.startsWith('sel:')) this.send({ type: 'select', building: act.slice(4) });
    });
  }

  private set(el: HTMLElement, html: string, show = true) {
    el.style.display = show ? '' : 'none';
    if (!show) return;
    if (this.cache.get(el) !== html) { this.cache.set(el, html); el.innerHTML = html; }
  }

  update(s: Snap) {
    if (Math.abs(s.t - this.lastT) < 0.1) return; // ~10 Hz
    this.lastT = s.t;
    const pct = (v: number) => Math.round(Math.max(0, Math.min(1, v)) * 100);
    const gauge = (name: string, v: number, limit: number, color: string, good: boolean) =>
      `<span>${name}</span><div class="lh-bar"><i style="width:${pct(v)}%;background:${color}"></i><u style="left:${pct(limit)}%"></u></div><span class="${good ? 'lh-ok' : 'lh-bad'}">${good ? '✓' : '✗'}</span>`;
    const st = s.storm;
    const nextStorm = st.phase === 'calm' ? `Next storm in ~${Math.max(1, Math.round(st.nextInS / 60))} min` : '';
    this.set(this.tl, `<div class="lh-res"><span>🪙 <b>${Math.floor(s.coin)}</b></span><span>🪵 <b>${Math.floor(s.timber)}</b></span><span title="Island bloom">🌸 <b>${pct(s.meadow)}%</b></span></div>
      <div class="lh-g">${gauge('Lamp', s.lamp, s.limits.lamp, '#ffd84a', s.lamp >= s.limits.lamp)}${gauge('Fog', s.fog, s.limits.fog, '#c9d3dc', s.fog < s.limits.fog)}${gauge('Seas', s.chop, s.limits.chop, '#5ab0ff', s.chop < s.limits.chop)}</div>
      ${s.streak.mult > 1 || s.streak.s > 30 ? `<div class="lh-streak">✨ Steady Light <b>x${s.streak.mult.toFixed(1)}</b>${s.streak.nextS ? ` · next in ${Math.ceil(s.streak.nextS / 60)} min` : ''}</div>` : ''}
      <div class="lh-next">${nextStorm}${s.nextDistrict ? `<br>Next land: ${s.nextDistrict.name} (${s.nextDistrict.goals.map((g) => `${Math.min(g.have, g.need)}/${g.need} ${g.label}`).join(', ')})` : ''}</div>`);

    // ship forecast
    const sailing = s.ships.filter((x) => x.state === 'sailing').sort((a, b) => a.etaS - b.etaS).slice(0, 3);
    const recent = s.ships.filter((x) => x.state !== 'sailing' && x.age < 6).slice(-1);
    let ships = '<h4>Ships</h4>';
    for (const x of recent) {
      const [txt, cls] = x.state === 'docked' ? (x.rescued ? ['Rescued 🛟', 'ok'] : ['Docked ✓', 'ok']) : x.state === 'spilled' ? ['Cargo spilled', 'bad'] : ['Ran aground', 'bad'];
      ships += `<div class="lh-ship"><div class="row"><span>${SHIP_ICON[x.kind]} ${x.name}</span><span class="lh-chip ${cls}">${txt}</span></div></div>`;
    }
    for (const x of sailing) {
      const [txt, cls] = CHECK[x.check];
      ships += `<div class="lh-ship"><div class="row"><span>${SHIP_ICON[x.kind]} ${x.name}</span><span>${Math.ceil(x.etaS)}s</span></div>
        <div class="prog"><i style="width:${pct(x.progress)}%"></i></div><div class="row"><span style="font-size:12px;opacity:.75">${SHIP_KIND[x.kind]}</span><span class="lh-chip ${cls}">${txt}</span></div></div>`;
    }
    if (!sailing.length) ships += `<div class="lh-ship" style="opacity:.8">Sail sighted in ~${Math.ceil(s.nextShipS)}s</div>`;
    this.set(this.tr, ships);

    // storm banner
    if (st.phase === 'warning') { this.storm.className = 'lh-panel lh-storm warn'; this.set(this.storm, `⚠️ Storm in ${Math.ceil(st.warnS - st.timeInPhase)}s - build up to Zone 3+`); }
    else if (st.phase === 'storm') {
      this.storm.className = `lh-panel lh-storm ${st.surge ? 'surge' : 'on'}`;
      const head = st.failed ? '🌑 Lamp out - ride it out' : st.surge ? '⚡ LIGHTNING SURGE - Zone 5!' : '⛈️ STORM - hold Zone 3+';
      this.set(this.storm, `${head} <span style="opacity:.8">${Math.ceil(st.duration - st.timeInPhase)}s</span><div class="bar"><i style="width:${pct(st.integrity)}%;background:${st.integrity > 0.4 ? '#ffd84a' : '#ff6b5a'}"></i></div>`);
    } else this.set(this.storm, '', false);

    // coaching line
    let msg: string, col: string;
    if (st.phase === 'storm') {
      if (st.failed) { msg = 'The lamp is out. Spin easy until the storm passes.'; col = '#ff8a7a'; }
      else if (s.zone >= s.requirement) { msg = st.surge ? 'Hold it! The surge salvage is yours.' : 'Strong! The lamp is holding.'; col = '#7dff9a'; }
      else { msg = `Push harder - Zone ${s.requirement}+ keeps the lamp alive`; col = '#ff8a7a'; }
    } else if (st.phase === 'warning') { msg = s.zone >= 3 ? 'Good - stay strong for the storm' : 'Storm coming - start building effort'; col = '#ffb347'; }
    else if (s.inZone) { msg = 'Steady - lamp bright, the island grows 🌱'; col = '#7dff9a'; }
    else if (s.above) { msg = 'Ease off a little - you\'re churning up the sea'; col = '#5ab0ff'; }
    else { msg = 'A bit more effort - fog is rolling in'; col = '#c9d3dc'; }
    this.coach.style.borderLeftColor = col;
    this.set(this.coach, msg);

    // toasts (newest at the bottom, fade after 5 s)
    this.set(this.toasts, s.toasts.filter((x) => x.age < 5.5).map((x) => `<div class="lh-toast" style="color:${x.color};opacity:${x.age > 4.5 ? Math.max(0, 5.5 - x.age) : 1}">${x.text}</div>`).join(''));

    // build panel / buttons / log
    if (s.mode === 'build') {
      this.set(this.br, '', false);
      const sel = s.options.find((o) => o.selected)!;
      const where = s.cursor.plot < 0 ? 'the lighthouse' : DISTRICT_NAME[PLOTS[s.cursor.plot].district] + (PLOTS[s.cursor.plot].shore ? ' beach' : '');
      const title = sel.type === 'lens' ? 'Upgrade the lighthouse' : sel.type === 'upgrade' ? `Upgrade on ${where}` : `Build on ${where}`;
      // show a window of rows around the selection so the panel fits on an iPad
      const idx = s.options.indexOf(sel), WIN = 7, start = Math.max(0, Math.min(s.options.length - WIN, idx - 3));
      const rows = s.options.slice(start, start + WIN).map((o) => {
        const c = o.cost;
        return `<div class="lh-opt ${o.selected ? 'sel' : ''} ${o.reason && !o.selected ? 'dim' : ''}" data-act="sel:${o.type}">
          <span class="ic">${o.icon}</span><span class="nm">${o.label} ${o.max ? `<span style="opacity:.6;font-size:12px">${o.owned}/${o.max}</span>` : ''}</span>
          <span class="cost">${c ? `🪙${c.coin} 🪵${c.timber}` : ''}</span>
          <span class="ef">${o.selected && o.reason ? `<span class="why">${o.reason}</span>` : o.effect}</span></div>`;
      }).join('');
      const more = (n: number, up: boolean) => (n > 0 ? `<div class="lh-hint">${up ? '▲' : '▼'} ${n} more</div>` : '');
      const verb = sel.type === 'upgrade' || sel.type === 'lens' ? 'Upgrade' : `Build ${sel.label}`;
      this.set(this.build, `<h3>${title}</h3><div class="sub">◀ ▶ move · ▲ ▼ choose · A ${sel.type === 'upgrade' || sel.type === 'lens' ? 'upgrade' : 'build'} · B close</div>
        ${more(start, true)}<div class="lh-list">${rows}</div>${more(s.options.length - start - WIN, false)}
        ${s.cursor.bonus ? `<div class="lh-bonus">🔗 ${s.cursor.bonus}</div>` : ''}
        <div class="acts"><div class="lh-btn go ${sel.reason ? 'no' : ''}" data-act="build">${sel.icon} ${verb}</div><div class="lh-btn" data-act="close">Close</div></div>`);
    } else {
      this.set(this.build, '', false);
      const can = s.canBuildAny;
      this.set(this.br, `<div class="lh-btn" data-act="log">📜 Log</div><div class="lh-btn" data-act="view">🎥 View</div><div class="lh-btn ${can ? 'hot' : ''}" data-act="open">🔨 Build</div>`);
    }
    this.set(this.log, this.logHtml(s), s.logOpen && s.mode === 'watch');
  }

  private logHtml(s: Snap): string {
    const st = s.stats, tt = s.totals, rank = keeperRank(tt.shipsDockedTotal, tt.stormsWeatheredTotal);
    const row = (k: string, v: string | number) => `<span>${k}</span><b>${v}</b>`;
    const built = s.buildings.filter(Boolean).length;
    const lensNames = ['Oil Lamp', 'Fresnel Lens', 'Twin Beams', 'Electric Lantern'];
    let lands = '';
    lands += `<div class="lh-dist" style="flex-wrap:wrap;gap:4px 14px;justify-content:flex-start">${s.districts.map((d) => `<span>${d.open ? '✅' : '🔒'} ${d.name}</span>`).join('')}</div>`;
    if (s.nextDistrict) lands += `<div style="margin-top:6px">Next: <b>${s.nextDistrict.name}</b></div>`;
    if (s.nextDistrict) lands += s.nextDistrict.goals.map((g) => `<div style="font-size:13px;opacity:.85">${g.label}: ${Math.min(g.have, g.need)} / ${g.need}</div><div class="lh-goal"><i style="width:${Math.min(100, (g.have / g.need) * 100)}%"></i></div>`).join('');
    return `<h2>📜 Keeper's Log</h2><div style="opacity:.8">${rank.name}${rank.next ? ` · ${rank.next} renown to the next title` : ''}</div>
      <div class="lh-cols"><div><h4>This ride</h4><div class="grid">
        ${row('Ships docked', st.shipsDocked)}${st.shipsRescued ? row('Ships rescued', st.shipsRescued) : ''}${row('Ships lost', st.shipsLost)}
        ${row('Coin earned', Math.round(st.coinEarned))}${row('Built / upgraded', `${st.buildingsBuilt} / ${st.upgrades}`)}
        ${row('Storms weathered', `${st.stormsWeathered}${st.stormsFailed ? ` (${st.stormsFailed} lost)` : ''}`)}
        ${row('Bloom gained', `+${Math.round(st.bloomGained * 100)}%`)}${row('Best Steady Light', `${Math.floor(st.bestStreakS / 60)} min`)}
      </div></div>
      <div><h4>The island</h4><div class="grid">
        ${row('Buildings', built)}${row('Lighthouse', lensNames[s.lens - 1])}${row('Bloom', `${Math.round(s.meadow * 100)}%`)}
        ${row('Ships docked (all time)', tt.shipsDockedTotal)}${row('Storms weathered (all time)', tt.stormsWeatheredTotal)}
      </div></div></div>
      <h4>Lands</h4>${lands}
      <div class="lh-hint">Z or B to close</div>`;
  }

  unmount() { this.root.remove(); }
}
