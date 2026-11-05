// Shell adapters: shared flat widgets plus controller hints and animated progression.
import type { ComponentChildren } from 'preact';
import { useEffect, useRef, useState } from 'preact/hooks';
import { UiPanel, UiField, UiStepper, UiChoice, UiToggle, UiSpinner, clampStep, UI } from '../../ui';
import { play } from '../../audio/sfx';

export function Panel({ children, class: cls = '', focused }: { children: ComponentChildren; class?: string; focused?: boolean }) {
  return <UiPanel class={`panel ${cls}`} focused={focused}>{children}</UiPanel>;
}

const KEY_STYLE: Record<string, { glyph: string; color: string }> = {
  a: { glyph: 'A', color: UI.controller.a }, b: { glyph: 'B', color: UI.controller.b }, y: { glyph: 'Y', color: UI.controller.y }, z: { glyph: 'Z', color: UI.controller.z },
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

export const Field = UiField;
export { clampStep };
export function Stepper(p: Parameters<typeof UiStepper>[0]) { return <UiStepper {...p} onChange={v=>{play('uiTick');p.onChange(v);}}/>; }
export function Choice<T extends string>(p: {value:T; options:ReadonlyArray<{value:T;label:string}>;onChange:(v:T)=>void}) { return <UiChoice {...p} onChange={v=>{play('uiTick');p.onChange(v);}}/>; }
export function Toggle(p: Parameters<typeof UiToggle>[0]) { return <UiToggle {...p} onChange={v=>{play('uiTick');p.onChange(v);}}/>; }

/** Animated number (ease-out). `delayMs` lets a screen reveal values one after another. */
export function CountUp({ to, from = 0, ms = 900, delayMs = 0, format = (n: number) => String(Math.round(n)), tick = false }: { to: number; from?: number; ms?: number; delayMs?: number; format?: (n: number) => string; tick?: boolean }) {
  const [v, setV] = useState(from);
  const lastTick = useRef(0);
  useEffect(() => {
    if (!Number.isFinite(to) || (typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches)) { setV(to); return; }
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

export function Spinner() { return <UiSpinner/>; }
