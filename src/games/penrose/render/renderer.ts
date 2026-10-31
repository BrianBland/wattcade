import type { BikeState, GameRenderer, InputState, Insets, Profile } from '../../../contracts';
import { NO_INSETS } from '../../../contracts';
import type { Command, PenroseAction, PenroseSnapshot } from '../sim/sim';
import { createPenroseEngine } from './engine';
import type { EngineDom, PenroseEngine } from './engineTypes';
import { layout } from './layout';

const CSS = `
.pp-root { position: absolute; inset: 0; overflow: hidden; font-family: "Atkinson Hyperlegible", "Helvetica Neue", Arial, sans-serif; color: #23263A; -webkit-user-select: none; user-select: none }
.pp-sky { position: absolute; inset: 0 }
.pp-stage { position: absolute; overflow: hidden }
.pp-stage canvas { display: block }
.pp-status { position: absolute; display: flex; flex-direction: column; justify-content: center; align-items: center; text-align: center; gap: 2px; padding: 0 16px; pointer-events: none }
.pp-status .pp-line { font: 600 14px ui-monospace, Menlo, monospace; color: #23263A; background: rgba(255,255,255,.62); border-radius: 999px; padding: 3px 12px; min-height: 1.6em; max-width: 100%; white-space: nowrap; overflow: hidden; text-overflow: ellipsis }
.pp-status .pp-line:empty { visibility: hidden }
.pp-status .pp-hint { font-size: 13px; line-height: 1.3; color: #23263A; background: rgba(255,255,255,.62); border-radius: 10px; padding: 3px 12px; max-width: 84ch; display: -webkit-box; -webkit-box-orient: vertical; -webkit-line-clamp: 3; overflow: hidden }
.pp-status .pp-hint:empty { display: none }
.pp-badges { position: absolute; inset: 0; pointer-events: none }
.pp-badges .badge { position: absolute; left: 0; top: 0; margin: -22px 0 0 -22px; width: 44px; height: 44px; border: 0; padding: 0; background: transparent; cursor: pointer; pointer-events: auto }
.pp-badges .badge .disc, .pp-badges .badge svg { display: none }
.pp-fade { position: absolute; inset: 0; opacity: 0; display: grid; place-items: center; text-align: center; pointer-events: none }
.pp-fade .feb { font: 600 13px ui-monospace, Menlo, monospace; letter-spacing: .14em; text-transform: uppercase; color: #2A2640; opacity: .75 }
.pp-fade .ftt { font-weight: 800; font-size: clamp(28px, 5vw, 52px); color: #2A2640; letter-spacing: -.01em; margin-top: 4px; text-shadow: 0 2px 0 rgba(255,255,255,.4) }
`;

const el = (tag: string, cls: string, parent?: HTMLElement): HTMLElement => {
  const e = document.createElement(tag); e.className = cls; parent?.appendChild(e); return e;
};
const place = (e: HTMLElement, b: { x: number; y: number; w: number; h: number }) => {
  Object.assign(e.style, { left: `${b.x}px`, top: `${b.y}px`, width: `${b.w}px`, height: `${b.h}px` });
};

export class PenroseRenderer implements GameRenderer {
  private root: HTMLElement | null = null;
  private dom: EngineDom | null = null;
  private engine: PenroseEngine | null = null;
  private send: (a: PenroseAction) => void = () => {};
  private insets: Insets = NO_INSETS;
  private ro: ResizeObserver | null = null;
  private started = false;
  private lastCmd = 0;
  private lastT = 0;
  private loadSent = -1;
  private loadT = 0;
  private status: HTMLElement | null = null;

  mount(container: HTMLElement, ctx: { profile: Readonly<Profile>; send?: (action: unknown) => void; insets?: Insets }) {
    if (ctx.send) this.send = ctx.send as (a: PenroseAction) => void;
    this.insets = ctx.insets ?? NO_INSETS;
    const root = el('div', 'pp-root', container); this.root = root;
    const style = document.createElement('style'); style.textContent = CSS; root.appendChild(style);
    const sky = el('div', 'pp-sky', root);
    const stage = el('div', 'pp-stage', root);
    const badges = el('div', 'pp-badges', stage);
    const status = el('div', 'pp-status', root); this.status = status;
    const line = el('div', 'pp-line', status), hint = el('div', 'pp-hint', status);
    const fade = el('div', 'pp-fade', root); const card = el('div', '', fade); el('div', 'feb', card); el('div', 'ftt', card);
    fade.setAttribute('aria-live', 'polite');
    const sink = el('div', '', root); sink.hidden = true;
    this.dom = { sky, stage, badges, fade, ui: { cad: { value: 0 }, cadOut: el('div', '', sink), read: el('div', '', sink), mach: el('div', '', sink), status: line, hint } };
    this.applyLayout();
    this.engine = createPenroseEngine(this.dom, {
      onWon: (index) => { const lv = this.engine?.levels[index]; if (lv) this.send({ type: 'won', index, id: lv.id, solved: !!this.engine?.autopilot }); },
      onFell: (index) => this.send({ type: 'fell', index }),
      onLevel: (index, def, level) => {
        const ms = (level as { machines?: Array<{ key: string; name: string }> } | null)?.machines ?? [];
        this.send({ type: 'level', index, id: def.id, name: def.name, machines: ms.map((m) => ({ key: m.key, name: m.name })) });
      },
      onAutopilot: () => {},
    });
    stage.insertBefore(stage.lastChild as Node, badges); // the canvas goes under the tap targets
    if (typeof ResizeObserver === 'function') { this.ro = new ResizeObserver(() => this.applyLayout()); this.ro.observe(container); }
  }

  setInsets(insets: Insets) { this.insets = insets; this.applyLayout(); }

  resize() { this.applyLayout(); }

  private applyLayout() {
    if (!this.root || !this.dom) return;
    const W = this.root.clientWidth || 800, H = this.root.clientHeight || 600;
    const { stage, status } = layout(W, H, this.insets);
    place(this.dom.stage, stage); if (this.status) place(this.status, status);
    this.engine?.resize();
  }

  render(snapshot: unknown, _bike: Readonly<BikeState>, _input: Readonly<InputState>) {
    const s = snapshot as PenroseSnapshot, e = this.engine;
    if (!e || !s) return;
    const now = performance.now(), dt = this.lastT ? Math.min(0.05, (now - this.lastT) / 1000) : 1 / 60; this.lastT = now;
    if (!this.started) { this.started = true; this.lastCmd = s.cmds.at(-1)?.id ?? 0; e.load(Math.min(s.start, e.levels.length - 1)); }
    for (const c of s.cmds) if (c.id > this.lastCmd) { this.lastCmd = c.id; this.apply(c); }
    if (!e.autopilot) { e.rider.cad = Math.max(0, s.cad); e.rider.gear = Math.max(1, Math.min(12, Math.round(s.gear))); e.rider.effort = s.effort; }
    else e.rider.effort = null;
    e.tick(dt);
    this.loadT += dt;
    const v = Math.round(e.load01() * 20) / 20;
    if (v !== this.loadSent && this.loadT > 0.5) { this.loadSent = v; this.loadT = 0; this.send({ type: 'load', v }); }
  }

  private apply(c: Command) {
    const e = this.engine!;
    if (c.kind === 'toggle') e.toggle(c.key);
    else if (c.kind === 'restart') e.restart();
    else if (c.kind === 'next') e.load(e.index + 1);
    else if (c.kind === 'prev') e.load(e.index - 1);
    else if (c.kind === 'goto' && c.index !== undefined) e.load(c.index);
    else if (c.kind === 'solve') e.setAutopilot(!e.autopilot);
  }

  unmount() {
    this.ro?.disconnect(); this.ro = null;
    this.engine?.dispose(); this.engine = null;
    this.root?.remove(); this.root = null; this.dom = null;
  }
}
