import type { SfSnapshot } from '../sim/types';
import { TIER_NAMES } from '../sim/progression';
import { craftName } from '../sim/save';
import type { layout } from './layout';

/**
 * Floating arcade HUD in the shared wattcade look (main.css tokens, .card/.btn/.tag, neon italic numerals).
 * Watts, zone and controller hints belong to the shell HUD; this only shows what the game adds.
 */
const CSS = `
.sq-hud { position:absolute; inset:0; pointer-events:none; color:var(--fg,#e9e6ff); text-shadow:0 1px 2px #000, 0 0 6px #000c; }
/* Soft dark fades behind the top corners keep text legible without boxes. */
.sq-hud::before { content:''; position:absolute; inset:0; pointer-events:none; background:radial-gradient(ellipse 340px 150px at 0% 0%,#07060f99,transparent 70%),radial-gradient(ellipse 380px 150px at 100% 0%,#07060f99,transparent 70%); }
.sq-box { position:absolute; box-sizing:border-box; }
.sq-top { display:flex; justify-content:space-between; align-items:flex-start; gap:12px; }
.sq-title { min-width:0; flex:1; }
.sq-title span { overflow:hidden; white-space:nowrap; text-overflow:ellipsis; }
.sq-chip { display:inline-flex; align-items:baseline; gap:8px; }
.sq-chip b { color:var(--neon,#00f0ff); font:900 13px system-ui; letter-spacing:1.5px; text-transform:uppercase; }
.sq-chip span { font:700 12px system-ui; color:#d8d4f5; }
.sq-title b { display:block; font-size:clamp(15px,2vw,20px); font-weight:900; font-style:italic; letter-spacing:3px; text-transform:uppercase; color:var(--neon,#00f0ff); text-shadow:0 0 14px #00f0ff88, 0 2px 0 #000; }
.sq-title span { font:800 12px system-ui; letter-spacing:2px; text-transform:uppercase; color:var(--dim,#a29dcc); }
.sq-stats { flex:none; display:flex; gap:clamp(12px,2.4vw,26px); justify-content:flex-end; text-align:right; }
.sq-stat b { display:block; font:900 clamp(18px,2.6vw,26px) system-ui; color:#fff; letter-spacing:0.5px; font-variant-numeric:tabular-nums; line-height:1.05; }
.sq-stat b em { font-style:normal; color:var(--acc,#00f0ff); }
.sq-stat span { font:800 10px system-ui; letter-spacing:1.5px; text-transform:uppercase; color:#cfcaf3; }
.sq-locks i { display:inline-block; width:9px; height:9px; margin-left:4px; border-radius:50%; border:2px solid #fff36b; vertical-align:middle; }
.sq-locks i.on { background:#fff36b; box-shadow:0 0 8px #fff36b; }
.sq-status { text-align:center; font:800 13px system-ui; letter-spacing:2px; text-transform:uppercase; }
.sq-status > span { display:inline-block; padding:2px 14px; background:linear-gradient(90deg,transparent,#07060f99 20%,#07060f99 80%,transparent); }
.sq-status .sq-elite { display:inline-block; padding:2px 14px; background:linear-gradient(90deg,transparent,#07060f99 20%,#07060f99 80%,transparent); }
.sq-elite { margin-top:4px; color:#ffd34d; font:900 italic 13px system-ui; letter-spacing:3px; text-shadow:0 0 calc(4px + var(--b,0) * 10px) #ffd34d, 0 1px 2px #000; }
.sq-status.warn { color:var(--warn,#ffb020); }
.sq-bar { height:10px; margin:6px auto 0; max-width:360px; border:2px solid var(--pink,#ff2bd6); border-radius:3px; background:#0009; transform:skewX(-20deg); overflow:hidden; }
.sq-bar i { display:block; height:100%; background:linear-gradient(90deg,var(--pink,#ff2bd6),#fff); transition:width .2s; }
.sq-callout { text-align:center; opacity:0; transform:scale(.9); transition:opacity .3s, transform .3s; }
.sq-callout.on { opacity:1; transform:none; }
.sq-callout > div { display:inline-block; padding:14px 26px; border-radius:22px; background:radial-gradient(ellipse at center,#07060fb0 0%,#07060f70 60%,transparent 100%); }
.sq-callout b { display:block; font-size:clamp(34px,6vw,58px); font-weight:900; font-style:italic; letter-spacing:6px; text-transform:uppercase; color:#fff; line-height:1; text-shadow:0 0 22px var(--acc,#ff2bd6), 0 0 4px var(--acc,#ff2bd6), 0 3px 0 #000; }
.sq-callout span { display:block; margin-top:6px; font:900 clamp(13px,1.8vw,18px) system-ui; letter-spacing:4px; text-transform:uppercase; color:var(--acc,#ff2bd6); }
.sq-foot { display:flex; align-items:flex-end; justify-content:space-between; gap:10px; }
.sq-shield { min-width:120px; font:800 11px system-ui; letter-spacing:2px; text-transform:uppercase; color:var(--dim,#a29dcc); }
.sq-shield .sq-bar { margin:4px 0 0; width:clamp(110px,18vw,180px); border-color:var(--neon,#00f0ff); }
.sq-shield .sq-bar i { background:linear-gradient(90deg,var(--neon,#00f0ff),#fff); }
.sq-shield.low .sq-bar i { background:linear-gradient(90deg,var(--bad,#ff4d6d),var(--warn,#ffb020)); }
.sq-song { flex:1; min-width:0; text-align:center; font:700 12px system-ui; opacity:.85; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
.sq-song small { display:block; font-weight:800; letter-spacing:2px; text-transform:uppercase; color:var(--dim,#a29dcc); }
.sq-actions { display:flex; gap:8px; align-items:center; pointer-events:auto; }
.sq-actions .btn { pointer-events:auto; }
.sq-actions .btn.ready { border-color:var(--neon,#00f0ff); box-shadow:0 0 18px #00f0ff88; }
.sq-menu { position:absolute; display:none; align-items:center; justify-content:center; padding:12px; box-sizing:border-box; background:#07060fb3; pointer-events:auto; overflow:auto; }
.sq-menu .panel { width:min(620px,100%); text-align:center; }
/* Hangar showcase: the turning craft takes the free side (right in landscape, bottom in portrait). */
.sq-menu.wide { justify-content:flex-start; padding-left:max(12px, 3%); background:linear-gradient(90deg,#07060fd9 0%,#07060f99 52%,transparent 72%); } .sq-menu.wide .panel { width:min(560px, 54%); }
.sq-menu.tall { align-items:flex-start; padding-top:max(12px, 4%); background:linear-gradient(180deg,#07060fd9 0%,#07060f99 55%,transparent 75%); }
.sq-grow { margin:-6px 0 12px; font:800 11px system-ui; letter-spacing:2px; text-transform:uppercase; color:var(--neon,#00f0ff); }
.sq-menu h2 { margin:0; font-size:var(--t-l,26px); font-style:italic; letter-spacing:5px; text-transform:uppercase; color:var(--neon,#00f0ff); text-shadow:0 0 14px #00f0ff99, 0 2px 0 #000; }
.sq-menu .sub { margin:6px 0 16px; color:var(--dim,#a29dcc); }
.sq-crafts { display:grid; gap:12px; grid-template-columns:repeat(auto-fit,minmax(200px,1fr)); margin-bottom:16px; text-align:left; }
.sq-crafts .card { font:inherit; color:inherit; }
.sq-crafts .card:disabled { opacity:.45; cursor:default; }
.sq-crafts .card p { margin:8px 0; color:var(--dim,#a29dcc); font-size:14px; }
.sq-crafts .card small { font-weight:800; letter-spacing:1px; text-transform:uppercase; font-size:11px; }
.sq-lvl { display:flex; align-items:center; gap:8px; margin:8px 0 4px; font:800 12px system-ui; letter-spacing:1px; text-transform:uppercase; }
.sq-lvl .bar { flex:1; height:8px; }
.sq-next { font-size:12px; color:var(--dim,#a29dcc); }
.sq-locks { position:relative; }
.sq-pop { position:absolute; right:0; top:100%; margin-top:6px; white-space:nowrap; font:900 italic 13px system-ui; letter-spacing:2px; text-transform:uppercase; color:#fff36b; text-shadow:0 0 10px #fff36b; opacity:0; transition:opacity .2s; }
.sq-pop.on { opacity:1; }
.sq-tester { display:inline-block; margin-bottom:8px; }
.sq-amp { display:inline-block; width:64px; height:6px; margin-left:4px; border-radius:3px; background:#ffffff22; overflow:hidden; vertical-align:middle; }
.sq-amp i { display:block; height:100%; background:linear-gradient(90deg,var(--neon,#00f0ff),var(--pink,#ff2bd6)); }
.sq-score { text-align:center; opacity:0; transform:translateY(10px) scale(.96); transition:opacity .35s, transform .35s; }
.sq-score.on { opacity:1; transform:none; }
.sq-score > div { display:inline-grid; grid-template-columns:auto auto; gap:2px 18px; align-items:center; padding:16px 26px; border-radius:20px; background:radial-gradient(ellipse at center,#07060fd0 0%,#07060fa0 65%,#07060f40 100%); }
.sq-score .g { grid-row:span 6; font:900 italic clamp(64px,10vw,104px)/1 system-ui; color:var(--gc); text-shadow:0 0 26px var(--gc), 0 3px 0 #000; padding-right:6px; }
.sq-score h4 { margin:0 0 4px; font:900 13px system-ui; letter-spacing:3px; text-transform:uppercase; color:var(--dim,#a29dcc); text-align:left; max-width:260px; overflow:hidden; white-space:nowrap; text-overflow:ellipsis; }
.sq-score .r { display:flex; justify-content:space-between; gap:18px; font:800 13px system-ui; letter-spacing:1px; text-transform:uppercase; color:#cfcaf3; min-width:200px; }
.sq-score .r b { color:#fff; font-variant-numeric:tabular-nums; }
.sq-menu .hint { margin:12px 0 0; font-size:13px; color:var(--dim,#a29dcc); }
.sq-hud.hangar > .sq-box { visibility:hidden; }
@media (max-width: 560px) { .sq-title b { font-size:13px; letter-spacing:2px; } .sq-title span { font-size:10px; letter-spacing:1px; display:block; } .sq-stats { gap:10px; } .sq-stat b { font-size:18px; } .sq-stat span { font-size:9px; letter-spacing:1px; } .sq-locks div, .sq-long { display:none; } .sq-shield { min-width:0; } .sq-shield .sq-bar { width:90px; } }
@media (min-width: 561px) { .sq-short { display:none; } }
`;

const STATUS: Record<SfSnapshot['effort']['status'], string> = {
  on: '', settling: 'Find your rhythm', under: 'Keep the pedals turning', over: 'Ease off · back to Zone 2', recover: 'Escort cover · easy spin',
};

export class SquadronHud {
  readonly root = document.createElement('div');
  private top = this.box('sq-top'); private title = this.part(this.top, 'sq-title'); private stats = this.part(this.top, 'sq-stats'); private status = this.box('sq-status');
  private callout = this.box('sq-callout'); private score = this.box('sq-score'); private foot = this.box('sq-foot'); readonly menu = document.createElement('div');
  private shield!: HTMLElement; private song!: HTMLElement; private nova!: HTMLButtonElement;
  private menuKey = ''; private callUntil = 0; private lastClearAt = -1; private lastBanner = '';

  constructor() {
    this.root.className = 'sq-hud';
    const style = document.createElement('style'); style.textContent = CSS; this.root.appendChild(style);
    this.foot.innerHTML = `<div class="sq-shield"><span>Shield</span><div class="sq-bar"><i></i></div></div><div class="sq-song"></div>`
      + `<div class="sq-actions"><button class="btn small" data-action="target" data-direction="-1" aria-label="Previous target">‹</button>`
      + `<button class="btn small" data-action="target" data-direction="1" aria-label="Next target">›</button><button class="btn small" data-action="nova"></button></div>`;
    this.shield = this.foot.querySelector('.sq-shield')!; this.song = this.foot.querySelector('.sq-song')!;
    this.nova = this.foot.querySelector('[data-action="nova"]')!;
    this.menu.className = 'sq-menu'; this.root.appendChild(this.menu);
  }
  private box(cls: string) { return this.part(this.root, `sq-box ${cls}`); }
  private part(parent: HTMLElement, cls: string) { const el = document.createElement('div'); el.className = cls; parent.appendChild(el); return el; }

  place(l: ReturnType<typeof layout>) {
    const { safe } = l, pad = 16, place = (el: HTMLElement, x: number, y: number, w: number, h?: number) =>
      Object.assign(el.style, { left: `${x}px`, top: `${y}px`, width: `${Math.max(0, w)}px`, ...(h !== undefined ? { height: `${Math.max(0, h)}px` } : {}) });
    place(this.top, safe.x + pad, safe.y + 12, safe.w - pad * 2);
    place(this.status, safe.x + pad, safe.y + l.header - 4, safe.w - pad * 2);
    place(this.callout, safe.x + pad, safe.y + safe.h * 0.34, safe.w - pad * 2);
    place(this.score, safe.x + pad, safe.y + safe.h * 0.26, safe.w - pad * 2);
    place(this.foot, safe.x + pad, safe.y + safe.h - l.footer + 8, safe.w - pad * 2, l.footer - 16);
    place(this.menu, safe.x, safe.y, safe.w, safe.h);
    const wide = safe.w > safe.h * 1.1; this.menu.classList.toggle('wide', wide); this.menu.classList.toggle('tall', !wide);
  }

  update(s: SfSnapshot) {
    // No title during play: just the arsenal tier (and a tester tag), small, on a legible chip.
    this.title.innerHTML = `<span class="sq-chip"><b>Arsenal ${s.gunLevel}</b><span>${TIER_NAMES[s.gunLevel]}${s.tester ? ' · Tester' : ''}</span></span>`
      + `<div class="sq-chip" style="display:flex;margin-top:4px"><span>Amp</span><span class="sq-amp"><i style="width:${Math.round((0.15 + s.amp * 0.85) * (0.9 + s.beat * 0.1) * 100)}%"></i></span></div>`;
    this.renderScore(s);
    const pips = Array.from({ length: s.lockCapacity }, (_, i) => `<i class="${i < s.locks.length ? 'on' : ''}"></i>`).join('');
    this.stats.innerHTML = `<div class="sq-stat"><b>${s.score.toLocaleString()}</b><span>Score</span></div>`
      + `<div class="sq-stat" style="--acc:#b6ff3b"><b><em>${Math.round(s.clear.rate * 100)}%</em></b><span>Cleared</span></div>`
      + `<div class="sq-stat sq-locks" style="--acc:#fff36b"><b><em>${s.locks.length}</em>/${s.lockCapacity}</b><span>Locks</span><div>${pips}</div>`
      + `<em class="sq-pop${s.fullLock > 0 ? ' on' : ''}">Full lock</em><em class="sq-pop${s.clear.streak > 1 && s.clear.last?.perfect && s.t - s.clear.last.at < 3 ? ' on' : ''}">Perfect ×${s.clear.streak}</em></div>`;
    const warn = s.effort.status !== 'on' && s.effort.status !== 'recover' && s.effort.status !== 'settling' || s.quality < 0.6;
    this.status.classList.toggle('warn', warn);
    this.status.innerHTML = s.boss
      ? `<span>${s.boss.name} · ${s.boss.stage} · ${Math.ceil(s.boss.left)}s</span><div class="sq-bar"><i style="width:${Math.max(0, s.boss.hp / s.boss.maxHp * 100)}%"></i></div>`
      : s.bossIn !== null ? `Flagship inbound · ${Math.ceil(s.bossIn)}s`
      : s.upcoming ? `${s.upcoming.label} · ${s.upcoming.watts} W in ${Math.ceil(s.upcoming.left)}s`
      : s.cadence ? `Optional spin · ${s.cadence.min}–${s.cadence.max} RPM` : STATUS[s.effort.status];
    if (!s.boss && this.status.innerHTML) this.status.innerHTML = `<span>${this.status.innerHTML}</span>`;
    if (s.eliteHint) this.status.insertAdjacentHTML('beforeend', `<div class="sq-elite" style="--b:${s.beat.toFixed(2)}">${s.eliteHint < 0 ? '◀ Elite wing' : 'Elite wing ▶'}</div>`);
    // Callouts: perfect formations take priority over banners.
    const last = s.clear.last;
    if (last && last.at !== this.lastClearAt) {
      this.lastClearAt = last.at;
      if (last.perfect && bigPerfect(s.clear.streak)) this.call('Perfect', s.clear.streak > 1 ? `Streak ×${s.clear.streak}` : 'Formation cleared', '#fff36b', s.t, 1.6);
    }
    if (s.banner && s.banner !== this.lastBanner && s.t >= this.callUntil) {
      const [head, ...rest] = s.banner.split(' · ');
      this.call(head, rest.join(' · '), '#ff2bd6', s.t, 2.4);
    }
    this.lastBanner = s.banner;
    this.callout.classList.toggle('on', s.t < this.callUntil);
    this.shield.classList.toggle('low', s.shield < 35);
    this.shield.querySelector<HTMLElement>('i')!.style.width = `${Math.max(0, s.shield)}%`;
    this.song.innerHTML = `<small>${s.section === 'drop' ? 'Full spectrum' : s.sectorName}</small>${escapeHtml(s.song)}`;
    const ready = s.charge >= 100 && s.coverLeft <= 0 && s.rejoinLeft <= 0;
    const nova = s.coverLeft > 0 ? `Cover ${Math.ceil(s.coverLeft)}s` : ready ? 'Nova · take a breather' : `Nova ${Math.floor(s.charge)}%`;
    if (this.nova.getAttribute('aria-label') !== nova) {
      this.nova.setAttribute('aria-label', nova);
      this.nova.innerHTML = ready ? '<span class="sq-long">Nova · take a breather</span><span class="sq-short">Nova</span>' : nova;
    }
    this.nova.disabled = !ready; this.nova.classList.toggle('ready', ready);
    this.renderMenu(s);
  }
  private scoreAt = -1;
  /** End-of-segment scorecard: big letter grade with the numbers behind it, during the breather. */
  private renderScore(s: SfSnapshot) {
    const c = s.scorecard, on = !!c && s.t - c.at < 7.5;
    this.score.classList.toggle('on', on);
    if (!c || c.at === this.scoreAt) return;
    this.scoreAt = c.at;
    const color = { S: '#ffd34d', A: '#b6ff3b', B: '#00f0ff', C: '#ffb020', D: '#9aa0b4' }[c.grade];
    const row = (k: string, v: string) => `<div class="r"><span>${k}</span><b>${v}</b></div>`;
    this.score.innerHTML = `<div style="--gc:${color}"><span class="g">${c.grade}</span><h4>${escapeHtml(c.title)}</h4>`
      + row('Cleared', `${c.clearPct}%`) + row('On target', `${c.onTargetPct}%`) + row('Perfect wings', String(c.perfects)) + row('Elites', c.elites) + row('Flagship', c.boss) + `</div>`;
  }
  private call(head: string, sub: string, color: string, t: number, dur: number) {
    this.callout.style.setProperty('--acc', color);
    this.callout.innerHTML = `<div><b>${escapeHtml(head)}</b>${sub ? `<span>${escapeHtml(sub)}</span>` : ''}</div>`;
    this.callUntil = t + dur;
  }
  private renderMenu(s: SfSnapshot) {
    this.root.classList.toggle('hangar', s.phase === 'hangar');
    this.menu.style.display = s.phase === 'hangar' ? 'flex' : 'none';
    const countdown = `Pedalling launches in ${Math.ceil(s.menuLeft)}s · A to launch`;
    const key = `${s.phase}:${s.craft}:${s.escortUnlocked}:${s.ergAvailable}:${s.tester}:${s.crafts.cruiser.level}:${s.crafts.escort.level}`;
    if (key === this.menuKey) { const c = this.menu.querySelector('.hint'); if (c) c.textContent = countdown; return; }
    this.menuKey = key;
    const card = (c: 'cruiser' | 'escort') => {
      const locked = c === 'escort' && (!s.escortUnlocked || !s.ergAvailable);
      const info = s.crafts[c];
      const note = c === 'escort' && !s.ergAvailable ? 'Requires an ERG trainer' : c === 'escort' && !s.escortUnlocked ? 'Unlocks at Cruiser level 3' : c === s.craft ? 'Selected' : 'Choose';
      const level = locked ? '' : `<div class="sq-lvl">Lv ${info.level}<div class="bar"><i style="width:${Math.round(info.progress * 100)}%"></i></div></div>`
        + `<div class="sq-next">${info.next ? `Lv ${info.level + 1}: ${escapeHtml(info.next)}${info.minutesToNext ? ` · ${info.minutesToNext} min` : ''}` : 'Max level'}</div>`;
      return `<button class="card${c === s.craft ? ' focused' : ''}" data-action="craft" data-craft="${c}" ${locked ? 'disabled' : ''}>`
        + `<h3>${craftName(c)}</h3>${c === 'cruiser' ? '<span class="tag zone2">Zone 2</span><span class="tag">Gears</span>' : '<span class="tag zone2">Zone 2</span><span class="tag erg">ERG</span>'}`
        + `<p>${c === 'cruiser' ? 'Ride steady with virtual gears. Fill every lock slot for full-lock volleys.' : 'The trainer holds the watts. Wingmen shoot down bullets; a beam sweeps your lane on each phrase.'}</p>${level}<small>${note}</small></button>`;
    };
    this.menu.innerHTML = `<div class="panel">${s.tester ? '<span class="tag sq-tester" style="color:var(--warn,#ffb020)">Tester · everything unlocked</span>' : ''}<h2>Sprocket Squadron</h2><div class="sub">Hold the groove to paint targets. Your squadron flies itself — choose who it hits.</div>`
      + `<div class="sq-grow">Arsenal grows to tier ${s.crafts[s.craft].arsenalCap} each ride</div><div class="sq-crafts">${card('cruiser')}${card('escort')}</div>`
      + `<button class="btn primary" data-action="launch">Launch squadron</button><p class="hint">${countdown}</p></div>`;
  }
}
/** Full-screen PERFECT only for the first in a run of perfects and at streak milestones; the rest pop by the lock pips. */
export const bigPerfect = (streak: number) => streak <= 1 || streak === 3 || streak % 5 === 0;
const escapeHtml = (text: string) => text.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);
