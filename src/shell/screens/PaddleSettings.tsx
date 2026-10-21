import { useEffect, useRef, useState } from 'preact/hooks';
import type { SessionLike } from '../types';
import { Btn } from '../components/Bits';
import { Field, KeyHints, Stepper, Toggle } from '../components/ui';
import { useMenuNav } from '../useMenuNav';

export type PaddleTuning = NonNullable<SessionLike['tuning']>;
export const PADDLE_KEYS = ['paddleMode', 'paddleCurve', 'paddleDeadzone', 'paddleSwitchThreshold'] as const;
const key = (name: string) => `cadenza.${name}`;

/** Changes go straight to the rider's saved tuning and are read on the next input/simulation tick. */
export function PaddleSettings({ tuning, onBack, onResume }: { tuning: PaddleTuning; onBack: () => void; onResume: () => void }) {
  const [, refresh] = useState(0);
  const modal = useRef<HTMLDivElement>(null);
  const get = (name: string) => tuning.get(key(name));
  const continuous = get('paddleMode') === 'continuous', quadratic = get('paddleCurve') === 'quadratic';
  const set = (name: string, value: number | string) => { tuning.set(key(name), value); refresh(v => v + 1); };
  const adjust = (i: number, dir: number) => {
    if (i === 0) set('paddleMode', continuous ? 'stepped' : 'continuous');
    if (i === 1) set('paddleCurve', quadratic ? 'linear' : 'quadratic');
    if (i === 2 || i === 3) {
      const name = PADDLE_KEYS[i]; set(name, Number(get(name)) + dir);
    }
  };
  const [idx, setIdx] = useMenuNav(6, [1, 1, 1, 1, 2], i => {
    if (i < 4) adjust(i, 1);
    else if (i === 4) onBack(); else onResume();
  }, onBack, true, { onAdjust: (i, d) => { if (i >= 4) return false; adjust(i, d); return true; } });
  useEffect(() => { modal.current?.querySelector('.focused')?.scrollIntoView?.({ block: 'nearest' }); }, [idx]);
  return <div class="overlay-modal">
    <div class="modal pause paddle-settings" ref={modal}>
      <h2>Paddle steering</h2>
      <p class="dim">Saved for this rider in Cadenza. Resume to try your changes.</p>
      <div class="fields">
        <Field label="Movement" focused={idx === 0} onClick={() => setIdx(0)} hint="Pull to position; release to centre.">
          <Toggle on={continuous} labels={['Stepped', 'Continuous']} onChange={on => set('paddleMode', on ? 'continuous' : 'stepped')} />
        </Field>
        <Field label="Response curve" focused={idx === 1} onClick={() => setIdx(1)} hint="Linear responds evenly; quadratic softens light pulls.">
          <Toggle on={quadratic} labels={['Linear', 'Quadratic']} onChange={on => set('paddleCurve', on ? 'quadratic' : 'linear')} />
        </Field>
        <Field label="Deadzone" focused={idx === 2} onClick={() => setIdx(2)} hint="Raw movement ignored near rest. Lower is more sensitive.">
          <Stepper label="Paddle deadzone" value={Number(get('paddleDeadzone'))} min={0} max={60} unit="%" onChange={v => set('paddleDeadzone', v)} />
        </Field>
        <Field label="Switch threshold" focused={idx === 3} onClick={() => setIdx(3)} hint={continuous ? 'Applies only in stepped mode; kept for when you switch.' : 'Pull after the response curve needed for the first lane. Lower switches sooner.'}>
          <Stepper label="Lane switch threshold" value={Number(get('paddleSwitchThreshold'))} min={5} max={90} unit="%" onChange={v => set('paddleSwitchThreshold', v)} />
        </Field>
      </div>
      <div class="row pause-actions">
        <Btn focused={idx === 4} onClick={onBack}>Back</Btn>
        <Btn primary focused={idx === 5} onClick={onResume}>▶ Resume</Btn>
      </div>
      <KeyHints hints={ [['dpad', 'Move'], ['lr', 'Change'], ['a', 'Select'], ['b', 'Back']] } />
    </div>
  </div>;
}
