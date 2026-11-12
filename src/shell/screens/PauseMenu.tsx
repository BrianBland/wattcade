import '../chrome/chrome.css';
import { ChromeHints } from '../chrome/ChromeHints';
import type { GameMenuAction } from '../../contracts';
import { useLayoutEffect, useRef, useState } from 'preact/hooks';
import { Btn } from '../components/Bits';
import { Choice, Field, Stepper, Toggle } from '../components/ui';
import type { HudLayout } from '../hud/layout';
import { debugActions, getDifficulty } from '../services';
import { FakeBikeHelp } from '../hud/FakeBikeHelp';
import { useMenuNav } from '../useMenuNav';
import { setSoundEnabled, soundEnabled } from '../../audio/sfx';
import './pause.css';

const clampDiff = (v: number) => Math.min(1.5, Math.max(0.5, +v.toFixed(2)));

export function PauseMenu({ onResume, onQuit, onHelp, onRestart, layout, onLayout, initial = 0, fake = false, onHistory, extensions = [], onExtension, quitLabel = 'End ride' }: { extensions?: readonly GameMenuAction[]; onExtension: (action: unknown) => void; initial?: number; fake?: boolean; onHistory?: () => void; quitLabel?: string; layout: HudLayout; onLayout: (v: HudLayout) => void; onResume: () => void; onQuit: () => void; onHelp: () => void; onRestart: () => void }) {
  const card = useRef<HTMLDivElement>(null);
  const [diff, setDiff] = useState(getDifficulty);
  const setD = (v: number) => { const c = clampDiff(v); setDiff(c); debugActions.setDifficulty(c); };
  const [sound, setSound] = useState(soundEnabled());
  const toggleSound = () => { setSoundEnabled(!sound); setSound(!sound); };
  const tail = [{ label: 'Controls', run: onHelp }, ...(onHistory ? [{ label: 'History', run: onHistory }] : []), { label: '↻ Restart', run: onRestart }];
  const layouts = ['auto', 'touch', 'controller'] as const;
  const cycleLayout = (d: number) => onLayout(layouts[(layouts.indexOf(layout) + d + layouts.length) % layouts.length]);
  const actions = [onResume, onQuit, () => setD(diff + 0.05), () => cycleLayout(1), toggleSound, ...tail.map(a => a.run), ...extensions.map(entry => () => onExtension(entry.action))];
  const [idx, setIdx] = useMenuNav(actions.length, [2, ...actions.slice(2).map(() => 1)], (i) => actions[i](), onResume, true, {
    initial,
    onAdjust: (i, d) => {
      if (i === 2) { setD(diff + d * 0.05); return true; }
      if (i === 3) { cycleLayout(d); return true; }
      if (i === 4) { toggleSound(); return true; }
      return false;
    },
  });
  useLayoutEffect(() => { card.current?.querySelector<HTMLElement>('.focused')?.scrollIntoView?.({ block: 'nearest', inline: 'nearest' }); }, [idx]);
  return (
    <div class="overlay-modal chrome-ui chrome-pause">
      <div class="modal pause" ref={card} role="dialog" aria-modal="true" aria-labelledby="pause-title">
        <div class="chrome-eyebrow">TAKE A BREATHER</div><h2 id="pause-title">Paused.</h2><p class="pause-caption">Your ride will be here.</p>
        <div class="pause-ride-actions">
          <Btn primary focused={idx === 0} onClick={onResume}>Resume ride →</Btn>
          <Btn focused={idx === 1} onClick={onQuit}>{quitLabel}</Btn>
        </div>
        <div class="fields">
          <Field label="Difficulty" focused={idx === 2} hint="Scales hills and ERG targets" onClick={() => setIdx(2)}>
            <Stepper value={diff} step={0.05} min={0.5} max={1.5} digits={2} onChange={setD} />
          </Field>
          <Field label="Control layout" focused={idx === 3} hint="Auto follows controller connection" onClick={() => setIdx(3)}><Choice value={layout} onChange={onLayout} options={[{ value: 'auto', label: 'Auto' }, { value: 'touch', label: 'Touch' }, { value: 'controller', label: 'Controller' }]} /></Field>
          <Field label="Sound" focused={idx === 4} onClick={() => setIdx(4)}><Toggle on={sound} onChange={() => toggleSound()} /></Field>
        </div>
        <div class="row pause-actions">
          {tail.map((a, i) => <Btn key={a.label} focused={idx === i + 5} onClick={a.run}>{a.label}</Btn>)}
        </div>
        {extensions.map((entry, i) => <Btn key={entry.id} focused={idx === 5 + tail.length + i} onClick={() => onExtension(entry.action)}>{entry.label}</Btn>)}
        {fake && <FakeBikeHelp />}
        <ChromeHints hints={[['dpad', 'Move'], ['lr', 'Change'], ['a', 'Select'], ['b', 'Resume']]} />
      </div>
    </div>
  );
}
