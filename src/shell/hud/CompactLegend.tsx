import type { Button, ControlHint, ControlTarget } from '../../contracts';
import { GLYPH, GLYPH_COLOR, legendLines } from './legendLines';

const MEMBERS: Partial<Record<ControlTarget, Button[]>> = {
  dpad: ['up', 'down', 'left', 'right'], shiftersL: ['shiftUpL', 'shiftDnL'], shiftersR: ['shiftUpR', 'shiftDnR'],
};

/** Readable text list of the current mappings: glyphs + label per line, held keys lit. */
export function CompactLegend({ controls, held, paddles }: { controls: ControlHint[]; held: ReadonlySet<Button>; paddles: [number, number] }) {
  const lines = legendLines(controls);
  const isHeld = (k: ControlTarget) => k === 'paddles' ? paddles.some((p) => Math.abs(p) > 0.1)
    : (MEMBERS[k] ? MEMBERS[k]!.some((b) => held.has(b)) : held.has(k as Button));
  return (
    <div class="clg">
      {lines.length === 0 && <span class="dim">No controls</span>}
      {lines.map((l) => (
        <div class={`clg-line${l.active ? ' active' : ''}`}>
          {l.keys.map((k) => <kbd class={isHeld(k) ? 'held' : ''} style={GLYPH_COLOR[k] ? { '--kc': GLYPH_COLOR[k] } as any : undefined}>{GLYPH[k]}</kbd>)}
          <span>{l.label}</span>
        </div>
      ))}
    </div>
  );
}
