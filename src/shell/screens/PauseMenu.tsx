import { useState } from 'preact/hooks';
import { Btn } from '../components/Bits';
import { Field, KeyHints, Stepper, Toggle } from '../components/ui';
import { debugActions, getDifficulty } from '../services';
import { useMenuNav } from '../useMenuNav';
import { setSoundEnabled, soundEnabled } from '../../audio/sfx';

const clampDiff = (v: number) => Math.min(1.5, Math.max(0.5, +v.toFixed(2)));

export function PauseMenu({ onResume, onQuit, onHelp, onRestart, legendOn, onLegend, initial = 0, quitLabel = 'Finish ride' }: { initial?: number; quitLabel?: string; legendOn: boolean; onLegend: (v: boolean) => void; onResume: () => void; onQuit: () => void; onHelp: () => void; onRestart: () => void }) {
  const [diff, setDiff] = useState(getDifficulty);
  const setD = (v: number) => { const c = clampDiff(v); setDiff(c); debugActions.setDifficulty(c); };
  const [sound, setSound] = useState(soundEnabled());
  const toggleSound = () => { setSoundEnabled(!sound); setSound(!sound); };
  const actions = [onResume, () => setD(diff + 0.05), () => onLegend(!legendOn), toggleSound, onHelp, onRestart, onQuit];
  const [idx, setIdx] = useMenuNav(actions.length, [1, 1, 1, 1, 3], (i) => actions[i](), onResume, true, {
    initial,
    onAdjust: (i, d) => {
      if (i === 1) { setD(diff + d * 0.05); return true; }
      if (i === 2) { onLegend(!legendOn); return true; }
      if (i === 3) { toggleSound(); return true; }
      return false;
    },
  });
  return (
    <div class="overlay-modal">
      <div class="modal pause">
        <h2>Paused</h2>
        <Btn primary focused={idx === 0} onClick={onResume}>▶ Resume</Btn>
        <div class="fields">
          <Field label="Difficulty" focused={idx === 1} hint="Scales hills and ERG targets" onClick={() => setIdx(1)}>
            <Stepper value={diff} step={0.05} min={0.5} max={1.5} digits={2} onChange={setD} />
          </Field>
          <Field label="Controls legend" focused={idx === 2} onClick={() => setIdx(2)}><Toggle on={legendOn} onChange={onLegend} /></Field>
          <Field label="Sound" focused={idx === 3} onClick={() => setIdx(3)}><Toggle on={sound} onChange={() => toggleSound()} /></Field>
        </div>
        <div class="row pause-actions">
          <Btn focused={idx === 4} onClick={onHelp}>Controls</Btn>
          <Btn focused={idx === 5} onClick={onRestart}>↻ Restart</Btn>
          <Btn focused={idx === 6} onClick={onQuit}>{quitLabel}</Btn>
        </div>
        <KeyHints hints={[['dpad', 'Move'], ['lr', 'Change'], ['a', 'Select'], ['b', 'Resume']]} />
      </div>
    </div>
  );
}
