import type { ControlHint, GameHud } from '../../contracts';
import { controlRows } from '../controlGlyphs';
import { Hood } from './Pad';
import { buildPad } from './padModel';

const ORDER = ['paddles', 'left', 'right', 'up', 'down', 'dpad', 'a', 'b', 'y', 'z'];
export function legendRows(hints: readonly ControlHint[]) {
  return controlRows(hints.slice().sort((a, b) => (a.displayOrder ?? 100 + ORDER.indexOf(a.button)) - (b.displayOrder ?? 100 + ORDER.indexOf(b.button)))
    .map(h => ({ ...h, active: undefined })), Infinity);
}
function Rows({ hints }: { hints: ControlHint[] }) {
  return <div class="legend-rows">{legendRows(hints).map(row => <div class="legend-binding" key={row.label}>
    <span class="legend-glyphs">{row.glyphs.map((g, i) => <b key={i} style={{ color: g.color }}>{g.glyph.replace('◀', '←').replace('▶', '→')}</b>)}</span><span>{row.label}</span>
  </div>)}</div>;
}
/** Complete stable mappings at start/pause; gameplay readiness never reorders this guide. */
export function ControlLegend({ hud }: { hud: GameHud }) {
  const hints = hud.controls ?? [], pad = buildPad(hints, !!hud.gears);
  const face = (h: ControlHint) => ['a', 'b', 'y', 'z'].includes(h.button);
  const direction = (h: ControlHint) => ['paddles', 'left', 'right', 'up', 'down', 'dpad'].includes(h.button);
  const faces = hints.filter(face).map(h => h.touch?.down.type === 'construct' && h.label !== 'Construction' ? { ...h, label: `Construction · ${h.label}` } : h);
  const directions = hints.filter(direction), extras = hints.filter(h => !face(h) && !direction(h));
  return <div class="control-legend">
    <div class="legend-columns">
      {directions.length > 0 && <section><header><h2>Directions & paddles</h2><Hood side="L" model={pad.left} held={new Set()} paddle={0} disabled reference /></header><Rows hints={directions} /></section>}
      {faces.length > 0 && <section><header><h2>Actions</h2><Hood side="R" model={pad.right} held={new Set()} paddle={0} disabled reference /></header><Rows hints={faces} /></section>}
    </div>
    {extras.length > 0 && <div class="legend-extras"><Rows hints={extras} /></div>}
    <p class="legend-learn"><i />Action colors match your controller. Find this guide again in Pause → Controls.</p>
  </div>;
}
