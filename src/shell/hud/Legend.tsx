import type { Button, ControlHint, ControlTarget } from '../../contracts';
import { GLYPH_COLOR as COLORS } from './legendLines';

type Held = ReadonlySet<Button>;
type Hints = Map<string, ControlHint>;

function Key({ id, label, hints, held, pos }: { id: Button; label: string; hints: Hints; held: Held; pos?: string }) {
  const h = hints.get(id);
  const color = COLORS[id];
  return (
    <div class={`lg-key${pos ? ` ${pos}` : ''}${h ? ' mapped' : ''}${held.has(id) ? ' held' : ''}${h?.active ? ' active' : ''}`} style={color ? { '--kc': color } as any : undefined}>
      <b>{label}</b><span>{h?.label ?? ''}</span>
    </div>
  );
}
function Group({ id, label, hints, held, cls }: { id: ControlTarget; label: string; hints: Hints; held: boolean; cls?: string }) {
  const h = hints.get(id);
  return <div class={`lg-key wide${cls ? ` ${cls}` : ''}${h ? ' mapped' : ''}${held ? ' held' : ''}${h?.active ? ' active' : ''}`}><b>{label}</b><span>{h?.label ?? ''}</span></div>;
}

/** Four keys in a diamond, as on the hood face: [top, left, right, bottom]. */
function Diamond({ keys, hints, held }: { keys: Array<[Button, string]>; hints: Hints; held: Held }) {
  const pos = ['top', 'lft', 'rgt', 'bot'];
  return <div class="lg-diamond">{keys.map(([id, label], i) => <Key id={id} label={label} hints={hints} held={held} pos={pos[i]} />)}</div>;
}

/** Shift buttons on the inboard side of a hood: up above down. */
function Shifters({ side, hints, held }: { side: 'L' | 'R'; hints: Hints; held: Held }) {
  const up = `shiftUp${side}` as Button, dn = `shiftDn${side}` as Button;
  return (
    <div class="lg-shift">
      <Group id={`shifters${side}`} label={`Shift ${side}`} hints={hints} held={held.has(up) || held.has(dn)} />
      <Key id={up} label="Sh+" hints={hints} held={held} />
      <Key id={dn} label="Sh-" hints={hints} held={held} />
    </div>
  );
}

/**
 * Drawing of the Zwift Ride hoods, mirroring the hardware: D-pad on the left hood face,
 * Y/Z/A/B diamond on the right hood face, shifters on the inboard side of each hood,
 * and the brake-lever paddles below.
 */
export function Legend({ controls, held, paddles, expanded }: { controls: ControlHint[]; held: Held; paddles: [number, number]; expanded: boolean }) {
  const hints: Hints = new Map(controls.map((c) => [c.button as string, c]));
  const dpadHeld = (['up', 'down', 'left', 'right'] as Button[]).some((b) => held.has(b));
  return (
    <div class={`legend${expanded ? ' expanded' : ''}`}>
      <div class="lg-hood left">
        <div class="lg-face">
          <Group id="dpad" label="D-pad" hints={hints} held={dpadHeld} />
          <Diamond keys={[['up', '▲'], ['left', '◀'], ['right', '▶'], ['down', '▼']]} hints={hints} held={held} />
        </div>
        <Shifters side="L" hints={hints} held={held} />
        <Group id="paddles" label="Paddle L" hints={hints} held={Math.abs(paddles[0]) > 0.1} cls="lg-paddle" />
      </div>
      <div class="lg-hood right">
        <Shifters side="R" hints={hints} held={held} />
        <div class="lg-face">
          {/* No ControlTarget for the ABYZ cluster as a whole; spacer keeps both faces aligned. */}
          <div class="lg-key wide lg-spacer"><b>&nbsp;</b></div>
          <Diamond keys={[['y', 'Y'], ['z', 'Z'], ['a', 'A'], ['b', 'B']]} hints={hints} held={held} />
        </div>
        <Group id="paddles" label="Paddle R" hints={hints} held={Math.abs(paddles[1]) > 0.1} cls="lg-paddle" />
      </div>
    </div>
  );
}
