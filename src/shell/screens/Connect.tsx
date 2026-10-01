import { useEffect, useState } from 'preact/hooks';
import type { DeviceKind } from '../types';
import { Btn, Dot } from '../components/Bits';
import { connectDevice, controllerInfo, disconnectDevice, getDeviceStatus, getFake, setFake, subscribeDevices } from '../services';
import { useMenuNav } from '../useMenuNav';

const ITEMS: Array<{ kind: DeviceKind; label: string; note: string }> = [
  { kind: 'trainer', label: 'Trainer', note: 'KICKR CORE. Close Zwift on this iPad first.' },
  { kind: 'controller', label: 'Controller', note: 'Zwift Ride. Close Zwift on this iPad first.' },
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
            <div>{st[it.kind].busy ? 'Connecting...' : st[it.kind].connected ? 'Connected (tap to disconnect)' : 'Tap to connect'}</div>
            <div class="dim" style={{ marginTop: '8px' }}>{it.note}</div>
            {st[it.kind].error && <div class="warn">{st[it.kind].error}</div>}
            {it.kind === 'controller' && st.controller.connected && <div class="dim">fw {controllerInfo.firmware ?? '?'} · battery {controllerInfo.battery ?? '?'}%</div>}
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
