import { useEffect, useRef, useState } from 'preact/hooks';
import type { Button, ControlTouch } from '../../contracts';
import { input } from '../services';
import type { Cluster, HoodModel, PadButton } from './padModel';

type Held = ReadonlySet<Button>;
const POS: Record<string, string> = { up: 'top', y: 'top', left: 'lft', z: 'lft', right: 'rgt', a: 'rgt', down: 'bot', b: 'bot' };

/** Touch/click target: holds the virtual button while the pointer is down. */
export function PadKey({ b, held, merged, pos, send, disabled = false, block = false }: { b: PadButton; held: Held; merged?: boolean; pos?: string; send?: (a: unknown) => void; disabled?: boolean; block?: boolean }) {
  const pointers = useRef(new Map<number, { touch?: ControlTouch; send?: (a: unknown) => void; target: HTMLElement }>());
  const [pressed, setPressed] = useState(false);
  const release = (id: number, cancel: boolean) => {
    const p = pointers.current.get(id); if (!p) return;
    pointers.current.delete(id);
    if (p.touch && p.send) { const command = cancel ? p.touch.cancel : p.touch.up; if (command) p.send({ ...command, pointer: id }); }
    else input.releaseTouch(id);
    if (p.target.hasPointerCapture?.(id)) p.target.releasePointerCapture(id);
    setPressed(pointers.current.size > 0);
  };
  const cancelAll = () => { for (const id of [...pointers.current.keys()]) release(id, true); };
  useEffect(() => {
    const hidden = () => { if (document.hidden) cancelAll(); };
    window.addEventListener('blur', cancelAll); document.addEventListener('visibilitychange', hidden);
    return () => { cancelAll(); window.removeEventListener('blur', cancelAll); document.removeEventListener('visibilitychange', hidden); };
  }, []);
  // Cancel a captured hold when a menu, pause or another control mapping replaces it.
  useEffect(() => { cancelAll(); }, [disabled, b.mapped, b.id, b.touch?.down.epoch, b.touch?.down.type]);
  const cd = b.mapped ? b.cooldown : undefined, fill = cd ? Math.max(0, Math.min(1, cd.fill)) : 0;
  const cls = `pk${block ? ' block' : ''}${pos ? ` ${pos}` : ''}${b.mapped ? ' mapped' : ''}${merged ? ' merged' : ''}${held.has(b.id) || pressed ? ' held' : ''}${b.active ? ' active' : ''}${b.active === false ? ' off' : ''}${cd ? (cd.ready ? ' cd ready' : ' cd') : ''}${cd && (cd.flourish ?? 0) > 0.6 && !cd.ready ? ' hot' : ''}`;
  return (
    <button type="button" data-control={b.id} class={cls} style={{ '--kc': b.color, ...(cd ? { '--fill': `${fill * 100}%`, '--tint': cd.ready ? b.color : cd.tint ?? b.color } : {}) } as any} disabled={!b.mapped || disabled} aria-label={b.label ?? b.id} title={b.label}
      onPointerDown={(e) => {
        e.preventDefault(); const target = e.currentTarget;
        pointers.current.set(e.pointerId, { touch: b.touch, send, target });
        target.setPointerCapture?.(e.pointerId); setPressed(true);
        if (b.touch && send) send({ ...b.touch.down, pointer: e.pointerId }); else input.holdTouch(e.pointerId, b.id);
      }}
      onPointerUp={(e) => release(e.pointerId, false)} onPointerCancel={(e) => release(e.pointerId, true)}
      onLostPointerCapture={(e) => release(e.pointerId, true)} onPointerLeave={(e) => release(e.pointerId, true)}
      onPointerMove={(e) => { const r = e.currentTarget.getBoundingClientRect(); if (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom) release(e.pointerId, true); }}
      onContextMenu={(e) => e.preventDefault()}>
      {cd && <i class="pk-fill" aria-hidden="true" />}
      <b>{b.glyph}</b>{!merged && b.label && <span>{b.label}</span>}
    </button>
  );
}

function Group({ c, held, gear, send, disabled }: { c: Cluster; held: Held; gear?: number; send?: (a: unknown) => void; disabled?: boolean }) {
  if (c.kind === 'shift') {
    return (
      <div class={`pc shift${c.mapped ? '' : ' unused'}`}>
        {c.gears && <small class="pc-gear">Gear <strong>{gear ?? '—'}</strong></small>}
        <div class="pc-btns">{c.buttons.map((b) => <PadKey key={b.id} b={b} held={held} send={send} disabled={disabled} merged={!!c.label && !c.gears} />)}</div>
        {c.label && !c.gears && <small>{c.label}</small>}
      </div>
    );
  }
  return (
    <div class={`pc ${c.kind}${c.mapped ? '' : ' unused'}`}>
      <div class="pc-grid">{c.buttons.map((b) => <PadKey key={b.id} b={b} held={held} send={send} disabled={disabled} merged={!!c.label} pos={POS[b.id]} />)}</div>
      {c.label && <div class="pc-label">{c.label}</div>}
    </div>
  );
}

/** Brake-lever paddle: analog, so display-only (fills from the centre). */
function Paddle({ model, v }: { model: HoodModel['paddle']; v: number }) {
  const h = Math.min(50, Math.abs(v) * 50);
  return (
    <div class={`pp${model.mapped ? ' mapped' : ''}`} title={model.label}>
      <div class="pp-track"><i style={{ height: `${h}%`, [v >= 0 ? 'bottom' : 'top']: '50%' }} /></div>
      <small>{model.label ?? ''}</small>
    </div>
  );
}

/** One hood, laid out outer→inner like the controller: left = paddle, shifters, D-pad; right = face buttons, shifters, paddle. */
export function Hood({ side, model, held, paddle, gear, send, disabled }: { side: 'L' | 'R'; model: HoodModel; held: Held; paddle: number; gear?: number; send?: (a: unknown) => void; disabled?: boolean }) {
  const pad = model.paddle.mapped && <Paddle model={model.paddle} v={paddle} />;
  const shift = model.shift?.mapped && <Group c={model.shift} held={held} send={send} disabled={disabled} gear={gear} />;
  const stick = <Group c={model.stick} held={held} send={send} disabled={disabled} />;
  return side === 'L'
    ? <div class="hood left" role="group" aria-label="Left controller">{pad}{shift}{stick}</div>
    : <div class="hood right" role="group" aria-label="Right controller">{stick}{shift}{pad}</div>;
}
