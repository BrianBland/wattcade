// DOM overlay for Watershed: current block, ride timeline, water-style meter (heavy ↔ light), gorge/delta stats.
import type { WatershedSnapshot } from '../sim/sim';
import type { Style } from '../sim/plan';
import { layout, type Box } from './layout';

const STYLE_COLOR: Record<Style, string> = { grind: '#ff9a4a', spin: '#5fd6ff', steady: '#7dff9a', free: '#9aa7b4', salmon: '#ff8a8a' };
const STYLE_WORD: Record<Style, string> = { grind: 'GRIND', spin: 'SPIN', steady: 'STEADY', free: 'EASY', salmon: 'SWIM' };

const CSS = `
.ws-ui { position:absolute; inset:0; pointer-events:none; font: 600 15px/1.25 system-ui, -apple-system, sans-serif; color:#fff; text-shadow: 0 1px 2px #0008; -webkit-user-select:none; user-select:none; }
.ws-panel { position:absolute; box-sizing:border-box; background: rgba(10,26,40,0.6); border: 1px solid rgba(255,255,255,0.14); border-radius: 14px; backdrop-filter: blur(6px); -webkit-backdrop-filter: blur(6px); padding: 9px 12px; }
.ws-block .nm { font-size: 21px; display:flex; justify-content:space-between; gap:8px; align-items:baseline }
.ws-block .nm b { font-size: 15px; font-variant-numeric: tabular-nums; opacity:.85 }
.ws-block .st { display:inline-block; font-size:12px; letter-spacing:.08em; padding:1px 8px; border-radius:9px; color:#0a1a28; margin:4px 0 3px; text-shadow:none }
.ws-block .hint { font-size: 14px; opacity: .9 }
.ws-stats { display:grid; grid-template-columns: 1fr auto; gap:3px 10px; font-size:14px }
.ws-stats b { font-variant-numeric: tabular-nums; text-align:right; font-size: 17px }
.ws-plan { padding: 6px 8px }
.ws-plan .bar { position:relative; display:flex; height: 12px; border-radius: 6px; overflow:hidden; gap:2px }
.ws-plan .bar i { display:block; height:100%; opacity:.55 }
.ws-plan .bar i.cur { opacity: 1 }
.ws-plan .bar u { position:absolute; top:-2px; bottom:-2px; width:3px; background:#fff; border-radius:2px; text-decoration:none; box-shadow:0 0 4px #000a }
.ws-plan .lbl { display:flex; justify-content:space-between; font-size:11px; opacity:.75; margin-top:3px; font-variant-numeric: tabular-nums }
.ws-meter { padding: 6px 12px }
.ws-meter .row { display:flex; justify-content:space-between; font-size:11px; letter-spacing:.06em; opacity:.85 }
.ws-meter .track { position:relative; height:10px; border-radius:5px; margin-top:4px; background: linear-gradient(90deg, #8a5a2b, #3d8fd1 55%, #bfeaff); }
.ws-meter .band { position:absolute; top:-3px; bottom:-3px; border:2px solid #fff; border-radius:6px; box-sizing:border-box }
.ws-meter .dot { position:absolute; top:50%; width:16px; height:16px; margin:-8px 0 0 -8px; border-radius:50%; background:#fff; box-shadow:0 0 6px #000a; transition: left .25s }
.ws-meter .dot.ok { background:#7dff9a }
.ws-block .obj { margin-top:4px; font-size:14px }
.ws-block .obj.done b { color:#7dff9a } .ws-block .obj.failed b { color:#ff9a8a }
.ws-block .pbar { height:7px; border-radius:4px; background:rgba(255,255,255,.18); margin-top:4px; overflow:hidden }
.ws-block .pbar i { display:block; height:100%; background:linear-gradient(90deg,#ffd23f,#7dff9a) }
.ws-pop { position:absolute; box-sizing:border-box; text-align:center; padding: 12px 18px; border-radius: 18px; background: rgba(10,26,40,0.72); border:1px solid rgba(255,255,255,.18);
  opacity:0; transform: translateY(-8px) scale(.97); transition: opacity .35s, transform .35s; }
.ws-pop.on { opacity:1; transform:none }
.ws-pop .t { font-size: 26px; font-weight: 800; letter-spacing:.01em }
.ws-pop .s { font-size: 16px; opacity:.92; margin-top:4px }
.ws-pop.salmon { border-color: #ff8a8a } .ws-pop.warn { background: rgba(110,30,20,0.8) }
.ws-stats .fish { grid-column: 1 / 3; font-size: 12px; letter-spacing: .08em; opacity:.8; text-transform: uppercase }
`;

const PHASE_COLOR: Record<string, string> = { evaporate: '#ffd76a', cloud: '#e8f4ff', rain: '#7fb6e0', river: '#3d8fd1', salmon: '#ff8a8a' };
const MENU_CSS = `
.ws-menu { position:absolute; left:50%; transform:translateX(-50%); width:min(92%, 760px); pointer-events:auto; text-align:center; padding:18px; border-radius:20px; background:rgba(10,26,40,0.78); border:1px solid rgba(255,255,255,.18); backdrop-filter: blur(8px); -webkit-backdrop-filter: blur(8px) }
.ws-menu h2 { margin:0 0 4px; font-size:26px } .ws-menu .sub { opacity:.85; margin-bottom:12px }
.ws-menu .opts { display:grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap:10px }
.ws-menu .opt { cursor:pointer; padding:12px 10px; border-radius:14px; background:rgba(255,255,255,.07); border:2px solid transparent; transition: transform .15s }
.ws-menu .opt.sel { border-color:#ffd23f; background:rgba(255,210,63,.14); transform: scale(1.04) }
.ws-menu .opt b { display:block; font-size:30px } .ws-menu .opt small { display:block; font-size:13px; opacity:.85; margin:2px 0 8px; min-height:2.4em }
.ws-menu .tl { display:flex; height:9px; border-radius:5px; overflow:hidden; gap:1px }
.ws-menu .tl i { display:block; height:100% }
.ws-menu .warm { margin-top:12px; display:inline-flex; align-items:center; gap:8px; cursor:pointer; padding:8px 16px; border-radius:12px; background:rgba(255,255,255,.07); border:2px solid transparent; font-size:15px }
.ws-menu .warm.on { border-color:#7fb6e0; background:rgba(127,182,224,.16) } .ws-menu .warm .box { width:18px; height:18px; border-radius:5px; border:2px solid rgba(255,255,255,.7); display:inline-grid; place-items:center; font-size:13px; line-height:1 }
.ws-menu .go { margin-top:14px; display:inline-block; cursor:pointer; padding:10px 26px; border-radius:14px; background:#2f7d3f; font-weight:800; font-size:18px }
.ws-menu .hint { margin-top:8px; font-size:13px; opacity:.75 }
`;
const fmt = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

export class Hud {
  private root = document.createElement('div');
  private style = document.createElement('style');
  private block: HTMLDivElement; private stats: HTMLDivElement; private plan: HTMLDivElement; private meter: HTMLDivElement;
  private pop = document.createElement('div'); private popLeft = 0;
  private menuEl = document.createElement('div'); private menuKey = ''; private send?: (a: unknown) => void;
  private planKey = '';
  private size: [number, number] = [800, 600]; private insetB = 0;
  private rpmLow = 60; private rpmHigh = 110;

  constructor(container: HTMLElement) {
    this.style.textContent = CSS + MENU_CSS;
    this.root.className = 'ws-ui';
    const mk = (cls: string) => { const d = document.createElement('div'); d.className = `ws-panel ${cls}`; this.root.appendChild(d); return d; };
    this.block = mk('ws-block'); this.stats = mk('ws-stats'); this.plan = mk('ws-plan'); this.meter = mk('ws-meter');
    this.pop.className = 'ws-pop'; this.pop.innerHTML = '<div class="t"></div><div class="s"></div>'; this.root.appendChild(this.pop);
    this.meter.innerHTML = '<div class="row"><span>HEAVY · CARVES</span><span>LIGHT · CARRIES</span></div><div class="track"><div class="band"></div><div class="dot"></div></div>';
    this.menuEl.className = 'ws-menu'; this.menuEl.style.display = 'none'; this.root.appendChild(this.menuEl);
    container.append(this.style, this.root);
  }

  setSend(send?: (a: unknown) => void) { this.send = send; }

  /** The pre-game ride-length menu (cards with a phase timeline each; taps choose, the button starts). */
  private updateMenu(s: WatershedSnapshot) {
    const m = s.menu, open = !!m;
    this.menuEl.style.display = open ? 'block' : 'none';
    for (const el of [this.block, this.stats, this.plan, this.meter]) el.style.visibility = open ? 'hidden' : 'visible';
    if (!m) return;
    const L = layout(this.size[0], this.size[1], this.insetB);
    this.menuEl.style.top = `${Math.max(12, L.UH * 0.16)}px`;
    const key = `${m.sel}:${m.skipWarmup}`;
    if (key !== this.menuKey) {
      this.menuKey = key;
      this.menuEl.innerHTML = `<h2>Choose your ride</h2><div class="sub">Same water cycle, sized to your workout: ERG all the way.</div><div class="opts">${m.options.map((o, i) => {
        const tot = o.blocks.reduce((a, b) => a + b.minutes, 0);
        return `<div class="opt${i === m.sel ? ' sel' : ''}" data-min="${o.length}"><b>${o.minutes} min</b><small>${o.blurb}</small><div class="tl">${o.blocks.map((b) => `<i style="flex:${b.minutes / tot};background:${PHASE_COLOR[b.phase]}"></i>`).join('')}</div></div>`;
      }).join('')}</div><div class="warm${m.skipWarmup ? ' on' : ''}"><span class="box">${m.skipWarmup ? '✓' : ''}</span>Already warm: skip evaporation &amp; cloud, start at the rain</div><br><div class="go">▶ Start</div><div class="hint"></div>`;
      this.menuEl.querySelectorAll<HTMLElement>('.opt').forEach((el) => el.addEventListener('pointerdown', () => this.send?.({ type: 'length', minutes: Number(el.dataset.min) })));
      this.menuEl.querySelector('.warm')?.addEventListener('pointerdown', () => this.send?.({ type: 'warmup', skip: !m.skipWarmup }));
      this.menuEl.querySelector('.go')?.addEventListener('pointerdown', () => this.send?.({ type: 'start' }));
    }
    (this.menuEl.querySelector('.hint') as HTMLElement).textContent = `◀▶ choose · Y warm-up · A start · starts by itself in ${Math.ceil(m.left)} s`;
  }

  setRpmRange(lo: number, hi: number) { this.rpmLow = lo; this.rpmHigh = hi; }
  setSize(w: number, h: number) { this.size = [w, h]; this.place(); }
  setInsetBottom(b: number) { this.insetB = b; this.place(); }

  private place() {
    const L = layout(this.size[0], this.size[1], this.insetB);
    const put = (el: HTMLElement, b: Box) => Object.assign(el.style, { left: `${b.x}px`, top: `${b.y}px`, width: `${b.w}px`, minHeight: '0' });
    put(this.block, L.block); put(this.stats, L.stats); put(this.plan, L.plan); put(this.meter, L.meter); put(this.pop, L.popup);
  }

  /** A one-or-two-line instruction popup for `seconds`. */
  popup(title: string, sub: string, seconds = 4, tone: '' | 'salmon' | 'warn' = '') {
    (this.pop.querySelector('.t') as HTMLElement).textContent = title;
    (this.pop.querySelector('.s') as HTMLElement).textContent = sub;
    this.pop.className = `ws-pop on ${tone}`;
    this.popLeft = seconds;
  }
  tick(dt: number) {
    if (this.popLeft > 0) { this.popLeft -= dt; if (this.popLeft <= 0) this.pop.classList.remove('on'); }
  }

  update(s: WatershedSnapshot) {
    this.updateMenu(s);
    if (s.menu) return;
    const b = s.block, o = s.jobs?.objective && (s.phase === 'river') ? s.jobs.objective : null;
    this.block.innerHTML = `<div class="nm">${b.name}<b>${fmt(b.left)}</b></div>`
      + `<span class="st" style="background:${STYLE_COLOR[b.style]}">${STYLE_WORD[b.style]}${b.rpm ? ` ${b.rpm.min}${b.rpm.max ? `–${b.rpm.max}` : '+'} rpm` : ''}</span>`
      + ` <span style="font-size:13px;opacity:.8">ERG ${Math.round(b.ftp * 100)}% FTP</span>`
      + (o ? `<div class="obj ${o.state}"><b>${o.state === 'done' ? '✓ ' : o.state === 'failed' ? '✗ ' : '◎ '}${o.title}</b><div class="pbar"><i style="width:${Math.round(o.progress * 100)}%"></i></div></div>` : `<div class="hint">${b.hint}</div>`);
    const f = s.salmon, sky = s.sky;
    this.stats.innerHTML = s.phase === 'evaporate'
      ? `<span>Vapor</span><b>${Math.round(sky.vapor)}</b><span>Sunlight</span><b>${sky.inSun ? '☀️ yes' : '—'}</b>`
      : s.phase === 'cloud'
      ? `<span>Cloud size</span><b>${Math.round(sky.size)}</b><span>Cloudlets</span><b>${sky.caught}</b>`
      : s.phase === 'rain'
      ? `<span>Rainfall</span><b>${Math.round(sky.rained)}</b><span>Cloud left</span><b>${Math.round(sky.size)}</b>`
      : f
      ? `<span class="fish">Salmon run ${f.run}</span><span>School</span><b>${f.alive} 🐟</b><span>Home</span><b>${f.home}</b><span>Lost</span><b>${f.lost}</b>`
      : `<span>Gorge depth</span><b>${(s.deepestCut * 4).toFixed(0)} m</b>`
        + `<span>Flour · Planks</span><b>${Math.round(s.jobs.mills[0].output)} · ${Math.round(s.jobs.mills[1].output)}</b>`
        + `<span>Harvests</span><b>${s.jobs.fields.reduce((a, f) => a + f.harvests, 0)}</b>`;

    const key = `${s.blocks.length}:${b.index}`;
    if (key !== this.planKey) {
      this.planKey = key;
      this.plan.innerHTML = `<div class="bar">${s.blocks.map((x, i) => `<i class="${i === b.index ? 'cur' : ''}" style="flex:${x.minutes};background:${STYLE_COLOR[x.style]}"></i>`).join('')}<u></u></div><div class="lbl"><span></span><span></span></div>`;
    }
    const u = this.plan.querySelector('u') as HTMLElement;
    u.style.left = `${Math.min(100, (100 * s.t) / s.rideS)}%`;
    const lbl = this.plan.querySelectorAll('.lbl span');
    lbl[0].textContent = fmt(s.t); lbl[1].textContent = `-${fmt(Math.max(0, s.rideS - s.t))}`;

    const pos = (rpm: number) => Math.max(0, Math.min(100, (100 * (rpm - this.rpmLow)) / (this.rpmHigh - this.rpmLow)));
    const band = this.meter.querySelector('.band') as HTMLElement, dot = this.meter.querySelector('.dot') as HTMLElement;
    if (b.rpm) {
      const a = pos(b.rpm.min), z = b.rpm.max !== undefined ? pos(b.rpm.max) : 100;
      Object.assign(band.style, { display: 'block', left: `${a}%`, width: `${Math.max(3, z - a)}%` });
    } else band.style.display = 'none';
    if (f?.needLeap) Object.assign(band.style, { display: 'block', left: `${pos(95)}%`, width: `${100 - pos(95)}%` });
    dot.style.left = `${s.cadNorm * 100}%`;
    dot.classList.toggle('ok', f?.needLeap ? s.cadence >= 95 : s.inBand);
  }

  unmount() { this.root.remove(); this.style.remove(); }
}
