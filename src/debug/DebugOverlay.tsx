import { useEffect, useRef, useState } from 'preact/hooks';
import { debugActions, debugSnapshot, onSystem, setDebugOpen } from '../shell/services';
import { ControllerPanel, DerivedPanel, DevicePanel, MixerPanel, TuningPanel } from './panels';
import { packetsPerSecond } from '../shell/format';
import type { DebugSnapshot } from './types';
import { loadFlag, saveFlag } from './flag';

export function DebugOverlay() {
  const [open, setOpen] = useState(() => loadFlag('wattcade.debug', false));
  const [tuneOpen, setTuneOpen] = useState(() => loadFlag('wattcade.debug.tune', false));
  const [snap, setSnap] = useState<DebugSnapshot | null>(null);
  const [pps, setPps] = useState<Record<string, number>>({});
  const prev = useRef<{ t: number; p: Record<string, number> }>({ t: 0, p: {} });

  useEffect(() => onSystem((a) => { if (a === 'toggleDebug') setOpen((o) => !o); }), []);
  useEffect(() => { saveFlag('wattcade.debug', open); setDebugOpen(open); }, [open]);
  useEffect(() => { saveFlag('wattcade.debug.tune', tuneOpen); }, [tuneOpen]);
  useEffect(() => {
    if (!open) return;
    const poll = () => {
      const s = debugSnapshot(); setSnap(s);
      const now = performance.now() / 1000, dt = now - prev.current.t, next: Record<string, number> = {}, rates: Record<string, number> = {};
      for (const k of ['trainer', 'hr', 'controller'] as const) {
        const st = s.stats[k]; if (!st) continue;
        next[k] = st.packets; rates[k] = packetsPerSecond({ packets: prev.current.p[k] ?? st.packets }, st, dt);
      }
      prev.current = { t: now, p: next }; setPps(rates);
    };
    poll(); const id = setInterval(poll, 200);
    return () => clearInterval(id);
  }, [open]);

  if (!open || !snap) return null;
  return (
    <div class="dbg">
      <DevicePanel s={snap} pps={pps} /><DerivedPanel s={snap} />
      <ControllerPanel s={snap} /><MixerPanel s={snap} act={debugActions} />
      <TuningPanel s={snap} act={debugActions} open={tuneOpen} toggle={() => setTuneOpen((o) => !o)} />
    </div>
  );
}
