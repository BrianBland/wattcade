import { MENU, type CadenzaSnapshot, type SongRecap } from '../sim/sim';
import type { Box, Layout } from './layout';
import { rideIndexAt } from '../sim/ride';

/** Wipeout-flavoured DOM HUD: score, target card, shield, now playing, coaching callout + countdown, launch meter, recaps, pre-game menu. */
const CSS = `
.ws-hud { position:absolute; inset:0; pointer-events:none; font-family:'Eurostile','Michroma','Orbitron','Avenir Next Condensed','Arial Narrow',sans-serif; color:#fff; text-transform:uppercase; --acc-t:color-mix(in srgb, var(--acc) 62%, #fff); }
.ws-box { position:absolute; }
.ws-score > div > b { display:block; font-size:34px; font-weight:900; font-style:italic; letter-spacing:2px; text-shadow:0 0 12px var(--acc), 0 2px 0 #000; }
.ws-score > div > span { font:800 14px system-ui; letter-spacing:2px; color:var(--acc-t); text-shadow:0 1px 2px #000; }
.ws-zone { text-align:right; }
.ws-zone b { display:block; font-size:28px; font-weight:900; font-style:italic; letter-spacing:3px; color:var(--acc-t); text-shadow:0 0 14px var(--acc), 0 2px 0 #000; }
.ws-zone span { display:block; font:800 13px system-ui; letter-spacing:2px; text-shadow:0 1px 2px #000; }
.ws-zone .ok { color:#b6ff3b; } .ws-zone .low { color:#ffb020; }
.ws-song { font:700 12px system-ui; text-transform:none; text-shadow:0 1px 2px #000; opacity:.9; overflow:hidden; white-space:nowrap; text-overflow:ellipsis; }
.ws-song small { display:block; opacity:.7; font-weight:600; overflow:hidden; text-overflow:ellipsis; }
.ws-shield { border:2px solid var(--acc); border-radius:4px; background:#0008; transform:skewX(-20deg); overflow:hidden; }
.ws-shield i { display:block; height:100%; background:linear-gradient(90deg, var(--acc), #fff); transition:width .2s; }
.ws-shield.low i { background:linear-gradient(90deg,#ff3d5a,#ffb020); }
.ws-callout { text-align:center; opacity:0; transition:opacity .35s, transform .35s; transform:scale(.9); }
.ws-callout.on { opacity:1; transform:scale(1); }
.ws-callout b { display:block; font-size:clamp(26px,5vw,58px); font-weight:900; font-style:italic; letter-spacing:3px; color:#fff; text-shadow:0 0 12px var(--acc), 0 3px 0 #000; line-height:1; }
.ws-callout b.tick { animation:ws-tick .45s cubic-bezier(.2,1.6,.4,1); }
@keyframes ws-tick { from { transform:scale(1.6); opacity:.2; } to { transform:none; opacity:1; } }
.ws-callout span { display:block; margin-top:8px; font-size:clamp(15px,2.6vw,30px); font-weight:900; font-style:italic; letter-spacing:2px; color:#fff; text-shadow:0 0 10px var(--acc), 0 2px 0 #000; line-height:1.1; }
.ws-callout span:empty { display:none; }
.ws-menu { pointer-events:auto; background:#05040ccc; border:2px solid var(--acc); border-radius:6px; padding:18px 20px; box-shadow:0 0 40px color-mix(in srgb, var(--acc) 40%, transparent); display:flex; flex-direction:column; gap:8px; box-sizing:border-box; overflow-y:auto; }
.ws-menu h2 { margin:0 0 4px; font-size:30px; font-style:italic; letter-spacing:6px; color:var(--acc-t); text-shadow:0 0 12px var(--acc); }
.ws-row { display:flex; justify-content:space-between; align-items:center; padding:10px 12px; border:2px solid transparent; font:800 16px system-ui; letter-spacing:2px; cursor:pointer; }
.ws-row.f { border-color:var(--acc); background:color-mix(in srgb, var(--acc) 18%, transparent); }
.ws-row em { font-style:normal; color:var(--acc-t); }
.ws-row.go { justify-content:center; background:var(--acc); color:#000; font-size:20px; }
.ws-row.go.f { box-shadow:0 0 20px var(--acc); border-color:#fff; }
.ws-menu small { font:600 12px system-ui; text-transform:none; opacity:.7; text-align:center; }
.ws-pop { position:absolute; left:0; top:100%; font-size:26px; font-weight:900; font-style:italic; letter-spacing:3px; white-space:nowrap; color:#fff; text-shadow:0 0 16px var(--acc), 0 2px 0 #000; opacity:0; transform:translateY(6px) scale(.8); transition:opacity .25s, transform .25s; }
.ws-pop.on { opacity:1; transform:none; } .ws-pop.bad { color:#9aa0b4; text-shadow:0 2px 0 #000; }
.ws-launch { text-align:center; opacity:0; transition:opacity .2s; }
.ws-launch.on { opacity:1; }
.ws-launch .lbl { font-size:22px; font-weight:900; font-style:italic; letter-spacing:5px; text-shadow:0 0 14px var(--acc), 0 2px 0 #000; }
.ws-launch .bar { position:relative; height:16px; margin-top:6px; border:2px solid #fff; border-radius:3px; background:#0009; transform:skewX(-20deg); overflow:hidden; }
.ws-launch .bar i { position:absolute; left:0; top:0; bottom:0; background:linear-gradient(90deg,#9aa0b4,#b6ff3b 70%,#fff); }
.ws-launch .bar u { position:absolute; top:0; bottom:0; width:2px; background:#fff; opacity:.8; }
.ws-launch .bar s { position:absolute; left:0; bottom:0; height:3px; background:var(--acc); }
.ws-launch .res { font-size:34px; font-weight:900; font-style:italic; letter-spacing:4px; line-height:1.1; text-shadow:0 0 22px currentColor, 0 3px 0 #000; }
.ws-launch .res small { display:block; font-size:18px; letter-spacing:3px; color:#fff; }
.ws-recap { pointer-events:none; background:#05040cd9; border:2px solid var(--acc); border-radius:6px; padding:12px 14px; box-shadow:0 0 30px color-mix(in srgb, var(--acc) 35%, transparent);
  opacity:0; transform:translateX(30px); transition:opacity .4s, transform .4s; display:flex; flex-direction:column; gap:6px; box-sizing:border-box; overflow:hidden; }
.ws-recap.on { opacity:1; transform:none; }
.ws-recap h3 { margin:0; font-size:15px; letter-spacing:3px; color:var(--acc-t); }
.ws-recap .t { font:700 13px system-ui; text-transform:none; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; opacity:.9; }
.ws-recap .big { font-size:30px; font-weight:900; font-style:italic; letter-spacing:2px; }
.ws-recap .grid { display:grid; grid-template-columns:1fr 1fr; gap:2px 10px; font:800 12px system-ui; letter-spacing:1px; }
.ws-recap .grid b { font-size:16px; display:block; color:#fff; }
.ws-recap .grid span { color:#fff9; }
.ws-recap canvas { width:100%; height:16px; border-radius:2px; }
.ws-recap .ls { font-size:18px; letter-spacing:3px; }
`;

const RATING: Record<string, { label: string; color: string; icon: string }> = {
  perfect: { label: 'PERFECT LAUNCH', color: '#fff36b', icon: '★' }, great: { label: 'GREAT LAUNCH', color: '#b6ff3b', icon: '◆' },
  good: { label: 'GOOD LAUNCH', color: '#5fd7ff', icon: '●' }, weak: { label: 'WEAK LAUNCH', color: '#9aa0b4', icon: '○' },
};
/** Effort strip colours: on target, under, over, recovering. */
const STRIP = ['#b6ff3b', '#6b7080', '#ff4a1c', '#2b6a8a'];
/** Launch meter range (ratio) and its rating marks. */
const METER_MAX = 1.3, MARKS = [0.85, 1.0, 1.15];

export class Hud {
  private root: HTMLDivElement;
  private score = this.el('ws-box ws-score'); private zone = this.el('ws-box ws-zone'); private song = this.el('ws-box ws-song');
  private shield = this.el('ws-box ws-shield'); private callout = this.el('ws-box ws-callout'); private menu = this.el('ws-box ws-menu');
  private launch = this.el('ws-box ws-launch'); private recapEl = this.el('ws-box ws-recap'); private popEl = document.createElement('div');
  private scoreText = document.createElement('div');
  private popUntil = 0; private recapUntil = 0; private launchKey = '';
  private send?: (a: unknown) => void;
  private lastKey = '';
  private effortKey = ''; private calloutUntil = 0; private calloutContent = ''; private lastP = -1;
  constructor(container: HTMLElement) {
    if (!document.getElementById('ws-hud-css')) { const st = document.createElement('style'); st.id = 'ws-hud-css'; st.textContent = CSS; document.head.appendChild(st); }
    this.root = document.createElement('div'); this.root.className = 'ws-hud';
    for (const e of [this.score, this.zone, this.song, this.shield, this.callout, this.menu, this.launch, this.recapEl]) this.root.appendChild(e);
    this.popEl.className = 'ws-pop'; this.score.append(this.scoreText, this.popEl);
    this.shield.appendChild(document.createElement('i'));
    container.appendChild(this.root);
  }
  private el(cls: string) { const d = document.createElement('div'); d.className = cls; return d; }
  setSend(s?: (a: unknown) => void) { this.send = s; }
  place(L: Layout) {
    const put = (e: HTMLElement, b: Box) => Object.assign(e.style, { left: `${b.x}px`, top: `${b.y}px`, width: `${b.w}px`, height: `${b.h}px` });
    put(this.score, L.score); put(this.zone, L.zone); put(this.song, L.song); put(this.shield, L.shield); put(this.callout, L.callout);
    Object.assign(this.menu.style, { left: `${L.menu.x}px`, width: `${L.menu.w}px`, height: 'auto', maxHeight: `${L.menu.h}px`,
      top: `${L.menu.y + L.menu.h / 2}px`, transform: 'translateY(-50%)' }); put(this.launch, L.launch); put(this.recapEl, L.recap);
  }
  dispose() { this.root.remove(); }
  /** A short flourish under the score (chain milestones; `bad` = greyed, e.g. a broken chain). */
  pop(text: string, now: number, bad = false) { this.popEl.textContent = text; this.popEl.className = `ws-pop on${bad ? ' bad' : ''}`; this.popUntil = now + 1.4; }
  /** End-of-song recap card (shown ~9 s). */
  recap(r: SongRecap, now: number) {
    const ls = r.launches.length ? r.launches.map((x) => `<span style="color:${RATING[x].color}">${RATING[x].icon}</span>`).join(' ') : '—';
    this.recapEl.innerHTML = `<h3>SONG ${r.n} COMPLETE</h3><div class="t">${esc(r.title)} — ${esc(r.artist)}</div><div class="big">${r.score.toLocaleString()}</div>`
      + `<div class="grid"><div><b>${r.accuracyPct}%</b><span>ACCURACY</span></div><div><b>${r.maxChain}</b><span>BEST CHAIN</span></div>`
      + `<div><b>${r.onTargetPct}%</b><span>ON TARGET</span></div><div><b class="ls">${ls}</b><span>LAUNCHES</span></div></div><canvas width="260" height="16"></canvas>`;
    const g = (this.recapEl.querySelector('canvas') as HTMLCanvasElement).getContext('2d');
    if (g) { const n = Math.max(1, r.strip.length), w = 260 / n; r.strip.forEach((c, i) => { g.fillStyle = STRIP[c] ?? '#000'; g.fillRect(i * w, 0, Math.ceil(w), 16); }); }
    this.recapEl.classList.add('on'); this.recapUntil = now + 9;
  }

  /** The launch meter while rolling (fill = effort ratio, marks = good / great / perfect), then the rating. */
  private updateLaunch(s: CadenzaSnapshot) {
    const L = s.menu ? null : s.launch;
    this.launch.classList.toggle('on', !!L);
    if (!L) { this.launchKey = ''; return; }
    if (L.active) {
      if (this.launchKey !== 'live') {
        this.launchKey = 'live';
        this.launch.innerHTML = `<div class="lbl">PUNCH IT!</div><div class="bar"><i></i>${MARKS.map((m) => `<u style="left:${(100 * m) / METER_MAX}%"></u>`).join('')}<s></s></div>`;
      }
      const bar = this.launch.querySelector('.bar')!;
      (bar.querySelector('i') as HTMLElement).style.width = `${Math.min(100, (100 * L.ratio) / METER_MAX)}%`;
      (bar.querySelector('s') as HTMLElement).style.width = `${100 * L.progress}%`;
    } else if (L.rating && this.launchKey !== L.rating) {
      this.launchKey = L.rating;
      const r = RATING[L.rating];
      this.launch.innerHTML = `<div class="res" style="color:${r.color}">${r.label}<small>${L.bonus ? `+${L.bonus.toLocaleString()}` : 'push harder through the roll'}</small></div>`;
    }
  }

  update(s: CadenzaSnapshot, accent: string, now: number) {
    this.root.style.setProperty('--acc', accent);
    if (now > this.popUntil) this.popEl.classList.remove('on');
    if (now > this.recapUntil) this.recapEl.classList.remove('on');
    this.updateLaunch(s);
    if (s.menu) {
      this.callout.classList.remove('on');
      this.effortKey = ''; this.calloutUntil = 0;
      this.menu.style.display = 'flex';
      for (const e of [this.score, this.zone, this.song, this.shield]) e.style.display = 'none';
      const m = s.menu, key = JSON.stringify({ row: m.row, difficulty: m.difficulty, trainer: m.trainer, reducedFlash: m.reducedFlash });
      if (key !== this.lastKey) {
        this.lastKey = key;
        const row = (i: number, label: string, val: string, cls = '') => `<div class="ws-row${m.row === i ? ' f' : ''} ${cls}" data-i="${i}">${label}${val ? `<em>◀ ${val} ▶</em>` : ''}</div>`;
        this.menu.innerHTML = `<h2>CADENZA</h2>${row(MENU.difficulty, 'Difficulty', m.difficulty)}${row(MENU.trainer, 'Trainer', m.trainer === 'erg' ? 'ERG (holds the watts)' : 'Grade (climbs)')}${row(MENU.flash, 'Reduced flashing', m.reducedFlash ? 'On' : 'Off')}${row(MENU.start, `Ride · ${Math.ceil(m.left)}`, '', 'go')}<small>◀▶ / Z A / paddles: steer · follow the target, sprint on the 3-2-1 · casual rests more, elite sprints more</small>`;
        this.menu.querySelectorAll<HTMLElement>('.ws-row').forEach((r) => r.addEventListener('pointerdown', (e) => {
          e.preventDefault(); e.stopPropagation();
          const i = Number(r.dataset.i);
          if (i === MENU.difficulty) { const d = ['casual', 'pro', 'elite']; this.send?.({ type: 'difficulty', value: d[(d.indexOf(m.difficulty) + 1) % 3] }); }
          if (i === MENU.trainer) this.send?.({ type: 'trainer' });
          if (i === MENU.flash) this.send?.({ type: 'flash' });
          if (i === MENU.start) this.send?.({ type: 'start' });
        }));
      }
      const ride = this.menu.querySelector<HTMLElement>(`[data-i="${MENU.start}"]`);
      if (ride) { const label = `Ride · ${Math.ceil(m.left)}`; if (ride.textContent !== label) ride.textContent = label; }
      return;
    }
    this.menu.style.display = 'none';
    for (const e of [this.score, this.zone, this.song, this.shield]) e.style.display = '';
    this.scoreText.innerHTML = `<b>${s.score.toLocaleString()}</b><span>×${s.mult.toFixed(1)}${s.overdrive ? ' · OVERDRIVE' : ''}${s.chain >= 8 ? ` · chain ${s.chain}` : ''}</span>`;
    const fmt = (x: number) => { const l = Math.max(0, Math.ceil(x - 1e-6)); return `${Math.floor(l / 60)}:${String(l % 60).padStart(2, '0')}`; };
    const e = s.effort;
    const band = `Z${e.min}${e.max !== e.min ? `–${e.max}` : ''}`;
    const watts = e.phase === 'recover' ? 'Easy pedaling' : `${e.watts}${e.ceilingWatts ? `–${e.ceilingWatts}` : '+'} W`;
    this.zone.innerHTML = `<b>${band}</b><span>${fmt(e.left)} left</span><span class="${e.ok ? 'ok' : 'low'}">${e.erg ? 'ERG · keep spinning' : watts}</span>`;
    const block = s.track.rideBlocks[rideIndexAt(s.track.rideBlocks, s.p)], key = `${block.t0}:${e.phase}`;
    if (key !== this.effortKey || s.p < this.lastP) {
      this.effortKey = key; this.calloutUntil = now + (e.phase === 'recover' ? 4 : 3);
    }
    this.lastP = s.p;
    const show = !s.done && (!!e.countdown || !!e.coaching || !!s.dropout || now < this.calloutUntil);
    this.callout.classList.toggle('on', show);
    if (show) {
      // one voice: a big instruction, and a smaller line in the same style saying what it means
      const [lead, sub] = e.countdown ? [String(e.countdown), 'Sprint incoming']
        : s.dropout ? [e.phase === 'recover' ? 'Break' : e.erg ? 'Keep Spinning' : 'Harder', `Reboot in ${s.dropout.left.toFixed(1)}`]
        : e.phase === 'recover' ? [e.instruction, `Easy pedaling · ${band}`]
        : [e.instruction, e.erg ? band : `${band} · ${watts}`];
      const content = `<b${e.countdown ? ' class="tick"' : ''}>${esc(lead)}</b><span>${esc(sub)}</span>`;
      if (content !== this.calloutContent) { this.callout.innerHTML = content; this.calloutContent = content; }
    }
    this.song.innerHTML = s.song ? `♪ ${esc(s.song.title)} — ${esc(s.song.artist)}${s.song.credit ? `<small>${esc(s.song.credit)}</small>` : ''}` : '';
    const bar = this.shield.firstElementChild as HTMLElement;
    bar.style.width = `${s.shield}%`;
    this.shield.classList.toggle('low', s.shield < 35 || !!s.dropout);
  }
}
const esc = (x: string) => x.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);
