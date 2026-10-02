import type { Button, ControlHint, ControlTarget } from '../../contracts';

const COLORS: Partial<Record<Button, string>> = { y: '#3b82ff', b: '#ff4d4d', z: '#ff9a2b', a: '#3b82ff' };
type Held = ReadonlySet<Button>;

function Key({ id, label, hints, held, held2 }: { id: Button; label: string; hints: Map<string, ControlHint>; held: Held; held2?: boolean }) {
  const h = hints.get(id);
  const on = held.has(id) || held2;
  const color = COLORS[id];
  return (
    <div class={`lg-key${h ? ' mapped' : ''}${on ? ' held' : ''}${h?.active ? ' active' : ''}`} style={color ? { '--kc': color } as any : undefined}>
      <b>{label}</b><span>{h?.label ?? ''}</span>
    </div>
  );
}
function Group({ id, label, hints, held, children }: { id: ControlTarget; label: string; hints: Map<string, ControlHint>; held: boolean; children?: any }) {
  const h = hints.get(id);
  return <div class={`lg-key wide${h ? ' mapped' : ''}${held ? ' held' : ''}${h?.active ? ' active' : ''}`}><b>{label}</b><span>{h?.label ?? ''}</span>{children}</div>;
}

/** Compact drawing of the Ride hoods. `expanded` shows labels at a larger size. */
export function Legend({ controls, held, paddles, expanded }: { controls: ControlHint[]; held: Held; paddles: [number, number]; expanded: boolean }) {
  const hints = new Map(controls.map((c) => [c.button as string, c]));
  const k = (id: Button, label: string, h?: boolean) => <Key id={id} label={label} hints={hints} held={held} held2={h} />;
  const dpadHeld = ['up', 'down', 'left', 'right'].some((b) => held.has(b as Button));
  return (
    <div class={`legend${expanded ? ' expanded' : ''}`}>
      <div class="lg-side">
        <Group id="paddles" label="Paddles" hints={hints} held={Math.abs(paddles[0]) > 0.1 || Math.abs(paddles[1]) > 0.1} />
        <Group id="shiftersL" label="Shift L" hints={hints} held={held.has('shiftUpL') || held.has('shiftDnL')} />
        {k('shiftUpL', 'Sh+')}{k('shiftDnL', 'Sh-')}
        <Group id="dpad" label="D-pad" hints={hints} held={dpadHeld} />
        <div class="lg-dpad">{k('up', '▲')}{k('left', '◀')}{k('right', '▶')}{k('down', '▼')}</div>
      </div>
      <div class="lg-side">
        <Group id="shiftersR" label="Shift R" hints={hints} held={held.has('shiftUpR') || held.has('shiftDnR')} />
        {k('shiftUpR', 'Sh+')}{k('shiftDnR', 'Sh-')}
        <div class="lg-abyz">{k('y', 'Y')}{k('z', 'Z')}{k('a', 'A')}{k('b', 'B')}</div>
      </div>
    </div>
  );
}
