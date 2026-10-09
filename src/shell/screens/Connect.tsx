import { useEffect, useState } from 'preact/hooks';
import type { DeviceKind } from '../types';
import { Btn, Dot } from '../components/Bits';
import { KeyHints, Spinner } from '../components/ui';
import { addSecondController, connectDevice, controllerCount, controllerInfo, disconnectDevice, getDeviceStatus, getFake, liveDevices, setFake, subscribeDevices, savedHrWatches, selectSavedHrWatch } from '../services';
import { MediaServerConnection } from '../components/MediaServerConnection';
import { useMenuNav } from '../useMenuNav';

const ITEMS: Array<{ kind: DeviceKind; label: string; icon: string; note: string }> = [
  { kind: 'trainer', label: 'Trainer', icon: '⚡', note: 'KICKR CORE. Close Zwift on this iPad first.' },
  { kind: 'controller', label: 'Controller', icon: '🎮', note: 'Zwift Ride. Connect one "Zwift SF2", then + Add other side. Close Zwift first.' },
  { kind: 'hr', label: 'Heart rate', icon: '❤', note: 'Garmin: enable Broadcast Heart Rate and record an Indoor Bike activity on the watch.' },
];

function live(kind: DeviceKind): string | null {
  const b = liveDevices();
  if (kind === 'trainer') return `${Math.round(b.raw.power)} W · ${Math.round(b.raw.cadence)} rpm`;
  if (kind === 'hr') return b.raw.hr == null ? '-- bpm' : `${Math.round(b.raw.hr)} bpm`;
  return `${controllerCount()} of 2 sides${controllerInfo.battery != null ? ` · 🔋 ${controllerInfo.battery}%` : ''}`;
}

export function Connect({ onDone }: { onDone: () => void }) {
  const [, force] = useState(0);
  useEffect(() => subscribeDevices(() => force((n) => n + 1)), []);
  useEffect(() => { const id = setInterval(() => force((n) => n + 1), 250); return () => clearInterval(id); }, []); // live readings
  const st = getDeviceStatus();
  const act = (i: number) => {
    if (i < 3) { const k = ITEMS[i].kind; if (st[k].busy) return; void (st[k].connected ? disconnectDevice(k) : connectDevice(k)); }
    else if (i === 3) document.querySelector<HTMLInputElement>('[aria-label="Media server URL"]')?.focus();
    else if (i === 4) setFake(!getFake());
    else onDone();
  };
  const anyOn = ITEMS.some((it) => st[it.kind].connected);
  const [idx, setIdx] = useMenuNav(6, [4, 2], act, onDone, true, { initial: 5 }); // default to Ride/Continue so a stray controller press can't disconnect a device
  return (
    <div class="screen">
      <div class="screen-head">
        <div><h1>Connect</h1><div class="sub">{anyOn ? 'Connected devices ride with you through every game.' : 'Your saved setup connects automatically. Tap a device to choose it, or continue for a demo ride.'}</div></div>
      </div>
      <div class="device-row">
        {ITEMS.map((it, i) => {
          const s = st[it.kind];
          return (
            <div class={`card tile device${idx === i ? ' focused' : ''}${s.connected ? ' on' : ''}`} onClick={() => { setIdx(5); act(i); }}>
              <div class="device-top"><span class="icon">{it.icon}</span><h3>{it.label}</h3><span class="spacer" />{s.busy ? <Spinner /> : <Dot on={s.connected} />}</div>
              <div class="device-state">{s.busy ? (s.detail ? `Connecting: ${s.detail}` : 'Connecting…') : s.connected ? 'Connected · tap to disconnect' : 'Tap to connect'}</div>
              {s.connected && <div class="device-live">{live(it.kind)}</div>}
              {it.kind === 'trainer' && s.connected && s.detail && <div class="warn">{s.detail}</div>}
              {it.kind === 'hr' && s.connected && s.detail && <div class="dim small">{s.detail}</div>}
              {it.kind === 'hr' && (
                <div class="row" onClick={(e) => e.stopPropagation()}>
                  {savedHrWatches().map((watch) => (
                    <button key={watch.id} class="btn small" disabled={s.busy || watch.selected} onClick={(e) => { e.stopPropagation(); void selectSavedHrWatch(watch.id); }}>
                      {s.busy ? 'Wait for connection:' : watch.selected ? 'Using' : 'Use'} {watch.name} · {watch.id.slice(-6)}
                    </button>
                  ))}
                  <button class="btn small" disabled={s.busy} onClick={() => void connectDevice('hr')}>+ Add watch</button>
                </div>
              )}
              {s.error && <div class="warn">{s.error}</div>}
              {it.kind === 'controller' && s.connected && <div class="dim small">fw {controllerInfo.firmware ?? '?'}</div>}
              {it.kind === 'controller' && s.connected && controllerCount() < 2 && (
                <button class="btn small" disabled={s.busy} onClick={(e) => { e.stopPropagation(); void addSecondController(); }}>+ Add other side</button>
              )}
              {controllerInfo.warning && it.kind === 'controller' && <div class="warn">{controllerInfo.warning}</div>}
              <div class="dim small note">{it.note}</div>
            </div>
          );
        })}
        <MediaServerConnection focused={idx === 3} onFocus={() => setIdx(3)}/>
      </div>
      <div class="row">
        <Btn focused={idx === 4} onClick={() => act(4)}>{getFake() ? 'Fake bike: ON' : 'Fake bike: off'}</Btn>
        <Btn primary focused={idx === 5} onClick={onDone}>Continue ▶</Btn>
      </div>
      <KeyHints hints={[['dpad', 'Move'], ['a', 'Connect / select'], ['b', 'Continue']]} />
    </div>
  );
}
