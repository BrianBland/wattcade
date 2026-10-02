import type { Button } from '../../contracts';
import { input } from '../services';
import type { Cluster, HoodModel, PadButton } from './padModel';

type Held = ReadonlySet<Button>;
const POS: Record<string, string> = { up: 'top', y: 'top', left: 'lft', z: 'lft', right: 'rgt', a: 'rgt', down: 'bot', b: 'bot' };

/** Touch/click target: holds the virtual button while the pointer is down. */
export function PadKey({ b, held, merged, pos }: { b: PadButton; held: Held; merged?: boolean; pos?: string }) {
  const off = (e: PointerEvent) => input.releaseTouch(e.pointerId);
  const cls = `pk${pos ? ` ${pos}` : ''}${b.mapped ? ' mapped' : ''}${merged ? ' merged' : ''}${held.has(b.id) ? ' held' : ''}${b.active ? ' active' : ''}${b.active === false ? ' off' : ''}`;
  return (
    <button type="button" class={cls} style={{ '--kc': b.color } as any} disabled={!b.mapped}
      onPointerDown={(e) => { e.preventDefault(); input.holdTouch(e.pointerId, b.id); }}
      onPointerUp={off} onPointerCancel={off} onPointerLeave={off} onContextMenu={(e) => e.preventDefault()}>
      <b>{b.glyph}</b>{!merged && b.label && <span>{b.label}</span>}
    </button>
  );
}

function Group({ c, held }: { c: Cluster; held: Held }) {
  if (c.kind === 'shift') {
    return (
      <div class={`pc shift${c.mapped ? '' : ' unused'}`}>
        <div class="pc-btns">{c.buttons.map((b) => <PadKey b={b} held={held} merged={!!c.label} />)}</div>
        {c.label && <small>{c.label}</small>}
      </div>
    );
  }
  return (
    <div class={`pc ${c.kind}${c.mapped ? '' : ' unused'}`}>
      <div class="pc-grid">{c.buttons.map((b) => <PadKey b={b} held={held} merged={!!c.label} pos={POS[b.id]} />)}</div>
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
export function Hood({ side, model, held, paddle }: { side: 'L' | 'R'; model: HoodModel; held: Held; paddle: number }) {
  const pad = <Paddle model={model.paddle} v={paddle} />;
  const shift = model.shift && <Group c={model.shift} held={held} />;
  const stick = <Group c={model.stick} held={held} />;
  return side === 'L'
    ? <div class="hood left">{pad}{shift}{stick}</div>
    : <div class="hood right">{stick}{shift}{pad}</div>;
}
