// DOM overlay for Watershed: current block, ride timeline, water-style meter (heavy ↔ light), gorge/delta stats.
import type { WatershedSnapshot } from '../sim/sim';
import type { Style } from '../sim/plan';
import { layout, type Box } from './layout';

const STYLE_COLOR: Record<Style, string> = { grind: '#ff9a4a', spin: '#5fd6ff', steady: '#7dff9a', free: '#9aa7b4' };
const STYLE_WORD: Record<Style, string> = { grind: 'GRIND', spin: 'SPIN', steady: 'STEADY', free: 'EASY' };

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
`;

const fmt = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

export class Hud {
  private root = document.createElement('div');
  private style = document.createElement('style');
  private block: HTMLDivElement; private stats: HTMLDivElement; private plan: HTMLDivElement; private meter: HTMLDivElement;
  private planKey = '';
  private size: [number, number] = [800, 600]; private insetB = 0;
  private rpmLow = 60; private rpmHigh = 110;

  constructor(container: HTMLElement) {
    this.style.textContent = CSS;
    this.root.className = 'ws-ui';
    const mk = (cls: string) => { const d = document.createElement('div'); d.className = `ws-panel ${cls}`; this.root.appendChild(d); return d; };
    this.block = mk('ws-block'); this.stats = mk('ws-stats'); this.plan = mk('ws-plan'); this.meter = mk('ws-meter');
    this.meter.innerHTML = '<div class="row"><span>HEAVY · CARVES</span><span>LIGHT · CARRIES</span></div><div class="track"><div class="band"></div><div class="dot"></div></div>';
    container.append(this.style, this.root);
  }

  setRpmRange(lo: number, hi: number) { this.rpmLow = lo; this.rpmHigh = hi; }
  setSize(w: number, h: number) { this.size = [w, h]; this.place(); }
  setInsetBottom(b: number) { this.insetB = b; this.place(); }

  private place() {
    const L = layout(this.size[0], this.size[1], this.insetB);
    const put = (el: HTMLElement, b: Box) => Object.assign(el.style, { left: `${b.x}px`, top: `${b.y}px`, width: `${b.w}px`, minHeight: '0' });
    put(this.block, L.block); put(this.stats, L.stats); put(this.plan, L.plan); put(this.meter, L.meter);
  }

  update(s: WatershedSnapshot) {
    const b = s.block;
    this.block.innerHTML = `<div class="nm">${b.name}<b>${fmt(b.left)}</b></div>`
      + `<span class="st" style="background:${STYLE_COLOR[b.style]}">${STYLE_WORD[b.style]}${b.rpm ? ` ${b.rpm.min}${b.rpm.max ? `–${b.rpm.max}` : '+'} rpm` : ''}</span>`
      + ` <span style="font-size:13px;opacity:.8">ERG ${Math.round(b.ftp * 100)}% FTP</span><div class="hint">${b.hint}</div>`;
    this.stats.innerHTML = `<span>Gorge depth</span><b>${(s.deepestCut * 4).toFixed(0)} m</b>`
      + `<span>Valley carved</span><b>${Math.round(s.carved / 10)}</b><span>Delta built</span><b>${Math.round(s.delta / 10)}</b>`;

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
    dot.style.left = `${s.cadNorm * 100}%`;
    dot.classList.toggle('ok', s.inBand);
  }

  unmount() { this.root.remove(); this.style.remove(); }
}
