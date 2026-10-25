import type { ControlHint } from '../../contracts';
import { controlGlyph } from '../controlGlyphs';

const ORDER = ['a', 'b', 'y', 'z', 'left', 'right', 'up', 'down'];
export function actionIndicators(controls: readonly ControlHint[]) {
  return controls.filter(h => h.indicator !== false && (h.cooldown || h.indicator)).slice()
    .sort((a, b) => (a.displayOrder ?? 100 + ORDER.indexOf(a.button)) - (b.displayOrder ?? 100 + ORDER.indexOf(b.button)))
    .map(h => {
      const explicit = h.indicator || undefined, ready = explicit?.ready ?? h.cooldown?.ready ?? false;
      const value = explicit?.fill ?? h.cooldown?.fill;
      return { id: h.button, name: explicit?.label ?? h.label, hint: h.label, color: controlGlyph(h.button).color,
        status: explicit?.status ?? (ready ? h.active === false ? 'Unavailable' : 'Ready' : 'Charging'),
        ready, blocked: h.active === false, fill: value == null ? undefined : Math.min(1, Math.max(0, Number.isFinite(value) ? value : 0)) };
    });
}
export function ActionIndicators({ controls }: { controls: readonly ControlHint[] }) {
  return <>{actionIndicators(controls).map(item => <div key={item.id} class={`action-indicator${item.ready ? ' ready' : ''}${item.blocked ? ' blocked' : ''}`} style={{ '--action-color': item.color }} title={item.hint}>
    <div><b>{item.name}</b><span>{item.status}</span></div>
    {item.fill !== undefined && <div class="indicator-track" role="progressbar" aria-label={`${item.name}: ${item.status}`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(item.fill * 100)}><i style={{ width: `${item.fill * 100}%` }} /></div>}
  </div>)}</>;
}
