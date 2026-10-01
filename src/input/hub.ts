import type { Button, ControllerRawState, InputState, ProfileSettings, Seconds, SystemAction } from '../contracts';
import { ScriptedInput } from './scripted';
import {
  KEY_BUTTONS, KEY_PADDLES, KEY_SYSTEM, PAD_BUTTONS, COMBO_HOLD_MS, SHIFTERS, applyDeadzone,
} from './mapping';

type Src = InputState['source'];
type DebugKind = 'difficulty' | 'timeScale';
export interface HubOptions { deadzone?: number; invertL?: boolean; invertR?: boolean; now?: () => number }
type PadLike = { buttons: ArrayLike<{ pressed: boolean }>; axes: ArrayLike<number> } | null;

/** Debug-overlay shifter steps (SPEC 3.1): left shifters adjust difficulty, right shifters adjust time scale. */
export const DEBUG_DIFFICULTY_STEP = 0.05;
export const DEBUG_TIMESCALE_STEP = 1;

const EMPTY: ReadonlySet<Button> = new Set();

export class InputHub {
  /** When true, shifter buttons are consumed: they emit onDebugAdjust and are hidden from state(). */
  debugOpen = false;
  touchVisible = false;

  private deadzone: number; private invertL: boolean; private invertR: boolean;
  private rideRaw: ControllerRawState = { buttons: EMPTY, paddleL: 0, paddleR: 0 };
  private kbHeld = new Set<Button>(); private kbPaddle = { L: 0, R: 0 };
  private kbDown = { L: new Set<number>(), R: new Set<number>() } as Record<'L' | 'R', Set<number>>;
  private padHeld = new Set<Button>(); private padPaddle = { L: 0, R: 0 };
  private touchHeld = new Map<number, Button>();
  private script: ScriptedInput | null = null;
  private getPads: (() => ArrayLike<PadLike>) | null = null;

  private merged = new Set<Button>();
  private pendingPressed = new Set<Button>(); private pendingReleased = new Set<Button>();
  private now: () => number;
  private comboStart = -1; private comboFired = false; private comboEnded = false;
  private source: Src = 'keyboard';
  private idleS = 0;
  private cur: InputState = { held: EMPTY, pressed: EMPTY, released: EMPTY, paddleL: 0, paddleR: 0, paddleIdleS: 0, source: 'keyboard' };
  private sysCbs = new Set<(a: SystemAction) => void>();
  private dbgCbs = new Set<(k: DebugKind, d: number) => void>();
  private touchEl: HTMLElement | null = null;

  constructor(opts: HubOptions = {}) {
    this.now = opts.now ?? (() => performance.now()); this.deadzone = opts.deadzone ?? 15; this.invertL = opts.invertL ?? false; this.invertR = opts.invertR ?? false;
  }

  applySettings(s: ProfileSettings): void {
    this.deadzone = s.paddleDeadzone; this.invertL = s.paddleInvertL; this.invertR = s.paddleInvertR;
  }

  state(): Readonly<InputState> { return this.cur; }
  raw(): ControllerRawState { return this.rideRaw; }
  onSystem(cb: (a: SystemAction) => void): () => void { this.sysCbs.add(cb); return () => { this.sysCbs.delete(cb); }; }
  onDebugAdjust(cb: (k: DebugKind, delta: number) => void): () => void { this.dbgCbs.add(cb); return () => { this.dbgCbs.delete(cb); }; }
  private fire(a: SystemAction) { for (const cb of [...this.sysCbs]) cb(a); }

  setScript(s: ScriptedInput | null): void {
    this.script = s;
    if (s) this.source = 'script';
    this.recompute();
  }

  /** Fed by core's DataHub with raw controller state (paddles -100..100). */
  setControllerState(raw: ControllerRawState): void {
    this.rideRaw = { buttons: new Set(raw.buttons), paddleL: raw.paddleL, paddleR: raw.paddleR };
    this.source = 'ride';
    this.recompute();
  }

  // ----- tick -----
  beginTick(dt: Seconds): void {
    if (this.getPads) this.pollGamepad();
    if (this.script) { this.script.advance(dt); this.recompute(); }

    this.checkCombo();
    const hide = this.debugOpen;
    const combo = this.comboStart >= 0 || this.comboEnded;
    if (this.comboStart < 0) this.comboEnded = false;
    const hidden = (b: Button) => (hide && SHIFTERS.has(b)) || (combo && (b === 'powerUpL' || b === 'powerUpR'));
    const pressed = new Set<Button>(); const released = new Set<Button>(); const held = new Set<Button>();
    for (const b of this.pendingPressed) if (!hidden(b)) pressed.add(b);
    for (const b of this.pendingReleased) if (!hidden(b)) released.add(b);
    for (const b of this.merged) if (!hidden(b)) held.add(b);
    if (hide) {
      for (const b of this.pendingPressed) {
        if (b === 'shiftUpL') this.emitDbg('difficulty', DEBUG_DIFFICULTY_STEP);
        else if (b === 'shiftDnL') this.emitDbg('difficulty', -DEBUG_DIFFICULTY_STEP);
        else if (b === 'shiftUpR') this.emitDbg('timeScale', DEBUG_TIMESCALE_STEP);
        else if (b === 'shiftDnR') this.emitDbg('timeScale', -DEBUG_TIMESCALE_STEP);
      }
    }
    this.pendingPressed = new Set(); this.pendingReleased = new Set();

    const { l, r } = this.paddles();
    if (l !== 0 || r !== 0) this.idleS = 0; else this.idleS += dt;
    this.cur = { held, pressed, released, paddleL: l, paddleR: r, paddleIdleS: this.idleS, source: this.source };
  }
  private emitDbg(k: DebugKind, d: number) { for (const cb of [...this.dbgCbs]) cb(k, d); }

  private paddles(): { l: number; r: number } {
    const pick = (...v: number[]) => v.reduce((a, b) => (Math.abs(b) > Math.abs(a) ? b : a), 0);
    const rideL = applyDeadzone(this.rideRaw.paddleL, this.deadzone, this.invertL);
    const rideR = applyDeadzone(this.rideRaw.paddleR, this.deadzone, this.invertR);
    return {
      l: pick(rideL, this.kbPaddle.L, this.padPaddle.L, this.script?.paddleL ?? 0),
      r: pick(rideR, this.kbPaddle.R, this.padPaddle.R, this.script?.paddleR ?? 0),
    };
  }

  /** Merge all sources' held buttons and record edges (so sub-tick presses are never lost). */
  private recompute(): void {
    const next = new Set<Button>();
    for (const s of [this.rideRaw.buttons, this.kbHeld, this.padHeld, this.touchHeld.values(), this.script?.held ?? EMPTY]) for (const b of s) next.add(b);
    for (const b of next) if (!this.merged.has(b)) this.pendingPressed.add(b);
    for (const b of this.merged) if (!next.has(b)) this.pendingReleased.add(b);
    this.merged = next;
    this.checkCombo();
  }

  /** powerUpL+powerUpR: tap -> pause, hold >= 1 s -> toggleDebug (never both). */
  private checkCombo(): void {
    const both = this.merged.has('powerUpL') && this.merged.has('powerUpR');
    if (both) {
      if (this.comboStart < 0) { this.comboStart = this.now(); this.comboFired = false; }
      else if (!this.comboFired && this.now() - this.comboStart >= COMBO_HOLD_MS) { this.comboFired = true; this.fire('toggleDebug'); }
    } else if (this.comboStart >= 0) {
      if (!this.comboFired && this.now() - this.comboStart < COMBO_HOLD_MS) this.fire('pause');
      this.comboStart = -1; this.comboFired = false;
    }
    if (both) this.comboEnded = true;
  }

  // ----- keyboard -----
  attachKeyboard(target: EventTarget): () => void {
    const typing = (e: Event) => { const t = (e as KeyboardEvent).target as HTMLElement | null; const n = t?.tagName; return n === 'INPUT' || n === 'TEXTAREA' || n === 'SELECT'; };
    const down = (ev: Event) => {
      const e = ev as KeyboardEvent;
      if (typing(e) || e.ctrlKey || e.metaKey || e.altKey) return;
      const code = e.code;
      const sys = KEY_SYSTEM[code]; const btn = KEY_BUTTONS[code]; const pad = KEY_PADDLES[code];
      if (!sys && !btn && !pad) return;
      e.preventDefault?.();
      if (e.repeat) return;
      this.source = 'keyboard';
      if (sys) this.fire(sys);
      if (btn) this.kbHeld.add(btn);
      if (pad) { this.kbDown[pad.side].add(pad.dir); this.syncKbPaddle(pad.side); }
      this.recompute();
    };
    const up = (ev: Event) => {
      const code = (ev as KeyboardEvent).code;
      const btn = KEY_BUTTONS[code]; const pad = KEY_PADDLES[code];
      if (btn) this.kbHeld.delete(btn);
      if (pad) { this.kbDown[pad.side].delete(pad.dir); this.syncKbPaddle(pad.side); }
      if (btn || pad) this.recompute();
    };
    const blur = () => { this.kbHeld.clear(); this.kbDown.L.clear(); this.kbDown.R.clear(); this.syncKbPaddle('L'); this.syncKbPaddle('R'); this.recompute(); };
    target.addEventListener('keydown', down); target.addEventListener('keyup', up); target.addEventListener('blur', blur);
    return () => { target.removeEventListener('keydown', down); target.removeEventListener('keyup', up); target.removeEventListener('blur', blur); blur(); };
  }
  private syncKbPaddle(side: 'L' | 'R') { const d = this.kbDown[side]; this.kbPaddle[side] = d.size === 0 ? 0 : d.size === 2 ? 0 : [...d][0]; }

  // ----- gamepad -----
  /** Polls inside beginTick. `getPads` is injectable for tests; defaults to navigator.getGamepads. */
  attachGamepad(getPads?: () => ArrayLike<PadLike>): () => void {
    this.getPads = getPads ?? (() => (typeof navigator !== 'undefined' && navigator.getGamepads ? navigator.getGamepads() : []));
    return () => { this.getPads = null; this.padHeld.clear(); this.padPaddle = { L: 0, R: 0 }; this.recompute(); };
  }
  private pollGamepad() {
    const pads = this.getPads!();
    const held = new Set<Button>();
    let l = 0; let r = 0; let any = false;
    for (let i = 0; i < pads.length; i++) {
      const p = pads[i]; if (!p) continue;
      p.buttons && Array.from(p.buttons).forEach((b, idx) => {
        if (!b.pressed) return;
        const btn = PAD_BUTTONS[idx]; if (btn) { held.add(btn); any = true; }
      });
      const ax = p.axes;
      const dz = this.deadzone / 100;
      const f = (v: number) => (Math.abs(v) <= dz ? 0 : Math.sign(v) * Math.min(1, (Math.abs(v) - dz) / (1 - dz)));
      const a = ax.length > 0 ? f(ax[0]) : 0; const b = ax.length > 2 ? f(ax[2]) : 0;
      if (Math.abs(a) > Math.abs(l)) l = a; if (Math.abs(b) > Math.abs(r)) r = b;
    }
    this.padHeld = held; this.padPaddle = { L: l, R: r };
    if (any || held.size > 0 || l !== 0 || r !== 0) { if (this.source !== 'ride' || !this.rideActive()) this.source = 'gamepad'; }
    this.recompute();
  }
  private rideActive() { return this.rideRaw.buttons.size > 0 || this.rideRaw.paddleL !== 0 || this.rideRaw.paddleR !== 0; }

  // ----- touch -----
  attachTouch(container: HTMLElement): () => void {
    const doc = container.ownerDocument;
    const root = doc.createElement('div');
    root.dataset.wattcade = 'touch-overlay';
    root.style.cssText = 'position:absolute;inset:0;pointer-events:none;z-index:50;touch-action:none;user-select:none;-webkit-user-select:none;';
    root.style.display = this.touchVisible ? 'block' : 'none';
    const mk = (label: string, b: Button, css: string) => {
      const el = doc.createElement('button');
      el.type = 'button'; el.textContent = label; el.dataset.btn = b;
      el.style.cssText = `position:absolute;width:64px;height:64px;border-radius:50%;border:2px solid #fff8;background:#0008;color:#fff;font:700 20px sans-serif;pointer-events:auto;touch-action:none;${css}`;
      const on = (e: Event) => { e.preventDefault(); const id = (e as PointerEvent).pointerId ?? 0; this.touchHeld.set(id, b); this.source = 'touch'; this.recompute(); };
      const off = (e: Event) => { const id = (e as PointerEvent).pointerId ?? 0; if (this.touchHeld.delete(id)) this.recompute(); };
      el.addEventListener('pointerdown', on); el.addEventListener('pointerup', off);
      el.addEventListener('pointercancel', off); el.addEventListener('pointerleave', off);
      root.appendChild(el);
    };
    const L = 'left:'; const B = 'bottom:';
    mk('▲', 'up', `${L}84px;${B}148px`); mk('▼', 'down', `${L}84px;${B}20px`);
    mk('◀', 'left', `${L}20px;${B}84px`); mk('▶', 'right', `${L}148px;${B}84px`);
    mk('A', 'a', `right:84px;${B}20px`); mk('B', 'b', `right:20px;${B}84px`);
    mk('Y', 'y', `right:148px;${B}84px`); mk('Z', 'z', `right:84px;${B}148px`);
    if (getComputedStyle(container).position === 'static') container.style.position = 'relative';
    container.appendChild(root);
    this.touchEl = root;
    let taps: number[] = [];
    const corner = (e: Event) => {
      const pe = e as PointerEvent; const r = container.getBoundingClientRect();
      if (pe.clientX - r.left > 60 || pe.clientY - r.top > 60) return;
      const t = this.now(); taps = taps.filter((x) => t - x < 1000); taps.push(t);
      if (taps.length >= 3) { taps = []; this.fire('toggleDebug'); }
    };
    container.addEventListener('pointerdown', corner);
    return () => { container.removeEventListener('pointerdown', corner); root.remove(); if (this.touchEl === root) this.touchEl = null; this.touchHeld.clear(); this.recompute(); };
  }
  showTouch(v: boolean): void { this.touchVisible = v; if (this.touchEl) this.touchEl.style.display = v ? 'block' : 'none'; }
}
