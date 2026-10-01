import { useEffect, useState } from 'preact/hooks';
import type { DeviceKind } from '../types';
import { Btn, Dot } from '../components/Bits';
import { addSecondController, connectDevice, controllerCount, controllerInfo, disconnectDevice, getDeviceStatus, getFake, setFake, subscribeDevices } from '../services';
import { useMenuNav } from '../useMenuNav';

const ITEMS: Array<{ kind: DeviceKind; label: string; note: string }> = [
  { kind: 'trainer', label: 'Trainer', note: 'KICKR CORE. Close Zwift on this iPad first.' },
  { kind: 'controller', label: 'Controller', note: 'Zwift Ride. If two "Zwift SF2" devices appear, connect one, then "+ Add other side" for the second. Close Zwift on this iPad first.' },
  { kind: 'hr', label: 'Heart rate', note: 'Enable Broadcast Heart Rate on your Garmin. Record an Indoor Bike activity on your watch; it is your Garmin/Strava record for now.' },
];

export function Connect({ onDone }: { onDone: () => void }) {
  const [, force] = useState(0);
  useEffect(() => subscribeDevices(() => force((n) => n + 1)), []);
  const st = getDeviceStatus();
  const act = (i: number) => {
    if (i < 3) { const k = ITEMS[i].kind; void (st[k].connected ? disconnectDevice(k) : connectDevice(k)); }
    else if (i === 3) setFake(!getFake());
    else onDone();
  };
  const [idx, setIdx] = useMenuNav(5, 1, act, onDone);
  return (
    <div class="screen">
      <h1>Connect</h1>
      <div class="grid">
        {ITEMS.map((it, i) => (
          <div class={`card${idx === i ? ' focused' : ''}`} onClick={() => { setIdx(i); act(i); }}>
            <h3><Dot on={st[it.kind].connected} />{it.label}</h3>
            <div>{st[it.kind].busy ? (st[it.kind].detail ? `Connecting: ${st[it.kind].detail}` : 'Connecting...') : st[it.kind].connected ? 'Connected (tap to disconnect)' : 'Tap to connect'}</div>
            <div class="dim" style={{ marginTop: '8px' }}>{it.note}</div>
            {it.kind === 'trainer' && st.trainer.connected && st.trainer.detail && <div class="warn">{st.trainer.detail}</div>}
            {st[it.kind].error && <div class="warn">{st[it.kind].error}</div>}
            {it.kind === 'controller' && st.controller.connected && <div class="dim">{controllerCount()} of 2 sides · fw {controllerInfo.firmware ?? '?'} · battery {controllerInfo.battery ?? '?'}%</div>}
            {it.kind === 'controller' && st.controller.connected && controllerCount() < 2 && (
              <button class="btn small" onClick={(e) => { e.stopPropagation(); void addSecondController(); }}>+ Add other side</button>
            )}
            {controllerInfo.warning && it.kind === 'controller' && <div class="warn">{controllerInfo.warning}</div>}
          </div>
        ))}
      </div>
      <div class="row">
        <Btn focused={idx === 3} onClick={() => act(3)}>{getFake() ? 'Fake bike: ON' : 'Fake bike: off'}</Btn>
        <Btn primary focused={idx === 4} onClick={onDone}>Continue</Btn>
      </div>
      <div class="dim">With no devices connected, games use the fake bike automatically (keys: W/S cadence, E/D power, R/F HR).</div>
    </div>
  );
}
