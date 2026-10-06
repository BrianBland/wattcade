import type { WattsurfSnapshot } from '../sim/sim';
import type { Box, Layout } from './layout';

/** Wipeout-flavoured DOM HUD: score, zone card, shield, now playing, zone callouts, dropout banner, pre-game menu. */
const CSS = `
.ws-hud { position:absolute; inset:0; pointer-events:none; font-family:'Eurostile','Michroma','Orbitron','Avenir Next Condensed','Arial Narrow',sans-serif; color:#fff; text-transform:uppercase; }
.ws-box { position:absolute; }
.ws-score b { display:block; font-size:34px; font-weight:900; font-style:italic; letter-spacing:2px; text-shadow:0 0 12px var(--acc), 0 2px 0 #000; }
.ws-score span { font:800 14px system-ui; letter-spacing:2px; color:var(--acc); text-shadow:0 1px 2px #000; }
.ws-zone { text-align:right; }
.ws-zone b { display:block; font-size:28px; font-weight:900; font-style:italic; letter-spacing:3px; color:var(--acc); text-shadow:0 0 14px var(--acc), 0 2px 0 #000; }
.ws-zone span { display:block; font:800 13px system-ui; letter-spacing:2px; text-shadow:0 1px 2px #000; }
.ws-zone .ok { color:#b6ff3b; } .ws-zone .low { color:#ffb020; }
.ws-song { font:700 12px system-ui; text-transform:none; text-shadow:0 1px 2px #000; opacity:.9; overflow:hidden; white-space:nowrap; text-overflow:ellipsis; }
.ws-song small { display:block; opacity:.7; font-weight:600; overflow:hidden; text-overflow:ellipsis; }
.ws-shield { border:2px solid var(--acc); border-radius:4px; background:#0008; transform:skewX(-20deg); overflow:hidden; }
.ws-shield i { display:block; height:100%; background:linear-gradient(90deg, var(--acc), #fff); transition:width .2s; }
.ws-shield.low i { background:linear-gradient(90deg,#ff3d5a,#ffb020); }
.ws-callout { text-align:center; opacity:0; transition:opacity .35s, transform .35s; transform:scale(.9); }
.ws-callout.on { opacity:1; transform:scale(1); }
.ws-callout b { display:block; font-size:64px; font-weight:900; font-style:italic; letter-spacing:8px; color:#fff; text-shadow:0 0 24px var(--acc), 0 0 4px var(--acc), 0 3px 0 #000; line-height:1; }
.ws-callout span { display:block; font-size:22px; font-weight:900; letter-spacing:6px; color:var(--acc); text-shadow:0 2px 0 #000; margin-top:6px; }
.ws-cue { display:block; font-size:24px; letter-spacing:3px; }
.ws-cue.up { color:#fff; text-shadow:0 0 14px #fff, 0 2px 0 #000; }
.ws-cue.down { color:#ff5a2a; text-shadow:0 0 14px #ff3b12, 0 2px 0 #000; }
.ws-drop { position:absolute; left:0; right:0; text-align:center; font-weight:900; font-style:italic; font-size:30px; letter-spacing:4px; color:#ff3d5a; text-shadow:0 0 16px #ff3d5a, 0 2px 0 #000; }
.ws-menu { pointer-events:auto; background:#05040ccc; border:2px solid var(--acc); border-radius:6px; padding:18px 20px; box-shadow:0 0 40px color-mix(in srgb, var(--acc) 40%, transparent); display:flex; flex-direction:column; gap:8px; }
.ws-menu h2 { margin:0 0 4px; font-size:30px; font-style:italic; letter-spacing:6px; color:var(--acc); text-shadow:0 0 12px var(--acc); }
.ws-row { display:flex; justify-content:space-between; align-items:center; padding:10px 12px; border:2px solid transparent; font:800 16px system-ui; letter-spacing:2px; cursor:pointer; }
.ws-row.f { border-color:var(--acc); background:color-mix(in srgb, var(--acc) 18%, transparent); }
.ws-row em { font-style:normal; color:var(--acc); }
.ws-row.go { justify-content:center; background:var(--acc); color:#000; font-size:20px; }
.ws-row.go.f { box-shadow:0 0 20px var(--acc); border-color:#fff; }
.ws-menu small { font:600 12px system-ui; text-transform:none; opacity:.7; text-align:center; }
`;

export class Hud {
  private root: HTMLDivElement;
  private score = this.el('ws-box ws-score'); private zone = this.el('ws-box ws-zone'); private song = this.el('ws-box ws-song');
  private shield = this.el('ws-box ws-shield'); private callout = this.el('ws-box ws-callout'); private menu = this.el('ws-box ws-menu');
  private drop = document.createElement('div');
  private send?: (a: unknown) => void;
  private calloutUntil = 0; private lastKey = '';
  constructor(container: HTMLElement) {
    if (!document.getElementById('ws-hud-css')) { const st = document.createElement('style'); st.id = 'ws-hud-css'; st.textContent = CSS; document.head.appendChild(st); }
    this.root = document.createElement('div'); this.root.className = 'ws-hud';
    this.drop.className = 'ws-drop';
    for (const e of [this.score, this.zone, this.song, this.shield, this.callout, this.menu, this.drop]) this.root.appendChild(e);
    this.shield.appendChild(document.createElement('i'));
    container.appendChild(this.root);
  }
  private el(cls: string) { const d = document.createElement('div'); d.className = cls; return d; }
  setSend(s?: (a: unknown) => void) { this.send = s; }
  place(L: Layout) {
    const put = (e: HTMLElement, b: Box) => Object.assign(e.style, { left: `${b.x}px`, top: `${b.y}px`, width: `${b.w}px`, height: `${b.h}px` });
    put(this.score, L.score); put(this.zone, L.zone); put(this.song, L.song); put(this.shield, L.shield); put(this.callout, L.callout); put(this.menu, L.menu);
    Object.assign(this.drop.style, { top: `${L.callout.y + L.callout.h + 10}px` });
  }
  /** Show the big ZONE callout. */
  zoneCallout(n: number, kind: string, now: number) {
    this.callout.innerHTML = `<b>ZONE ${String(n).padStart(2, '0')}</b><span>${kind}</span>`;
    this.callout.classList.add('on'); this.calloutUntil = now + 1.8;
  }
  text(title: string, sub: string, now: number, s = 1.6) { this.callout.innerHTML = `<b style="font-size:44px">${title}</b><span>${sub}</span>`; this.callout.classList.add('on'); this.calloutUntil = now + s; }
  dispose() { this.root.remove(); }

  update(s: WattsurfSnapshot, accent: string, now: number) {
    this.root.style.setProperty('--acc', accent);
    if (now > this.calloutUntil) this.callout.classList.remove('on');
    if (s.menu) {
      this.menu.style.display = 'flex';
      for (const e of [this.score, this.zone, this.song, this.shield]) e.style.display = 'none';
      const m = s.menu, key = JSON.stringify(m) + accent;
      if (key !== this.lastKey) {
        this.lastKey = key;
        const row = (i: number, label: string, val: string, cls = '') => `<div class="ws-row${m.row === i ? ' f' : ''} ${cls}" data-i="${i}">${label}${val ? `<em>◀ ${val} ▶</em>` : ''}</div>`;
        this.menu.innerHTML = `<h2>WATTSURF</h2><div class="ws-row${m.row === 0 ? ' f' : ''}" data-i="0">Mode<em>Mono</em></div>${row(1, 'Difficulty', m.difficulty)}${row(2, 'Trainer', m.trainer === 'erg' ? 'ERG (holds the watts)' : 'Grade (climbs)')}${row(3, 'Reduced flashing', m.reducedFlash ? 'On' : 'Off')}${row(4, `Ride · ${Math.ceil(m.left)}`, '', 'go')}<small>◀▶ / Z A / paddles: one lane per press · builds climb, drops are short sprints · ERG = the trainer sets the watts, you just pedal</small>`;
        this.menu.querySelectorAll<HTMLElement>('.ws-row').forEach((r) => r.addEventListener('pointerdown', (e) => {
          e.preventDefault(); e.stopPropagation();
          const i = Number(r.dataset.i);
          if (i === 1) { const d = ['casual', 'pro', 'elite']; this.send?.({ type: 'difficulty', value: d[(d.indexOf(m.difficulty) + 1) % 3] }); }
          if (i === 2) this.send?.({ type: 'trainer' });
          if (i === 3) this.send?.({ type: 'flash' });
          if (i === 4 || i === 0) this.send?.({ type: 'start' });
        }));
      }
      return;
    }
    this.menu.style.display = 'none';
    for (const e of [this.score, this.zone, this.song, this.shield]) e.style.display = '';
    this.score.innerHTML = `<b>${s.score.toLocaleString()}</b><span>×${s.mult.toFixed(1)}${s.overdrive ? ' · OVERDRIVE' : ''}${s.chain >= 8 ? ` · chain ${s.chain}` : ''}</span>`;
    const fmt = (x: number) => { const l = Math.max(0, Math.ceil(x)); return `${Math.floor(l / 60)}:${String(l % 60).padStart(2, '0')}`; };
    const e = s.effort;
    const PHASE: Record<string, string> = { cruise: 'Cruise', climb: 'Climb', sprint: 'SPRINT', hold: 'Hold it', recover: 'Recover' };
    const want = e.phase === 'recover' ? 'easy' : e.erg ? `ERG ${e.watts}+ W` : `≥ ${e.watts} W`;
    this.zone.innerHTML = `<b>ZONE ${String(s.zone.n).padStart(2, '0')}</b><span>${s.zone.kind} · ${fmt(s.zone.left)}</span><span class="${e.ok ? 'ok' : 'low'}">${PHASE[e.phase]} ${want} · ${fmt(e.left)} ${e.phase === 'recover' ? '' : e.ok ? '✓' : '↑'}</span>`;
    this.song.innerHTML = s.song ? `♪ ${esc(s.song.title)} — ${esc(s.song.artist)}${s.song.credit ? `<small>${esc(s.song.credit)}</small>` : ''}` : '';
    const bar = this.shield.firstElementChild as HTMLElement;
    bar.style.width = `${s.shield}%`;
    this.shield.classList.toggle('low', s.shield < 35 || !!s.dropout);
    // off target: a big plain-language prompt under the callout (the world itself greys out / the ship overheats too)
    if (s.dropout) this.drop.textContent = `DROPOUT · hit your target to reboot ${s.dropout.left.toFixed(1)}s`;
    else if (e.under > 0.25) this.drop.innerHTML = `<span class="ws-cue up">${e.erg ? 'KEEP PEDALLING' : `POWER UP ▲ ${e.watts} W`}</span>`;
    else if (e.over > 0.3) this.drop.innerHTML = `<span class="ws-cue down">EASE OFF ▼ ${e.ceilingWatts} W</span>`;
    else this.drop.textContent = '';
  }
}
const esc = (x: string) => x.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);
