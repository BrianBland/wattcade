// DOM layer for the crime systems (zero draw calls): cash/rep line, hot list, dealer menu, fence quote, crime toasts,
// speech bubbles + phone icons over NPCs, and edge-of-screen arrows to the fence / dealer / gang turf.
import * as THREE from 'three';
import type { Snapshot } from '../sim/sim';
import { DEALER, FENCE, TURF } from '../sim/crime';
import { BIKES } from '../sim/bikes';
import { heightAt } from '../sim/world';

const css = <E extends HTMLElement>(el: E, s: string) => { el.style.cssText = s; return el; };
const div = (s: string) => css(document.createElement('div'), s);
const ICON: Record<string, string> = { bottle: '🍾', molotov: '🔥', oil: '🛢', grenade: '💣', bazooka: '🚀' };
export class CrimeHud {
  private root: HTMLDivElement; private money: HTMLDivElement; private panel: HTMLDivElement; private msg: HTMLDivElement;
  private bubbles: HTMLDivElement[] = []; private marks: HTMLDivElement[] = []; private v = new THREE.Vector3(); private panelKey = '';
  constructor(container: HTMLElement) {
    this.root = div('position:absolute;inset:0;pointer-events:none;overflow:hidden;font-family:system-ui');
    this.money = div('position:absolute;left:18px;top:62px;font:800 18px system-ui;color:#e9d58a;text-shadow:0 1px 3px #000;white-space:pre');
    this.panel = div('position:absolute;left:50%;bottom:120px;transform:translateX(-50%);display:none;background:rgba(36,26,18,.88);border:2px solid #c9a227;border-radius:8px;padding:10px 14px;color:#f1e6cf;font:600 14px system-ui;min-width:280px;box-shadow:0 4px 18px #000a');
    this.msg = div('position:absolute;left:0;right:0;top:22%;text-align:center;font:900 24px system-ui;color:#f2c14e;text-shadow:0 2px 0 #2b1d14,0 3px 8px #000;opacity:0;transition:opacity .2s');
    for (let i = 0; i < 3; i++) { const m = div('position:absolute;font:800 12px system-ui;color:#fff;text-align:center;transform:translate(-50%,-50%);text-shadow:0 1px 3px #000'); this.marks.push(m); this.root.append(m); }
    this.root.append(this.money, this.panel, this.msg); container.append(this.root);
  }
  private bubble(i: number) { while (this.bubbles.length <= i) { const b = div('position:absolute;transform:translate(-50%,-100%);background:#f4eee2;color:#2b1d14;border:2px solid #2b1d14;border-radius:10px;padding:2px 7px;font:800 12px system-ui;white-space:nowrap'); this.bubbles.push(b); this.root.append(b); } return this.bubbles[i]; }
  private project(cam: THREE.PerspectiveCamera, x: number, y: number, z: number, W: number, H: number) {
    this.v.set(x, y, z).project(cam); const behind = this.v.z > 1;
    return { x: (this.v.x * 0.5 + 0.5) * W, y: (-this.v.y * 0.5 + 0.5) * H, behind, on: !behind && Math.abs(this.v.x) < 1 && Math.abs(this.v.y) < 1 };
  }
  update(s: Snapshot, cam: THREE.PerspectiveCamera, W: number, H: number) {
    cam.updateMatrixWorld();
    const hot = s.hot.map((k) => BIKES[k].label).join(', ');
    this.money.textContent = `$${s.cash}   ★ rep ${s.rep}\nHot list: ${hot}`;
    // toast
    const live = s.msg && s.t - s.msg.at < 2.6; this.msg.style.opacity = live ? '1' : '0'; if (live) this.msg.textContent = s.msg!.text;
    // dealer menu / fence quote
    let key = '', html = '';
    if (s.dealer.menu) {
      const m = s.dealer.menu; key = `m${m.sel}:${s.cash}`;
      html = `<div style="font:900 15px system-ui;color:#c9a227;margin-bottom:6px">VAN GUY · “Everything fell off a truck.”</div><div style="display:flex;gap:6px">` +
        m.items.map((it, i) => `<div style="flex:1;text-align:center;padding:6px 4px;border-radius:6px;border:2px solid ${i === m.sel ? '#f2c14e' : '#5a4a3a'};background:${i === m.sel ? '#5a3f22' : 'transparent'};opacity:${it.afford ? 1 : 0.45}"><div style="font-size:20px">${ICON[it.w]}</div>${it.qty}× ${it.w}<br><b style="color:${it.afford ? '#9fd48a' : '#d47a6a'}">$${it.price}</b></div>`).join('') +
        `</div><div style="margin-top:6px;font-size:12px;opacity:.8">◀ ▶ / paddle tap: browse · Ⓐ buy · Ⓑ leave · you have $${s.cash}</div>`;
    } else if (s.fence) {
      key = `f${s.fence.near}:${s.fence.price}:${s.rider.kind}`;
      html = `<div style="font:900 15px system-ui;color:#c9a227">SPOKEY JOE’S CHOP SHOP</div>${s.rider.kind ? BIKES[s.rider.kind].label : ''}${s.rider.flat ? ' (flat)' : ''}: <b style="color:#9fd48a">$${s.fence.price}</b>${s.fence.hot ? ' <b style="color:#f26b4e">HOT LIST ×1.6!</b>' : ''}<div style="font-size:12px;opacity:.8">${s.fence.near ? 'Ⓐ sell it' : 'Ride under the canopy and stop to sell'}</div>`;
    } else if (s.dealer.near) { key = 'dn'; html = '<b style="color:#c9a227">Van Guy</b>: “Psst… Ⓐ to see the goods.”'; }
    if (key !== this.panelKey) { this.panelKey = key; this.panel.style.display = key ? 'block' : 'none'; this.panel.innerHTML = html; }
    // speech bubbles / phones over nearby NPCs
    let bi = 0;
    for (const n of s.npcs) {
      const calling = (n.callS ?? 0) > 0, txt = calling ? `📞 ${'▮'.repeat(Math.ceil(n.callS!))}` : n.say;
      if (!txt || Math.hypot(n.x - s.rider.x, n.z - s.rider.z) > 40) continue;
      const p = this.project(cam, n.x, n.y + 2.15, n.z, W, H); if (!p.on) continue;
      const b = this.bubble(bi++); b.style.display = 'block'; b.style.left = `${p.x}px`; b.style.top = `${p.y}px`; b.textContent = txt;
      b.style.background = calling ? '#f26b4e' : '#f4eee2'; b.style.color = calling ? '#fff' : '#2b1d14';
    }
    for (let i = bi; i < this.bubbles.length; i++) this.bubbles[i].style.display = 'none';
    // markers: on-screen pin, else clamped arrow at the edge
    const sites = [{ x: FENCE.x, z: FENCE.z, label: '$ Chop shop', col: '#9fd48a' }, { x: DEALER.x, z: DEALER.z, label: '🔫 Van Guy', col: '#f2c14e' }, { x: TURF.x, z: TURF.z, label: s.gang.provoked ? '☠ Deck Rats!' : '☠ Deck Rats', col: s.gang.provoked ? '#f26b4e' : '#c9a227' }];
    sites.forEach((st, i) => {
      const m = this.marks[i], d = Math.hypot(st.x - s.rider.x, st.z - s.rider.z);
      const p = this.project(cam, st.x, heightAt(st.x, st.z) + 5, st.z, W, H);
      m.style.color = st.col;
      if (d < 12) { m.style.display = 'none'; return; }
      m.style.display = 'block';
      if (p.on) { m.style.left = `${p.x}px`; m.style.top = `${p.y}px`; m.innerHTML = `▼<br>${st.label} ${Math.round(d)}m`; return; }
      let dx = p.x - W / 2, dy = p.y - H / 2; if (p.behind) { dx = -dx; dy = -dy; }
      const k = Math.min((W / 2 - 60) / Math.max(1e-3, Math.abs(dx)), (H / 2 - 40) / Math.max(1e-3, Math.abs(dy)));
      const ang = Math.atan2(dy, dx) * 180 / Math.PI;
      m.style.left = `${W / 2 + dx * k}px`; m.style.top = `${H / 2 + dy * k}px`;
      m.innerHTML = `<span style="display:inline-block;transform:rotate(${ang}deg);font-size:18px">➤</span><br>${st.label} ${Math.round(d)}m`;
    });
  }
  dispose() { this.root.remove(); }
}
