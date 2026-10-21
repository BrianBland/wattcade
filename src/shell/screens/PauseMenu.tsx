import type { GameMenuAction } from '../../contracts';
import { useLayoutEffect, useRef, useState } from 'preact/hooks';
import { Btn } from '../components/Bits';
import { Choice, Field, KeyHints, Stepper, Toggle } from '../components/ui';
import type { HudLayout } from '../hud/layout';
import { debugActions, getDifficulty } from '../services';
import { FakeBikeHelp } from '../hud/FakeBikeHelp';
import { useMenuNav } from '../useMenuNav';
import { setSoundEnabled, soundEnabled } from '../../audio/sfx';
import './pause.css';

const clampDiff = (v: number) => Math.min(1.5, Math.max(0.5, +v.toFixed(2)));

export function PauseMenu({ onResume, onQuit, onHelp, onRestart, layout, onLayout, initial = 0, fake = false, onHistory, extensions = [], onExtension, quitLabel = 'Finish ride' }: { extensions?: readonly GameMenuAction[]; onExtension: (action: unknown) => void; initial?: number; fake?: boolean; onHistory?: () => void; quitLabel?: string; layout: HudLayout; onLayout: (v: HudLayout) => void; onResume: () => void; onQuit: () => void; onHelp: () => void; onRestart: () => void }) {
  const card = useRef<HTMLDivElement>(null);
  const [diff, setDiff] = useState(getDifficulty);
  const setD = (v: number) => { const c = clampDiff(v); setDiff(c); debugActions.setDifficulty(c); };
  const [sound, setSound] = useState(soundEnabled());
  const toggleSound = () => { setSoundEnabled(!sound); setSound(!sound); };
  const tail = [{ label: 'Controls', run: onHelp }, ...(onHistory ? [{ label: 'History', run: onHistory }] : []), { label: '↻ Restart', run: onRestart }, { label: quitLabel, run: onQuit }];
  const layouts = ['auto', 'touch', 'controller'] as const;
  const cycleLayout = (d: number) => onLayout(layouts[(layouts.indexOf(layout) + d + layouts.length) % layouts.length]);
  const actions = [onResume, () => setD(diff + 0.05), () => cycleLayout(1), toggleSound, ...tail.map(a => a.run), ...extensions.map(entry => () => onExtension(entry.action))];
  const [idx, setIdx] = useMenuNav(actions.length, [1, 1, 1, 1, tail.length, ...extensions.map(() => 1)], (i) => actions[i](), onResume, true, {
    initial,
    onAdjust: (i, d) => {
      if (i === 1) { setD(diff + d * 0.05); return true; }
      if (i === 2) { cycleLayout(d); return true; }
      if (i === 3) { toggleSound(); return true; }
      return false;
    },
  });
  useLayoutEffect(() => { card.current?.querySelector<HTMLElement>('.focused')?.scrollIntoView?.({ block: 'nearest', inline: 'nearest' }); }, [idx]);
  return (
    <div class="overlay-modal">
      <div class="modal pause" ref={card}>
        <h2>Paused</h2>
        <Btn primary focused={idx === 0} onClick={onResume}>▶ Resume</Btn>
        <div class="fields">
          <Field label="Difficulty" focused={idx === 1} hint="Scales hills and ERG targets" onClick={() => setIdx(1)}>
            <Stepper value={diff} step={0.05} min={0.5} max={1.5} digits={2} onChange={setD} />
          </Field>
          <Field label="Control layout" focused={idx === 2} hint="Auto follows controller connection" onClick={() => setIdx(2)}><Choice value={layout} onChange={onLayout} options={[{ value: 'auto', label: 'Auto' }, { value: 'touch', label: 'Touch' }, { value: 'controller', label: 'Controller' }]} /></Field>
          <Field label="Sound" focused={idx === 3} onClick={() => setIdx(3)}><Toggle on={sound} onChange={() => toggleSound()} /></Field>
        </div>
        <div class="row pause-actions">
          {tail.map((a, i) => <Btn key={a.label} focused={idx === i + 4} onClick={a.run}>{a.label}</Btn>)}
        </div>
        {extensions.map((entry, i) => <Btn key={entry.id} focused={idx === 4 + tail.length + i} onClick={() => onExtension(entry.action)}>{entry.label}</Btn>)}
        {fake && <FakeBikeHelp />}
        <KeyHints hints={[['dpad', 'Move'], ['lr', 'Change'], ['a', 'Select'], ['b', 'Resume']]} />
      </div>
    </div>
  );
}
