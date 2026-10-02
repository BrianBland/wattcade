// DOM overlay for Keeper's Light: resources, sea gauges with docking limits, ship forecast, storm banner,
// a big coaching line (readable from the saddle), toasts, and the build panel (tap-friendly).
import type { Snap } from './snap';

const ICON: Record<string, string> = { cottage: '🏠', garden: '🌷', pier: '⚓', market: '🧺', bell: '🔔', lamp2: '🔥' };
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
.lh-next { margin-top:7px; font-size:12px; opacity:.8 }
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
@media (max-width: 760px) { .lh-tr { width: 190px } .lh-coach { font-size:17px; max-width: 60% } .lh-g { grid-template-columns: 44px 100px 16px } .lh-build { width: 290px } }
`;

export class Hud {
  private root: HTMLDivElement;
  private tl: HTMLDivElement; private tr: HTMLDivElement; private storm: HTMLDivElement; private coach: HTMLDivElement;
  private toasts: HTMLDivElement; private br: HTMLDivElement; private build: HTMLDivElement;
  private cache = new Map<HTMLElement, string>();
  private lastT = -1;

  constructor(container: HTMLElement, private send?: (a: unknown) => void) {
    const style = document.createElement('style'); style.textContent = CSS;
    const root = document.createElement('div'); root.className = 'lh-ui'; root.appendChild(style);
    const mk = (cls: string) => { const d = document.createElement('div'); d.className = cls; root.appendChild(d); return d; };
    this.tl = mk('lh-panel lh-tl'); this.tr = mk('lh-panel lh-tr'); this.storm = mk('lh-panel lh-storm'); this.coach = mk('lh-panel lh-coach');
    this.toasts = mk('lh-toasts'); this.br = mk('lh-br'); this.build = mk('lh-panel lh-build');
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
      <div class="lh-next">${nextStorm}</div>`);

    // ship forecast
    const sailing = s.ships.filter((x) => x.state === 'sailing').sort((a, b) => a.etaS - b.etaS).slice(0, 3);
    const recent = s.ships.filter((x) => x.state !== 'sailing' && x.age < 6).slice(-1);
    let ships = '<h4>Ships</h4>';
    for (const x of recent) {
      const [txt, cls] = x.state === 'docked' ? ['Docked ✓', 'ok'] : x.state === 'spilled' ? ['Cargo spilled', 'bad'] : ['Ran aground', 'bad'];
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

    // build panel / buttons
    if (s.mode === 'build') {
      this.set(this.br, '', false);
      const plotName = s.cursor.plot < 4 ? 'the beach' : s.cursor.plot < 10 ? 'the lower terrace' : s.cursor.plot < 16 ? 'the middle terrace' : 'the hilltop';
      const sel = s.options.find((o) => o.selected)!;
      const rows = s.options.map((o) => {
        const done = o.owned >= o.max;
        return `<div class="lh-opt ${o.selected ? 'sel' : ''} ${o.reason && !o.selected ? 'dim' : ''}" data-act="sel:${o.type}">
          <span class="ic">${ICON[o.type]}</span><span class="nm">${o.label} <span style="opacity:.6;font-size:12px">${o.owned}/${o.max}</span></span>
          <span class="cost">${done ? '' : `🪙${o.cost.coin} 🪵${o.cost.timber}`}</span>
          <span class="ef">${o.selected && o.reason ? `<span class="why">${o.reason}</span>` : o.effect}</span></div>`;
      }).join('');
      this.set(this.build, `<h3>Build on ${plotName}</h3><div class="sub">◀ ▶ move plot · ▲ ▼ choose · A build · B close</div>${rows}
        <div class="acts"><div class="lh-btn go ${sel.reason ? 'no' : ''}" data-act="build">${ICON[sel.type]} Build ${sel.label}</div><div class="lh-btn" data-act="close">Close</div></div>`);
    } else {
      this.set(this.build, '', false);
      const can = s.canBuildAny;
      this.set(this.br, `<div class="lh-btn" data-act="view">🎥 View</div><div class="lh-btn ${can ? 'hot' : ''}" data-act="open">🔨 Build</div>`);
    }
  }

  unmount() { this.root.remove(); }
}
