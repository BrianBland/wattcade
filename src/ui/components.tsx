import type { ComponentChildren, ComponentProps } from 'preact';
import { createPortal } from 'preact/compat';
import { useEffect, useId, useLayoutEffect, useRef, useState } from 'preact/hooks';
import { clamp01 } from './tokens';
import './widgets.css';
const nativeButtonKey = (e: {
  key: string;
  stopPropagation(): void;
}) => {
  if (e.key === 'Enter' || e.key === ' ') e.stopPropagation();
};
export function UiRoot({
  children,
  class: cls = ''
}: {
  children: ComponentChildren;
  class?: string;
}) {
  return <div class={`ui-root ${cls}`}>{children}</div>;
}
export function UiButton({
  variant = 'quiet',
  focused = false,
  busy = false,
  selected = false,
  class: cls = '',
  children,
  ...rest
}: ComponentProps<'button'> & {
  variant?: 'primary' | 'quiet' | 'danger';
  focused?: boolean;
  busy?: boolean;
  selected?: boolean;
}) {
  return <button {...rest} onKeyDown={e => {
    nativeButtonKey(e);
    rest.onKeyDown?.(e);
  }} type={rest.type ?? 'button'} class={`ui-button ${variant}${focused ? ' focused' : ''}${selected ? ' selected' : ''} ${cls}`} disabled={rest.disabled || busy} aria-busy={busy || undefined}>{busy && <UiSpinner />}{children}</button>;
}
export function UiPanel({
  children,
  class: cls = '',
  focused = false,
  ...props
}: ComponentProps<'section'> & {
  focused?: boolean;
}) {
  return <section {...props} class={`ui-panel ${focused ? 'focused ' : ''}${cls}`}>{children}</section>;
}
export function UiReadout({
  label,
  value,
  class: cls = ''
}: {
  label: ComponentChildren;
  value: ComponentChildren;
  class?: string;
}) {
  return <div class={`ui-readout ${cls}`}><span>{label}</span><b>{value}</b></div>;
}
export function UiProgress({
  value,
  label,
  tone = 'accent',
  class: cls = ''
}: {
  value: number;
  label: string;
  tone?: 'accent' | 'gold';
  class?: string;
}) {
  const progress = clamp01(value);
  return <div class={`ui-progress ${tone} ${cls}`} role="progressbar" aria-label={label} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(progress * 100)}><i style={{
      width: `${progress * 100}%`
    }} /></div>;
}
export function UiTabs<T extends string>({
  items,
  value,
  onChange,
  label,
  focusedValue
}: {
  items: readonly {
    value: T;
    label: string;
    disabled?: boolean;
  }[];
  value: T;
  onChange: (value: T) => void;
  label: string;
  focusedValue?: T;
}) {
  const ref = useRef<HTMLDivElement>(null);
  return <div class="ui-tabs" role="tablist" aria-label={label} ref={ref}>{items.map((item, i) => <button key={item.value} type="button" role="tab" class={`ui-tab${item.value === focusedValue ? ' focused' : ''}`} aria-selected={item.value === value} tabIndex={item.value === value ? 0 : -1} disabled={item.disabled} onClick={() => onChange(item.value)} onKeyDown={e => {
      nativeButtonKey(e);
      if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(e.key)) return;
      e.preventDefault();
      e.stopPropagation();
      const available = items.map((x, j) => !x.disabled ? j : -1).filter(j => j >= 0),
        at = available.indexOf(i);
      const next = e.key === 'Home' ? available[0] : e.key === 'End' ? available.at(-1) : available[(at + (e.key === 'ArrowRight' ? 1 : -1) + available.length) % available.length];
      if (next != null) {
        onChange(items[next].value);
        ref.current?.querySelectorAll<HTMLButtonElement>('button')[next]?.focus();
      }
    }}>{item.label}</button>)}</div>;
}
export function UiListRow({
  children,
  selected = false,
  focused = false,
  class: cls = '',
  ...props
}: ComponentProps<'button'> & {
  selected?: boolean;
  focused?: boolean;
}) {
  return <button {...props} onKeyDown={e => {
    nativeButtonKey(e);
    props.onKeyDown?.(e);
  }} type="button" class={`ui-list-row${selected ? ' selected' : ''}${focused ? ' focused' : ''} ${cls}`} aria-pressed={selected}>{children}</button>;
}
/** Focus/hover on desktop; tap to disclose on touch. Always contains a real focusable button. */
export function UiTooltip({
  label,
  children,
  focused = false
}: {
  label: string;
  children: ComponentChildren;
  focused?: boolean;
}) {
  const id = useId(),
    button = useRef<HTMLButtonElement>(null),
    tip = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false),
    [position, setPosition] = useState({
      left: 8,
      top: 8
    });
  const reposition = () => {
    const b = button.current,
      t = tip.current;
    if (!b || !t) return;
    const r = b.getBoundingClientRect();
    if (r.bottom < 0 || r.top > innerHeight || r.right < 0 || r.left > innerWidth) {
      setOpen(false);
      return;
    }
    const width = t.offsetWidth,
      height = t.offsetHeight;
    setPosition({
      left: Math.max(8, Math.min(innerWidth - width - 8, r.right - width)),
      top: r.top - height - 8 >= 8 ? r.top - height - 8 : Math.max(8, Math.min(innerHeight - height - 8, r.bottom + 8))
    });
  };
  useLayoutEffect(() => {
    if (open) reposition();
  }, [open]);
  useEffect(() => {
    if (!open) return;
    const outside = (e: PointerEvent) => {
      if (!button.current?.contains(e.target as Node) && !tip.current?.contains(e.target as Node)) setOpen(false);
    };
    window.addEventListener('resize', reposition);
    window.addEventListener('scroll', reposition, true);
    window.addEventListener('pointerdown', outside, true);
    return () => {
      window.removeEventListener('resize', reposition);
      window.removeEventListener('scroll', reposition, true);
      window.removeEventListener('pointerdown', outside, true);
    };
  }, [open]);
  return <span class="ui-tooltip"><button ref={button} type="button" class={focused ? 'focused' : undefined} aria-label={label} aria-describedby={open ? id : undefined} onPointerEnter={e => {
      if (e.pointerType === 'mouse') setOpen(true);
    }} onPointerLeave={e => {
      if (e.pointerType === 'mouse' && document.activeElement !== button.current) setOpen(false);
    }} onFocus={e => {
      if (e.currentTarget.matches(':focus-visible')) setOpen(true);
    }} onClick={() => setOpen(true)} onBlur={() => setOpen(false)} onKeyDown={e => {
      nativeButtonKey(e);
      if (e.key === 'Escape') {
        e.stopPropagation();
        setOpen(false);
        button.current?.blur();
      }
    }}>?</button>
 {open && createPortal(<div ref={tip} id={id} class="ui-tooltip-content" role="tooltip" style={{
      left: position.left,
      top: position.top
    }}>{children}</div>, document.body)}</span>;
}
export function UiSpinner() {
  return <span class="ui-spinner" aria-label="Loading" />;
}
export function UiMessage({
  title,
  children,
  tone = 'info',
  busy = false,
  action,
  class: cls = ''
}: {
  title: string;
  children?: ComponentChildren;
  tone?: 'info' | 'error' | 'empty';
  busy?: boolean;
  action?: ComponentChildren;
  class?: string;
}) {
  return <section class={`ui-message ${tone} ${cls}`} role={tone === 'error' ? 'alert' : 'status'} aria-busy={busy || undefined}>{busy && <UiSpinner />}<b>{title}</b>{children && <div>{children}</div>}{action}</section>;
}
export function UiField({
  label,
  focused,
  hint,
  children,
  onClick
}: {
  label: string;
  focused?: boolean;
  hint?: string;
  children: ComponentChildren;
  onClick?: () => void;
}) {
  return <div class={`ui-field field${focused ? ' focused' : ''}`} onClick={onClick}><label>{label}</label><div class="field-ctl" role="group" aria-label={label}>{children}</div>{hint && <small class="dim">{hint}</small>}</div>;
}
export const clampStep = (v: number, min: number, max: number, digits: number) => Math.min(max, Math.max(min, Math.round(v * 10 ** digits) / 10 ** digits));
export function UiStepper({
  value,
  onChange,
  step = 1,
  min = -Infinity,
  max = Infinity,
  unit,
  digits = 0
}: {
  value: number;
  onChange: (v: number) => void;
  step?: number;
  min?: number;
  max?: number;
  unit?: string;
  digits?: number;
}) {
  const set = (v: number) => onChange(clampStep(v, min, max, digits));
  return <span class="ui-stepper stepper"><button type="button" class="step" onKeyDown={nativeButtonKey} aria-label="Decrease" onClick={e => {
      e.stopPropagation();
      set(value - step);
    }}>−</button><input type="number" aria-label="Value" value={value.toFixed(digits)} step={step} min={Number.isFinite(min) ? min : undefined} max={Number.isFinite(max) ? max : undefined} onInput={e => {
      const v = Number(e.currentTarget.value);
      if (Number.isFinite(v)) onChange(v);
    }} onBlur={() => set(value)} />{unit && <span class="unit">{unit}</span>}<button type="button" class="step" onKeyDown={nativeButtonKey} aria-label="Increase" onClick={e => {
      e.stopPropagation();
      set(value + step);
    }}>+</button></span>;
}
export function UiChoice<T extends string>({
  value,
  options,
  onChange
}: {
  value: T;
  options: ReadonlyArray<{
    value: T;
    label: string;
  }>;
  onChange: (v: T) => void;
}) {
  const i = Math.max(0, options.findIndex(o => o.value === value));
  const go = (d: number) => {
    if (options.length) onChange(options[(i + d + options.length) % options.length].value);
  };
  return <span class="ui-choice choice"><button type="button" class="step" onKeyDown={nativeButtonKey} aria-label="Previous option" onClick={e => {
      e.stopPropagation();
      go(-1);
    }}>‹</button><b>{options[i]?.label}</b><button type="button" class="step" onKeyDown={nativeButtonKey} aria-label="Next option" onClick={e => {
      e.stopPropagation();
      go(1);
    }}>›</button></span>;
}
export function UiToggle({
  on,
  onChange,
  labels = ['Off', 'On']
}: {
  on: boolean;
  onChange: (v: boolean) => void;
  labels?: [string, string];
}) {
  return <button type="button" class={`ui-toggle toggle${on ? ' on' : ''}`} role="switch" onKeyDown={nativeButtonKey} aria-checked={on} onClick={e => {
    e.stopPropagation();
    onChange(!on);
  }}><i /><span>{on ? labels[1] : labels[0]}</span></button>;
}
