// Shared UI kit for the shell screens: glass panels, controller key hints, steppers/choices/toggles that work with the
// D-pad (left/right via useMenuNav's onAdjust) and touch, count-up numbers and a spinner.
import type { ComponentChildren } from 'preact';
import { useEffect, useRef, useState } from 'preact/hooks';
import { play } from '../../audio/sfx';

export function Panel({ children, class: cls = '', focused }: { children: ComponentChildren; class?: string; focused?: boolean }) {
  return <div class={`panel${focused ? ' focused' : ''}${cls ? ` ${cls}` : ''}`}>{children}</div>;
}

const KEY_STYLE: Record<string, { glyph: string; color: string }> = {
  a: { glyph: 'A', color: '#2bd96b' }, b: { glyph: 'B', color: '#ff4d4d' }, y: { glyph: 'Y', color: '#3b82ff' }, z: { glyph: 'Z', color: '#ff9a2b' },
  dpad: { glyph: '✥', color: '#8a84b8' }, lr: { glyph: '◀▶', color: '#8a84b8' }, ud: { glyph: '▲▼', color: '#8a84b8' }, shift: { glyph: '±', color: '#b07cff' },
};
/** Ride-style button glyph. */
export function Key({ k }: { k: keyof typeof KEY_STYLE | string }) {
  const s = KEY_STYLE[k] ?? { glyph: k.toUpperCase(), color: '#8a84b8' };
  return <span class="key" style={{ '--kc': s.color } as Record<string, string>}>{s.glyph}</span>;
}
/** "Ⓐ Select  Ⓑ Back" strip. */
export function KeyHints({ hints }: { hints: Array<[string, string]> }) {
  return <div class="key-hints">{hints.map(([k, label]) => <span><Key k={k} />{label}</span>)}</div>;
}

export function ScreenHeader({ title, sub, children }: { title: string; sub?: ComponentChildren; children?: ComponentChildren }) {
  return (
    <div class="screen-head">
      <div><h1>{title}</h1>{sub && <div class="sub">{sub}</div>}</div>
      <span class="spacer" />
      {children}
    </div>
  );
}

/** A focusable form row: label, control, optional hint. */
export function Field({ label, focused, hint, children, onClick }: { label: string; focused?: boolean; hint?: string; children: ComponentChildren; onClick?: () => void }) {
  return (
    <div class={`field${focused ? ' focused' : ''}`} onClick={onClick}>
      <label>{label}</label>
      <div class="field-ctl">{children}</div>
      {hint && <small class="dim">{hint}</small>}
    </div>
  );
}

/** − value + ; the value is editable by typing too. */
export function Stepper({ value, onChange, step = 1, min = -Infinity, max = Infinity, unit, digits = 0, label }: { value: number; onChange: (v: number) => void; step?: number; min?: number; max?: number; unit?: string; digits?: number; label?: string }) {
  const set = (v: number) => onChange(clampStep(v, min, max, digits));
  return (
    <span class="stepper">
      <button type="button" class="step" onClick={(e) => { e.stopPropagation(); play('uiTick'); set(value - step); }}>−</button>
      <input type="number" aria-label={label} value={value.toFixed(digits)} step={step} onInput={(e) => { const v = Number((e.target as HTMLInputElement).value); if (Number.isFinite(v)) onChange(v); }} onBlur={() => set(value)} />
      {unit && <span class="unit">{unit}</span>}
      <button type="button" class="step" onClick={(e) => { e.stopPropagation(); play('uiTick'); set(value + step); }}>+</button>
    </span>
  );
}
export function clampStep(v: number, min: number, max: number, digits = 0): number {
  const f = 10 ** digits;
  return Math.min(max, Math.max(min, Math.round(v * f) / f));
}

/** ‹ option › cycling choice. */
export function Choice<T extends string>({ value, options, onChange }: { value: T; options: ReadonlyArray<{ value: T; label: string }>; onChange: (v: T) => void }) {
  const i = Math.max(0, options.findIndex((o) => o.value === value));
  const go = (d: number) => { play('uiTick'); onChange(options[(i + d + options.length) % options.length].value); };
  return (
    <span class="choice">
      <button type="button" class="step" onClick={(e) => { e.stopPropagation(); go(-1); }}>‹</button>
      <b>{options[i]?.label}</b>
      <button type="button" class="step" onClick={(e) => { e.stopPropagation(); go(1); }}>›</button>
    </span>
  );
}

export function Toggle({ on, onChange, labels = ['Off', 'On'] }: { on: boolean; onChange: (v: boolean) => void; labels?: [string, string] }) {
  return (
    <button type="button" class={`toggle${on ? ' on' : ''}`} onClick={(e) => { e.stopPropagation(); play('uiTick'); onChange(!on); }}>
      <i /><span>{on ? labels[1] : labels[0]}</span>
    </button>
  );
}

/** Animated number (ease-out). `delayMs` lets a screen reveal values one after another. */
export function CountUp({ to, from = 0, ms = 900, delayMs = 0, format = (n: number) => String(Math.round(n)), tick = false }: { to: number; from?: number; ms?: number; delayMs?: number; format?: (n: number) => string; tick?: boolean }) {
  const [v, setV] = useState(from);
  const lastTick = useRef(0);
  useEffect(() => {
    if (!Number.isFinite(to)) { setV(to); return; }
    let raf = 0; const t0 = performance.now() + delayMs;
    const step = (now: number) => {
      const k = Math.min(1, Math.max(0, (now - t0) / ms)), e = 1 - Math.pow(1 - k, 3);
      setV(from + (to - from) * e);
      if (tick && k > 0 && k < 1 && now - lastTick.current > 60) { lastTick.current = now; play('countTick'); }
      if (k < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [to, from]);
  return <>{format(v)}</>;
}

export function Spinner() { return <span class="spinner" aria-label="working" />; }
